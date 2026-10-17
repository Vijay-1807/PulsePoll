package handlers

import (
	"context"
	"crypto/rand"
	"encoding/csv"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/bonthavijay/pulsepoll/backend/internal/models"
	"github.com/bonthavijay/pulsepoll/backend/internal/validate"
)

const slugAlphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func generateSlug() (string, error) {
	b := make([]byte, 8)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(slugAlphabet))))
		if err != nil {
			return "", err
		}
		b[i] = slugAlphabet[n.Int64()]
	}
	return string(b), nil
}

// findPollBySlug reads through the Redis metadata cache before Mongo.
func (h *Handler) findPollBySlug(ctx context.Context, slug string) (*models.Poll, error) {
	if p, err := h.RDB.GetPollMeta(ctx, slug); err == nil && p != nil {
		return p, nil
	}
	var p models.Poll
	err := h.DB.Polls.FindOne(ctx, bson.M{"slug": slug}).Decode(&p)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = h.RDB.SetPollMeta(ctx, &p)
	return &p, nil
}

func pollIsExpired(p *models.Poll, now time.Time) bool {
	return p.ExpiresAt != nil && now.After(*p.ExpiresAt)
}

func (h *Handler) CreatePoll(c *gin.Context) {
	var in validate.CreatePollInput
	if err := c.ShouldBindJSON(&in); err != nil {
		fail(c, http.StatusBadRequest, "invalid JSON body")
		return
	}

	in.Question = validate.Normalize(in.Question)
	in.Description = validate.Normalize(in.Description)
	for i := range in.Options {
		in.Options[i] = validate.Normalize(in.Options[i])
	}
	in.Options = validate.DedupeOptions(in.Options)

	if fields := validate.ValidateStruct(in); fields != nil {
		failFields(c, fields)
		return
	}
	if len(in.Options) < 2 {
		failFields(c, map[string]string{"options": "provide at least 2 distinct non-empty options"})
		return
	}
	if len(in.Options) > 8 {
		failFields(c, map[string]string{"options": "8 options max"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	now := time.Now().UTC()
	poll := models.Poll{
		OwnerID:     currentUserID(c),
		Question:    in.Question,
		Description: in.Description,
		MultiSelect: in.MultiSelect,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	for _, text := range in.Options {
		poll.Options = append(poll.Options, models.PollOption{ID: primitive.NewObjectID().Hex(), Text: text})
	}
	if in.ExpiresInM > 0 {
		exp := now.Add(time.Duration(in.ExpiresInM) * time.Minute)
		poll.ExpiresAt = &exp
	}

	// Slugs are short and shareable; retry a couple of times on the
	// astronomically unlikely collision.
	var inserted bool
	for attempt := 0; attempt < 5 && !inserted; attempt++ {
		slug, err := generateSlug()
		if err != nil {
			fail(c, http.StatusInternalServerError, "could not generate share link")
			return
		}
		poll.Slug = slug
		res, err := h.DB.Polls.InsertOne(ctx, poll)
		if err != nil {
			if mongo.IsDuplicateKeyError(err) {
				continue
			}
			fail(c, http.StatusInternalServerError, "could not create poll")
			return
		}
		poll.ID = res.InsertedID.(primitive.ObjectID)
		inserted = true
	}
	if !inserted {
		fail(c, http.StatusInternalServerError, "could not allocate a share link")
		return
	}

	// Seed the live counters so every read path starts from Redis.
	optionIDs := make([]string, len(poll.Options))
	for i, o := range poll.Options {
		optionIDs[i] = o.ID
	}
	_ = h.RDB.SeedCounts(ctx, poll.ID.Hex(), optionIDs, map[string]int64{}, 0)
	_ = h.RDB.SetPollMeta(ctx, &poll)

	c.JSON(http.StatusCreated, gin.H{"poll": poll})
}

func (h *Handler) ListPolls(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	cur, err := h.DB.Polls.Find(ctx,
		bson.M{"owner_id": currentUserID(c)},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(200),
	)
	if err != nil {
		fail(c, http.StatusInternalServerError, "could not load polls")
		return
	}
	defer cur.Close(ctx)

	var polls []models.Poll
	if err := cur.All(ctx, &polls); err != nil {
		fail(c, http.StatusInternalServerError, "could not load polls")
		return
	}

	summaries := make([]models.PollSummary, 0, len(polls))
	now := time.Now().UTC()
	for _, p := range polls {
		optionIDs := make([]string, len(p.Options))
		for i, o := range p.Options {
			optionIDs[i] = o.ID
		}
		counts, total, _ := h.RDB.GetResults(ctx, p.ID.Hex(), optionIDs)
		viewers, _ := h.RDB.ViewerCount(ctx, p.ID.Hex())
		p.Closed = p.Closed || pollIsExpired(&p, now)
		summaries = append(summaries, models.PollSummary{Poll: p, TotalVotes: total, Counts: counts, Viewers: viewers})
	}
	c.JSON(http.StatusOK, gin.H{"polls": summaries})
}

func (h *Handler) GetPublicPoll(c *gin.Context) {
	slug := c.Param("slug")
	if !validate.ValidSlug(slug) {
		fail(c, http.StatusNotFound, "poll not found")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	poll, err := h.findPollBySlug(ctx, slug)
	if err != nil {
		fail(c, http.StatusInternalServerError, "could not load poll")
		return
	}
	if poll == nil {
		fail(c, http.StatusNotFound, "poll not found")
		return
	}

	optionIDs := make([]string, len(poll.Options))
	for i, o := range poll.Options {
		optionIDs[i] = o.ID
	}
	counts, total, err := h.RDB.GetResults(ctx, poll.ID.Hex(), optionIDs)
	if err != nil {
		fail(c, http.StatusInternalServerError, "could not load results")
		return
	}
	viewers, _ := h.RDB.ViewerCount(ctx, poll.ID.Hex())

	c.JSON(http.StatusOK, gin.H{"poll": models.PublicPoll{
		Slug:        poll.Slug,
		Question:    poll.Question,
		Description: poll.Description,
		Options:     poll.Options,
		MultiSelect: poll.MultiSelect,
		Closed:      poll.Closed || pollIsExpired(poll, time.Now().UTC()),
		ExpiresAt:   poll.ExpiresAt,
		TotalVotes:  total,
		Counts:      counts,
		Viewers:     viewers,
	}})
}

// findOwnedPoll fetches a poll by id and verifies ownership. Returning 404 for
// someone else's poll avoids leaking which ids exist.
func (h *Handler) findOwnedPoll(ctx context.Context, id string, ownerID primitive.ObjectID) (*models.Poll, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, nil
	}
	var p models.Poll
	err = h.DB.Polls.FindOne(ctx, bson.M{"_id": oid, "owner_id": ownerID}).Decode(&p)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

type updatePollInput struct {
	Closed *bool `json:"closed"`
}

func (h *Handler) UpdatePoll(c *gin.Context) {
	var in updatePollInput
	if err := c.ShouldBindJSON(&in); err != nil || in.Closed == nil {
		fail(c, http.StatusBadRequest, "provide {\"closed\": true|false}")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	poll, err := h.findOwnedPoll(ctx, c.Param("id"), currentUserID(c))
	if err != nil {
		fail(c, http.StatusInternalServerError, "could not load poll")
		return
	}
	if poll == nil {
		fail(c, http.StatusNotFound, "poll not found")
		return
	}

	now := time.Now().UTC()
	_, err = h.DB.Polls.UpdateOne(ctx,
		bson.M{"_id": poll.ID},
		bson.M{"$set": bson.M{"closed": *in.Closed, "updated_at": now}},
	)
	if err != nil {
		fail(c, http.StatusInternalServerError, "could not update poll")
		return
	}
	poll.Closed = *in.Closed
	poll.UpdatedAt = now
	h.RDB.InvalidatePollMeta(ctx, poll.Slug)

	// Tell every open page about the state change through Redis.
	payload := fmt.Sprintf(`{"type":"status","pollId":%q,"payload":{"closed":%t}}`, poll.ID.Hex(), *in.Closed)
	_ = h.RDB.Publish(ctx, poll.ID.Hex(), []byte(payload))

	c.JSON(http.StatusOK, gin.H{"poll": poll})
}

func (h *Handler) DeletePoll(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	poll, err := h.findOwnedPoll(ctx, c.Param("id"), currentUserID(c))
	if err != nil {
		fail(c, http.StatusInternalServerError, "could not load poll")
		return
	}
	if poll == nil {
		fail(c, http.StatusNotFound, "poll not found")
		return
	}

	if _, err := h.DB.Votes.DeleteMany(ctx, bson.M{"poll_id": poll.ID}); err != nil {
		fail(c, http.StatusInternalServerError, "could not delete votes")
		return
	}
	if _, err := h.DB.Polls.DeleteOne(ctx, bson.M{"_id": poll.ID}); err != nil {
		fail(c, http.StatusInternalServerError, "could not delete poll")
		return
	}
	h.RDB.PurgePoll(ctx, poll.ID.Hex(), poll.Slug)

	payload := fmt.Sprintf(`{"type":"deleted","pollId":%q}`, poll.ID.Hex())
	_ = h.RDB.Publish(ctx, poll.ID.Hex(), []byte(payload))

	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func (h *Handler) ExportResults(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	poll, err := h.findOwnedPoll(ctx, c.Param("id"), currentUserID(c))
	if err != nil {
		fail(c, http.StatusInternalServerError, "could not load poll")
		return
	}
	if poll == nil {
		fail(c, http.StatusNotFound, "poll not found")
		return
	}

	optionIDs := make([]string, len(poll.Options))
	for i, o := range poll.Options {
		optionIDs[i] = o.ID
	}
	counts, total, err := h.RDB.GetResults(ctx, poll.ID.Hex(), optionIDs)
	if err != nil {
		fail(c, http.StatusInternalServerError, "could not load results")
		return
	}

	filename := fmt.Sprintf("pulsepoll-%s-results.csv", poll.Slug)
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename="+strconv.Quote(filename))

	w := csv.NewWriter(c.Writer)
	_ = w.Write([]string{"Poll", poll.Question})
	_ = w.Write([]string{"Option", "Votes", "Percent"})
	for _, o := range poll.Options {
		pct := 0.0
		if total > 0 {
			pct = float64(counts[o.ID]) / float64(total) * 100
		}
		_ = w.Write([]string{o.Text, strconv.FormatInt(counts[o.ID], 10), strings.TrimSpace(strconv.FormatFloat(pct, 'f', 1, 64))})
	}
	_ = w.Write([]string{"TOTAL", strconv.FormatInt(total, 10), "100.0"})
	w.Flush()
}

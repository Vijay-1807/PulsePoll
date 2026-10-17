package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/mongo"

	"github.com/bonthavijay/pulsepoll/backend/internal/models"
	"github.com/bonthavijay/pulsepoll/backend/internal/validate"
)

func (h *Handler) Vote(c *gin.Context) {
	slug := c.Param("slug")
	if !validate.ValidSlug(slug) {
		fail(c, http.StatusNotFound, "poll not found")
		return
	}

	var in validate.VoteInput
	if err := c.ShouldBindJSON(&in); err != nil {
		fail(c, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if fields := validate.ValidateStruct(in); fields != nil {
		failFields(c, fields)
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
	if poll.Closed || pollIsExpired(poll, time.Now().UTC()) {
		fail(c, http.StatusGone, "this poll is closed")
		return
	}

	// The ballot must reference options that actually exist on the poll.
	valid := make(map[string]bool, len(poll.Options))
	for _, o := range poll.Options {
		valid[o.ID] = true
	}
	picked := make([]string, 0, len(in.OptionIDs))
	seen := make(map[string]bool, len(in.OptionIDs))
	for _, oid := range in.OptionIDs {
		if !valid[oid] {
			failFields(c, map[string]string{"optionIds": "contains an option that does not belong to this poll"})
			return
		}
		if !seen[oid] {
			seen[oid] = true
			picked = append(picked, oid)
		}
	}
	if len(picked) == 0 {
		failFields(c, map[string]string{"optionIds": "select at least one option"})
		return
	}
	if !poll.MultiSelect && len(picked) != 1 {
		failFields(c, map[string]string{"optionIds": "this poll accepts a single choice"})
		return
	}

	voterHash := validate.VoterFingerprint(in.VoterID, c.ClientIP(), c.Request.UserAgent())

	// Durable record first: the unique (poll_id, voter_hash) index is the
	// final guard against double ballots, even under concurrent requests.
	vote := models.Vote{
		PollID:    poll.ID,
		VoterHash: voterHash,
		OptionIDs: picked,
		CreatedAt: time.Now().UTC(),
	}
	if _, err := h.DB.Votes.InsertOne(ctx, vote); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			fail(c, http.StatusConflict, "you have already voted on this poll")
			return
		}
		fail(c, http.StatusInternalServerError, "could not record vote")
		return
	}
	// Fast Redis-side dedupe index (kept in sync with the durable store).
	if _, err := h.RDB.MarkVoted(ctx, poll.ID.Hex(), voterHash); err != nil {
		// The vote is safely in Mongo; dedupe still works via the unique
		// index, so a Redis hiccup here must not fail the request.
		_ = err
	}

	counts, total, err := h.RDB.ApplyVote(ctx, poll.ID.Hex(), picked)
	if err != nil {
		fail(c, http.StatusInternalServerError, "vote saved but live counters are unavailable")
		return
	}

	// Fan the new snapshot out through Redis pub/sub; every backend instance
	// pushes it down its own WebSockets.
	event, _ := json.Marshal(gin.H{
		"type":   "vote",
		"pollId": poll.ID.Hex(),
		"payload": gin.H{
			"counts":    counts,
			"total":     total,
			"optionIds": picked,
			"voter":     voterHash[:6],
			"at":        time.Now().UTC(),
		},
	})
	if err := h.RDB.Publish(ctx, poll.ID.Hex(), event); err != nil {
		_ = err // clients still converge via the REST response next poll.
	}

	c.JSON(http.StatusCreated, gin.H{"counts": counts, "total": total, "optionIds": picked})
}

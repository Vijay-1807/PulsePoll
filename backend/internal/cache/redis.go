// Package cache owns every Redis interaction. Redis is not a sidecar here: it
// is the source of truth for live vote counts, voter deduplication, viewer
// presence, poll metadata caching, rate limiting and the pub/sub fan-out that
// drives the WebSocket updates. MongoDB remains the durable store; Redis can
// always be rebuilt from it (see WarmFromMongo in the server package).
package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/bonthavijay/pulsepoll/backend/internal/models"
)

const (
	keyCounts  = "pp:counts:%s"  // hash optionID -> count (live source of truth)
	keyTotal   = "pp:total:%s"   // string total ballots
	keyVoted   = "pp:voted:%s"   // set of voter hashes that already voted
	keyViewers = "pp:viewers:%s" // zset connID -> last heartbeat unix
	keyMeta    = "pp:meta:%s"    // cached poll document by slug
	keyRL      = "pp:rl:%s:%s"   // rate limit counter: bucket + identifier

	ChannelPattern = "pp:events:*"
)

func Channel(pollID string) string { return "pp:events:" + pollID }

type Cache struct {
	rdb *redis.Client
}

func Connect(ctx context.Context, url string) (*Cache, error) {
	url = strings.TrimSpace(url)
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	rdb := redis.NewClient(opts)
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return &Cache{rdb: rdb}, nil
}

func (c *Cache) Close() error { return c.rdb.Close() }

func (c *Cache) Ping(ctx context.Context) error { return c.rdb.Ping(ctx).Err() }

// ---------- Vote counts ----------

// ApplyVote atomically increments the live counters and returns the fresh
// snapshot the caller can broadcast. All commands travel in one pipeline.
func (c *Cache) ApplyVote(ctx context.Context, pollID string, optionIDs []string) (map[string]int64, int64, error) {
	pipe := c.rdb.Pipeline()
	for _, oid := range optionIDs {
		pipe.HIncrBy(ctx, fmt.Sprintf(keyCounts, pollID), oid, 1)
	}
	pipe.Incr(ctx, fmt.Sprintf(keyTotal, pollID))
	hget := pipe.HGetAll(ctx, fmt.Sprintf(keyCounts, pollID))
	get := pipe.Get(ctx, fmt.Sprintf(keyTotal, pollID))
	if _, err := pipe.Exec(ctx); err != nil {
		return nil, 0, err
	}

	counts, err := parseCounts(hget.Val())
	if err != nil {
		return nil, 0, err
	}
	total, err := strconv.ParseInt(get.Val(), 10, 64)
	if err != nil {
		return nil, 0, err
	}
	return counts, total, nil
}

// SeedCounts rebuilds a poll's counters from durable data. It is idempotent:
// a seeded poll carries a marker so a healthy Redis is never overwritten.
func (c *Cache) SeedCounts(ctx context.Context, pollID string, optionIDs []string, counts map[string]int64, total int64) error {
	key := fmt.Sprintf(keyCounts, pollID)
	exists, err := c.rdb.Exists(ctx, key).Result()
	if err != nil {
		return err
	}
	if exists > 0 {
		return nil
	}

	pipe := c.rdb.Pipeline()
	vals := make(map[string]interface{}, len(optionIDs))
	for _, oid := range optionIDs {
		vals[oid] = counts[oid] // zero values keep the hash existing
	}
	pipe.HSet(ctx, key, vals)
	pipe.Set(ctx, fmt.Sprintf(keyTotal, pollID), total, 0)
	_, err = pipe.Exec(ctx)
	return err
}

// ReseedCounts overwrites counters from durable data (used by the periodic
// reconciler when Redis has drifted from MongoDB).
func (c *Cache) ReseedCounts(ctx context.Context, pollID string, optionIDs []string, counts map[string]int64, total int64) error {
	key := fmt.Sprintf(keyCounts, pollID)
	pipe := c.rdb.Pipeline()
	pipe.Del(ctx, key)
	vals := make(map[string]interface{}, len(optionIDs))
	for _, oid := range optionIDs {
		vals[oid] = counts[oid]
	}
	pipe.HSet(ctx, key, vals)
	pipe.Set(ctx, fmt.Sprintf(keyTotal, pollID), total, 0)
	_, err := pipe.Exec(ctx)
	return err
}

func (c *Cache) GetTotal(ctx context.Context, pollID string) (int64, error) {
	v, err := c.rdb.Get(ctx, fmt.Sprintf(keyTotal, pollID)).Int64()
	if err == redis.Nil {
		return 0, nil
	}
	return v, err
}

func (c *Cache) GetResults(ctx context.Context, pollID string, optionIDs []string) (map[string]int64, int64, error) {
	pipe := c.rdb.Pipeline()
	hget := pipe.HGetAll(ctx, fmt.Sprintf(keyCounts, pollID))
	get := pipe.Get(ctx, fmt.Sprintf(keyTotal, pollID))
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
		return nil, 0, err
	}
	counts, err := parseCounts(hget.Val())
	if err != nil {
		return nil, 0, err
	}
	if counts == nil {
		counts = map[string]int64{}
	}
	for _, oid := range optionIDs {
		if _, ok := counts[oid]; !ok {
			counts[oid] = 0
		}
	}
	total := int64(0)
	if v := get.Val(); v != "" {
		if total, err = strconv.ParseInt(v, 10, 64); err != nil {
			return nil, 0, err
		}
	}
	return counts, total, nil
}

// ---------- Voter dedupe ----------

// MarkVoted records a voter and reports whether they had already voted.
func (c *Cache) MarkVoted(ctx context.Context, pollID, voterHash string) (alreadyVoted bool, err error) {
	set, err := c.rdb.SAdd(ctx, fmt.Sprintf(keyVoted, pollID), voterHash).Result()
	if err != nil {
		return false, err
	}
	if set == 0 {
		return true, nil
	}
	// Keep the dedupe set around well past any reasonable poll life.
	c.rdb.Expire(ctx, fmt.Sprintf(keyVoted, pollID), 30*24*time.Hour)
	return false, nil
}

func (c *Cache) UnmarkVoted(ctx context.Context, pollID, voterHash string) {
	c.rdb.SRem(ctx, fmt.Sprintf(keyVoted, pollID), voterHash)
}

// ---------- Viewer presence ----------

func (c *Cache) AddViewer(ctx context.Context, pollID, connID string) (int64, error) {
	key := fmt.Sprintf(keyViewers, pollID)
	pipe := c.rdb.Pipeline()
	pipe.ZAdd(ctx, key, redis.Z{Score: float64(time.Now().Unix()), Member: connID})
	pipe.ZRemRangeByScore(ctx, key, "-inf", strconv.FormatInt(time.Now().Add(-60*time.Second).Unix(), 10))
	card := pipe.ZCard(ctx, key)
	pipe.Expire(ctx, key, 24*time.Hour)
	_, err := pipe.Exec(ctx)
	return card.Val(), err
}

func (c *Cache) TouchViewer(ctx context.Context, pollID, connID string) (int64, error) {
	key := fmt.Sprintf(keyViewers, pollID)
	pipe := c.rdb.Pipeline()
	pipe.ZAdd(ctx, key, redis.Z{Score: float64(time.Now().Unix()), Member: connID})
	pipe.ZRemRangeByScore(ctx, key, "-inf", strconv.FormatInt(time.Now().Add(-60*time.Second).Unix(), 10))
	card := pipe.ZCard(ctx, key)
	_, err := pipe.Exec(ctx)
	return card.Val(), err
}

func (c *Cache) RemoveViewer(ctx context.Context, pollID, connID string) (int64, error) {
	key := fmt.Sprintf(keyViewers, pollID)
	pipe := c.rdb.Pipeline()
	pipe.ZRem(ctx, key, connID)
	pipe.ZRemRangeByScore(ctx, key, "-inf", strconv.FormatInt(time.Now().Add(-60*time.Second).Unix(), 10))
	card := pipe.ZCard(ctx, key)
	_, err := pipe.Exec(ctx)
	return card.Val(), err
}

func (c *Cache) ViewerCount(ctx context.Context, pollID string) (int64, error) {
	key := fmt.Sprintf(keyViewers, pollID)
	pipe := c.rdb.Pipeline()
	pipe.ZRemRangeByScore(ctx, key, "-inf", strconv.FormatInt(time.Now().Add(-60*time.Second).Unix(), 10))
	card := pipe.ZCard(ctx, key)
	_, err := pipe.Exec(ctx)
	return card.Val(), err
}

// ---------- Poll metadata cache ----------

func (c *Cache) GetPollMeta(ctx context.Context, slug string) (*models.Poll, error) {
	raw, err := c.rdb.Get(ctx, fmt.Sprintf(keyMeta, slug)).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var p models.Poll
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (c *Cache) SetPollMeta(ctx context.Context, p *models.Poll) error {
	raw, err := json.Marshal(p)
	if err != nil {
		return err
	}
	return c.rdb.Set(ctx, fmt.Sprintf(keyMeta, p.Slug), raw, 60*time.Second).Err()
}

func (c *Cache) InvalidatePollMeta(ctx context.Context, slug string) {
	c.rdb.Del(ctx, fmt.Sprintf(keyMeta, slug))
}

// PurgePoll removes every key belonging to a deleted poll.
func (c *Cache) PurgePoll(ctx context.Context, pollID, slug string) {
	c.rdb.Del(ctx,
		fmt.Sprintf(keyCounts, pollID),
		fmt.Sprintf(keyTotal, pollID),
		fmt.Sprintf(keyVoted, pollID),
		fmt.Sprintf(keyViewers, pollID),
		fmt.Sprintf(keyMeta, slug),
	)
}

// ---------- Pub/Sub ----------

func (c *Cache) Publish(ctx context.Context, pollID string, payload []byte) error {
	return c.rdb.Publish(ctx, Channel(pollID), payload).Err()
}

func (c *Cache) Subscribe(ctx context.Context) *redis.PubSub {
	return c.rdb.PSubscribe(ctx, ChannelPattern)
}

// Messages flattens a pub/sub subscription into a channel of [channel, payload]
// pairs, ready to feed hub.RunChannel.
func (c *Cache) Messages(ctx context.Context, ps *redis.PubSub) <-chan [2]string {
	ch := make(chan [2]string, 256)
	go func() {
		defer close(ch)
		for {
			msg, err := ps.ReceiveMessage(ctx)
			if err != nil {
				if ctx.Err() == nil {
					log.Printf("cache: pubsub receive stopped: %v", err)
				}
				return
			}
			ch <- [2]string{msg.Channel, msg.Payload}
		}
	}()
	return ch
}

// ---------- Rate limiting ----------

// Allow increments a fixed-window counter and reports whether the caller is
// still within the limit, plus how many seconds until the window resets.
func (c *Cache) Allow(ctx context.Context, bucket, id string, limit int, window time.Duration) (bool, int64, time.Duration) {
	key := fmt.Sprintf(keyRL, bucket, id)
	pipe := c.rdb.Pipeline()
	incr := pipe.Incr(ctx, key)
	ttl := pipe.TTL(ctx, key)
	_, err := pipe.Exec(ctx)
	if err != nil {
		// Fail open: rate limiting is protection, not the product.
		return true, 0, 0
	}
	if incr.Val() == 1 {
		c.rdb.Expire(ctx, key, window)
		return true, int64(limit - 1), window
	}
	retry := ttl.Val()
	if retry < 0 {
		retry = window
	}
	return incr.Val() <= int64(limit), max64(limit-int(incr.Val()), 0), retry
}

func parseCounts(m map[string]string) (map[string]int64, error) {
	if m == nil {
		return map[string]int64{}, nil
	}
	out := make(map[string]int64, len(m))
	for k, v := range m {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("bad counter for %s: %w", k, err)
		}
		out[k] = n
	}
	return out, nil
}

func max64(a, b int) int64 {
	if a > b {
		return int64(a)
	}
	return int64(b)
}

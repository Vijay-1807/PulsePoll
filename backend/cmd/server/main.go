package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/bonthavijay/pulsepoll/backend/internal/cache"
	"github.com/bonthavijay/pulsepoll/backend/internal/config"
	"github.com/bonthavijay/pulsepoll/backend/internal/database"
	"github.com/bonthavijay/pulsepoll/backend/internal/handlers"
	"github.com/bonthavijay/pulsepoll/backend/internal/hub"
	"github.com/bonthavijay/pulsepoll/backend/internal/middleware"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("fatal: %v", err)
	}
}

func run() error {
	cfg := config.Load()

	rootCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := database.Connect(rootCtx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		return err
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = db.Disconnect(ctx)
	}()
	if err := db.EnsureIndexes(rootCtx); err != nil {
		return err
	}
	log.Printf("mongo connected (%s)", cfg.MongoDB)

	rdb, err := cache.Connect(rootCtx, cfg.RedisURL)
	if err != nil {
		return err
	}
	defer rdb.Close()
	log.Printf("redis connected")

	// Rebuild live counters from the durable vote log wherever Redis has no
	// data (fresh start, restart, flush).
	if err := warmCache(rootCtx, db, rdb); err != nil {
		log.Printf("warn: cache warm-up: %v", err)
	}

	h := hub.New()
	ps := rdb.Subscribe(rootCtx)
	defer ps.Close()
	go func() {
		log.Println("redis pub/sub subscriber started")
		h.RunChannel(rootCtx, rdb.Messages(rootCtx, ps))
		log.Println("redis pub/sub subscriber stopped")
	}()

	go reconcileLoop(rootCtx, db, rdb)

	router := buildRouter(cfg, db, rdb, h)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("pulsepoll api listening on :%s (%s)", cfg.Port, cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-rootCtx.Done():
	}

	log.Println("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(ctx)
}

func buildRouter(cfg *config.Config, db *database.DB, rdb *cache.Cache, h *hub.Hub) *gin.Engine {
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(bodyLimit(64 * 1024))

	// Behind a managed proxy the client IP arrives in X-Forwarded-For; only
	// trust proxies on private ranges (or an explicit override).
	trusted := []string{"127.0.0.1/32", "::1/128", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"}
	if v := os.Getenv("TRUSTED_PROXIES"); v != "" {
		trusted = []string{v}
	}
	_ = router.SetTrustedProxies(trusted)

	router.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSOrigins,
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))

	hdl := handlers.New(db, rdb, h, cfg)

	router.GET("/api/health", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		mongoOK := db.Client.Ping(ctx, nil) == nil
		redisOK := rdb.Ping(ctx) == nil
		status := http.StatusOK
		if !mongoOK || !redisOK {
			status = http.StatusServiceUnavailable
		}
		c.JSON(status, gin.H{
			"status": map[bool]string{true: "ok", false: "degraded"}[mongoOK && redisOK],
			"mongo":  mongoOK,
			"redis":  redisOK,
		})
	})

	auth := router.Group("/api/auth")
	{
		auth.POST("/signup", middleware.RateLimit(rdb, "signup", 30, 15*time.Minute), hdl.Signup)
		auth.POST("/login", middleware.RateLimit(rdb, "login", 20, 15*time.Minute), hdl.Login)
		auth.GET("/me", middleware.RequireAuth(cfg.JWTSecret), hdl.Me)
	}

	polls := router.Group("/api/polls")
	{
		polls.POST("", middleware.RequireAuth(cfg.JWTSecret), hdl.CreatePoll)
		polls.GET("", middleware.RequireAuth(cfg.JWTSecret), hdl.ListPolls)
		polls.PATCH("/:id", middleware.RequireAuth(cfg.JWTSecret), hdl.UpdatePoll)
		polls.DELETE("/:id", middleware.RequireAuth(cfg.JWTSecret), hdl.DeletePoll)
		polls.GET("/:id/export.csv", middleware.RequireAuth(cfg.JWTSecret), hdl.ExportResults)
		polls.GET("/slug/:slug", hdl.GetPublicPoll)
		polls.POST("/slug/:slug/vote", middleware.RateLimit(rdb, "vote", 30, time.Minute), hdl.Vote)
	}

	router.GET("/api/ws/polls/:slug", hdl.WatchPoll)

	return router
}

func bodyLimit(bytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, bytes)
		}
		c.Next()
	}
}

type pollWithOptions struct {
	ID      primitive.ObjectID `bson:"_id"`
	Options []struct {
		ID string `bson:"id"`
	} `bson:"options"`
}

func (p pollWithOptions) optionIDs() []string {
	out := make([]string, 0, len(p.Options))
	for _, o := range p.Options {
		out = append(out, o.ID)
	}
	return out
}

// warmCache seeds Redis counters from MongoDB for polls that have no live
// data yet. Mongo is durable and authoritative; Redis is the fast path.
func warmCache(ctx context.Context, db *database.DB, rdb *cache.Cache) error {
	cur, err := db.Polls.Find(ctx, bson.M{})
	if err != nil {
		return err
	}
	defer cur.Close(ctx)

	count := 0
	for cur.Next(ctx) {
		var p pollWithOptions
		if err := cur.Decode(&p); err != nil {
			continue
		}
		if err := seedPollFromVotes(ctx, db, rdb, p.ID, p.optionIDs()); err != nil {
			log.Printf("warn: warm %s: %v", p.ID.Hex(), err)
			continue
		}
		count++
	}
	log.Printf("cache warm-up checked %d polls", count)
	return cur.Err()
}

func seedPollFromVotes(ctx context.Context, db *database.DB, rdb *cache.Cache, pollID primitive.ObjectID, optionIDs []string) error {
	counts := make(map[string]int64, len(optionIDs))
	for _, oid := range optionIDs {
		counts[oid] = 0
	}

	cur, err := db.Votes.Aggregate(ctx, mongoPipeline(pollID))
	if err != nil {
		return err
	}
	defer cur.Close(ctx)
	for cur.Next(ctx) {
		var row struct {
			OptionID string `bson:"_id"`
			Count    int64  `bson:"count"`
		}
		if err := cur.Decode(&row); err != nil {
			continue
		}
		counts[row.OptionID] = row.Count
	}
	if err := cur.Err(); err != nil {
		return err
	}

	total, err := db.Votes.CountDocuments(ctx, bson.M{"poll_id": pollID})
	if err != nil {
		return err
	}
	return rdb.SeedCounts(ctx, pollID.Hex(), optionIDs, counts, total)
}

// reconcileLoop periodically verifies Redis counters against the durable vote
// log and repairs drift (e.g. Redis restarted with persistence disabled).
func reconcileLoop(ctx context.Context, db *database.DB, rdb *cache.Cache) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cur, err := db.Polls.Find(ctx, bson.M{})
			if err != nil {
				continue
			}
			for cur.Next(ctx) {
				var p pollWithOptions
				if err := cur.Decode(&p); err != nil {
					continue
				}
				optionIDs := p.optionIDs()
				redisTotal, err := rdb.GetTotal(ctx, p.ID.Hex())
				if err != nil {
					continue
				}
				mongoTotal, err := db.Votes.CountDocuments(ctx, bson.M{"poll_id": p.ID})
				if err != nil || redisTotal == mongoTotal {
					continue
				}
				log.Printf("reconcile: poll %s redis=%d mongo=%d, rebuilding", p.ID.Hex(), redisTotal, mongoTotal)
				_ = reseedFromVotes(ctx, db, rdb, p.ID, optionIDs)
			}
			cur.Close(ctx)
		}
	}
}

func reseedFromVotes(ctx context.Context, db *database.DB, rdb *cache.Cache, pollID primitive.ObjectID, optionIDs []string) error {
	counts := make(map[string]int64, len(optionIDs))
	for _, oid := range optionIDs {
		counts[oid] = 0
	}
	cur, err := db.Votes.Aggregate(ctx, mongoPipeline(pollID))
	if err != nil {
		return err
	}
	defer cur.Close(ctx)
	for cur.Next(ctx) {
		var row struct {
			OptionID string `bson:"_id"`
			Count    int64  `bson:"count"`
		}
		if err := cur.Decode(&row); err != nil {
			continue
		}
		counts[row.OptionID] = row.Count
	}
	total, err := db.Votes.CountDocuments(ctx, bson.M{"poll_id": pollID})
	if err != nil {
		return err
	}
	return rdb.ReseedCounts(ctx, pollID.Hex(), optionIDs, counts, total)
}

func mongoPipeline(pollID primitive.ObjectID) []bson.M {
	return []bson.M{
		{"$match": bson.M{"poll_id": pollID}},
		{"$unwind": "$option_ids"},
		{"$group": bson.M{"_id": "$option_ids", "count": bson.M{"$sum": 1}}},
	}
}

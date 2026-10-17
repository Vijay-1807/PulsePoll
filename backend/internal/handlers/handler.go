package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/bonthavijay/pulsepoll/backend/internal/cache"
	"github.com/bonthavijay/pulsepoll/backend/internal/config"
	"github.com/bonthavijay/pulsepoll/backend/internal/database"
	"github.com/bonthavijay/pulsepoll/backend/internal/hub"
)

type Handler struct {
	DB  *database.DB
	RDB *cache.Cache
	Hub *hub.Hub
	Cfg *config.Config
}

func New(db *database.DB, rdb *cache.Cache, h *hub.Hub, cfg *config.Config) *Handler {
	return &Handler{DB: db, RDB: rdb, Hub: h, Cfg: cfg}
}

func fail(c *gin.Context, status int, msg string) {
	c.JSON(status, gin.H{"error": msg})
}

func failFields(c *gin.Context, fields map[string]string) {
	c.JSON(http.StatusUnprocessableEntity, gin.H{
		"error":  "validation failed",
		"fields": fields,
	})
}

func (h *Handler) issueToken(userID primitive.ObjectID) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub": userID.Hex(),
		"iat": now.Unix(),
		"exp": now.Add(h.Cfg.JWTTTL).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(h.Cfg.JWTSecret))
}

func currentUserID(c *gin.Context) primitive.ObjectID {
	id, _ := c.Get("userID")
	uid, _ := id.(primitive.ObjectID)
	return uid
}

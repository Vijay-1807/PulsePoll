package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/bonthavijay/pulsepoll/backend/internal/cache"
)

const ContextUserID = "userID"

func RequireAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		tokenStr, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || strings.TrimSpace(tokenStr) == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing or malformed token"})
			return
		}

		claims := jwt.MapClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		sub, _ := claims["sub"].(string)
		uid, err := primitive.ObjectIDFromHex(sub)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token subject"})
			return
		}
		c.Set(ContextUserID, uid)
		c.Next()
	}
}

// RateLimit applies a fixed-window per-IP limit backed by Redis.
func RateLimit(rdb *cache.Cache, bucket string, limit int, window time.Duration) gin.HandlerFunc {
	return func(gc *gin.Context) {
		ip := gc.ClientIP()
		allowed, _, retryAfter := rdb.Allow(gc.Request.Context(), bucket, ip, limit, window)
		if !allowed {
			gc.Header("Retry-After", retryAfter.Round(time.Second).String())
			gc.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "too many requests, slow down a little",
			})
			return
		}
		gc.Next()
	}
}

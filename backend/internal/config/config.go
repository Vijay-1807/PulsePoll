package config

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv       string
	Port         string
	MongoURI     string
	MongoDB      string
	RedisURL     string
	JWTSecret    string
	JWTTTL       time.Duration
	CORSOrigins  []string
	VoteCooldown time.Duration
}

func Load() *Config {
	// .env is optional; real environments inject variables directly.
	_ = godotenv.Load()

	c := &Config{
		AppEnv:   getEnv("APP_ENV", "development"),
		Port:     getEnv("PORT", "8080"),
		MongoURI: getEnv("MONGO_URI", "mongodb://localhost:27017"),
		MongoDB:  getEnv("MONGO_DB", "pulsepoll"),
		RedisURL: getEnv("REDIS_URL", "redis://localhost:6379"),
		// Fallback secret is fine only for local dev; production must set JWT_SECRET.
		JWTSecret:    getEnv("JWT_SECRET", "dev-only-insecure-secret-change-me"),
		VoteCooldown: time.Duration(getEnvInt("VOTE_COOLDOWN_SECONDS", 1)) * time.Second,
	}

	ttlHours := getEnvInt("JWT_TTL_HOURS", 168)
	c.JWTTTL = time.Duration(ttlHours) * time.Hour

	c.CORSOrigins = splitAndTrim(getEnv("CORS_ORIGINS", "http://localhost:5173,http://localhost:4173,http://localhost:3000"))

	if c.AppEnv == "production" && c.JWTSecret == "dev-only-insecure-secret-change-me" {
		log.Fatal("config: JWT_SECRET must be set in production")
	}
	return c
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		trimmed := strings.TrimSpace(v)
		if trimmed != "" {
			return trimmed
		}
	}
	return strings.TrimSpace(fallback)
}

func getEnvInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return n
		}
	}
	return fallback
}

func splitAndTrim(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

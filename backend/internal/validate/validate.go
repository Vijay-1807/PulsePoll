// Package validate centralizes server-side input validation. Nothing from a
// request body reaches MongoDB or Redis before it passes through here.
package validate

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/mail"
	"regexp"
	"strings"
	"unicode"

	"github.com/go-playground/validator/v10"
)

var (
	v        = validator.New(validator.WithRequiredStructEnabled())
	slugRe   = regexp.MustCompile(`^[A-Za-z0-9_-]{6,12}$`)
	objectID = regexp.MustCompile(`^[a-fA-F0-9]{24}$`)
)

type SignupInput struct {
	Name     string `json:"name" validate:"required,min=2,max=60"`
	Email    string `json:"email" validate:"required,email,max=254"`
	Password string `json:"password" validate:"required,min=8,max=128"`
}

type LoginInput struct {
	Email    string `json:"email" validate:"required,email,max=254"`
	Password string `json:"password" validate:"required,min=1,max=128"`
}

type CreatePollInput struct {
	Question    string   `json:"question" validate:"required,min=3,max=200"`
	Description string   `json:"description" validate:"max=500"`
	Options     []string `json:"options" validate:"required,min=2,max=8,dive,min=1,max=80"`
	MultiSelect bool     `json:"multiSelect"`
	ExpiresInM  int      `json:"expiresInMinutes" validate:"omitempty,min=1,max=10080"`
}

type VoteInput struct {
	OptionIDs []string `json:"optionIds" validate:"required,min=1,max=8,dive,min=1,max=64"`
	VoterID   string   `json:"voterId" validate:"max=64"`
}

// Normalize trims content, strips control characters, and collapses
// whitespace so "  Pizza  " and "Pizza" are the same option.
func Normalize(s string) string {
	s = strings.Map(func(r rune) rune {
		if r == '\n' || r == '\t' {
			return ' '
		}
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, s)
	return strings.Join(strings.Fields(s), " ")
}

func ValidateStruct(s any) map[string]string {
	err := v.Struct(s)
	if err == nil {
		return nil
	}
	fieldErrors := map[string]string{}
	var ve validator.ValidationErrors
	if errors.As(err, &ve) {
		for _, fe := range ve {
			fieldErrors[strings.ToLower(fe.Field())] = messageFor(fe)
		}
		return fieldErrors
	}
	fieldErrors["_"] = "invalid input"
	return fieldErrors
}

func messageFor(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return "is required"
	case "email":
		return "must be a valid email address"
	case "min":
		return "must be at least " + fe.Param() + " characters"
	case "max":
		if fe.Kind().String() == "slice" {
			return "must contain at most " + fe.Param() + " items"
		}
		return "must be at most " + fe.Param() + " characters"
	case "numeric":
		return "must be a number"
	default:
		return "is invalid"
	}
}

func ValidEmail(s string) bool {
	_, err := mail.ParseAddress(s)
	return err == nil
}

func ValidSlug(s string) bool { return slugRe.MatchString(s) }

func IsObjectID(s string) bool { return objectID.MatchString(s) }

// VoterFingerprint derives the dedupe key for a ballot. The client-supplied
// anonymous ID is blended with the request IP and user agent; when no ID is
// present the network fingerprint still prevents trivial ballot stuffing.
func VoterFingerprint(voterID, ip, userAgent string) string {
	h := sha256.New()
	h.Write([]byte(strings.ToLower(strings.TrimSpace(voterID))))
	h.Write([]byte{0})
	h.Write([]byte(ip))
	h.Write([]byte{0})
	h.Write([]byte(userAgent))
	return hex.EncodeToString(h.Sum(nil))
}

// DedupeOptions removes duplicates (case-insensitive) while preserving order.
func DedupeOptions(opts []string) []string {
	seen := make(map[string]bool, len(opts))
	out := make([]string, 0, len(opts))
	for _, o := range opts {
		key := strings.ToLower(o)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, o)
	}
	return out
}

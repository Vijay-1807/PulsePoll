package handlers

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"

	"github.com/bonthavijay/pulsepoll/backend/internal/models"
	"github.com/bonthavijay/pulsepoll/backend/internal/validate"
)

type userResponse struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

func toUserResponse(u *models.User) userResponse {
	return userResponse{ID: u.ID.Hex(), Name: u.Name, Email: u.Email}
}

func (h *Handler) Signup(c *gin.Context) {
	var in validate.SignupInput
	if err := c.ShouldBindJSON(&in); err != nil {
		fail(c, http.StatusBadRequest, "invalid JSON body")
		return
	}
	in.Name = validate.Normalize(in.Name)
	in.Email = strings.ToLower(validate.Normalize(in.Email))
	if fields := validate.ValidateStruct(in); fields != nil {
		failFields(c, fields)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		fail(c, http.StatusInternalServerError, "could not process password")
		return
	}

	user := models.User{
		Name:         in.Name,
		Email:        in.Email,
		PasswordHash: string(hash),
		CreatedAt:    time.Now().UTC(),
	}
	res, err := h.DB.Users.InsertOne(ctx, user)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			fail(c, http.StatusConflict, "an account with this email already exists")
			return
		}
		fail(c, http.StatusInternalServerError, "could not create account")
		return
	}
	user.ID = res.InsertedID.(primitive.ObjectID)

	token, err := h.issueToken(user.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "could not issue session")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"token": token, "user": toUserResponse(&user)})
}

func (h *Handler) Login(c *gin.Context) {
	var in validate.LoginInput
	if err := c.ShouldBindJSON(&in); err != nil {
		fail(c, http.StatusBadRequest, "invalid JSON body")
		return
	}
	in.Email = strings.ToLower(validate.Normalize(in.Email))
	if fields := validate.ValidateStruct(in); fields != nil {
		failFields(c, fields)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var user models.User
	err := h.DB.Users.FindOne(ctx, bson.M{"email": in.Email}).Decode(&user)
	if errors.Is(err, mongo.ErrNoDocuments) {
		fail(c, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if err != nil {
		fail(c, http.StatusInternalServerError, "could not look up account")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(in.Password)); err != nil {
		fail(c, http.StatusUnauthorized, "invalid email or password")
		return
	}

	token, err := h.issueToken(user.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "could not issue session")
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "user": toUserResponse(&user)})
}

func (h *Handler) Me(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	var user models.User
	if err := h.DB.Users.FindOne(ctx, bson.M{"_id": currentUserID(c)}).Decode(&user); err != nil {
		fail(c, http.StatusUnauthorized, "account not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": toUserResponse(&user)})
}

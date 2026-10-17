package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type User struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name         string             `bson:"name" json:"name"`
	Email        string             `bson:"email" json:"email"`
	PasswordHash string             `bson:"password_hash" json:"-"`
	CreatedAt    time.Time          `bson:"created_at" json:"createdAt"`
}

type PollOption struct {
	ID   string `bson:"id" json:"id"`
	Text string `bson:"text" json:"text"`
}

type Poll struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Slug        string             `bson:"slug" json:"slug"`
	OwnerID     primitive.ObjectID `bson:"owner_id" json:"ownerId"`
	Question    string             `bson:"question" json:"question"`
	Description string             `bson:"description,omitempty" json:"description,omitempty"`
	Options     []PollOption       `bson:"options" json:"options"`
	MultiSelect bool               `bson:"multi_select" json:"multiSelect"`
	Closed      bool               `bson:"closed" json:"closed"`
	ExpiresAt   *time.Time         `bson:"expires_at,omitempty" json:"expiresAt,omitempty"`
	CreatedAt   time.Time          `bson:"created_at" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updated_at" json:"updatedAt"`
}

// Vote is the durable audit record of a single ballot. The live counts that
// power the UI are maintained in Redis, but every ballot is persisted here so
// results survive a Redis restart and can be reconciled.
type Vote struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	PollID    primitive.ObjectID `bson:"poll_id" json:"pollId"`
	VoterHash string             `bson:"voter_hash" json:"voterHash"`
	OptionIDs []string           `bson:"option_ids" json:"optionIds"`
	CreatedAt time.Time          `bson:"created_at" json:"createdAt"`
}

// PublicPoll is the shape served to the voting audience. Voting is anonymous,
// so no owner or internal fields leak here.
type PublicPoll struct {
	Slug        string         `json:"slug"`
	Question    string         `json:"question"`
	Description string         `json:"description,omitempty"`
	Options     []PollOption   `json:"options"`
	MultiSelect bool           `json:"multiSelect"`
	Closed      bool           `json:"closed"`
	ExpiresAt   *time.Time     `json:"expiresAt,omitempty"`
	TotalVotes  int64          `json:"totalVotes"`
	Counts      map[string]int64 `json:"counts"`
	Viewers     int64          `json:"viewers"`
}

// PollSummary is used on the owner dashboard: poll metadata + live totals.
type PollSummary struct {
	Poll
	TotalVotes int64            `json:"totalVotes"`
	Counts     map[string]int64 `json:"counts"`
	Viewers    int64            `json:"viewers"`
}

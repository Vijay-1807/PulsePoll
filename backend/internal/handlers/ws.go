package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/bonthavijay/pulsepoll/backend/internal/hub"
	"github.com/bonthavijay/pulsepoll/backend/internal/validate"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Poll watching is public and read-only; ballots go through the
	// rate-limited REST endpoint, so cross-origin sockets are harmless.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// WatchPoll upgrades to a WebSocket and streams live events for one poll.
// Redis pub/sub is the transport between instances; this handler only deals
// with the clients physically attached to this process.
func (h *Handler) WatchPoll(c *gin.Context) {
	slug := c.Param("slug")
	if !validate.ValidSlug(slug) {
		fail(c, http.StatusNotFound, "poll not found")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	poll, err := h.findPollBySlug(ctx, slug)
	cancel()
	if err != nil {
		fail(c, http.StatusInternalServerError, "could not load poll")
		return
	}
	if poll == nil {
		fail(c, http.StatusNotFound, "poll not found")
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return // Upgrade already wrote the error response.
	}

	pollID := poll.ID.Hex()
	connID := uuid.NewString()
	client := hub.NewClient(h.Hub, conn, pollID, connID)

	// Register first so this client also receives the presence snapshot it
	// triggers, then count it as a viewer.
	h.Hub.Register(client)

	// Presence: joining counts as a viewer until the heartbeat window lapses.
	bg := context.Background()
	if viewers, err := h.RDB.AddViewer(bg, pollID, connID); err == nil {
		h.Hub.BroadcastPresence(pollID, viewers)
	}

	onHeartbeat := func() {
		if viewers, err := h.RDB.TouchViewer(bg, pollID, connID); err == nil {
			h.Hub.BroadcastPresence(pollID, viewers)
		}
	}

	// Send the current snapshot immediately so the UI never renders stale.
	optionIDs := make([]string, len(poll.Options))
	for i, o := range poll.Options {
		optionIDs[i] = o.ID
	}
	if counts, total, err := h.RDB.GetResults(bg, pollID, optionIDs); err == nil {
		raw, _ := json.Marshal(hub.Event{
			Type:   "state",
			PollID: pollID,
			Payload: map[string]any{
				"counts": counts,
				"total":  total,
				"closed": poll.Closed || pollIsExpired(poll, time.Now().UTC()),
			},
		})
		client.Enqueue(raw)
	}

	go client.WritePump()
	// Blocks until the socket closes.
	client.ReadPump(onHeartbeat)

	if viewers, err := h.RDB.RemoveViewer(bg, pollID, connID); err == nil {
		h.Hub.BroadcastPresence(pollID, viewers)
	}
}

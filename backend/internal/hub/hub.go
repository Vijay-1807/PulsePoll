// Package hub couples Redis pub/sub to locally connected WebSocket clients.
// Every backend instance subscribes once to Redis and fans events out to the
// clients it actually holds, so the design scales horizontally: a vote taken
// on instance A reaches viewers on instance B through Redis.
package hub

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 75 * time.Second
	pingPeriod     = 30 * time.Second
	maxMessageSize = 1024
	sendBuffer     = 64
)

type Event struct {
	Type    string `json:"type"`
	PollID  string `json:"pollId,omitempty"`
	Payload any    `json:"payload,omitempty"`
}

type Client struct {
	Conn   *websocket.Conn
	PollID string
	ID     string
	send   chan []byte
	hub    *Hub
}

// NewClient wires a connection to its hub so lifecycle hooks (unregister,
// broadcast) always have a valid pointer.
func NewClient(h *Hub, conn *websocket.Conn, pollID, id string) *Client {
	return &Client{
		Conn:   conn,
		PollID: pollID,
		ID:     id,
		send:   make(chan []byte, sendBuffer),
		hub:    h,
	}
}

type Hub struct {
	mu       sync.RWMutex
	rooms    map[string]map[*Client]bool
	presence map[string]int64
}

func New() *Hub {
	return &Hub{
		rooms:    make(map[string]map[*Client]bool),
		presence: make(map[string]int64),
	}
}

// RunChannel receives redis pub/sub messages from the provided channel and
// routes each one to local viewers of the addressed poll. The two-element
// array is {channel, payload}.
func (h *Hub) RunChannel(ctx context.Context, ch <-chan [2]string) {
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			pollID := strings.TrimPrefix(msg[0], "pp:events:")
			if pollID == msg[0] {
				continue
			}
			h.broadcast(pollID, []byte(msg[1]))
		}
	}
}

func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	if h.rooms[c.PollID] == nil {
		h.rooms[c.PollID] = make(map[*Client]bool)
	}
	h.rooms[c.PollID][c] = true
	h.mu.Unlock()
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	if room, ok := h.rooms[c.PollID]; ok {
		if _, exists := room[c]; exists {
			delete(room, c)
			close(c.send)
		}
		if len(room) == 0 {
			delete(h.rooms, c.PollID)
		}
	}
	h.mu.Unlock()
}

func (h *Hub) broadcast(pollID string, payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[pollID] {
		select {
		case c.send <- payload:
		default:
			// Slow consumer: drop the message rather than stalling the room.
			log.Printf("hub: dropping message for slow client %s", c.ID)
		}
	}
}

// BroadcastPresence pushes a viewer-count update to everyone watching a poll.
// It is deduplicated so heartbeats do not spam clients with identical counts.
func (h *Hub) BroadcastPresence(pollID string, viewers int64) {
	h.mu.Lock()
	if h.presence[pollID] == viewers {
		h.mu.Unlock()
		return
	}
	h.presence[pollID] = viewers
	h.mu.Unlock()

	payload, _ := json.Marshal(Event{
		Type:   "presence",
		PollID: pollID,
		Payload: map[string]int64{"viewers": viewers},
	})
	h.broadcast(pollID, payload)
}

func (h *Hub) LocalViewers(pollID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[pollID])
}

// ---------- Client pumps ----------

func (c *Client) Send(event Event) {
	raw, err := json.Marshal(event)
	if err != nil {
		return
	}
	select {
	case c.send <- raw:
	default:
	}
}

// ReadPump processes incoming client frames. The only thing clients are
// allowed to send is a heartbeat; everything else is ignored.
func (c *Client) ReadPump(onHeartbeat func()) {
	defer func() {
		c.hub.Unregister(c)
		_ = c.Conn.Close()
	}()
	c.Conn.SetReadLimit(maxMessageSize)
	_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		return c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		_, raw, err := c.Conn.ReadMessage()
		if err != nil {
			return
		}
		_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		var msg struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(raw, &msg); err == nil && msg.Type == "heartbeat" {
			onHeartbeat()
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.Conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// Enqueue initial state to a freshly connected client (non-blocking).
func (c *Client) Enqueue(raw []byte) {
	select {
	case c.send <- raw:
	default:
	}
}

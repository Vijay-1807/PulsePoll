# PulsePoll — 3-5 Minute Walkthrough Video Script
**Candidate**: Bontha Vijay  
**Role**: Developer Internship (HCL GUVI)  
**Submission Email**: devhiring@hclguvi.com  

---

## 📋 Pre-Recording Checklist (Do this 2 minutes before recording)
1. **Screen Resolution**: Set recording to 1080p (1920x1080) at 60fps or 30fps.
2. **Audio Check**: Test microphone for 5 seconds to ensure loud, crisp, and clear voice.
3. **Browser Setup**:
   - **Left Window (60% width)**: Chrome Desktop browser logged into PulsePoll dashboard.
   - **Right Window (40% width)**: Chrome Incognito or Mobile Device view (F12 -> Responsive) opened to the public poll URL.
4. **Backend Warm-up**: If testing against Render, visit the `/api/health` endpoint once so the ~50-second free-tier cold start is complete and the demo is lightning fast.
5. **Timer**: Keep a phone timer set to 4 minutes to stay comfortably within the 3–5 minute mark.

---

## 🎬 Minute-by-Minute Script & Camera Actions

### ⏱️ 0:00 – 0:35 | Introduction & Problem Statement
**Screen**: Landing page of PulsePoll (`/`), slowly scroll past hero to the live preview card.

**What to Say (Word-for-Word)**:
> *"Hello Muruganantham and the GUVI Engineering team. My name is Bontha Vijay, and this is my submission for the Developer Internship task: **PulsePoll**, a high-performance live polling tool.*
>
> *The core objective was straightforward but technically demanding: build a system where a user creates a poll, shares a link, an audience votes on it, and every person watching sees results update instantly in real-time with **zero page reloads** and no manual polling.*
>
> *I built this using the exact required technology stack: **React with TypeScript** on the frontend, **Go using Gin** for the backend REST and WebSocket server, **MongoDB** for durable persistence, and **Redis** driving the live memory counters, deduplication, and real-time Pub/Sub distribution."*

---

### ⏱️ 0:35 – 1:15 | Authentication & Creating a Poll
**Screen**: Click "Sign In" or "Get Started". Show the clean auth screen, log into your account, and navigate to "New Poll".

**What to Say (Word-for-Word)**:
> *"To meet the requirement that poll creation isn't wide open to anyone, I implemented session-based JWT authentication with bcrypt password hashing at cost factor 12, protected by server-side rate limiting.*
>
> *Let's create a new poll. I'll enter our question: 'Which backend runtime is best for high-throughput distributed systems?'*
> *For options, let's add: 'Go (Goroutines)', 'Node.js (Event Loop)', 'Elixir (BEAM Actor Model)', and 'Rust (Tokio)'.*
> *Notice our configuration toggles: we can enable single or multi-select, and an optional auto-close countdown timer.*
>
> *When I click 'Create Poll', the backend validates every field, verifies option uniqueness, creates an indexed slug, and immediately redirects us to the live room."*

---

### ⏱️ 1:15 – 2:20 | The Live Moment (Real-Time Synchronized Voting)
**Screen**: Place two windows side by side.
- Left Window: Logged-in Creator view showing the real-time results card.
- Right Window: Anonymous voter on the public share URL (`/p/<slug>`).

**What to Say (Word-for-Word)**:
> *"Now for the most important requirement: **true real-time updates with no refresh**.*
>
> *On the right, we have an audience member who opened our share link. Notice that both windows immediately reflect the presence counter: '2 watching now'. This presence is tracked via Redis sorted sets with heartbeat pruning.*
>
> *Now, watch the Left window carefully as I submit a vote for 'Go (Goroutines)' on the Right:*
> *(Click Vote on Right Window — watch Left window immediately animate and update)*
>
> *Without touching the Left window and without refreshing, the vote counter immediately ticked up to 1, the percentage bar animated, and the live activity ticker registered the anonymous pick in under 40 milliseconds.*
>
> *If I try to vote a second time on the Right window, it blocks me. The server enforces strict one-person-one-vote using a SHA-256 fingerprint derived from voter ID, client IP, and user-agent. This is verified atomically against Redis sets and guarded at the database level by a compound unique index in MongoDB.*
>
> *Let's open another window or vote for 'Rust (Tokio)' — both screens update synchronously."*

---

### ⏱️ 2:20 – 3:15 | MANDATORY QUESTION 1: The One Challenge That Gave Me the Most Trouble
**Screen**: Briefly show the Go architecture diagram from the README, or highlight `backend/internal/cache/redis.go` and `backend/cmd/server/main.go`.

**What to Say (Word-for-Word)**:
> *"Now I want to directly answer the two mandatory questions from the assignment brief.*
>
> *First: **What was the one challenge that gave you the most trouble, and how did you solve it?***
>
> *The hardest technical challenge was **maintaining atomic consistency between Redis and MongoDB under concurrent voting without data drift or race conditions**.*
>
> *In a naive architecture, developers often use Redis as a write-behind cache. But if the Redis instance crashes or restarts on a free cloud tier, votes in memory that haven't flushed to disk are lost forever. Conversely, querying MongoDB on every single WebSocket broadcast creates a massive database bottleneck.*
>
> *Here is how I solved it:*
> 1. *First, I implemented **Write-Through Durability**: every vote commits first to MongoDB with a unique index on `(poll_id, voter_hash)`. This provides a guaranteed audit trail and prevents double-ballots at the database engine level.*
> 2. *Second, once saved, Go atomically increments the Redis hash counters (`HINCRBY`) and total count in a single Redis pipeline, then publishes the full snapshot across Redis Pub/Sub (`pp:events:<pollId>`).*
> 3. *Third, to ensure Redis can never drift from MongoDB, I wrote a self-healing bootstrapper: when the Go backend starts up, `warmCache()` recomputes all active poll counters directly from MongoDB aggregate pipelines. In addition, a background Goroutine reconciles Redis totals against MongoDB every 5 minutes to repair any anomalies automatically.*
>
> *This makes Redis lightning fast while keeping MongoDB the immutable source of truth."*

---

### ⏱️ 3:15 – 4:05 | MANDATORY QUESTION 2: Did You Use Any AI Tools?
**Screen**: Show the project codebase structure (`/frontend` and `/backend` folders) and the Playwright automated test suite.

**What to Say (Word-for-Word)**:
> *"Second question: **Did you use any AI tools while building this? If yes, which ones and how did they help or get in the way?***
>
> *Yes, I actively used AI coding assistants (Gemini and Claude).*
>
> *Where they helped:*
> - *AI was fantastic for rapid boilerplate acceleration: drafting TypeScript interfaces, writing the MongoDB aggregation pipeline syntax for vote rollups, and generating comprehensive Playwright end-to-end test fixtures.*
> - *It helped me quickly scaffold the Tailwind utility classes and responsive layouts.*
>
> *Where they got in the way and failed:*
> - *AI repeatedly recommended naive patterns that violated production principles. For instance, it initially suggested simple polling intervals (`setInterval`) or in-memory Go maps instead of Redis Pub/Sub.*
> - *When handling WebSockets, the AI-generated code caused infinite reconnect loops under React 18 StrictMode due to component double-mounting. It also failed to handle Go Goroutine channel leaks when a WebSocket client disconnects abruptly.*
>
> *I had to reject the AI's naive implementations and write custom socket cleanup lifecycles, structured Goroutine lifecycles with `context.WithCancel`, and the distributed Redis Pub/Sub architecture myself. In short: AI was a great typing accelerator, but the architectural decisions, concurrency safety, and system resilience were entirely human-driven."*

---

### ⏱️ 4:05 – 4:40 | Extra Features & Conclusion
**Screen**: Show Dashboard, click "Share" (display QR code), show "Votes Over Time" chart, click "Export CSV".

**What to Say (Word-for-Word)**:
> *"To make this genuinely production-ready, I added several high-value features:*
> - *A dynamic **QR Code generator** and one-click share modal so audience members in an auditorium can scan and vote in seconds.*
> - *A live **Votes Over Time** timeline chart built with Recharts.*
> - *One-click **CSV export** for poll owners to download full vote audit summaries.*
> - *A complete **Playwright end-to-end test suite** verifying the multi-browser live flow, authentication boundaries, and input validation.*
>
> *The frontend is deployed live on Vercel, the Go API and Redis are deployed on Render, and MongoDB is hosted on Atlas.*
>
> *Thank you Muruganantham and the GUVI team for reviewing my submission. I look forward to the next steps!"*

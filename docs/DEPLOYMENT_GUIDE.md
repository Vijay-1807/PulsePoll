# PulsePoll Deployment Guide (Render + Vercel + MongoDB Atlas)

This guide walks you through deploying PulsePoll to free-tier cloud platforms.

---

## Architecture Overview
- **Database**: MongoDB Atlas (Free M0 Tier) - Stores users, polls, and immutable vote records.
- **Backend & Redis**: Render (Free Web Service + Free Key Value) - Runs Go (Gin) API and Redis.
- **Frontend**: Vercel (Free Hobby Tier) - Serves React + TypeScript SPA.

---

## Step 1 — MongoDB Atlas (Database)
1. Go to https://cloud.mongodb.com and log in or create a free account.
2. In **Database Access**: create a database user (e.g. `infosys1807`).
3. In **Network Access**: add IP `0.0.0.0/0` (Allow access from anywhere). This is required because Render free web services have dynamic IPs.
4. Click **Connect** → **Drivers** (Go) → copy connection string:
   ```
   mongodb+srv://infosys1807:<password>@cluster0.ar3btyr.mongodb.net/?retryWrites=true&w=majority
   ```

---

## Step 2 — Render (Go API + Redis)
1. Go to https://render.com and log in with GitHub.
2. Click **New +** → **Blueprint**.
3. Connect repo: **`Vijay-1807/PulsePoll`**.
4. Render detects `render.yaml` and provisions:
   - `pulsepoll-api` (Go Gin backend)
   - `pulsepoll-redis` (Redis Key Value store)
5. Fill environment variables when prompted:
   - `MONGO_URI`: your full MongoDB connection string with password.
   - `CORS_ORIGINS`: `https://placeholder.vercel.app` (updated in Step 4).
6. Click **Apply**.
7. Once deployed, verify:
   ```
   https://<your-service>.onrender.com/api/health
   ```
   Expected response:
   ```json
   {"mongo":true,"redis":true,"status":"ok"}
   ```

---

## Step 3 — Vercel (React Frontend)
1. Go to https://vercel.com and log in with GitHub.
2. Click **Add New...** → **Project** → import `Vijay-1807/PulsePoll`.
3. Set **Root Directory** to `frontend`.
4. Add Environment Variable:
   - `VITE_API_URL`: your Render backend URL (e.g., `https://pulsepoll-api-xxxx.onrender.com`, no trailing slash).
5. Click **Deploy**.

---

## Step 4 — Link CORS on Render
1. Go to Render Dashboard → `pulsepoll-api` → **Environment**.
2. Update `CORS_ORIGINS` with your actual Vercel URL (e.g., `https://pulsepoll-frontend-xxxx.vercel.app`).
3. Click **Save Changes**.

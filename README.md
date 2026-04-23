# YouTube Watch Party

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![Socket.IO](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![MongoDB](https://img.shields.io/badge/mongodb-%234ea94b.svg?style=for-the-badge&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)

A real-time YouTube Watch Party app. Users create or join rooms, stream YouTube videos together with sub-second playback sync, manage roles, and chat live.

**Live demo:** https://youtube-watch-party-c2y.pages.dev/

> Backend is a free-tier Render service, so the **first request after ~15 min idle takes ~30 s** to cold-start. Subsequent requests are instant. Open two tabs (or share the link with a friend) to test sync.

---

## Table of Contents

1. [Features](#features)
2. [Architecture Overview](#architecture-overview)
3. [Tech Stack](#tech-stack)
4. [Local Development Setup](#local-development-setup)
5. [Environment Variables](#environment-variables)
6. [Production Deployment](#production-deployment)
7. [Horizontal Scaling](#horizontal-scaling)
8. [REST API](#rest-api)
9. [WebSocket Events](#websocket-events)
10. [Role Permissions](#role-permissions)
11. [Manual Test Plan](#manual-test-plan)
12. [Further Reading](#further-reading)

---

## Features

- **Real-time playback sync** (`play`, `pause`, `seek`, `change_video`) across all connected participants, backed by an authoritative server state and drift-tolerance thresholds.
- **Role-based permissions:** host and moderators control playback; participants are watch-only.
- **Host management:** promote/demote, kick, and transfer host with atomic MongoDB updates.
- **Late-joiner sync** via `sync_state` on join so new users land on the same timestamp everyone else is watching.
- **In-room chat** with role badges and system join/leave messages.
- **Scrub-without-flooding** — the seek slider emits one event per drag (commit-on-release), with backend coalescing + per-socket rate limits.
- **Silent reconnect grace window** — brief network blips don't broadcast a "left the room" to everyone. State is persisted in MongoDB so it survives process restarts and cross-instance reconnects.
- **Responsive dark UI** tuned for desktop, tablet, and mobile.

---

## Architecture Overview

```mermaid
graph TD
    subgraph Clients
      A[Client A<br/>React + YT Player]
      B[Client B]
      C[Client C]
    end

    subgraph "Cloudflare Pages (static)"
      CF[Client bundle]
    end

    subgraph "Render (backend)"
      S[Node.js + Express + Socket.IO]
    end

    subgraph Datastores
      M[(MongoDB Atlas)]
      R[(Redis — Pub/Sub adapter)]
    end

    A & B & C -->|HTTPS| CF
    A & B & C <-->|REST + Socket.IO| S
    S <-->|Mongoose| M
    S <-->|@socket.io/redis-adapter| R
```

**Why this shape:**

- **Client on Cloudflare Pages** — free global CDN, instant cache invalidation, zero cold starts for static files.
- **API + Socket.IO on Render** — always-on WebSocket server, free tier.
- **MongoDB Atlas (free M0)** — shared authoritative state.
- **Redis** — Socket.IO Pub/Sub adapter so broadcasts work across **N ≥ 2** Node instances when you scale horizontally.

When `REDIS_URL` is set the server uses the [Redis adapter](https://socket.io/docs/v4/redis-adapter/). Without it, the server runs in single-process mode (development only — production boots will refuse to start unless `REDIS_URL` is configured).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| Realtime | Socket.IO + `@socket.io/redis-adapter` |
| Database | MongoDB + Mongoose |
| Cache / Pub-Sub | Redis |
| Video | YouTube IFrame Player API |
| Styling | Vanilla CSS + CSS variables |

**Monorepo layout** (npm workspaces):

```
.
├── client/              # React + Vite app → deployed to Cloudflare Pages
├── server/              # Express + Socket.IO API → deployed to Render
├── render.yaml          # Render blueprint
├── .env.example         # Environment template
├── OPTIMIZATIONS.md     # Running changelog of perf/scale work
├── INTERVIEW_NOTES.md   # Design rationale + technical deep-dives
└── package.json         # Workspace root
```

---

## Local Development Setup

### Prerequisites

- **Node.js 18+** and **npm**
- **MongoDB** — either a local install, or a free [Atlas](https://www.mongodb.com/atlas/database) cluster
- **Redis** *(optional for dev)* — either run locally via Docker or leave `REDIS_URL` blank for single-process mode

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/youtube-watch-party-app.git
cd youtube-watch-party-app
npm install
```

This installs both workspaces (`client/` and `server/`) from the root.

### 2. Configure environment

Copy the template and fill in the values:

```bash
cp .env.example .env
```

Minimal working `.env` for local dev:

```env
# --- Server ---
PORT=3001
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/youtube-watch-party
MONGO_MAX_POOL_SIZE=50
FRONTEND_URL=http://localhost:5173

# Leave blank to run in single-process mode (fine for local dev)
REDIS_URL=

# --- Client ---
VITE_API_URL=http://localhost:3001/api
```

If you want to test the Redis adapter locally:

```bash
docker run -p 6379:6379 redis:7-alpine
# then in .env:
# REDIS_URL=redis://127.0.0.1:6379
```

### 3. Run

```bash
npm run dev
```

This starts both workspaces concurrently:

- **Client:** http://localhost:5173
- **Server:** http://localhost:3001
- **Health:** http://localhost:3001/api/health
- **Readiness:** http://localhost:3001/api/ready (returns 503 when Redis is configured but unreachable)

### Available scripts

| Script | Purpose |
|---|---|
| `npm run dev` | client + server concurrently |
| `npm run dev:client` | frontend only |
| `npm run dev:server` | backend only |
| `npm run build` | build both workspaces |
| `npm run start` | run the production server (`server/dist/index.js`) |
| `npm run lint` | lint both workspaces |

---

## Environment Variables

| Variable | Where | Required | Description |
|---|---|---|---|
| `PORT` | server | No (default `3001`) | HTTP port |
| `NODE_ENV` | server | Yes in prod | `development` or `production` |
| `MONGO_URI` | server | **Yes** | MongoDB connection string |
| `MONGO_MAX_POOL_SIZE` | server | No (default `50`, clamped `10–100`) | Mongoose pool cap |
| `FRONTEND_URL` | server | **Yes in prod** | Comma-separated allow-list for CORS. If any entry contains `.pages.dev`, production also allows any `https://*.pages.dev` origin (for Cloudflare Pages previews). Set `CORS_STRICT_CLOUDFLARE=true` to disable that wildcard. |
| `REDIS_URL` | server | **Yes in prod** | `redis://…` or `rediss://…`. Server refuses to boot in production if missing. |
| `CORS_STRICT_CLOUDFLARE` | server | No | Set to `true` to disable the Cloudflare Pages preview wildcard |
| `VITE_API_URL` | client | No in prod (same-origin) | `http://localhost:3001/api` for local; absolute URL of your Render backend for the Cloudflare Pages build |

---

## Production Deployment

This repo is deployed in a **split-stack** configuration:

| Piece | Host | Free tier? |
|---|---|---|
| Client static bundle | Cloudflare Pages | Yes |
| API + Socket.IO | Render Web Service | Yes (sleeps after 15 min idle) |
| Database | MongoDB Atlas | Yes (M0, 512 MB) |
| Redis | Redis Cloud | Yes (30 MB) |

### Deploy the backend (Render)

1. New Render **Web Service** → connect this repo.
2. **Build command:** `npm install && npm run build`
3. **Start command:** `npm run start --workspace=server`
4. **Health check path:** `/api/ready` (not `/api/health` — `/api/ready` also checks Redis connectivity)
5. **Environment variables:**
    ```
    NODE_ENV=production
    MONGO_URI=<your Atlas URI>
    REDIS_URL=<your Redis URL, e.g. rediss://:pass@host:6379>
    FRONTEND_URL=https://<your-frontend>.pages.dev
    ```
6. Deploy. First boot will log:
    ```
    [Redis pub] ready
    [Redis sub] ready
    [Socket.IO] Redis adapter enabled (multi-instance broadcast)
    Server running on port 10000
    ```

### Deploy the frontend (Cloudflare Pages)

1. New Pages project → connect this repo.
2. **Build command:** `npm install && npm run build --workspace=client`
3. **Build output directory:** `client/dist`
4. **Environment variables:**
    ```
    VITE_API_URL=https://<your-backend>.onrender.com/api
    ```
5. Deploy. Cloudflare assigns `https://<project>.pages.dev` — add that to the backend's `FRONTEND_URL` allow-list.

A `render.yaml` blueprint is included for reference; Cloudflare Pages is configured via the dashboard (there's no equivalent blueprint file).

---

## Horizontal Scaling

The app is architected for multi-instance deployment. Everything runtime-sensitive is either atomic in MongoDB, persisted in MongoDB, or fanned out via Redis:

| Concern | How it's solved |
|---|---|
| Broadcasts across nodes | `@socket.io/redis-adapter` + `REDIS_URL` |
| Role / host-change invalidation | `io.serverSideEmit(…)` fan-out, each node re-applies to its local sockets |
| Cross-instance kick | Same `serverSideEmit` pattern |
| Disconnect-grace window | Persisted on `participants.disconnectedAt` in MongoDB (survives restarts, works across instances) |
| Authoritative room state | MongoDB with atomic `findOneAndUpdate` / `updateOne` — no read-before-write |
| Health signal for LB | `/api/ready` returns **503** when Redis adapter is not live |

### Deploy checklist for ≥ 2 app replicas

1. **`REDIS_URL` must be set on every instance.** The server refuses to boot in production without it.
2. **Sticky sessions on the load balancer.** Socket.IO's polling-fallback handshake is per-process (see [Why sticky sessions?](./INTERVIEW_NOTES.md#why-sticky-sessions) in the notes). Render exposes this on paid plans; Fly.io supports it natively.
3. Point the LB's **health check at `/api/ready`** so unhealthy instances are rotated out during Redis hiccups.
4. Keep `MONGO_URI` shared across instances.

> **Free-tier note:** this repo's live demo runs on a single Render free-tier instance. The code is multi-instance ready, but horizontal scaling on Render itself requires a paid plan. To demo multi-instance for free, deploy to **Fly.io** (`fly scale count 2` on the free tier) instead — same env vars, same code.

---

## REST API

| Method | Endpoint | Body | Response |
|---|---|---|---|
| `POST` | `/api/rooms` | `{ username }` | `{ roomId, roomCode, participantId, role }` |
| `POST` | `/api/rooms/join` | `{ roomCode, username }` | `{ roomId, participantId, role }` |
| `GET`  | `/api/rooms/:roomId` | – | Room details with participants + video state |
| `GET`  | `/api/health` | – | Liveness — always `200` while the process is up |
| `GET`  | `/api/ready` | – | Readiness — `503` if Redis adapter is configured but offline |

---

## WebSocket Events

| Event | Direction | Payload |
|---|---|---|
| `join_room` | Client → Server | – |
| `leave_room` | Client → Server | – |
| `user_joined` | Server → Room | `{ username, participantId, role, participants }` |
| `user_reconnected` | Server → Room | `{ username, participantId, participants }` |
| `user_left` | Server → Room | `{ username, participantId, participants }` |
| `sync_state` | Server → Client | `{ isPlaying, currentTime, videoId, timestamp }` |
| `room_snapshot` | Server → Client | `{ participantId, role, hostId, participants }` |
| `play` | Client → Server | `{ currentTime }` |
| `pause` | Client → Server | `{ currentTime }` |
| `seek` | Client → Server | `{ time }` |
| `change_video` | Client → Server | `{ videoId }` |
| `host_heartbeat` | Client → Server | `{ currentTime, isPlaying }` |
| `assign_role` | Client → Server | `{ targetUserId, role }` |
| `remove_participant` | Client → Server | `{ targetUserId }` |
| `transfer_host` | Client → Server | `{ targetUserId }` |
| `role_assigned` | Server → Room | `{ userId, username, newRole, participants }` |
| `participant_removed` | Server → Room | `{ userId, username, participants }` |
| `host_transferred` | Server → Room | `{ newHostId, participants }` |
| `kicked` | Server → Client | `{ message }` |
| `chat_message` | Client → Server | `{ message }` |
| `chat_broadcast` | Server → Room | `{ username, role, message, timestamp }` |

---

## Role Permissions

| Action | Host | Moderator | Participant |
|---|:---:|:---:|:---:|
| Play / Pause | ✓ | ✓ | ✕ |
| Seek | ✓ | ✓ | ✕ |
| Change video | ✓ | ✓ | ✕ |
| Assign role | ✓ | ✕ | ✕ |
| Remove participant | ✓ | ✕ | ✕ |
| Transfer host | ✓ | ✕ | ✕ |
| Send chat message | ✓ | ✓ | ✓ |

---

## Manual Test Plan

1. Open 2–3 tabs pointed at the client URL.
2. Create a room from tab 1, join from tabs 2 & 3 using the room code.
3. Verify playback sync: play, pause, scrub, and change video. All tabs should stay within ~1 s.
4. Drag the seek bar rapidly — only one `seek` event per release should fire (check the server log).
5. RBAC:
    - Participant UI hides playback controls.
    - Host can promote to moderator, demote, and transfer host.
    - Moderator gains playback controls immediately (no refresh).
6. Kick a participant from the host tab — the kicked tab should be redirected.
7. Kill the server (Ctrl-C), bring it back within 15 s — clients reconnect silently, no "user left" events.
8. Chat — verify messages appear in all tabs with correct role badges and rate-limited at 5 msgs / 3 s.

---

## Further Reading

- **[`OPTIMIZATIONS.md`](./OPTIMIZATIONS.md)** — Running changelog of every perf/scale/reliability change with problem, fix, files touched, and measurable impact.
- **[`INTERVIEW_NOTES.md`](./INTERVIEW_NOTES.md)** — Design rationale and technical deep-dives: seek flooding, DB audit findings, Redis-adapter scaling, sticky-session reasoning.

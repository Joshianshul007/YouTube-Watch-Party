# YouTube Watch Party

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101)
![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/mongodb-%234ea94b.svg?style=for-the-badge&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)

A real-time YouTube watch party web app. Create a room, share the 6-character code, and watch YouTube videos together with frame-accurate synced playback, role-based controls (host / moderator / participant), live chat, and silent reconnect on network blips.

---

## Live Demo

**App:** https://youtube-watch-party-c2y.pages.dev/

> The backend runs on Render's free tier and sleeps after 15 min of inactivity, so the first request may take ~30 s to wake it up. Subsequent requests are instant.

---

## Features

- **Synced playback** — play, pause, seek, and change-video events are propagated to every participant within a fixed drift tolerance.
- **Three-tier role model** — `host` (full control), `moderator` (playback control), `participant` (view + chat).
- **Host controls** — promote, demote, kick, transfer host; automatic host reassignment on host departure.
- **Late-join auto-sync** — new joiners receive the current video state (id + timestamp + play/pause) as part of their join snapshot.
- **Silent reconnect grace window** — a 15 s grace period means brief network blips don't remove you from the room; persisted in MongoDB so it survives across Node instances.
- **Live chat** — rate-limited (5 messages / 3 s per socket), with system join/leave/rejoin messages.
- **Drift-corrected player** — clients compute an authoritative target time using server `lastUpdated` and only seek when drift exceeds tolerance (1 s playing / 0.3 s paused).
- **Horizontal scaling ready** — Socket.IO with Redis adapter, cross-instance role-cache invalidation, cross-instance kick broadcasting.
- **Responsive dark UI** — desktop and mobile.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, React Router 7, Axios, Socket.IO client, lucide-react, react-hot-toast |
| Backend | Node.js 18+, Express 4, TypeScript, Socket.IO 4 |
| Database | MongoDB 6 + Mongoose 9 |
| Realtime scaling | Redis + `@socket.io/redis-adapter` |
| Video player | YouTube IFrame Player API |
| Deployment | Cloudflare Pages (frontend), Render (backend), any managed MongoDB + Redis |

---

## Folder Structure

```
youtube-watch-party-app/
├── client/                          # React + Vite frontend
│   ├── public/
│   │   ├── _redirects               # SPA fallback for Cloudflare Pages
│   │   └── favicon.svg
│   └── src/
│       ├── components/              # VideoPlayer, ControlsBar, ChatPanel, etc.
│       ├── context/RoomContext.tsx  # Global room state (participants, role, socket…)
│       ├── hooks/
│       │   ├── useSocket.ts         # Owns socket lifecycle + server events
│       │   └── useYouTubePlayer.ts  # IFrame API wrapper + drift correction
│       ├── pages/                   # LandingPage, RoomPage
│       ├── services/api.ts          # REST client (Axios)
│       ├── styles/                  # Landing, room, chat CSS
│       ├── types/index.ts           # Shared TS types
│       └── utils/youtube.ts         # YouTube URL → videoId parser
│
├── server/                          # Express + Socket.IO backend
│   └── src/
│       ├── db/connect.ts            # Mongoose connection (pool, indexes)
│       ├── models/
│       │   ├── Participant.ts       # Plain class used at creation time
│       │   └── RoomSchema.ts        # Mongoose schema + indexes
│       ├── routes/roomRoutes.ts     # POST /rooms, POST /rooms/join, GET /rooms/:id
│       ├── socket/
│       │   ├── socketServer.ts      # Socket.IO init, Redis adapter, healthcheck
│       │   ├── middleware/authMiddleware.ts
│       │   ├── handlers/
│       │   │   ├── roomHandler.ts       # join_room / leave_room / disconnect
│       │   │   ├── playbackHandler.ts   # play / pause / seek / change_video / heartbeat
│       │   │   ├── managementHandler.ts # assign_role / remove_participant / transfer_host
│       │   │   └── chatHandler.ts       # chat_message (rate-limited)
│       │   └── utils/roleCache.ts   # Cross-instance role-cache + kick broadcast
│       ├── store/RoomStore.ts       # All Mongo reads/writes (lean + atomic)
│       ├── utils/
│       │   ├── corsAllowlist.ts     # Shared CORS checker (Express + Socket.IO)
│       │   └── generateId.ts        # UUID + 6-char room codes
│       └── index.ts                 # HTTP server bootstrap
│
├── scripts/build-interview-pdf.ps1  # Converts interview notes .md → print-ready PDF
├── .env.example
├── render.yaml                      # Render blueprint (backend)
├── package.json                     # npm workspaces root
└── README.md
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in. All backend variables are read by `server/src/` at boot; `VITE_*` variables are read by the client at build time.

| Variable | Where | Required? | Description |
|---|---|---|---|
| `PORT` | server | no (default `3001`) | HTTP + Socket.IO port |
| `NODE_ENV` | server | yes | `development` or `production` |
| `MONGO_URI` | server | yes | MongoDB connection string |
| `MONGO_MAX_POOL_SIZE` | server | no (default `50`, max `100`) | Mongoose connection pool cap |
| `FRONTEND_URL` | server | yes in prod | Comma-separated exact origins (no trailing slash). Used by the shared CORS checker for Express + Socket.IO. If any value contains `.pages.dev`, production also allows `https://*.pages.dev` previews; set `CORS_STRICT_CLOUDFLARE=true` to disable that. |
| `CORS_STRICT_CLOUDFLARE` | server | no | `true` to force exact-match on Cloudflare Pages origins |
| `REDIS_URL` | server | optional in dev, **required in prod** | `redis://` or `rediss://` URL; enables Socket.IO Redis adapter for multi-instance broadcast. Prod boot fails fast if missing. |
| `SERVE_CLIENT` | server | no | `false` to disable serving `client/dist` from the backend (split-deploy default) |
| `VITE_API_URL` | client (build-time) | no in dev | Full URL to the backend, e.g. `https://api.example.com/api`. If omitted, dev uses `http://localhost:3001/api` and prod uses same-origin `/api`. |

---

## Installation

### Prerequisites

- Node.js **18+**
- MongoDB (local or hosted)
- Redis (optional in dev, required in prod)

### 1. Clone and install

```bash
git clone https://github.com/Joshianshul007/YouTube-Watch-Party.git
cd youtube-watch-party-app
npm install
```

This is an **npm workspaces** monorepo, so a single install at the root installs both `client/` and `server/` deps.

### 2. Configure environment

```bash
cp .env.example .env
```

Minimal `.env` for local development:

```env
PORT=3001
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/youtube-watch-party
FRONTEND_URL=http://localhost:5173
REDIS_URL=
VITE_API_URL=http://localhost:3001/api
```

---

## How to Run

### Both client + server (dev)

```bash
npm run dev
```

Uses `concurrently` to run the server (`ts-node-dev`, hot reload) and the client (`vite`) in parallel.

- Client: http://localhost:5173
- Server: http://localhost:3001
- Healthcheck: http://localhost:3001/api/health
- Readiness (Redis): http://localhost:3001/api/ready

### Frontend only

```bash
npm run dev:client
```

### Backend only

```bash
npm run dev:server
```

---

## Build Commands

| Command | What it does |
|---|---|
| `npm run build` | Runs `vite build` in `client/` (outputs `client/dist/`) then `tsc` in `server/` (outputs `server/dist/`) |
| `npm run build --workspace=client` | Client build only — used by Cloudflare Pages |
| `npm run build --workspace=server` | Server build only |
| `npm run start` | Starts the compiled server (`node server/dist/index.js`) |
| `npm run lint` (in `client/`) | ESLint on the client |

---

## Deployment

The live demo uses a **split deploy**:

| Target | Platform | Config |
|---|---|---|
| Frontend | Cloudflare Pages | Build: `npm run build --workspace=client`, Output: `client/dist`. SPA fallback via `client/public/_redirects`. |
| Backend | Render Web Service | Blueprint: `render.yaml`. Build: `npm install --include=dev && npm run build`. Start: `npm run start --workspace=server`. |
| Database | MongoDB Atlas (or any hosted Mongo) | — |
| Redis | Any managed Redis (Upstash, Render Redis, Redis Cloud) | **Required in production** |

### Production environment

Backend (Render → Environment):

```
NODE_ENV=production
MONGO_URI=<mongodb connection string>
REDIS_URL=<redis connection string>
FRONTEND_URL=<deployed frontend URL>
```

Frontend (Cloudflare Pages → Environment variables):

```
VITE_API_URL=<backend URL>/api
```

### Production safety rails

- `server/src/socket/socketServer.ts` **throws at boot** if `NODE_ENV=production` and `REDIS_URL` is empty — prevents silent single-process mode behind a load balancer.
- `GET /api/ready` returns `503` when Redis is down so load balancers can rotate the instance out.
- `server/src/db/connect.ts` disables `autoIndex` in production and runs `syncIndexes()` explicitly at boot.
- CORS allowlist (`server/src/utils/corsAllowlist.ts`) is shared by Express and Socket.IO so HTTP and WebSocket policies can't drift.

---

## REST API

All routes are mounted under `/api`.

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/api/rooms` | `{ username }` | `201 { roomId, roomCode, participantId, role: 'host' }` |
| `POST` | `/api/rooms/join` | `{ roomCode, username }` | `200 { roomId, participantId, role: 'participant' }` |
| `GET`  | `/api/rooms/:roomId` | — | `200 { id, code, hostId, videoState, createdAt, participants }` |
| `GET`  | `/api/health` | — | `200 { status: 'ok' }` |
| `GET`  | `/api/ready`  | — | `200 { status: 'ready', redis: true }` or `503 { status: 'degraded', redis: false }` |

---

## Socket.IO Events

Handshake auth: `{ roomId, participantId }` sent via `io(url, { auth: ... })`. The middleware (`authMiddleware`) does one lean Mongo read and caches `role`, `username`, `hostId` on `socket.data` — no DB round-trips on subsequent events.

### Client → Server

| Event | Payload | Auth |
|---|---|---|
| `join_room` | — | any participant (must exist in room) |
| `leave_room` | — | self |
| `play` | `{ currentTime: number }` | host / moderator |
| `pause` | `{ currentTime: number }` | host / moderator |
| `toggle_playback` | `{ currentTime: number }` | host / moderator |
| `seek` | `{ time: number }` | host / moderator (coalesced server-side, hard-capped at 20/sec) |
| `change_video` | `{ videoId: string }` (validated `[a-zA-Z0-9_-]{11}`) | host / moderator |
| `host_heartbeat` | `{ currentTime, isPlaying }` (every 5 s) | host / moderator |
| `assign_role` | `{ targetUserId, role: 'moderator' \| 'participant' }` | host |
| `remove_participant` | `{ targetUserId }` | host |
| `transfer_host` | `{ targetUserId }` | host |
| `chat_message` | `{ message: string }` (≤ 300 chars, 5 per 3 s) | any participant |

### Server → Client

| Event | Payload |
|---|---|
| `room_snapshot` | `{ participantId, role, hostId, participants[] }` (on join) |
| `sync_state` | `{ isPlaying, currentTime, videoId, timestamp }` |
| `user_joined` | `{ username, participantId, role, participants[] }` |
| `user_reconnected` | `{ participantId, username, participants[] }` (within grace window) |
| `user_left` | `{ username, participantId, participants[] }` |
| `role_assigned` | `{ userId, username, newRole, participants[] }` |
| `participant_removed` | `{ userId, username, participants[] }` |
| `host_transferred` | `{ newHostId, participants[] }` |
| `kicked` | `{ message }` (targeted at the kicked user only) |
| `chat_broadcast` | `{ username, role, message, timestamp }` |

### Cross-instance (server ↔ server via Redis adapter)

| Event | Purpose |
|---|---|
| `role_cache:invalidate` | Patch cached role on sockets owned by other Node instances (see `socket/utils/roleCache.ts`) |
| `room:kick` | Force-disconnect a socket owned by another Node instance |

---

## Challenges Faced

1. **Frame-accurate sync across the internet.** The YouTube IFrame API doesn't expose a real clock, so the server stamps `lastUpdated` on every state mutation and clients compute the authoritative target as `currentTime + (now - lastUpdated)`. Clients only seek when drift exceeds tolerance (`1 s` while playing, `0.3 s` while paused) to avoid constant stutter.
2. **Seek flood during slider drag.** A naive implementation emits a `seek` on every slider change. We solved it with a two-layer defense: frontend commits one emit on `pointerup`/`touchend`/`keyup`/`blur` (with a 200 ms trailing-debounce safety net), and the server coalesces seeks in a 150 ms window with a hard cap of 20/sec/socket.
3. **Reconnect vs. leave.** A reconnect needed to look different from a leave, but the user's next socket could land on a different Node instance. Solution: persist `disconnectedAt` in MongoDB (not in per-process memory) and use the stored socketId as a CAS guard so a stale disconnect never clobbers a newer connection.
4. **Host transfer with cached roles.** Socket auth caches `role` on `socket.data` to avoid a DB read per playback event. When roles change, we patch live sockets on the local instance AND broadcast `role_cache:invalidate` via `io.serverSideEmit` so peer instances behind the Redis adapter patch their sockets too.
5. **Kicking a user connected to a different Node.** Same pattern — `room:kick` is broadcast cross-instance so whichever node owns the socket actually calls `disconnect(true)`.
6. **Autoplay blocked by browsers.** A muted overlay ("Tap to unmute / Tap to start sync") lets the user satisfy the browser's user-gesture requirement.
7. **Cloudflare Pages preview URLs.** Each preview gets a fresh `*.pages.dev` hostname, breaking exact-match CORS. The allowlist recognises `https://*.pages.dev` in production unless `CORS_STRICT_CLOUDFLARE=true`.
8. **Atomic host reassignment.** Demote old host + promote new host + update `hostId` all in one `findOneAndUpdate` using `arrayFilters` — no partial states.

---

## Future Improvements

- **Authentication** (currently anonymous per-room) — sign-in with OAuth, persistent user profiles.
- **Multiple videos / queue** — currently one video per room; add a playlist + voting.
- **Chat history persistence** — chat is in-memory / socket-broadcast only; persist to a capped collection.
- **Support more providers** — Vimeo, Twitch VOD, direct MP4.
- **Reactions / emojis** — ephemeral floating reactions synced to the video timeline.
- **Unit + integration tests** — Jest for pure logic, Playwright for end-to-end sync tests.
- **Observability** — structured logging (pino), metrics (Prom/OpenTelemetry), tracing.
- **E2E encryption for chat** — optional room-level passphrase.
- **Mobile apps** — React Native client sharing the same types.

### Missing in current repo

- `docs/screenshots/` for README images
- Automated tests (`client/` and `server/`)
- CI (GitHub Actions) for lint + build on PR
- A dedicated `LICENSE` file (repo is unlicensed right now)

---

## Author

**Joshi** — Full-stack developer

If you spin up a fork or find a bug, open an issue or reach out.

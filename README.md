# YouTube Watch Party

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101)
![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/mongodb-%234ea94b.svg?style=for-the-badge&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)

A real-time YouTube watch party app. Create a room, share the code, and watch YouTube videos together with synced playback, role-based controls, and live chat.

**Live demo:** https://youtube-watch-party-c2y.pages.dev/

> The backend runs on Render's free tier and sleeps after 15 min of inactivity, so the first request may take ~30 s to wake it up. Subsequent requests are instant.

## Features

- Synced playback (play, pause, seek, change video) across all participants
- Host / moderator / participant roles with strict permission checks
- Host controls: promote, demote, kick, transfer host
- Late joiners auto-sync to the current timestamp
- In-room chat with system join/leave messages
- Silent reconnect grace window — brief network blips don't remove you from the room
- Responsive dark UI for desktop and mobile

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express, TypeScript, Socket.IO
- **Database:** MongoDB + Mongoose
- **Realtime scaling:** Redis (`@socket.io/redis-adapter`)
- **Video:** YouTube IFrame Player API

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or any hosted MongoDB)

### 1. Install

```bash
git clone <this-repo-url>
cd youtube-watch-party-app
npm install
```

### 2. Configure

Copy the example env file and fill in your values:

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

`REDIS_URL` is optional in development (single-process mode) and required in production.

### 3. Run

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run client + server together |
| `npm run dev:client` | Run frontend only |
| `npm run dev:server` | Run backend only |
| `npm run build` | Build both for production |
| `npm run start` | Start the production server |

## Deployment

The live demo uses a **split deploy**:

- **Frontend** → Cloudflare Pages (build: `npm run build --workspace=client`, output: `client/dist`)
- **Backend** → Render Web Service (build: `npm install && npm run build`, start: `npm run start --workspace=server`)
- **Database** → MongoDB (hosted)
- **Redis** → any managed Redis (required in production)

### Production env vars

On the backend:
```
NODE_ENV=production
MONGO_URI=<your mongodb connection string>
REDIS_URL=<your redis connection string>
FRONTEND_URL=<your deployed frontend URL>
```

On the frontend:
```
VITE_API_URL=<your backend URL>/api
```

Point your platform's health check at `/api/ready` — it returns `503` when Redis is configured but unreachable, so unhealthy instances get rotated out.

## More Documentation

- [`OPTIMIZATIONS.md`](./OPTIMIZATIONS.md) — Changelog of perf, scale, and reliability work.
- [`INTERVIEW_NOTES.md`](./INTERVIEW_NOTES.md) — Design rationale and technical deep-dives.

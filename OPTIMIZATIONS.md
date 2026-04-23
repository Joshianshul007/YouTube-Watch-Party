# Optimizations Log

A running changelog of performance, scalability, and reliability work done on the YouTube Watch Party app.

Every entry documents **what** changed, **why** (the problem), **how** (the fix), the **files touched**, and the measurable **impact**. Add new entries to the top of the log (reverse-chronological).

---

## Conventions

- **Status tags:** `Shipped` (merged), `In Progress`, `Planned`, `Rejected`.
- **Severity tags:** `High` / `Medium` / `Low` (user-visible impact or scale ceiling).
- **Scope tags:** `Frontend`, `Backend`, `Realtime`, `DB`, `Infra`.
- Keep entries short but concrete. Prefer bullet lists over prose.
- Link to exact files with line ranges when useful.

---

## Open Follow-ups (backlog)

Ideas validated during scans but not yet implemented. Move to the log below once shipped.

---

### 2026-04-23 — Horizontal-scaling hardening (Redis adapter + distributed state)

- **Status:** `Shipped`
- **Severity:** `High`
- **Scope:** `Realtime`, `Backend`, `Infra`

**Problem**

Audit found the app would fake-scale past one Node instance:

1. `socketServer.ts` silently fell back to single-process mode when `REDIS_URL` was missing — including in production. Cross-instance broadcasts would just vanish with no error.
2. `pendingRemovals: Map<string, Timeout>` in `roomHandler.ts` kept disconnect-grace state in per-process memory. If a user reconnected to a different Node instance, the original instance would still "leave" them 15 s later.
3. `syncSocketRoleCache` iterated `io.sockets.sockets.values()` (local only). Role/host changes never reached users connected to other instances until they reconnected.
4. `remove_participant` kick loop did the same local-only walk — kicking a user who was on a different instance silently failed.
5. Redis health wasn't exposed anywhere, so load balancers had no way to rotate a degraded instance out of traffic.

**Fix**

- `server/src/socket/socketServer.ts`
  - Throw on boot if `NODE_ENV=production` and `REDIS_URL` is missing.
  - Add bounded exponential-backoff `reconnectStrategy` (100 ms → 10 s cap) to both pub and sub clients.
  - Track adapter health via `ready` / `end` events and expose `isRedisHealthy()`.
  - Register cross-instance receivers (`bindRoleCacheReceiver`, `bindKickReceiver`).
- `server/src/socket/utils/roleCache.ts`
  - `syncSocketRoleCache` now applies the update locally **and** fans out to peer instances via `io.serverSideEmit('role_cache:invalidate', …)`. Each peer re-applies the same local update — guaranteed propagation without the `RemoteSocket.data` replication caveats.
  - New `kickParticipantEverywhere(io, { roomId, participantId, message })` uses the same local-then-fanout pattern so a kicked user on any node gets disconnected.
- `server/src/socket/handlers/managementHandler.ts`
  - `remove_participant` now calls `kickParticipantEverywhere` instead of walking local sockets.
- `server/src/models/RoomSchema.ts`
  - Added `disconnectedAt: Number | null` to the participant sub-schema (persistent disconnect-grace marker, visible to every instance).
- `server/src/store/RoomStore.ts`
  - `updateParticipantSocket` now also clears `disconnectedAt` in the same write — silent reconnects remain one round-trip.
  - New `markDisconnected(roomId, participantId, socketId, ts)` — conditional on matching `socketId` so a stale disconnect can't clobber a newer connection.
  - New `peekDisconnectedAt(roomId, participantId)` — lean positional projection.
- `server/src/socket/handlers/roomHandler.ts`
  - Deleted `pendingRemovals` Map and `cancelPendingRemoval` helper.
  - `disconnect` calls `markDisconnected`; after the grace window it re-reads `peekDisconnectedAt` and only finalises the leave if the timestamp still matches (otherwise a reconnect or a later disconnect superseded it).
  - `join_room` peeks the prior `disconnectedAt` _before_ the socket update to classify reconnect vs. fresh join.
- `server/src/index.ts`
  - Added `/api/ready` — returns **503** if the Redis adapter isn't live, **200** otherwise. Wire this into the platform's load-balancer health check.

**Impact**

- App is now truly horizontally scalable: any number of Node instances can share the same Redis cluster, and broadcasts, role changes, kicks, and silent reconnects all work across nodes.
- Production misconfiguration fails loud (boot error) instead of silently degrading.
- Redis hiccups become observable (readiness probe flips 503 → 200) so load balancers can rotate instances out cleanly.
- Disconnect-grace window survives process restarts and is immune to instance hopping.

**Deployment notes**

- **`REDIS_URL` is now mandatory in production.** Set it on every replica (Render, Railway, PM2 cluster, etc.).
- Enable **sticky sessions** at the load balancer. Socket.IO's long-polling fallback still requires the same backend for polling handshakes, even with the Redis adapter.
- Point the platform's health check at **`/api/ready`** (not just `/api/health`) so instances without a live Redis connection are pulled out of rotation.

### DB pressure (from 2026-04-23 audit) — ordered by impact-to-effort

**Critical — all shipped 2026-04-23**

- [x] **C1.** `authMiddleware` now uses `getAuthSnapshot` (lean, positional `$` projection). Role, username, hostId cached on `socket.data`.
- [x] **C2.** `host_heartbeat` now uses `heartbeatVideoState`: one conditional `updateOne`, no reads.
- [x] **C3.** `chat_message` now uses cached identity; zero DB reads per message. Per-socket rate limit (5 msg / 3 s) added.
- [x] **C4.** `toggle_playback` uses `togglePlaybackAtomic` (aggregation pipeline, `$not: '$videoState.isPlaying'`).
- [x] **C5.** `assign_role` / `transfer_host` use positional `$set` + `arrayFilters`; `remove_participant` uses atomic `$pull`. No more `room.save()`.

**Medium — all shipped 2026-04-23**

- [x] **M1.** `updateParticipantSocket`, `addParticipant`, `removeParticipant` all return `.lean()` shapes.
- [x] **M2.** `disconnect` guard + grace-flush use lean `participants.$.socketId` lookup.
- [x] **M3.** `createRoomWithHost` single-insert replaces `createRoom` + `addParticipant`.
- [x] **M4.** Dropped the speculative unique-code `while` loop; room creation retries on `E11000` up to 5 times.
- [x] **M5.** Explicit indexes declared in `RoomSchema`; `syncIndexes()` at boot in production.
- [ ] **M6.** Send **participant deltas** instead of full `participants[]` arrays in join/leave/role broadcasts. _(Deferred — touches client state machine.)_

**Minor — all shipped 2026-04-23**

- [x] **m1.** `GET /api/rooms/:roomId` uses `getRoomLean`.
- [x] **m2.** Removed dead `removeParticipantBySocket`. Sparse index on `participants.socketId` declared for future use.
- [x] **m3.** Added `getRoomLean`, `getRoomByCodeLean`.
- [x] **m6.** `autoIndex` explicitly pinned in `mongoose.connect`.
- [ ] **m5.** Background job for empty-room cleanup (TTL or scheduled sweep). _(Still pending.)_

### Cross-cutting

- [x] Per-socket rate limit on `chat_message` (5 msgs / 3 sec) — shipped.
- [ ] Move hot ephemeral room state (playback + socket map) to **Redis** with periodic Mongo snapshots.
- [ ] Make `REDIS_URL` **required** in production and document multi-replica deploys.
- [ ] Add **observability**: event rate, broadcast latency, Mongo op timings, p95/p99.
- [ ] Room admission control (max participants per room).
- [ ] k6/Artillery load test plan asserting seek-flood collapse + 1k concurrent users.

---

## Log

### 2026-04-23 — DB pressure audit → full remediation

- **Status:** Shipped (C1–C5, M1–M5, m1/m2/m3/m6 + chat rate limit). M6 + m5 remain in backlog.
- **Severity:** High
- **Scope:** Backend, Realtime, DB

**Problem**

Post-seek-fix audit found five critical DB patterns still on the hot path:
`authMiddleware`, `chat_message`, `host_heartbeat`, `toggle_playback`, and the
management handlers (`assign_role` / `transfer_host` / `remove_participant`)
all did full hydrated-room reads and/or `room.save()` per event. Compounded,
this meant a 1,000-user mass-reconnect storm would saturate Mongo at auth,
and a hot chatty room would do ~500 full-doc reads/sec.

**Fix**

- **Identity cache on `socket.data`** — single lean projected read at handshake
  (`getAuthSnapshot`) populates `role`, `username`, `hostId`. All permission
  checks and broadcast-identity lookups now read these without touching Mongo.
- **Live role invalidation** — new `syncSocketRoleCache(io, participants, hostId)`
  helper updates in-memory `socket.data.role` across all connected sockets on
  `role_assigned` / `host_transferred` / host-reassignment-after-leave, so the
  cache never goes stale.
- **Single-op atomic mutations** across the store:
  - `togglePlaybackAtomic` — aggregation pipeline (`$not: '$videoState.isPlaying'`).
  - `heartbeatVideoState` — conditional `updateOne`; zero reads.
  - `assignRole` — positional `$set` with `$elemMatch` guard against host.
  - `transferHost` — `arrayFilters` demote-old + promote-new + `hostId` in one write.
  - `assignNewHost` — atomic host reassignment on leave.
  - `createRoomWithHost` — single `insertOne` replacing two writes.
- **Lean everywhere** — `getRoomLean`, `getRoomByCodeLean`, and every mutation
  method returns a lean plain object. `GET /api/rooms/:roomId` uses lean.
- **Indexes** — explicit declarations on `{ id }`, `{ code }`, and sparse
  `{ 'participants.socketId' }`. `syncIndexes()` runs at boot in production;
  `autoIndex` pinned `false` in prod, `true` in dev.
- **Unique-code generation** — speculative `while(!isUnique)` read loop dropped;
  rely on the unique index and retry on `E11000` up to 5× inside the insert path.
- **Chat rate limit** — 5 messages / 3 seconds per socket, zero-alloc fixed-window
  counter.
- **Dead code removed** — `removeParticipantBySocket`.

**Files changed**

- `server/src/models/RoomSchema.ts`
- `server/src/db/connect.ts`
- `server/src/store/RoomStore.ts`
- `server/src/routes/roomRoutes.ts`
- `server/src/socket/middleware/authMiddleware.ts`
- `server/src/socket/handlers/chatHandler.ts`
- `server/src/socket/handlers/playbackHandler.ts`
- `server/src/socket/handlers/managementHandler.ts`
- `server/src/socket/handlers/roomHandler.ts`
- `server/src/socket/utils/roleCache.ts` (new)

**Impact (per-event, hot path)**

| Event | Reads before | Reads after | Writes before | Writes after |
|---|---|---|---|---|
| Socket handshake | 1 full doc | 1 projected lean | 0 | 0 |
| `chat_message` | 1 full doc | **0** | 0 | 0 |
| `host_heartbeat` | 2 (role + room) | **0** | 1 | 1 (conditional) |
| `play` / `pause` / `seek` (flush) | 1 (role) | **0** | 1 | 1 |
| `toggle_playback` | 1 (role) + 1 (room) | **0** | 1 | 1 (pipeline) |
| `assign_role` | 2 full docs | **0** | 1 (`room.save()` full doc) | 1 (`$set` dotted) |
| `transfer_host` | 2 full docs | **0** | 1 (`room.save()` full doc) | 1 (`arrayFilters`) |
| `remove_participant` (kick) | 2 full docs | **0** | 1 (`$pull`) | 1 (`$pull`) |
| `POST /api/rooms` | N reads (code loop) | 0 speculative | 2 writes | 1 (insert) + retries on collision only |
| `disconnect` grace guard | 2 full docs | 2 projected lean | 0 | 0 |

**Breaking changes:** none. Event contracts, REST payloads, and client behavior all preserved.

---


### 2026-04-23 — Seek-flooding fix (commit-on-release + server coalescing)

- **Status:** Shipped
- **Severity:** High
- **Scope:** Frontend, Realtime, Backend, DB

**Problem**

The slider emitted `socket.emit('seek', { time })` on every `onChange` during drag (60–120 events/sec per host). Each event triggered 2 Mongo round-trips and a room-wide broadcast, causing jitter, desync, high CPU, and a hard scalability ceiling.

**Fix**

- **Frontend — commit-only emit.**
  - Drag updates a local `scrubValue` and calls `onSeek` optimistically for preview.
  - One `seek` emit on `pointerup` / `mouseup` / `touchend` / `blur`, and on `keyup` for keyboard nudges.
  - 200 ms trailing-debounce fallback if no release event fires (touch/pen edge cases).
- **Backend — coalesce + hard limit per socket.**
  - Leading-edge flush + trailing flush inside a 150 ms window; latest `time` wins.
  - Hard cap of 20 seek events/sec per socket, excess dropped silently.
  - Added `disconnect` cleanup so a leaving/kicked host can't fire a trailing seek.
- **Backend — fewer DB round-trips.**
  - New `RoomStore.updateVideoStateFields(...)` does one atomic `$set` on dotted fields (`videoState.currentTime`, `videoState.lastUpdated`, …) — no more `getRoom` + `updateRoom`.
  - New `RoomStore.getParticipantRole(...)` uses a lean projection for permission checks.
  - `play` / `pause` / `toggle_playback` / `change_video` / `host_heartbeat` migrated to the atomic path with input validation and an 80 ms throttle.
- **Receiver — loop prevention.**
  - `useYouTubePlayer` already skips `sync_state` with an unchanged `lastUpdated`.
  - Added `LOCAL_SEEK_SUPPRESS_MS = 600`: after a local `seekTo()`, ignore drift correction briefly so the server echo doesn't fight the YouTube player's internal seek animation.

**Files changed**

- `client/src/components/ControlsBar.tsx`
- `client/src/hooks/useYouTubePlayer.ts`
- `server/src/socket/handlers/playbackHandler.ts`
- `server/src/store/RoomStore.ts`

**Impact**

- Per-drag server traffic: **~60–120 emits → 1 emit**.
- DB writes during a rapid drag on the server side: bounded to **≤ ~7/sec per host** (1000 ÷ 150 ms coalesce), previously unbounded.
- DB round-trips per playback event: **2 → 1** for most paths, **3 → 1** for `play`.
- Broadcast fan-out volume drops roughly 1–2 orders of magnitude in hot rooms.
- No event-contract or schema breaking changes.

**Edge cases verified**

| Case | Behavior |
|---|---|
| Rapid drags | Client emits once on release; server coalesces + latest-wins. |
| Seek while paused | Partial `$set` leaves `isPlaying` untouched. |
| Seek while playing | `lastUpdated` bumped; clients drift-correct to new target. |
| New joiner mid-seek | `join_room` emits current `sync_state` from authoritative `videoState`. |
| Slow network | Server-authoritative timestamp + `computeTargetTime` client-side. |
| Host disconnects mid-drag | `disconnect` handler clears pending trailing timer. |
| Malicious flood | Hard 20/sec cap + NaN/negative/∞ filtering. |

---

## How to add a new entry

1. Copy the template below to the top of the log.
2. Fill in problem, fix, files, and impact.
3. Keep each entry to ~30–60 lines; link out for deeper context.

```md
### YYYY-MM-DD — <short title>

- **Status:** Shipped | In Progress | Planned
- **Severity:** High | Medium | Low
- **Scope:** Frontend | Backend | Realtime | DB | Infra

**Problem**

<what was wrong, with numbers if possible>

**Fix**

- <bullet list of concrete changes>

**Files changed**

- `path/to/file.ts`

**Impact**

- <before → after metric>
```

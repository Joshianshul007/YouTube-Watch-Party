# Interview Prep Notes — Seek Flooding Fix & Realtime Scalability

Study notes for the work done on the YouTube Watch Party app. Written so you can explain **what**, **why**, **how**, and **tradeoffs** in your own words.

---

## 1. The 30-second pitch (memorize this)

> "Our host's seek slider was emitting a socket event on every pixel of drag — 60 to 120 events per second. Each event hit MongoDB twice and fan-out broadcast to everyone in the room, so active rooms would desync and the server couldn't scale past a few hundred users. I fixed it in three layers: the **client** now emits only on slider release with a 200 ms trailing-debounce fallback; the **server** coalesces seek events in a 150 ms window using a leading-edge + trailing-flush pattern with latest-value-wins, plus a 20 events/sec hard rate limit per socket; and I collapsed 2 Mongo round-trips into 1 atomic partial `$set`. A single rapid drag went from ~100 emits to 1, and DB writes during a flood are now bounded to ~7/sec per host instead of unbounded."

---

## 2. System context (know the architecture)

**Stack**

- Frontend: React + TypeScript + Vite, YouTube IFrame API.
- Backend: Node.js + Express + Socket.IO, MongoDB via Mongoose.
- Optional: Redis adapter for Socket.IO horizontal scaling.

**Data model**

- One `Room` document in Mongo per room, embedding:
  - `participants[]` (sub-schema)
  - `videoState` (`videoId`, `isPlaying`, `currentTime`, `lastUpdated`)
- Single authoritative `videoState` is the source of truth for all clients.

**Event flow (seek example)**

1. Host drags slider → client commits on release → `socket.emit('seek', { time })`.
2. Server validates + coalesces → updates `videoState.currentTime` + `lastUpdated`.
3. Server broadcasts `sync_state` to the whole room via `io.in(roomId).emit(...)`.
4. Each client runs drift correction: if `|localTime - target| > tolerance`, `player.seekTo(target)`.

---

## 3. The problem (be able to diagnose)

HTML `<input type="range">` fires `onChange` on **every** value change. During a normal drag that's 60–120 fires/sec. The original code:

```ts
const handleSeek = (e) => {
  socket.emit('seek', { time: parseFloat(e.target.value) });
};
```

**Consequences at scale:**

| Symptom | Root cause |
|---|---|
| Playback jitter | Clients received a firehose of `sync_state` events, each re-seeking the player. |
| Desync between users | Slow-network clients queued up broadcasts and applied them out of order. |
| High server CPU | JSON serialization + room fan-out on every emit. |
| Mongo queue saturation | Every event did `getRoom` + `updateRoom` (2 round-trips). |
| No horizontal scaling | Redis adapter off by default → one process = hard ceiling. |

**Rule of thumb:** a continuous UI interaction should never produce a continuous network event stream. You either **debounce**, **throttle**, or **commit on release**.

---

## 4. The fix, explained layer by layer

### 4.1 Frontend — commit-on-release (the correct UX)

**Pattern:** decouple the visual slider from the network. During drag, update only local state. Emit exactly once on release.

**Key idea — events that mean "drag is done":**

- `mouseup`, `pointerup`, `touchend` → pointer drag finished
- `keyup` (Arrow/PageUp/PageDown/Home/End) → keyboard nudge finished
- `blur` → focus lost mid-drag
- 200 ms trailing-debounce timer → **fallback** for edge cases where none of the above fires (some touch/pen devices, dragging out of viewport)

**Skeleton you should be able to draw on a whiteboard:**

```tsx
const [isScrubbing, setIsScrubbing] = useState(false);
const [scrubValue, setScrubValue] = useState(currentTime);
const pendingRef = useRef<number | null>(null);
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const commit = () => {
  if (timerRef.current) clearTimeout(timerRef.current);
  const val = pendingRef.current;
  pendingRef.current = null;
  setIsScrubbing(false);
  if (val == null) return;
  socket.emit('seek', { time: val }); // single emit
};

const onChange = (e) => {
  const val = parseFloat(e.target.value);
  setIsScrubbing(true);
  setScrubValue(val);
  pendingRef.current = val;
  // Local optimistic preview (no emit)
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(commit, 200); // fallback
};

<input
  type="range"
  value={isScrubbing ? scrubValue : currentTime}
  onChange={onChange}
  onMouseUp={commit}
  onTouchEnd={commit}
  onPointerUp={commit}
  onKeyUp={commit}
  onBlur={commit}
/>
```

**Why two display values (`scrubValue` vs `currentTime`)?** While the user drags, the authoritative `currentTime` from the server would yank the thumb back. Switching to local state during the drag gives a smooth UI; we switch back after commit.

### 4.2 Backend — leading-edge + trailing-flush coalescing

**Goal:** even if a bad client emits 100 seeks in 150 ms, we do ≤ 1 DB write and ≤ 1 broadcast.

**The pattern (classic throttle variant):**

```
┌─ event arrives
│
├─ if (now - lastFlush >= WINDOW && no pending timer)
│       → flush NOW (leading edge)
│
└─ else
        → overwrite pendingTime (latest wins)
        → if no timer, schedule one at lastFlush + WINDOW (trailing edge)
```

**Key properties:**

- **First event is never delayed** (leading edge) → a single click feels instant.
- **Rapid bursts collapse to one trailing flush** with the latest value.
- **No queue growth** — state is just `{ pendingTime, flushTimer, lastFlushAt }`.

**Why 150 ms?** Just below the ~200 ms human perception threshold for "instant" UI feedback, and below the frontend's 200 ms fallback so the two don't fight.

**Why also a hard per-second cap (20/sec)?** Defense-in-depth. The client fix could be bypassed by a malicious user. A token-bucket-ish counter per socket drops excess silently — cheap O(1) check.

**Per-socket state vs global state?** Per-socket, because each host/moderator has their own drag cadence. Tracked inside the handler closure, garbage-collected automatically on disconnect.

**Cleanup on disconnect:**

```ts
socket.on('disconnect', () => {
  if (seekBuf.flushTimer) clearTimeout(seekBuf.flushTimer);
  seekBuf.pendingTime = null;
});
```

Otherwise a host who drags-and-disconnects could have a ghost seek fire after they leave.

### 4.3 DB — one atomic partial update, not two round-trips

**Before:**

```ts
const room = await roomStore.getRoom(roomId);                // round-trip 1
await roomStore.updateRoom(roomId, { videoState: {...} });   // round-trip 2
```

This fetched the entire room doc just to read one field, then rewrote the entire `videoState` subdocument — risk of clobbering concurrent writes.

**After:**

```ts
RoomModel.findOneAndUpdate(
  { id: roomId },
  { $set: { 'videoState.currentTime': t, 'videoState.lastUpdated': now } },
  { returnDocument: 'after' }
);
```

**Why this is strictly better:**

- **1 round-trip** instead of 2.
- **Atomic** — no read-modify-write race.
- **Dotted-path `$set`** only touches the fields you pass; `isPlaying`/`videoId` aren't clobbered.
- Permission check uses a **lean projection** (`{ 'participants.$': 1 }` with `.lean()`), so we don't hydrate a full Mongoose document for a role check.

### 4.4 Receiver — preventing self-bounce loops

When the host commits a seek, the server echoes a `sync_state` back. During the YouTube player's internal seek animation, the local time briefly differs from the target, so drift correction would trigger a **second** `seekTo`, which looks like stutter.

**Fix:** after any **local** `seekTo`, record `Date.now()` and suppress drift correction for 600 ms:

```ts
if (drift > tol && (Date.now() - lastLocalSeekAtRef.current >= LOCAL_SEEK_SUPPRESS_MS)) {
  player.seekTo(target, true);
}
```

Receivers who didn't originate the seek hit drift > tolerance normally and snap to the target.

---

## 5. Concepts you must be able to explain

### Debounce vs Throttle vs Coalesce

| Pattern | Definition | Use case |
|---|---|---|
| **Debounce** | Wait `N` ms of silence before firing once at the end. | Search-as-you-type, form validation. |
| **Throttle** | Fire at most once per `N` ms (usually leading edge). | Scroll/resize handlers. |
| **Coalesce (leading + trailing)** | Fire immediately, then fire once more at the end with the latest value. | **Seek slider** — instant feedback + final accuracy. |

> If the interviewer says "why not just debounce?" → answer: debouncing delays the first event too. A single click on the slider should seek immediately.

### Why authoritative server?

- Prevents split-brain: two moderators racing each other can't produce inconsistent state across participants.
- New joiners get deterministic `sync_state`.
- Trust boundary: clients can lie about times; server decides.

### CAP / consistency angle

We favor **availability + low latency** over strict consistency. Clients use drift tolerance (1s while playing, 0.3s while paused) rather than hard snapping. Tradeoff: a late-arriving sync_state could briefly disagree with a more recent one, but the `lastUpdated` timestamp means only the newest wins.

### Backpressure

Three layers, cheapest first:

1. **Client-side commit-on-release** (doesn't generate load in the first place).
2. **Server coalescing** (collapses legitimate bursts).
3. **Hard per-socket cap** (kills malicious floods).

Good system design always pushes load reduction as close to the source as possible.

### Why Redis adapter matters (even though not shipped yet)

- Socket.IO stores room membership in memory. With 2+ Node processes, a broadcast on process A won't reach a socket on process B.
- Redis Pub/Sub fan-out via `@socket.io/redis-adapter` fixes this.
- Without it: you can only run one process → single point of failure + one event loop for all users.

---

## 6. Capacity math (interviewer loves numbers)

**Before the fix, in one active room of 50 users with host dragging for 5 seconds:**

- Emits from host: 60–120/sec × 5 sec ≈ **500 emits**
- Mongo round-trips: 500 × 2 = **1,000 ops**
- Broadcasts delivered: 500 × 50 recipients = **25,000 messages**

**After the fix, same scenario:**

- Emits from host: **1**
- Mongo round-trips: **1**
- Broadcasts delivered: 1 × 50 = **50 messages**

**Reduction factor:** ~**500×** for a single 5-second drag.

At 1,000 concurrent users spread across 20 active rooms, this is the difference between a server on fire and a server idling.

---

## 7. Edge cases (rehearse your answers)

| Q | A |
|---|---|
| What if the user drags and never releases? | Trailing-debounce fallback (200 ms client-side) commits anyway. |
| What if two moderators seek simultaneously? | Last `$set` wins per Mongo's atomic update ordering; both clients receive both `sync_state` events; drift correction applies the newer `lastUpdated`. |
| New participant joins during an active seek? | `join_room` sends them the current authoritative `videoState`; they don't see the in-flight intermediate values. |
| Host disconnects mid-drag? | `disconnect` handler cancels the pending trailing flush. Host reassignment is handled by the room handler (oldest moderator, then oldest participant). |
| Clock skew between clients? | We only use the server's `lastUpdated` as the authority and compute `elapsed = Date.now() - lastUpdated` on the receiver. Small clock skew causes ≤ drift tolerance, within the correction window. |
| What if validation fails (`NaN`, negative)? | Rejected before any state change: `Number.isFinite(t) && t >= 0`. |

---

## 8. What you'd do next (show forward thinking)

If asked "how would you scale to 10k users":

1. **Turn on Redis adapter** + run N Node replicas behind a sticky load balancer.
2. Move hot ephemeral state (current `videoState`, participant sockets) to **Redis** for sub-millisecond reads; snapshot to Mongo periodically.
3. **Participant deltas** instead of full arrays in join/leave events — O(1) payload instead of O(n).
4. **Rate-limit chat** per socket (e.g. 5 msgs / 3 sec).
5. **Observability**: track event rate, broadcast latency, Mongo p95/p99.
6. **Room admission cap** to protect hot rooms from unbounded fan-out.
7. **Empty-room TTL** sweep to keep the DB lean.
8. **Load test** (k6/Artillery): assert 1k fake seeks/sec collapse to ≤ 7 writes/sec and p95 broadcast < 100 ms.

---

## 9. Likely interview questions (practice)

1. Walk me through what happens when the host drags the slider.
2. Why emit on `pointerup` instead of debouncing `onChange`?
3. Why both a 150 ms coalesce window **and** a 20/sec hard cap?
4. Why dotted-path `$set` instead of replacing `videoState`?
5. How do you prevent a client from endlessly re-applying its own seek?
6. If two hosts seek at the same millisecond, what happens?
7. How would you prove your fix with a load test?
8. Where's the next bottleneck after fixing seek?
9. Why is the server authoritative instead of peer-to-peer?
10. How does the Redis adapter change the broadcast path?

---

## 10. Vocabulary cheat sheet

| Term | One-liner |
|---|---|
| **Coalesce** | Merge many pending updates into a single operation with the latest value. |
| **Leading edge** | Fire the first event of a burst immediately. |
| **Trailing edge** | Fire one final event after the burst ends. |
| **Backpressure** | Slowing or dropping producers so consumers aren't overwhelmed. |
| **Idempotent** | Applying the same operation twice has the same effect as once. |
| **Optimistic update** | Reflect the change in UI before the server confirms. |
| **Authoritative server** | Server state is the source of truth; clients defer to it. |
| **Drift correction** | Client periodically nudges itself toward server state rather than snapping. |
| **Fan-out** | One event delivered to many recipients. |
| **Atomic update** | Single DB operation that either fully applies or doesn't. |

---

Good luck. If you can explain sections 1–4 in your own words and draw the event-flow diagram from memory, you've got this.

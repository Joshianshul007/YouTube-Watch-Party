import { Server, Socket } from 'socket.io';
import { roomStore, LeanRoom } from '../../store/RoomStore';

// --- Rate-limit / coalesce settings ----------------------------------------
// Leading-edge applies immediately, subsequent seek events within the window
// are coalesced and only the LATEST value is persisted + broadcast on trailing
// flush. Tuned for interactive slider dragging.
const SEEK_COALESCE_MS = 150;
// Hard cap on seek events accepted per socket per second to protect the server
// from malicious or broken clients. Well above what a real UI can legitimately
// generate after the frontend commit-on-release fix.
const SEEK_HARD_LIMIT_PER_SEC = 20;

// Per-event throttle for other control events (defense-in-depth).
const CONTROL_EVENT_MIN_INTERVAL_MS = 80;

type SeekBuffer = {
  pendingTime: number | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
  lastFlushAt: number;
  windowStart: number;
  countInWindow: number;
};

export const registerPlaybackHandlers = (io: Server, socket: Socket) => {
  const roomId: string = socket.data.roomId;

  const seekBuf: SeekBuffer = {
    pendingTime: null,
    flushTimer: null,
    lastFlushAt: 0,
    windowStart: Date.now(),
    countInWindow: 0,
  };

  const lastControlEventAt: Record<string, number> = {};

  const broadcastSyncState = (room: LeanRoom) => {
    io.in(roomId).emit('sync_state', {
      isPlaying: room.videoState.isPlaying,
      currentTime: room.videoState.currentTime,
      videoId: room.videoState.videoId,
      timestamp: room.videoState.lastUpdated,
    });
  };

  // Role is cached on socket.data at handshake and invalidated by the
  // management/room handlers when it changes. No DB read per playback event.
  const isPrivileged = (): boolean => {
    const role = socket.data.role;
    return role === 'host' || role === 'moderator';
  };

  const throttleControl = (key: string): boolean => {
    const now = Date.now();
    const last = lastControlEventAt[key] ?? 0;
    if (now - last < CONTROL_EVENT_MIN_INTERVAL_MS) return false;
    lastControlEventAt[key] = now;
    return true;
  };

  const isValidVideoId = (videoId: string) => /^[a-zA-Z0-9_-]{11}$/.test(videoId);
  const isValidTime = (t: unknown): t is number =>
    typeof t === 'number' && Number.isFinite(t) && t >= 0;

  // --- seek: coalesce rapid events, latest value wins ----------------------
  const flushSeek = async () => {
    seekBuf.flushTimer = null;

    const target = seekBuf.pendingTime;
    seekBuf.pendingTime = null;
    if (target == null) return;

    if (!isPrivileged()) return;

    const updatedRoom = await roomStore.updateVideoStateFields(roomId, {
      currentTime: target,
      lastUpdated: Date.now(),
    });

    seekBuf.lastFlushAt = Date.now();
    if (updatedRoom) broadcastSyncState(updatedRoom);
  };

  socket.on('seek', (data: { time: number }) => {
    if (!isValidTime(data?.time)) return;

    // Hard rate limit per socket (protects against flooding even if the
    // frontend is bypassed).
    const now = Date.now();
    if (now - seekBuf.windowStart >= 1000) {
      seekBuf.windowStart = now;
      seekBuf.countInWindow = 0;
    }
    seekBuf.countInWindow += 1;
    if (seekBuf.countInWindow > SEEK_HARD_LIMIT_PER_SEC) {
      // Drop silently; malicious/broken client.
      return;
    }

    seekBuf.pendingTime = data.time;

    const sinceLast = now - seekBuf.lastFlushAt;

    // Leading edge: fire immediately if we're outside the coalesce window and
    // no trailing flush is already scheduled.
    if (sinceLast >= SEEK_COALESCE_MS && !seekBuf.flushTimer) {
      void flushSeek();
      return;
    }

    // Trailing edge: schedule exactly one flush at the end of the current window.
    if (!seekBuf.flushTimer) {
      const delay = Math.max(0, SEEK_COALESCE_MS - sinceLast);
      seekBuf.flushTimer = setTimeout(() => void flushSeek(), delay);
    }
  });

  socket.on('play', async (data: { currentTime: number }) => {
    if (!isValidTime(data?.currentTime)) return;
    if (!throttleControl('play')) return;
    if (!isPrivileged()) return;

    const updatedRoom = await roomStore.updateVideoStateFields(roomId, {
      isPlaying: true,
      currentTime: data.currentTime,
      lastUpdated: Date.now(),
    });

    if (updatedRoom) broadcastSyncState(updatedRoom);
  });

  socket.on('toggle_playback', async (data: { currentTime: number }) => {
    if (!isValidTime(data?.currentTime)) return;
    if (!throttleControl('toggle_playback')) return;
    if (!isPrivileged()) return;

    // Single atomic aggregation-pipeline update: flips isPlaying server-side,
    // no read-before-write.
    const updatedRoom = await roomStore.togglePlaybackAtomic(roomId, data.currentTime);
    if (updatedRoom) broadcastSyncState(updatedRoom);
  });

  socket.on('pause', async (data: { currentTime: number }) => {
    if (!isValidTime(data?.currentTime)) return;
    if (!throttleControl('pause')) return;
    if (!isPrivileged()) return;

    const updatedRoom = await roomStore.updateVideoStateFields(roomId, {
      isPlaying: false,
      currentTime: data.currentTime,
      lastUpdated: Date.now(),
    });

    if (updatedRoom) broadcastSyncState(updatedRoom);
  });

  socket.on('host_heartbeat', async (data: { currentTime: number; isPlaying: boolean }) => {
    if (!isValidTime(data?.currentTime)) return;
    if (!isPrivileged()) return;

    // Single conditional write: only applies if a video is loaded. Zero reads.
    await roomStore.heartbeatVideoState(roomId, {
      isPlaying: !!data.isPlaying,
      currentTime: Math.max(0, data.currentTime),
      lastUpdated: Date.now(),
    });
    // Do not broadcast; this is only to keep late joiners accurate.
  });

  socket.on('change_video', async (data: { videoId: string }) => {
    if (!throttleControl('change_video')) return;
    if (!isPrivileged()) return;

    const trimmedVideoId = data.videoId?.trim();
    if (!trimmedVideoId || !isValidVideoId(trimmedVideoId)) return;

    const updatedRoom = await roomStore.updateVideoStateFields(roomId, {
      videoId: trimmedVideoId,
      isPlaying: true,
      currentTime: 0,
      lastUpdated: Date.now(),
    });

    if (updatedRoom) broadcastSyncState(updatedRoom);
  });

  // Clean up any pending trailing-flush timer so seek events from a
  // disconnecting/kicked host don't fire after they've left.
  socket.on('disconnect', () => {
    if (seekBuf.flushTimer) {
      clearTimeout(seekBuf.flushTimer);
      seekBuf.flushTimer = null;
    }
    seekBuf.pendingTime = null;
  });
};

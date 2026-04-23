import { Server } from 'socket.io';
import type { IMongoParticipant } from '../../models/RoomSchema';

/**
 * Live role-cache invalidation (multi-instance safe).
 *
 * The auth middleware caches `role` / `hostId` on `socket.data` at handshake so
 * permission checks don't need a DB round-trip. Whenever we mutate roles
 * server-side (`assign_role`, `transfer_host`, host reassignment after a leave)
 * we must patch those cached values on every live socket, including sockets
 * connected to OTHER Node instances behind the Redis adapter.
 *
 * Strategy:
 *   1. Update local sockets synchronously (fast path, no network hop).
 *   2. `serverSideEmit` the same payload to peer instances via the Redis
 *      adapter. Each peer runs the identical local update on its own sockets.
 *
 * We deliberately avoid mutating `RemoteSocket.data` from fetchSockets() —
 * that path is not reliably replicated across adapter backends in all
 * Socket.IO versions; serverSideEmit IS the supported cross-node channel.
 */

const ROLE_INVALIDATE_EVENT = 'role_cache:invalidate';
const KICK_EVENT = 'room:kick';

type RoleInvalidatePayload = {
  participants: IMongoParticipant[];
  hostId: string;
};

type KickPayload = {
  roomId: string;
  participantId: string;
  message?: string;
};

const applyRoleCacheLocal = (
  io: Server,
  participants: IMongoParticipant[],
  hostId: string
) => {
  const byId = new Map<string, IMongoParticipant>();
  for (const p of participants) byId.set(p.id, p);

  for (const s of io.sockets.sockets.values()) {
    const pid = (s.data as { participantId?: string })?.participantId;
    if (!pid) continue;
    const fresh = byId.get(pid);
    if (!fresh) continue;
    s.data.role = fresh.role;
    s.data.hostId = hostId;
  }
};

export const syncSocketRoleCache = (
  io: Server,
  participants: IMongoParticipant[],
  hostId: string
) => {
  applyRoleCacheLocal(io, participants, hostId);
  // Fan out to peer Node instances. No-op under single-process mode.
  io.serverSideEmit(ROLE_INVALIDATE_EVENT, { participants, hostId } as RoleInvalidatePayload);
};

export const bindRoleCacheReceiver = (io: Server) => {
  io.on(ROLE_INVALIDATE_EVENT, (payload: RoleInvalidatePayload) => {
    if (!payload?.participants || !payload?.hostId) return;
    applyRoleCacheLocal(io, payload.participants, payload.hostId);
  });
};

/**
 * Cross-instance kick: the host's own Node instance might not own the kicked
 * user's socket. We emit locally AND broadcast via serverSideEmit so whichever
 * instance owns the socket actually closes it.
 */
const applyKickLocal = (io: Server, payload: KickPayload) => {
  for (const s of io.sockets.sockets.values()) {
    if (
      (s.data as { participantId?: string })?.participantId === payload.participantId &&
      (s.data as { roomId?: string })?.roomId === payload.roomId
    ) {
      try {
        s.emit('kicked', {
          message: payload.message ?? 'You were removed from the room by the host.',
        });
        s.leave(payload.roomId);
        s.disconnect(true);
      } catch {
        /* ignore */
      }
      break;
    }
  }
};

export const kickParticipantEverywhere = (io: Server, payload: KickPayload) => {
  applyKickLocal(io, payload);
  io.serverSideEmit(KICK_EVENT, payload);
};

export const bindKickReceiver = (io: Server) => {
  io.on(KICK_EVENT, (payload: KickPayload) => {
    if (!payload?.roomId || !payload?.participantId) return;
    applyKickLocal(io, payload);
  });
};

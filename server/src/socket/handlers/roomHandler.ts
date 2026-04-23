import { Server, Socket } from 'socket.io';
import { roomStore } from '../../store/RoomStore';
import { syncSocketRoleCache } from '../utils/roleCache';

const DISCONNECT_GRACE_MS = 15000;

export const registerRoomHandlers = (io: Server, socket: Socket) => {
  const roomId: string = socket.data.roomId;
  const participantId: string = socket.data.participantId;

  socket.on('join_room', async () => {
    // Peek BEFORE we overwrite so we can tell whether this was a fresh join
    // or a reconnect within the grace window. One lean projected read.
    const prevDisconnectedAt = await roomStore.peekDisconnectedAt(roomId, participantId);
    const wasReconnect =
      typeof prevDisconnectedAt === 'number' &&
      Date.now() - prevDisconnectedAt < DISCONNECT_GRACE_MS;

    socket.join(roomId);

    // Single write: sets socketId AND clears disconnectedAt atomically.
    const room = await roomStore.updateParticipantSocket(roomId, participantId, socket.id);
    if (!room) return;

    const participant = room.participants.find((p) => p.id === participantId);
    if (!participant) return;

    // Participant's role may have changed since handshake (e.g. host transferred
    // while this client was briefly disconnected). Re-sync cached identity.
    socket.data.role = participant.role;
    socket.data.hostId = room.hostId;

    socket.emit('sync_state', {
      isPlaying: room.videoState.isPlaying,
      currentTime: room.videoState.currentTime,
      videoId: room.videoState.videoId,
      timestamp: room.videoState.lastUpdated,
    });

    socket.emit('room_snapshot', {
      participantId: participant.id,
      role: participant.role,
      hostId: room.hostId,
      participants: room.participants,
    });

    if (wasReconnect) {
      socket.to(roomId).emit('user_reconnected', {
        participantId: participant.id,
        username: participant.username,
        participants: room.participants,
      });
    } else {
      socket.to(roomId).emit('user_joined', {
        username: participant.username,
        participantId: participant.id,
        role: participant.role,
        participants: room.participants,
      });
    }
  });

  socket.on('leave_room', async () => {
    // Explicit leave — skip the grace window entirely.
    await handleLeave(io, socket, roomId, participantId);
  });

  socket.on('disconnect', async () => {
    // Mark the grace window in Mongo (NOT in per-process memory), keyed off
    // this exact socketId so a superseding reconnect on another Node instance
    // is a conditional no-op here.
    const myTimestamp = Date.now();
    let writtenAt: number | null = null;
    try {
      writtenAt = await roomStore.markDisconnected(
        roomId,
        participantId,
        socket.id,
        myTimestamp
      );
    } catch (err) {
      console.error('markDisconnected failed:', err);
      return;
    }
    if (writtenAt === null) {
      // Either the participant already reconnected (newer socketId) or was
      // already removed. Nothing to schedule.
      return;
    }

    // After the grace window, check Mongo state directly. We do NOT keep a
    // local Map — any Node instance may have owned the last disconnect, and
    // this one may not even be the one that owns the reconnect.
    setTimeout(async () => {
      try {
        const current = await roomStore.peekDisconnectedAt(roomId, participantId);
        // `undefined` → removed elsewhere. `null` → reconnected. A different
        // number → a later disconnect superseded us (its own timer will fire).
        if (current !== writtenAt) return;
        await handleLeave(io, socket, roomId, participantId);
      } catch (err) {
        console.error('Delayed leave failed:', err);
      }
    }, DISCONNECT_GRACE_MS);
  });
};

const handleLeave = async (
  io: Server,
  socket: Socket,
  roomId: string,
  participantId: string
) => {
  // Cached identity on the departing socket tells us username + role without a read.
  const leavingUsername: string = socket.data.username ?? 'User';
  const leavingRole: string = socket.data.role ?? 'participant';

  const room = await roomStore.removeParticipant(roomId, participantId);
  if (!room) return;

  socket.to(roomId).emit('user_left', {
    username: leavingUsername,
    participantId,
    participants: room.participants,
  });

  // Automatically reassign host if the host just left.
  if (leavingRole === 'host' && room.participants.length > 0) {
    const sortedParticipants = [...room.participants].sort(
      (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );
    const oldestModerator = sortedParticipants.find((p) => p.role === 'moderator');
    const nextHost = oldestModerator ?? sortedParticipants[0];
    if (!nextHost) return;

    // Single atomic write: set hostId + promote the chosen participant.
    const finalRoom = await roomStore.assignNewHost(roomId, nextHost.id);
    if (!finalRoom) return;

    syncSocketRoleCache(io, finalRoom.participants, finalRoom.hostId);

    io.to(roomId).emit('host_transferred', {
      newHostId: nextHost.id,
      participants: finalRoom.participants,
    });
  }
};

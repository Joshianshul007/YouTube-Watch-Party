import { Server, Socket } from 'socket.io';
import { roomStore } from '../../store/RoomStore';

const DISCONNECT_GRACE_MS = 5000;

const pendingRemovals = new Map<string, NodeJS.Timeout>();

const cancelPendingRemoval = (roomId: string, participantId: string) => {
  const key = `${roomId}:${participantId}`;
  const timer = pendingRemovals.get(key);
  if (timer) {
    clearTimeout(timer);
    pendingRemovals.delete(key);
  }
};

export const registerRoomHandlers = (io: Server, socket: Socket) => {
  const roomId: string = socket.data.roomId;
  const participantId: string = socket.data.participantId;

  socket.on('join_room', async () => {
    cancelPendingRemoval(roomId, participantId);
    socket.join(roomId);

    const room = await roomStore.updateParticipantSocket(roomId, participantId, socket.id);
    if (!room) return;

    const participant = room.participants.find(p => p.id === participantId);
    if (!participant) return;

    socket.emit('sync_state', {
      isPlaying: room.videoState.isPlaying,
      currentTime: room.videoState.currentTime,
      videoId: room.videoState.videoId,
      timestamp: room.videoState.lastUpdated
    });

    socket.to(roomId).emit('user_joined', {
      username: participant.username,
      participantId: participant.id,
      role: participant.role,
      participants: room.participants
    });
  });

  socket.on('leave_room', async () => {
    cancelPendingRemoval(roomId, participantId);
    await handleLeave(io, socket, roomId, participantId);
  });

  socket.on('disconnect', () => {
    const key = `${roomId}:${participantId}`;
    cancelPendingRemoval(roomId, participantId);

    const timer = setTimeout(async () => {
      pendingRemovals.delete(key);
      try {
        await handleLeave(io, socket, roomId, participantId);
      } catch (err) {
        console.error('Delayed leave failed:', err);
      }
    }, DISCONNECT_GRACE_MS);

    pendingRemovals.set(key, timer);
  });
};

const handleLeave = async (io: Server, socket: Socket, roomId: string, participantId: string) => {
  const previousRoom = await roomStore.getRoom(roomId);
  if (!previousRoom) return;

  const leavingParticipant = previousRoom.participants.find(p => p.id === participantId);
  if (!leavingParticipant) return;

  // Remove participant from MongoDB
  const room = await roomStore.removeParticipant(roomId, participantId);
  if (!room) return;

  socket.to(roomId).emit('user_left', {
    username: leavingParticipant.username,
    participantId: participantId,
    participants: room.participants
  });

  // Automatically assign new host if host leaves
  if (leavingParticipant.role === 'host' && room.participants.length > 0) {
    const sortedParticipants = [...room.participants].sort(
      (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );
    const oldestModerator = sortedParticipants.find((p) => p.role === 'moderator');
    const fallbackParticipant = sortedParticipants[0];
    const nextHostCandidate = oldestModerator ?? fallbackParticipant;

    if (!nextHostCandidate) return;

    const finalRoom = await roomStore.getRoom(roomId);
    if (finalRoom) {
      const newHost = finalRoom.participants.find(p => p.id === nextHostCandidate.id);
      if (newHost) {
        newHost.role = 'host';
        finalRoom.hostId = newHost.id;
        await finalRoom.save();
        
        io.to(roomId).emit('host_transferred', {
          newHostId: newHost.id,
          participants: finalRoom.participants
        });
      }
    }
  }

  // Cleanup empty room - Mongo doesn't strictly need rapid cleanup, but we can do it later
  // Skip cleanup to retain history
};

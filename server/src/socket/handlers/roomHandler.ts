import { Server, Socket } from 'socket.io';
import { roomStore } from '../../store/RoomStore';

export const registerRoomHandlers = (io: Server, socket: Socket) => {
  const roomId: string = socket.data.roomId;
  const participantId: string = socket.data.participantId;

  // Handle participant joining the room
  socket.on('join_room', async () => {
    socket.join(roomId);
    
    // Update socket ID in MongoDB
    const room = await roomStore.updateParticipantSocket(roomId, participantId, socket.id);
    if (!room) return;
    
    const participant = room.participants.find(p => p.id === participantId);
    if (!participant) return;

    // Send the current sync state to the new joiner
    socket.emit('sync_state', {
      isPlaying: room.videoState.isPlaying,
      currentTime: room.videoState.currentTime,
      videoId: room.videoState.videoId,
      timestamp: room.videoState.lastUpdated
    });

    // Broadcast user list to the room
    socket.to(roomId).emit('user_joined', {
      username: participant.username,
      participantId: participant.id,
      role: participant.role,
      participants: room.participants
    });
  });

  // Handle explicit leave room
  socket.on('leave_room', async () => {
    await handleLeave(io, socket, roomId, participantId);
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    await handleLeave(io, socket, roomId, participantId);
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

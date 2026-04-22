import { Socket } from 'socket.io';
import { roomStore } from '../../store/RoomStore';

export const authMiddleware = async (socket: Socket, next: (err?: Error) => void) => {
  try {
    const roomId = socket.handshake.auth.roomId || socket.handshake.query.roomId;
    const participantId = socket.handshake.auth.participantId || socket.handshake.query.participantId;

    if (!roomId || !participantId) {
      return next(new Error('Authentication error: roomId and participantId are required'));
    }

    const room = await roomStore.getRoom(roomId as string);
    if (!room) {
      return next(new Error('Authentication error: Room not found'));
    }

    const participant = room.participants.find(p => p.id === participantId);
    if (!participant) {
      return next(new Error('Authentication error: Participant not found in room'));
    }

    // Attach data to socket for later use
    socket.data.roomId = roomId;
    socket.data.participantId = participantId;
    
    next();
  } catch (error) {
    next(new Error('Authentication error: Database failure'));
  }
};

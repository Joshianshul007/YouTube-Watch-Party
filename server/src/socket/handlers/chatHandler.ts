import { Server, Socket } from 'socket.io';
import { roomStore } from '../../store/RoomStore';

const MAX_CHAT_MESSAGE_LENGTH = 300;

export const registerChatHandlers = (io: Server, socket: Socket) => {
  const roomId: string = socket.data.roomId;
  const participantId: string = socket.data.participantId;

  socket.on('chat_message', async (data: { message: string }) => {
    const normalizedMessage = data.message?.trim();
    if (!normalizedMessage) return;
    if (normalizedMessage.length > MAX_CHAT_MESSAGE_LENGTH) return;

    const room = await roomStore.getRoom(roomId);
    if (!room) return;

    const participant = room.participants.find(p => p.id === participantId);
    if (!participant) return;

    // Broadcast to everyone in the room (including sender)
    io.in(roomId).emit('chat_broadcast', {
      username: participant.username,
      role: participant.role,
      message: normalizedMessage,
      timestamp: Date.now()
    });
  });
};

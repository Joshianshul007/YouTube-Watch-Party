import { Server, Socket } from 'socket.io';
import { roomStore } from '../../store/RoomStore';

export const registerChatHandlers = (io: Server, socket: Socket) => {
  const roomId: string = socket.data.roomId;
  const participantId: string = socket.data.participantId;

  socket.on('chat_message', async (data: { message: string }) => {
    if (!data.message || !data.message.trim()) return;

    const room = await roomStore.getRoom(roomId);
    if (!room) return;

    const participant = room.participants.find(p => p.id === participantId);
    if (!participant) return;

    // Broadcast to everyone in the room (including sender)
    io.in(roomId).emit('chat_broadcast', {
      username: participant.username,
      role: participant.role,
      message: data.message.trim(),
      timestamp: Date.now()
    });
  });
};

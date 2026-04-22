import { Server, Socket } from 'socket.io';
import { roomStore } from '../../store/RoomStore';

export const registerManagementHandlers = (io: Server, socket: Socket) => {
  const roomId: string = socket.data.roomId;
  const participantId: string = socket.data.participantId;

  const isHost = async (): Promise<boolean> => {
    const room = await roomStore.getRoom(roomId);
    if (!room) return false;
    const participant = room.participants.find(p => p.id === participantId);
    return participant?.role === 'host';
  };

  const allowedRoleAssignments = new Set(['moderator', 'participant']);

  // Assign role (promote/demote)
  socket.on('assign_role', async (data: { targetUserId: string; role: 'moderator' | 'participant' }) => {
    if (!(await isHost())) return;
    if (!allowedRoleAssignments.has(data.role)) return;

    const room = await roomStore.getRoom(roomId);
    if (!room) return;

    const target = room.participants.find(p => p.id === data.targetUserId);
    if (!target || target.role === 'host') return; // Can't change host role this way

    target.role = data.role;
    await room.save();

    io.in(roomId).emit('role_assigned', {
      userId: data.targetUserId,
      username: target.username,
      newRole: data.role,
      participants: room.participants
    });
  });

  // Remove participant (kick)
  socket.on('remove_participant', async (data: { targetUserId: string }) => {
    if (!(await isHost())) return;
    if (data.targetUserId === participantId) return; // Can't kick yourself

    const room = await roomStore.getRoom(roomId);
    if (!room) return;

    const target = room.participants.find(p => p.id === data.targetUserId);
    if (!target) return;

    // Find the target's socket and disconnect them
    const targetSocketId = target.socketId;

    const updatedRoom = await roomStore.removeParticipant(roomId, data.targetUserId);

    // Notify the kicked user directly
    if (targetSocketId) {
      io.to(targetSocketId).emit('kicked', { message: 'You were removed from the room by the host.' });
      // Force disconnect the target socket
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.leave(roomId);
        targetSocket.disconnect(true);
      }
    }

    // Notify remaining participants
    if (updatedRoom) {
      io.in(roomId).emit('participant_removed', {
        userId: data.targetUserId,
        username: target.username,
        participants: updatedRoom.participants
      });
    }
  });

  // Transfer host
  socket.on('transfer_host', async (data: { targetUserId: string }) => {
    if (!(await isHost())) return;
    if (data.targetUserId === participantId) return; // Already host

    const room = await roomStore.getRoom(roomId);
    if (!room) return;

    const currentHost = room.participants.find(p => p.id === participantId);
    const newHost = room.participants.find(p => p.id === data.targetUserId);
    if (!currentHost || !newHost) return;

    currentHost.role = 'participant';
    newHost.role = 'host';
    room.hostId = data.targetUserId;
    await room.save();

    io.in(roomId).emit('host_transferred', {
      newHostId: data.targetUserId,
      participants: room.participants
    });
  });
};

import { Server, Socket } from 'socket.io';
import { roomStore } from '../../store/RoomStore';
import { syncSocketRoleCache, kickParticipantEverywhere } from '../utils/roleCache';

const ALLOWED_ROLE_ASSIGNMENTS = new Set(['moderator', 'participant']);

export const registerManagementHandlers = (io: Server, socket: Socket) => {
  const roomId: string = socket.data.roomId;
  const participantId: string = socket.data.participantId;

  const isHost = (): boolean => socket.data.role === 'host';

  // Assign role (promote/demote)
  socket.on('assign_role', async (data: { targetUserId: string; role: 'moderator' | 'participant' }) => {
    if (!isHost()) return;
    if (!ALLOWED_ROLE_ASSIGNMENTS.has(data.role)) return;

    // One atomic update: refuses to run if the target is the host or missing.
    const updatedRoom = await roomStore.assignRole(roomId, data.targetUserId, data.role);
    if (!updatedRoom) return;

    const target = updatedRoom.participants.find(p => p.id === data.targetUserId);
    if (!target) return;

    // Refresh cached role on the target's live socket so their playback
    // permissions change instantly without a DB read.
    syncSocketRoleCache(io, updatedRoom.participants, updatedRoom.hostId);

    io.in(roomId).emit('role_assigned', {
      userId: data.targetUserId,
      username: target.username,
      newRole: data.role,
      participants: updatedRoom.participants,
    });
  });

  // Remove participant (kick)
  socket.on('remove_participant', async (data: { targetUserId: string }) => {
    if (!isHost()) return;
    if (data.targetUserId === participantId) return; // Can't kick yourself

    const updatedRoom = await roomStore.removeParticipant(roomId, data.targetUserId);
    if (!updatedRoom) return;

    // Close the kicked user's socket on whichever Node instance owns it.
    kickParticipantEverywhere(io, {
      roomId,
      participantId: data.targetUserId,
      message: 'You were removed from the room by the host.',
    });

    io.in(roomId).emit('participant_removed', {
      userId: data.targetUserId,
      username: (data as { username?: string }).username ?? 'User',
      participants: updatedRoom.participants,
    });
  });

  // Transfer host
  socket.on('transfer_host', async (data: { targetUserId: string }) => {
    if (!isHost()) return;
    if (data.targetUserId === participantId) return;

    // Atomic 2-way role swap + hostId update in a single write.
    const updatedRoom = await roomStore.transferHost(roomId, participantId, data.targetUserId);
    if (!updatedRoom) return;

    // Update cached role on the previous host (now 'participant') and the new
    // host (now 'host') so their permission checks match the DB immediately.
    syncSocketRoleCache(io, updatedRoom.participants, updatedRoom.hostId);

    io.in(roomId).emit('host_transferred', {
      newHostId: data.targetUserId,
      participants: updatedRoom.participants,
    });
  });
};

import { Socket } from 'socket.io';
import { roomStore } from '../../store/RoomStore';

/**
 * Socket handshake middleware.
 *
 * Cost target: ONE lean, projected Mongo read per connection. The result is
 * cached on `socket.data` so downstream handlers (chat, playback, management)
 * never need to re-read the room document just to check identity.
 *
 * Invariants the cache must preserve (see the handlers for invalidation points):
 *   - `socket.data.role` is the participant's current role.
 *   - `socket.data.username` is immutable (we don't support renames).
 *   - `socket.data.hostId` is the room's current host id.
 * The management and room handlers update these on `role_assigned`,
 * `host_transferred`, and host reassignment after leave.
 */
export const authMiddleware = async (socket: Socket, next: (err?: Error) => void) => {
  try {
    const roomId = socket.handshake.auth.roomId || socket.handshake.query.roomId;
    const participantId = socket.handshake.auth.participantId || socket.handshake.query.participantId;

    if (!roomId || !participantId) {
      return next(new Error('Authentication error: roomId and participantId are required'));
    }

    const snapshot = await roomStore.getAuthSnapshot(roomId as string, participantId as string);
    if (!snapshot) {
      return next(new Error('Authentication error: Participant not found in room'));
    }

    socket.data.roomId = roomId;
    socket.data.participantId = participantId;
    socket.data.role = snapshot.role;
    socket.data.username = snapshot.username;
    socket.data.hostId = snapshot.hostId;

    next();
  } catch (error) {
    next(new Error('Authentication error: Database failure'));
  }
};

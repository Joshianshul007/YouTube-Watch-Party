import { Server, Socket } from 'socket.io';

const MAX_CHAT_MESSAGE_LENGTH = 300;

// Per-socket chat rate limit: fixed-window token bucket.
// At 5 messages / 3 seconds per socket, a 100-user room can still push ~166
// msgs/sec globally — plenty for a lively watch party — but one malicious
// client is capped well below what would saturate the broadcast fan-out.
const CHAT_WINDOW_MS = 3000;
const CHAT_MAX_PER_WINDOW = 5;

type ChatQuota = {
  windowStart: number;
  count: number;
};

export const registerChatHandlers = (_io: Server, socket: Socket) => {
  const roomId: string = socket.data.roomId;

  const quota: ChatQuota = { windowStart: Date.now(), count: 0 };

  const allowMessage = (): boolean => {
    const now = Date.now();
    if (now - quota.windowStart >= CHAT_WINDOW_MS) {
      quota.windowStart = now;
      quota.count = 0;
    }
    quota.count += 1;
    return quota.count <= CHAT_MAX_PER_WINDOW;
  };

  socket.on('chat_message', (data: { message: string }) => {
    const normalizedMessage = data?.message?.trim();
    if (!normalizedMessage) return;
    if (normalizedMessage.length > MAX_CHAT_MESSAGE_LENGTH) return;
    if (!allowMessage()) return;

    // Identity came from the auth middleware — no DB read needed per message.
    const username: string | undefined = socket.data.username;
    const role: string | undefined = socket.data.role;
    if (!username || !role) return;

    // Broadcast directly via the socket's room; Socket.IO does an in-memory
    // fan-out (via Redis pub/sub when the adapter is configured).
    socket.nsp.to(roomId).emit('chat_broadcast', {
      username,
      role,
      message: normalizedMessage,
      timestamp: Date.now(),
    });
  });
};

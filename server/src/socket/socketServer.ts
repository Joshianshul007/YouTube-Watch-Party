import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { authMiddleware } from './middleware/authMiddleware';
import { registerRoomHandlers } from './handlers/roomHandler';
import { registerPlaybackHandlers } from './handlers/playbackHandler';
import { registerManagementHandlers } from './handlers/managementHandler';
import { registerChatHandlers } from './handlers/chatHandler';

export type SocketServerInit = {
  io: Server;
  shutdownRedis?: () => Promise<void>;
};

export const initSocketServer = async (httpServer: HttpServer): Promise<SocketServerInit> => {
  const normalizeOrigin = (value: string) => {
    let v = value.trim().replace(/\/$/, '');
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).trim();
    }
    return v;
  };
  const configured = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  const devOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const isProd = process.env.NODE_ENV === 'production';
  const allowlist = new Set([...configured, ...(isProd ? [] : devOrigins)]);

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowlist.size === 0) return cb(null, true);
        if (allowlist.has(normalizeOrigin(origin))) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.use(authMiddleware);

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (user: ${socket.data.participantId})`);

    registerRoomHandlers(io, socket);
    registerPlaybackHandlers(io, socket);
    registerManagementHandlers(io, socket);
    registerChatHandlers(io, socket);
  });

  const redisUrl = process.env.REDIS_URL?.trim();
  let pubClient: RedisClientType | undefined;
  let subClient: RedisClientType | undefined;

  if (redisUrl) {
    pubClient = createClient({ url: redisUrl });
    subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.error('[Redis pub]', err));
    subClient.on('error', (err) => console.error('[Redis sub]', err));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[Socket.IO] Redis adapter enabled (multi-instance broadcast)');
  } else {
    console.log('[Socket.IO] Single-process mode (set REDIS_URL to scale horizontally)');
  }

  const shutdownRedis =
    pubClient && subClient
      ? async () => {
          await Promise.allSettled([pubClient.quit(), subClient.quit()]);
        }
      : undefined;

  return { io, shutdownRedis };
};

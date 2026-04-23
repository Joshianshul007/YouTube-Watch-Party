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
import { createCorsOriginChecker } from '../utils/corsAllowlist';
import { bindRoleCacheReceiver, bindKickReceiver } from './utils/roleCache';

export type SocketServerInit = {
  io: Server;
  shutdownRedis?: () => Promise<void>;
  isRedisHealthy: () => boolean;
};

// Exponential backoff capped at 10 s. Bounded so the client keeps retrying
// forever but never hammers Redis during a sustained outage.
const reconnectStrategy = (retries: number) =>
  Math.min(100 * Math.pow(2, retries), 10_000);

export const initSocketServer = async (httpServer: HttpServer): Promise<SocketServerInit> => {
  const corsOrigin = createCorsOriginChecker();

  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use(authMiddleware);

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (user: ${socket.data.participantId})`);

    registerRoomHandlers(io, socket);
    registerPlaybackHandlers(io, socket);
    registerManagementHandlers(io, socket);
    registerChatHandlers(io, socket);
  });

  // Cross-instance receivers (no-op under single-process; active under Redis adapter).
  bindRoleCacheReceiver(io);
  bindKickReceiver(io);

  const redisUrl = process.env.REDIS_URL?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  // Hard fail in production if REDIS_URL is missing. Silent single-process mode
  // in prod is a scaling footgun — broadcasts would fail across replicas.
  if (!redisUrl && isProd) {
    throw new Error(
      'REDIS_URL is required in production to run Socket.IO in multi-instance mode. ' +
        'Set REDIS_URL on every replica or run a single instance with NODE_ENV!=production.'
    );
  }

  let pubClient: RedisClientType | undefined;
  let subClient: RedisClientType | undefined;
  let redisHealthy = false;

  if (redisUrl) {
    pubClient = createClient({ url: redisUrl, socket: { reconnectStrategy } });
    subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.error('[Redis pub]', err.message));
    subClient.on('error', (err) => console.error('[Redis sub]', err.message));

    pubClient.on('ready', () => {
      redisHealthy = true;
      console.log('[Redis pub] ready');
    });
    subClient.on('ready', () => {
      redisHealthy = true;
      console.log('[Redis sub] ready');
    });
    pubClient.on('end', () => {
      redisHealthy = false;
    });
    subClient.on('end', () => {
      redisHealthy = false;
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[Socket.IO] Redis adapter enabled (multi-instance broadcast)');
  } else {
    console.log('[Socket.IO] Single-process mode (dev only — set REDIS_URL for horizontal scaling)');
  }

  const shutdownRedis =
    pubClient && subClient
      ? async () => {
          await Promise.allSettled([pubClient!.quit(), subClient!.quit()]);
        }
      : undefined;

  return {
    io,
    shutdownRedis,
    // When Redis is not configured (dev), treat the adapter as "healthy"
    // since single-process mode doesn't depend on it.
    isRedisHealthy: () => (redisUrl ? redisHealthy : true),
  };
};

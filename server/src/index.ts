import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { initSocketServer } from './socket/socketServer';
import roomRoutes from './routes/roomRoutes';
import { connectDB } from './db/connect';
import { createCorsOriginChecker } from './utils/corsAllowlist';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

const corsOrigin = createCorsOriginChecker();

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    optionsSuccessStatus: 204,
  })
);
app.use(express.json());

app.use('/api/rooms', roomRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Readiness probe. Populated after `initSocketServer` resolves. Load balancers
// should use this endpoint to rotate instances out when Redis is down (the
// instance can still serve HTTP but cross-node Socket.IO broadcasts will fail).
let isRedisHealthy: () => boolean = () => false;

app.get('/api/ready', (req, res) => {
  if (!isRedisHealthy()) {
    return res.status(503).json({ status: 'degraded', redis: false });
  }
  return res.json({ status: 'ready', redis: true });
});

const shouldServeClient =
  process.env.NODE_ENV === 'production' && process.env.SERVE_CLIENT !== 'false';

if (shouldServeClient) {
  const clientDistPath = path.resolve(__dirname, '../../client/dist');
  const indexHtmlPath = path.join(clientDistPath, 'index.html');

  if (fs.existsSync(indexHtmlPath)) {
    app.use(express.static(clientDistPath));

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(indexHtmlPath);
    });
  } else {
    console.log(
      '[Static] client/dist/index.html not found, skipping SPA serving (frontend hosted separately).'
    );
  }
}

const bootstrap = async () => {
  await connectDB();

  const init = await initSocketServer(server);
  const { shutdownRedis } = init;
  isRedisHealthy = init.isRedisHealthy;

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    server.close(() => console.log('HTTP server closed'));
    if (shutdownRedis) {
      await shutdownRedis().catch((e) => console.error('Redis shutdown error:', e));
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

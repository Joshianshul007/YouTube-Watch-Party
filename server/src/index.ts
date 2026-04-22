import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import path from 'path';
import { initSocketServer } from './socket/socketServer';
import roomRoutes from './routes/roomRoutes';
import { connectDB } from './db/connect';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

const frontendOrigin = process.env.FRONTEND_URL;
app.use(
  cors({
    origin: frontendOrigin || true
  })
);
app.use(express.json());

app.use('/api/rooms', roomRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (process.env.NODE_ENV === 'production') {
  const clientDistPath = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

const bootstrap = async () => {
  await connectDB();

  const { shutdownRedis } = await initSocketServer(server);

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

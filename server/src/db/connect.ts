import mongoose from 'mongoose';
import { RoomModel } from '../models/RoomSchema';

export const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/youtube-watch-party';
    const maxPoolSize = Math.min(
      100,
      Math.max(10, parseInt(process.env.MONGO_MAX_POOL_SIZE || '50', 10) || 50)
    );

    // Pin `autoIndex` explicitly. In production we disable it and instead run
    // `syncIndexes()` at boot: same effect, but it's a deliberate op rather
    // than happening implicitly on the first query.
    const isProd = process.env.NODE_ENV === 'production';

    await mongoose.connect(mongoUri, {
      maxPoolSize,
      autoIndex: !isProd,
    });

    if (isProd) {
      try {
        await RoomModel.syncIndexes();
        console.log('[Mongo] Indexes synced');
      } catch (err) {
        console.error('[Mongo] syncIndexes failed:', err);
      }
    }

    console.log(`Connected to MongoDB (maxPoolSize=${maxPoolSize}, autoIndex=${!isProd})`);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

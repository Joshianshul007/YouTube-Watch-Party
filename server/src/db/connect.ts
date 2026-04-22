import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/youtube-watch-party';
    const maxPoolSize = Math.min(
      100,
      Math.max(10, parseInt(process.env.MONGO_MAX_POOL_SIZE || '50', 10) || 50)
    );

    await mongoose.connect(mongoUri, {
      maxPoolSize
    });
    console.log(`Connected to MongoDB (maxPoolSize=${maxPoolSize})`);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

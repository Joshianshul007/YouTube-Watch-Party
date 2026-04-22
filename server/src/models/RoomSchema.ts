import mongoose, { Schema, Document } from 'mongoose';

// Participant Sub-schema
const ParticipantSchema = new Schema({
  id: { type: String, required: true },
  username: { type: String, required: true },
  role: { type: String, enum: ['host', 'moderator', 'participant'], required: true },
  socketId: { type: String, default: null },
  joinedAt: { type: Date, default: Date.now }
});

// Video State Sub-schema
const VideoStateSchema = new Schema({
  videoId: { type: String, default: null },
  isPlaying: { type: Boolean, default: false },
  currentTime: { type: Number, default: 0 },
  lastUpdated: { type: Number, default: () => Date.now() }
});

// Room Schema
const RoomDocumentSchema = new Schema({
  id: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true },
  hostId: { type: String, required: true },
  participants: [ParticipantSchema],
  videoState: { type: VideoStateSchema, default: () => ({}) },
  createdAt: { type: Date, default: Date.now }
});

// Interfaces to match our existing code as much as possible
export interface IMongoParticipant {
  id: string;
  username: string;
  role: 'host' | 'moderator' | 'participant';
  socketId: string | null;
  joinedAt: Date;
}

export interface IMongoVideoState {
  videoId: string | null;
  isPlaying: boolean;
  currentTime: number;
  lastUpdated: number;
}

export interface IMongoRoom extends Document {
  id: string;
  code: string;
  hostId: string;
  participants: IMongoParticipant[];
  videoState: IMongoVideoState;
  createdAt: Date;
}

export const RoomModel = mongoose.model<IMongoRoom>('Room', RoomDocumentSchema);

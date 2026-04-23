import mongoose, { Schema, Document } from 'mongoose';

// Participant Sub-schema
const ParticipantSchema = new Schema({
  id: { type: String, required: true },
  username: { type: String, required: true },
  role: { type: String, enum: ['host', 'moderator', 'participant'], required: true },
  socketId: { type: String, default: null },
  // Unix ms. When non-null, this participant is in the disconnect-grace window.
  // Set on `disconnect`, cleared on `join_room`. Persisted (not in-memory) so
  // the grace window survives across Node instances and process restarts.
  disconnectedAt: { type: Number, default: null },
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

// Unique indexes on `id` and `code` are declared via `unique: true` above;
// adding a `schema.index()` for them would be a duplicate and triggers a
// Mongoose warning. Declare only the non-unique supplemental indexes here.
//
// Supports any code path that looks up by live socketId (e.g. future
// server-side reverse lookups). `sparse` keeps the index small since every
// participant can have a null `socketId` while briefly disconnected.
RoomDocumentSchema.index({ 'participants.socketId': 1 }, { sparse: true });

// Interfaces to match our existing code as much as possible
export interface IMongoParticipant {
  id: string;
  username: string;
  role: 'host' | 'moderator' | 'participant';
  socketId: string | null;
  disconnectedAt: number | null;
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

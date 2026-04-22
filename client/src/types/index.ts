export type Role = 'host' | 'moderator' | 'participant';

export interface Participant {
  id: string;
  username: string;
  role: Role;
  socketId: string | null;
  joinedAt: string;
}

export interface VideoState {
  videoId: string | null;
  isPlaying: boolean;
  currentTime: number;
  lastUpdated: number;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  participants: Participant[];
  videoState: VideoState;
  createdAt: string;
}

export interface ChatMessage {
  username: string;
  role: Role | 'system';
  message: string;
  timestamp: number;
}

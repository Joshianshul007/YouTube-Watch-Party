import { Participant } from './Participant';

interface VideoState {
  videoId: string | null;
  isPlaying: boolean;
  currentTime: number;
  lastUpdated: number;
}

export class Room {
  id: string;
  code: string;
  hostId: string;
  participants: Map<string, Participant>;
  videoState: VideoState;
  createdAt: Date;

  constructor(id: string, code: string, hostId: string) {
    this.id = id;
    this.code = code;
    this.hostId = hostId;
    this.participants = new Map();
    this.videoState = {
      videoId: null,
      isPlaying: false,
      currentTime: 0,
      lastUpdated: Date.now()
    };
    this.createdAt = new Date();
  }

  addParticipant(participant: Participant) {
    this.participants.set(participant.id, participant);
  }

  removeParticipant(participantId: string) {
    this.participants.delete(participantId);
  }

  getParticipant(participantId: string) {
    return this.participants.get(participantId);
  }
}

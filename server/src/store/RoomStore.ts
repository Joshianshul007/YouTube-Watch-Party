import { Participant } from '../models/Participant';
import { RoomModel, IMongoRoom } from '../models/RoomSchema';

class MongoRoomStore {
  async createRoom(roomId: string, roomCode: string, hostId: string): Promise<IMongoRoom> {
    const newRoom = new RoomModel({
      id: roomId,
      code: roomCode,
      hostId: hostId,
      participants: [],
      videoState: {
        videoId: null,
        isPlaying: false,
        currentTime: 0,
        lastUpdated: Date.now()
      }
    });
    return await newRoom.save();
  }

  async getRoom(roomId: string): Promise<IMongoRoom | null> {
    return await RoomModel.findOne({ id: roomId });
  }

  async getRoomByCode(code: string): Promise<IMongoRoom | null> {
    return await RoomModel.findOne({ code });
  }

  async updateRoom(roomId: string, updateData: Partial<IMongoRoom>): Promise<IMongoRoom | null> {
    return await RoomModel.findOneAndUpdate(
      { id: roomId },
      { $set: updateData },
      { returnDocument: 'after' }
    );
  }

  /**
   * Atomically update only the specified videoState subfields.
   * Avoids a read-then-write round-trip and preserves fields that are not passed in
   * (e.g. updating `currentTime` alone won't clobber `videoId` / `isPlaying`).
   */
  async updateVideoStateFields(
    roomId: string,
    fields: Partial<{ videoId: string | null; isPlaying: boolean; currentTime: number; lastUpdated: number }>
  ): Promise<IMongoRoom | null> {
    const set: Record<string, unknown> = {};
    if ('videoId' in fields) set['videoState.videoId'] = fields.videoId ?? null;
    if ('isPlaying' in fields) set['videoState.isPlaying'] = !!fields.isPlaying;
    if ('currentTime' in fields) set['videoState.currentTime'] = fields.currentTime;
    if ('lastUpdated' in fields) set['videoState.lastUpdated'] = fields.lastUpdated;

    if (Object.keys(set).length === 0) {
      return await this.getRoom(roomId);
    }

    return await RoomModel.findOneAndUpdate(
      { id: roomId },
      { $set: set },
      { returnDocument: 'after' }
    );
  }

  /**
   * Cheap, read-only, lean permission check. Returns the participant's role, or null.
   * Avoids hydrating the full Mongoose document for every playback event.
   */
  async getParticipantRole(
    roomId: string,
    participantId: string
  ): Promise<'host' | 'moderator' | 'participant' | null> {
    const doc = await RoomModel.findOne(
      { id: roomId, 'participants.id': participantId },
      { 'participants.$': 1 }
    ).lean();

    const role = doc?.participants?.[0]?.role;
    return role ?? null;
  }

  async addParticipant(roomId: string, participant: Participant): Promise<IMongoRoom | null> {
    return await RoomModel.findOneAndUpdate(
      { id: roomId },
      { $push: { participants: participant } },
      { returnDocument: 'after' }
    );
  }

  async removeParticipant(roomId: string, participantId: string): Promise<IMongoRoom | null> {
    return await RoomModel.findOneAndUpdate(
      { id: roomId },
      { $pull: { participants: { id: participantId } } },
      { returnDocument: 'after' }
    );
  }

  async updateParticipantSocket(roomId: string, participantId: string, socketId: string): Promise<IMongoRoom | null> {
    return await RoomModel.findOneAndUpdate(
      { id: roomId, 'participants.id': participantId },
      { $set: { 'participants.$.socketId': socketId } },
      { returnDocument: 'after' }
    );
  }

  async removeParticipantBySocket(socketId: string): Promise<IMongoRoom | null> {
    const room = await RoomModel.findOne({ 'participants.socketId': socketId });
    if (!room) return null;

    return await this.removeParticipant(room.id, room.participants.find(p => p.socketId === socketId)!.id);
  }
}

export const roomStore = new MongoRoomStore();

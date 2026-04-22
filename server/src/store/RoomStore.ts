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

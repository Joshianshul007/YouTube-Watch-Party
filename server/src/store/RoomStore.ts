import { Participant } from '../models/Participant';
import { RoomModel, IMongoRoom, IMongoParticipant } from '../models/RoomSchema';

// Lean shape — same fields as IMongoRoom but without Mongoose document methods.
// Use this for read-only callers (broadcast payloads, permission lookups, etc.).
export type LeanRoom = {
  id: string;
  code: string;
  hostId: string;
  participants: IMongoParticipant[];
  videoState: {
    videoId: string | null;
    isPlaying: boolean;
    currentTime: number;
    lastUpdated: number;
  };
  createdAt: Date;
};

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

  /**
   * Single-insert room creation with the host already embedded. Saves a
   * round-trip compared to `createRoom` + `addParticipant`.
   */
  async createRoomWithHost(
    roomId: string,
    roomCode: string,
    host: Participant
  ): Promise<LeanRoom> {
    const doc = await RoomModel.create({
      id: roomId,
      code: roomCode,
      hostId: host.id,
      participants: [host],
      videoState: {
        videoId: null,
        isPlaying: false,
        currentTime: 0,
        lastUpdated: Date.now(),
      },
    });
    return doc.toObject() as LeanRoom;
  }

  async getRoom(roomId: string): Promise<IMongoRoom | null> {
    return await RoomModel.findOne({ id: roomId });
  }

  /** Read-only, no Mongoose hydration. Prefer this for permission checks + broadcasts. */
  async getRoomLean(roomId: string): Promise<LeanRoom | null> {
    return (await RoomModel.findOne({ id: roomId }).lean()) as LeanRoom | null;
  }

  async getRoomByCode(code: string): Promise<IMongoRoom | null> {
    return await RoomModel.findOne({ code });
  }

  async getRoomByCodeLean(code: string): Promise<LeanRoom | null> {
    return (await RoomModel.findOne({ code }).lean()) as LeanRoom | null;
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
  ): Promise<LeanRoom | null> {
    const set: Record<string, unknown> = {};
    if ('videoId' in fields) set['videoState.videoId'] = fields.videoId ?? null;
    if ('isPlaying' in fields) set['videoState.isPlaying'] = !!fields.isPlaying;
    if ('currentTime' in fields) set['videoState.currentTime'] = fields.currentTime;
    if ('lastUpdated' in fields) set['videoState.lastUpdated'] = fields.lastUpdated;

    if (Object.keys(set).length === 0) {
      return await this.getRoomLean(roomId);
    }

    return (await RoomModel.findOneAndUpdate(
      { id: roomId },
      { $set: set },
      { returnDocument: 'after' }
    ).lean()) as LeanRoom | null;
  }

  /**
   * Atomically toggle isPlaying while also updating currentTime + lastUpdated.
   * No read-before-write — the aggregation pipeline flips the boolean
   * server-side. Uses the raw MongoDB driver because Mongoose 8+ requires an
   * explicit opt-in for pipeline updates; the raw collection accepts them
   * natively and bypasses hooks we don't use on this schema.
   */
  async togglePlaybackAtomic(
    roomId: string,
    currentTime: number
  ): Promise<LeanRoom | null> {
    const result = await RoomModel.collection.findOneAndUpdate(
      { id: roomId },
      [
        {
          $set: {
            'videoState.isPlaying': { $not: '$videoState.isPlaying' },
            'videoState.currentTime': currentTime,
            'videoState.lastUpdated': Date.now(),
          },
        },
      ],
      { returnDocument: 'after' }
    );
    // The mongodb driver (v6) returns the updated document directly (or null).
    return (result as unknown as LeanRoom | null) ?? null;
  }

  /**
   * Heartbeat-style partial update. Does NOT run if videoId is null
   * (no video loaded — nothing to sync). Zero reads.
   */
  async heartbeatVideoState(
    roomId: string,
    fields: { isPlaying: boolean; currentTime: number; lastUpdated: number }
  ): Promise<void> {
    await RoomModel.updateOne(
      { id: roomId, 'videoState.videoId': { $ne: null } },
      {
        $set: {
          'videoState.isPlaying': !!fields.isPlaying,
          'videoState.currentTime': fields.currentTime,
          'videoState.lastUpdated': fields.lastUpdated,
        },
      }
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

  /**
   * Lean-projected identity lookup for the socket handshake. One round-trip,
   * one participant sub-document returned (the `$` positional projection).
   */
  async getAuthSnapshot(
    roomId: string,
    participantId: string
  ): Promise<{ role: IMongoParticipant['role']; username: string; hostId: string } | null> {
    const doc = await RoomModel.findOne(
      { id: roomId, 'participants.id': participantId },
      { 'participants.$': 1, hostId: 1 }
    ).lean();

    const p = doc?.participants?.[0];
    if (!p) return null;
    return { role: p.role, username: p.username, hostId: doc!.hostId };
  }

  async addParticipant(roomId: string, participant: Participant): Promise<LeanRoom | null> {
    return (await RoomModel.findOneAndUpdate(
      { id: roomId },
      { $push: { participants: participant } },
      { returnDocument: 'after' }
    ).lean()) as LeanRoom | null;
  }

  async removeParticipant(roomId: string, participantId: string): Promise<LeanRoom | null> {
    return (await RoomModel.findOneAndUpdate(
      { id: roomId },
      { $pull: { participants: { id: participantId } } },
      { returnDocument: 'after' }
    ).lean()) as LeanRoom | null;
  }

  async updateParticipantSocket(
    roomId: string,
    participantId: string,
    socketId: string
  ): Promise<LeanRoom | null> {
    // Also clears `disconnectedAt` so any scheduled disconnect-grace timer
    // on any Node instance sees "this participant reconnected" on its next peek.
    return (await RoomModel.findOneAndUpdate(
      { id: roomId, 'participants.id': participantId },
      {
        $set: {
          'participants.$.socketId': socketId,
          'participants.$.disconnectedAt': null,
        },
      },
      { returnDocument: 'after' }
    ).lean()) as LeanRoom | null;
  }

  /**
   * Mark a participant as disconnected IFF the provided `socketId` still
   * matches their current `socketId` (prevents a stale disconnect from
   * clobbering a newer live connection). Also nulls `socketId` since it's
   * no longer valid.
   *
   * Returns the timestamp we wrote (so the caller can compare it later to
   * detect whether a subsequent disconnect superseded theirs), or `null` if
   * the update didn't match (stale / already reconnected / removed).
   */
  async markDisconnected(
    roomId: string,
    participantId: string,
    socketId: string,
    disconnectedAt: number
  ): Promise<number | null> {
    const res = await RoomModel.updateOne(
      {
        id: roomId,
        participants: { $elemMatch: { id: participantId, socketId } },
      },
      {
        $set: {
          'participants.$.disconnectedAt': disconnectedAt,
          'participants.$.socketId': null,
        },
      }
    );
    return res.modifiedCount > 0 ? disconnectedAt : null;
  }

  /**
   * Lean-projected peek at disconnect-grace state for a single participant.
   * Returns `undefined` if the participant is no longer in the room,
   * `null` if they are connected, or the numeric timestamp if they are
   * currently in the grace window.
   */
  async peekDisconnectedAt(
    roomId: string,
    participantId: string
  ): Promise<number | null | undefined> {
    const doc = await RoomModel.findOne(
      { id: roomId, 'participants.id': participantId },
      { 'participants.$': 1 }
    ).lean();
    const p = doc?.participants?.[0];
    if (!p) return undefined;
    return (p as { disconnectedAt?: number | null }).disconnectedAt ?? null;
  }

  /**
   * Atomically change a participant's role. Blocks changing the host's role
   * (use `transferHost` for that). Returns the updated room if the update ran.
   */
  async assignRole(
    roomId: string,
    targetUserId: string,
    role: 'moderator' | 'participant'
  ): Promise<LeanRoom | null> {
    return (await RoomModel.findOneAndUpdate(
      {
        id: roomId,
        participants: { $elemMatch: { id: targetUserId, role: { $ne: 'host' } } },
      },
      { $set: { 'participants.$.role': role } },
      { returnDocument: 'after' }
    ).lean()) as LeanRoom | null;
  }

  /**
   * Atomic host transfer in one write: demote the current host to 'participant',
   * promote the target to 'host', and update top-level `hostId` — all or nothing.
   */
  async transferHost(
    roomId: string,
    currentHostId: string,
    newHostId: string
  ): Promise<LeanRoom | null> {
    return (await RoomModel.findOneAndUpdate(
      { id: roomId },
      {
        $set: {
          hostId: newHostId,
          'participants.$[old].role': 'participant',
          'participants.$[new].role': 'host',
        },
      },
      {
        arrayFilters: [{ 'old.id': currentHostId }, { 'new.id': newHostId }],
        returnDocument: 'after',
      }
    ).lean()) as LeanRoom | null;
  }

  /**
   * Atomic host reassignment (no current host; used when the host leaves).
   * Sets hostId and promotes the target participant in one write.
   */
  async assignNewHost(roomId: string, newHostId: string): Promise<LeanRoom | null> {
    return (await RoomModel.findOneAndUpdate(
      { id: roomId },
      {
        $set: {
          hostId: newHostId,
          'participants.$[new].role': 'host',
        },
      },
      {
        arrayFilters: [{ 'new.id': newHostId }],
        returnDocument: 'after',
      }
    ).lean()) as LeanRoom | null;
  }
}

export const roomStore = new MongoRoomStore();

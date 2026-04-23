import { Router, Request, Response } from 'express';
import { roomStore } from '../store/RoomStore';
import { Participant } from '../models/Participant';
import { generateRoomCode, generateUUID } from '../utils/generateId';

const router = Router();

const MAX_CODE_RETRIES = 5;
// Mongo duplicate-key error code. We catch this to handle unique-code collisions
// at write time instead of paying for speculative reads beforehand.
const MONGO_DUPLICATE_KEY = 11000;

const isDupKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === MONGO_DUPLICATE_KEY;

// POST /api/rooms
router.post('/', async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }

    const roomId = generateUUID();
    const participantId = generateUUID();
    const hostParticipant = new Participant(participantId, username, 'host');

    // Insert the room with the host embedded in a single write. On the rare
    // chance of a duplicate room code, retry with a fresh code (relies on the
    // unique index on `code`).
    let created = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt += 1) {
      const roomCode = generateRoomCode();
      try {
        created = await roomStore.createRoomWithHost(roomId, roomCode, hostParticipant);
        break;
      } catch (err) {
        lastError = err;
        if (!isDupKeyError(err)) throw err;
      }
    }

    if (!created) {
      console.error('Failed to create room after retries', lastError);
      return res.status(500).json({ error: 'Failed to allocate room code' });
    }

    res.status(201).json({
      roomId: created.id,
      roomCode: created.code,
      participantId: hostParticipant.id,
      role: hostParticipant.role,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/rooms/join
router.post('/join', async (req: Request, res: Response) => {
  try {
    const { roomCode, username } = req.body;
    if (!roomCode || !username) {
      return res.status(400).json({ error: 'Room code and username are required' });
    }
    const room = await roomStore.getRoomByCodeLean(roomCode.toUpperCase());
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    const participantId = generateUUID();
    const newParticipant = new Participant(participantId, username, 'participant');

    await roomStore.addParticipant(room.id, newParticipant);

    res.status(200).json({
      roomId: room.id,
      participantId: newParticipant.id,
      role: newParticipant.role,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/rooms/:roomId
router.get('/:roomId', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const room = await roomStore.getRoomLean(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.status(200).json({
      id: room.id,
      code: room.code,
      hostId: room.hostId,
      videoState: room.videoState,
      createdAt: room.createdAt,
      participants: room.participants,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { roomStore } from '../store/RoomStore';
import { Participant } from '../models/Participant';
import { generateRoomCode, generateUUID } from '../utils/generateId';

const router = Router();

// POST /api/rooms
router.post('/', async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }

    const roomId = generateUUID();
    let roomCode = '';

    // Ensure unique room code
    let isUnique = false;
    while (!isUnique) {
      roomCode = generateRoomCode();
      const existing = await roomStore.getRoomByCode(roomCode);
      if (!existing) {
        isUnique = true;
      }
    }

    const participantId = generateUUID();
    
    // Create room first
    const newRoom = await roomStore.createRoom(roomId, roomCode, participantId);

    // Add host
    const hostParticipant = new Participant(participantId, username, 'host');
    await roomStore.addParticipant(roomId, hostParticipant);

    res.status(201).json({
      roomId: newRoom.id,
      roomCode: newRoom.code,
      participantId: hostParticipant.id,
      role: hostParticipant.role
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
    const room = await roomStore.getRoomByCode(roomCode.toUpperCase());
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    const participantId = generateUUID();
    const newParticipant = new Participant(participantId, username, 'participant');
    
    await roomStore.addParticipant(room.id, newParticipant);

    res.status(200).json({
      roomId: room.id,
      participantId: newParticipant.id,
      role: newParticipant.role
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
    const room = await roomStore.getRoom(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.status(200).json({
      id: room.id,
      code: room.code,
      hostId: room.hostId,
      videoState: room.videoState,
      createdAt: room.createdAt,
      participants: room.participants
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;

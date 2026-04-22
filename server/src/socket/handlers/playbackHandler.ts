import { Server, Socket } from 'socket.io';
import { roomStore } from '../../store/RoomStore';
import { IMongoRoom } from '../../models/RoomSchema';

export const registerPlaybackHandlers = (io: Server, socket: Socket) => {
  const roomId: string = socket.data.roomId;
  const participantId: string = socket.data.participantId;

  // Generalized broadcast for any state change
  const broadcastSyncState = (room: IMongoRoom) => {
    io.in(roomId).emit('sync_state', {
      isPlaying: room.videoState.isPlaying,
      currentTime: room.videoState.currentTime,
      videoId: room.videoState.videoId,
      timestamp: room.videoState.lastUpdated,
    });
  };

  const hasPermission = async (): Promise<boolean> => {
    const room = await roomStore.getRoom(roomId);
    if (!room) return false;
    const participant = room.participants.find(p => p.id === participantId);
    return participant?.role === 'host' || participant?.role === 'moderator';
  };

  const isValidVideoId = (videoId: string) => /^[a-zA-Z0-9_-]{11}$/.test(videoId);

  socket.on('play', async (data: { currentTime: number }) => {
    if (!(await hasPermission())) return;
    
    const updatedRoom = await roomStore.updateRoom(roomId, {
      videoState: {
        videoId: (await roomStore.getRoom(roomId))?.videoState.videoId || null,
        isPlaying: true,
        currentTime: data.currentTime,
        lastUpdated: Date.now()
      }
    } as any); // using any for nested partials is sometimes an issue in TS with mongoose, but safe here since we replace the object

    if (updatedRoom) broadcastSyncState(updatedRoom);
  });

  socket.on('pause', async (data: { currentTime: number }) => {
    if (!(await hasPermission())) return;

    const currentRoom = await roomStore.getRoom(roomId);
    const updatedRoom = await roomStore.updateRoom(roomId, {
      videoState: {
        videoId: currentRoom?.videoState.videoId || null,
        isPlaying: false,
        currentTime: data.currentTime,
        lastUpdated: Date.now()
      }
    } as any);

    if (updatedRoom) broadcastSyncState(updatedRoom);
  });

  socket.on('seek', async (data: { time: number }) => {
    if (!(await hasPermission())) return;
    
    const currentRoom = await roomStore.getRoom(roomId);
    const updatedRoom = await roomStore.updateRoom(roomId, {
      videoState: {
        videoId: currentRoom?.videoState.videoId || null,
        isPlaying: currentRoom?.videoState.isPlaying || false,
        currentTime: data.time,
        lastUpdated: Date.now()
      }
    } as any);

    if (updatedRoom) broadcastSyncState(updatedRoom);
  });

  socket.on('change_video', async (data: { videoId: string }) => {
    if (!(await hasPermission())) return;

    const trimmedVideoId = data.videoId?.trim();
    if (!trimmedVideoId || !isValidVideoId(trimmedVideoId)) return;

    const updatedRoom = await roomStore.updateRoom(roomId, {
      videoState: {
        videoId: trimmedVideoId,
        isPlaying: true,
        currentTime: 0,
        lastUpdated: Date.now()
      }
    } as any);

    if (updatedRoom) broadcastSyncState(updatedRoom);
  });
};

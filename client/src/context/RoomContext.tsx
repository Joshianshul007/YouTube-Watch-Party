import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import type { Participant, Role, VideoState, ChatMessage } from '../types';
import type { Socket } from 'socket.io-client';

interface RoomContextType {
  roomCode: string;
  participants: Participant[];
  videoState: VideoState;
  role: Role | null;
  socket: Socket | null;
  chatMessages: ChatMessage[];
  setRoomCode: (code: string) => void;
  setParticipants: (participants: Participant[]) => void;
  setVideoState: Dispatch<SetStateAction<VideoState>>;
  setRole: (role: Role) => void;
  setSocket: (socket: Socket | null) => void;
  addChatMessage: (msg: ChatMessage) => void;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export const RoomProvider = ({ children }: { children: ReactNode }) => {
  const [roomCode, setRoomCode] = useState<string>('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [videoState, setVideoState] = useState<VideoState>({
    videoId: null,
    isPlaying: false,
    currentTime: 0,
    lastUpdated: 0
  });
  const [role, setRole] = useState<Role | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const addChatMessage = useCallback((msg: ChatMessage) => {
    setChatMessages(prev => [...prev, msg]);
  }, []);

  return (
    <RoomContext.Provider 
      value={{ 
        roomCode, setRoomCode, 
        participants, setParticipants, 
        videoState, setVideoState, 
        role, setRole,
        socket, setSocket,
        chatMessages, addChatMessage
      }}
    >
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = () => {
  const context = useContext(RoomContext);
  if (context === undefined) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
};

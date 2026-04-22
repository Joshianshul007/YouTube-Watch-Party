import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useRoom } from '../context/RoomContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { Participant, Role } from '../types';

const SOCKET_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace('/api', '')
  : import.meta.env.PROD
    ? window.location.origin
    : 'http://localhost:3001';

export const useSocket = (roomId: string, participantId: string) => {
  const [localSocket, setLocalSocket] = useState<Socket | null>(null);
  const { setParticipants, setVideoState, setSocket: setContextSocket, setRole, addChatMessage } = useRoom();
  const navigate = useNavigate();

  useEffect(() => {
    if (!roomId || !participantId) return;

    const newSocket = io(SOCKET_URL, {
      auth: { roomId, participantId },
      transports: ['websocket']
    });

    newSocket.on('connect', () => {
      console.log('Connected to socket server');
      newSocket.emit('join_room');
    });

    newSocket.on('connect_error', (err) => {
      const msg = err.message || 'Connection error';
      // Participant was cleaned up server-side (grace period expired, room gone,
      // or identity lost). Clear local session and return to landing.
      if (/Participant not found/i.test(msg) || /Room not found/i.test(msg)) {
        toast.error('Session expired. Please join the room again.');
        localStorage.removeItem(`wp_session_${roomId}`);
        newSocket.disconnect();
        navigate('/');
        return;
      }
      toast.error(msg);
    });

    newSocket.on('room_snapshot', (data: {
      participantId: string;
      role: Role;
      hostId: string;
      participants: Participant[];
    }) => {
      setParticipants(data.participants);
      setRole(data.role);
      try {
        const key = `wp_session_${roomId}`;
        const raw = localStorage.getItem(key);
        const prev = raw ? JSON.parse(raw) : {};
        localStorage.setItem(key, JSON.stringify({ ...prev, participantId, role: data.role }));
      } catch { /* ignore */ }
    });

    newSocket.on('user_reconnected', (data: { participants: Participant[] }) => {
      setParticipants(data.participants);
    });

    // Core Room Events
    newSocket.on('user_joined', (data) => {
      setParticipants(data.participants);
      toast(`${data.username} joined the party`, { icon: '👋' });
      addChatMessage({
        username: 'System',
        role: 'system',
        message: `${data.username} joined the room`,
        timestamp: Date.now()
      });
    });

    newSocket.on('user_left', (data) => {
      setParticipants(data.participants);
      toast(`${data.username} left the party`, { icon: '🚪' });
      addChatMessage({
        username: 'System',
        role: 'system',
        message: `${data.username} left the room`,
        timestamp: Date.now()
      });
    });

    newSocket.on('sync_state', (data: { isPlaying: boolean; currentTime: number; videoId: string | null; timestamp: number }) => {
      const serverTimestamp = typeof data.timestamp === 'number' ? data.timestamp : Date.now();
      setVideoState({
        isPlaying: data.isPlaying,
        currentTime: data.currentTime,
        videoId: data.videoId,
        lastUpdated: serverTimestamp
      });
    });

    const persistRole = (nextRole: Role) => {
      try {
        const key = `wp_session_${roomId}`;
        const raw = localStorage.getItem(key);
        const prev = raw ? JSON.parse(raw) : {};
        localStorage.setItem(key, JSON.stringify({ ...prev, participantId, role: nextRole }));
      } catch { /* ignore */ }
    };

    // Management Events
    newSocket.on('host_transferred', (data) => {
      setParticipants(data.participants);
      const me = data.participants.find((p: Participant) => p.id === participantId);

      if (!me) return;

      setRole(me.role);
      persistRole(me.role);

      if (data.newHostId === participantId) {
        toast('You are now the Host!', { icon: '👑' });
      } else if (me.role === 'participant') {
        toast('Host has been transferred', { icon: '👑' });
      }
    });

    newSocket.on('role_assigned', (data) => {
      setParticipants(data.participants);
      if (data.userId === participantId) {
        setRole(data.newRole);
        persistRole(data.newRole);
        toast(`You are now a ${data.newRole === 'moderator' ? 'Moderator 🛡️' : 'Participant'}`, { icon: '✨' });
      } else {
        toast(`${data.username} is now a ${data.newRole}`, { icon: '✨' });
      }
    });

    newSocket.on('participant_removed', (data) => {
      setParticipants(data.participants);
      toast(`${data.username} was removed from the room`, { icon: '🚫' });
    });

    newSocket.on('kicked', (data) => {
      toast.error(data.message);
      localStorage.removeItem(`wp_session_${roomId}`);
      newSocket.disconnect();
      navigate('/');
    });

    // Chat Events
    newSocket.on('chat_broadcast', (data) => {
      addChatMessage({
        username: data.username,
        role: data.role,
        message: data.message,
        timestamp: data.timestamp
      });
    });

    setLocalSocket(newSocket);
    setContextSocket(newSocket);

    return () => {
      newSocket.emit('leave_room');
      newSocket.disconnect();
      setLocalSocket(null);
      setContextSocket(null);
    };
  }, [roomId, participantId, setParticipants, setVideoState, setContextSocket, setRole, addChatMessage, navigate]);

  return localSocket;
};

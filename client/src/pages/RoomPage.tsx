import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useRoom, RoomProvider } from '../context/RoomContext';
import { useSocket } from '../hooks/useSocket';
import { RoomHeader } from '../components/RoomHeader';
import { ParticipantList } from '../components/ParticipantList';
import { VideoPlayer } from '../components/VideoPlayer';
import { getRoom } from '../services/api';
import toast from 'react-hot-toast';
import '../styles/room.css';
import '../styles/chat.css';

const RoomPageContent = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { setRoomCode, setParticipants, setVideoState, setRole } = useRoom();
  const [isLoading, setIsLoading] = useState(true);

  // Fallback for direct URL hits without state
  const participantId = location.state?.participantId;
  const role = location.state?.role;

  useEffect(() => {
    if (!roomId) return;
    if (!participantId) {
      toast.error('You need to join or create a room first.');
      navigate('/');
      return;
    }

    const fetchRoom = async () => {
      try {
        const data = await getRoom(roomId);
        setRoomCode(data.code);
        setParticipants(data.participants);
        setVideoState(data.videoState);
        setRole(role);
      } catch (err) {
        toast.error('Room not found or expired.');
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoom();
  }, [roomId, participantId, role, navigate, setRoomCode, setParticipants, setVideoState, setRole]);

  // Establish socket connection only after initial fetch
  useSocket(roomId || '', participantId || '');

  if (isLoading) {
    return <div className="room-container" style={{ justifyContent: 'center', alignItems: 'center' }}>Loading Party...</div>;
  }

  return (
    <div className="room-container">
      <RoomHeader />
      <div className="room-main">
        <VideoPlayer />
        <ParticipantList />
      </div>
    </div>
  );
};

export const RoomPage = () => {
  return (
    <RoomProvider>
      <RoomPageContent />
    </RoomProvider>
  );
};

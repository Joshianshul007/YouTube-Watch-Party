import { Film, Copy, LogOut } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

export const RoomHeader = () => {
  const { roomCode, setRoomCode, setParticipants } = useRoom();
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode);
    toast.success('Room code copied!');
  };

  const handleLeave = () => {
    if (roomId) {
      localStorage.removeItem(`wp_session_${roomId}`);
    }
    navigate('/');
    setRoomCode('');
    setParticipants([]);
    toast('You left the room', { icon: '🚪' });
  };

  return (
    <header className="room-header">
      <h1>
        <Film size={24} />
        Watch Party
      </h1>
      
      <div className="room-actions">
        <div className="code-badge">
          {roomCode ? roomCode : '------'}
        </div>
        <button className="btn-secondary" onClick={handleCopy} title="Copy Code">
          <Copy size={18} />
          Copy
        </button>
        <button className="btn-secondary btn-danger" onClick={handleLeave} title="Leave Room">
          <LogOut size={18} />
          Leave
        </button>
      </div>
    </header>
  );
};

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { joinRoom } from '../services/api';
import toast from 'react-hot-toast';

export const JoinRoomForm = () => {
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !roomCode.trim()) return;

    setIsLoading(true);
    try {
      const data = await joinRoom(roomCode, username);
      navigate(`/room/${data.roomId}`, {
        state: { participantId: data.participantId, role: data.role },
      });
      toast.success('Joined room!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to join room. Check your code.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="join-username">Choose a Username</label>
        <input
          id="join-username"
          type="text"
          className="form-input"
          placeholder="e.g. MovieBuff99"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          maxLength={20}
        />
      </div>
      <div className="form-group">
        <label htmlFor="join-code">Room Code</label>
        <input
          id="join-code"
          type="text"
          className="form-input"
          placeholder="e.g. X7K9A2"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          required
          maxLength={6}
          style={{ textTransform: 'uppercase', letterSpacing: '2px' }}
        />
      </div>
      <button type="submit" className="btn-primary" disabled={isLoading || !username.trim() || !roomCode.trim()}>
        <Users size={20} />
        {isLoading ? 'Joining...' : 'Join Party'}
      </button>
    </form>
  );
};

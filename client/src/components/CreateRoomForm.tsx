import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { createRoom } from '../services/api';
import toast from 'react-hot-toast';

export const CreateRoomForm = () => {
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setIsLoading(true);
    try {
      const data = await createRoom(username);
      localStorage.setItem(
        `wp_session_${data.roomId}`,
        JSON.stringify({
          participantId: data.participantId,
          role: data.role,
          username,
        })
      );
      navigate(`/room/${data.roomId}`, {
        state: { participantId: data.participantId, role: data.role },
      });
      toast.success('Room created successfully!');
    } catch (err) {
      toast.error('Failed to create room. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="create-username">Choose a Username</label>
        <input
          id="create-username"
          type="text"
          className="form-input"
          placeholder="e.g. MovieBuff99"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          maxLength={20}
        />
      </div>
      <button type="submit" className="btn-primary" disabled={isLoading || !username.trim()}>
        <Play size={20} />
        {isLoading ? 'Creating...' : 'Create Party'}
      </button>
    </form>
  );
};

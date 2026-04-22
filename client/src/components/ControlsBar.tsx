import React, { useState } from 'react';
import { Play, Pause, Search } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { extractVideoId } from '../utils/youtube';
import toast from 'react-hot-toast';

interface ControlsBarProps {
  duration?: number;
  onSeek?: (seconds: number) => void;
}

const formatTime = (seconds: number) => {
  if (isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const ControlsBar = ({ duration = 0, onSeek }: ControlsBarProps) => {
  const { videoState, socket, role } = useRoom();
  const [urlInput, setUrlInput] = useState('');

  const isPrivileged = role === 'host' || role === 'moderator';

  const handlePlayPause = () => {
    if (!videoState.videoId || !isPrivileged || !socket) return;
    socket.emit('toggle_playback', { currentTime: videoState.currentTime });
  };

  const handleLoadUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || !isPrivileged) return;
    
    const parsedId = extractVideoId(urlInput.trim());
    if (!parsedId) {
      toast.error('Invalid YouTube URL');
      return;
    }

    if (socket) {
      socket.emit('change_video', { videoId: parsedId });
    }
    setUrlInput('');
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isPrivileged) return;
    const val = parseFloat(e.target.value);
    if (onSeek) onSeek(val);
    
    if (socket) {
      socket.emit('seek', { time: val });
    }
  };

  return (
    <div className="controls-bar">
      <button 
        className="btn-icon" 
        onClick={handlePlayPause}
        disabled={!isPrivileged}
        style={{ opacity: isPrivileged ? 1 : 0.5, cursor: isPrivileged ? 'pointer' : 'not-allowed' }}
      >
        {videoState.isPlaying ? <Pause size={24} /> : <Play size={24} fill="currentColor" />}
      </button>
      
      <div style={{ flex: 1, padding: '0 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>
          {formatTime(videoState.currentTime)}
        </span>
        <input 
          type="range" 
          min="0" 
          max={duration || 100} 
          value={videoState.currentTime} 
          onChange={handleSeek}
          disabled={!isPrivileged}
          style={{ flex: 1, cursor: isPrivileged ? 'pointer' : 'not-allowed', opacity: isPrivileged ? 1 : 0.7 }} 
        />
        <span style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: '#888' }}>
          {formatTime(duration)}
        </span>
      </div>

      <form onSubmit={handleLoadUrl} className="url-input-group">
        <input
          type="text"
          className="form-input"
          placeholder="Paste YouTube URL..."
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          disabled={!isPrivileged}
          style={{ width: '250px', padding: '8px 12px', cursor: isPrivileged ? 'text' : 'not-allowed' }}
        />
        <button 
          type="submit" 
          className="btn-secondary"
          disabled={!isPrivileged}
          style={{ opacity: isPrivileged ? 1 : 0.5, cursor: isPrivileged ? 'pointer' : 'not-allowed' }}
        >
          <Search size={16} />
          Load
        </button>
      </form>
    </div>
  );
};

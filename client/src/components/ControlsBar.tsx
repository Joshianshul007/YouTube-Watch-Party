import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Search } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { extractVideoId } from '../utils/youtube';
import toast from 'react-hot-toast';

interface ControlsBarProps {
  duration?: number;
  onSeek?: (seconds: number) => void;
  currentTime?: number;
  getCurrentTime?: () => number;
}

const formatTime = (seconds: number) => {
  if (isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Trailing-debounce fallback if pointerup/touchend/keyup never fire
// (e.g. dragging the pointer out of the viewport on some browsers).
const SEEK_COMMIT_FALLBACK_MS = 200;

export const ControlsBar = ({ duration = 0, onSeek, currentTime = 0, getCurrentTime }: ControlsBarProps) => {
  const { videoState, socket, role } = useRoom();
  const [urlInput, setUrlInput] = useState('');

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState<number>(currentTime);

  const pendingSeekRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPrivileged = role === 'host' || role === 'moderator';
  const displayTime = isScrubbing ? scrubValue : currentTime;
  const readNow = () => (getCurrentTime ? getCurrentTime() : currentTime);

  const handlePlayPause = () => {
    if (!videoState.videoId || !isPrivileged || !socket) return;
    socket.emit('toggle_playback', { currentTime: readNow() });
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

  const clearFallbackTimer = () => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  };

  // Commit the current pending scrub value: local preview + exactly ONE socket emit.
  const commitSeek = () => {
    clearFallbackTimer();

    const val = pendingSeekRef.current;
    pendingSeekRef.current = null;
    setIsScrubbing(false);

    if (val == null || !isPrivileged) return;

    const safeVal = Math.max(0, Number.isFinite(val) ? val : 0);

    if (onSeek) onSeek(safeVal);
    if (socket) socket.emit('seek', { time: safeVal });
  };

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isPrivileged) return;
    const val = parseFloat(e.target.value);
    if (!Number.isFinite(val)) return;

    setIsScrubbing(true);
    setScrubValue(val);
    pendingSeekRef.current = val;

    // Local-only optimistic preview so the frame doesn't freeze during drag.
    if (onSeek) onSeek(val);

    // Trailing-debounce safety net: if no release event ever fires
    // (edge case on some touch/pen devices), still emit exactly once.
    clearFallbackTimer();
    fallbackTimerRef.current = setTimeout(commitSeek, SEEK_COMMIT_FALLBACK_MS);
  };

  const handleScrubCommit = () => {
    if (pendingSeekRef.current == null) return;
    commitSeek();
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const keysThatSeek = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];
    if (!keysThatSeek.includes(e.key)) return;
    handleScrubCommit();
  };

  useEffect(() => clearFallbackTimer, []);

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
          {formatTime(displayTime)}
        </span>
        <input
          type="range"
          min="0"
          max={duration || 100}
          step="0.1"
          value={displayTime}
          onChange={handleScrubChange}
          onMouseUp={handleScrubCommit}
          onTouchEnd={handleScrubCommit}
          onPointerUp={handleScrubCommit}
          onKeyUp={handleKeyUp}
          onBlur={handleScrubCommit}
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

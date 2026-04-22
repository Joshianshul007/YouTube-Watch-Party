import { MonitorPlay, Loader2 } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { ControlsBar } from './ControlsBar';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer';

export const VideoPlayer = () => {
  const { videoState } = useRoom();
  const { isReady, duration, seekTo } = useYouTubePlayer('yt-player-container');

  return (
    <div className="video-section">
      {videoState.videoId ? (
        <div style={{ flex: 1, position: 'relative', background: '#000' }}>
          {!isReady && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff' }}>
              <Loader2 className="animate-spin" size={48} />
            </div>
          )}
          <div 
            id="yt-player-container" 
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, pointerEvents: 'none' }} 
          />
        </div>
      ) : (
        <div className="video-placeholder">
          <MonitorPlay size={64} color="#333" />
          <p>No video loaded</p>
          <p style={{ fontSize: '0.875rem', color: '#555' }}>
            Paste a YouTube URL below to start the party!
          </p>
        </div>
      )}
      
      <ControlsBar duration={duration} onSeek={seekTo} />
    </div>
  );
};

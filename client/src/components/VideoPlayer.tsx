import { MonitorPlay, Loader2, Volume2 } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { ControlsBar } from './ControlsBar';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer';

export const VideoPlayer = () => {
  const { videoState } = useRoom();
  const {
    isReady,
    duration,
    localTime,
    seekTo,
    getCurrentTime,
    isMuted,
    autoplayBlocked,
    unmuteAndPlay,
  } = useYouTubePlayer('yt-player-container');

  const showUnmuteOverlay = videoState.videoId && isReady && (isMuted || autoplayBlocked);

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
          {showUnmuteOverlay && (
            <button
              onClick={unmuteAndPlay}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(0,0,0,0.35)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                color: '#fff',
                zIndex: 10,
              }}
            >
              <div
                style={{
                  background: '#ff0000',
                  padding: '16px 24px',
                  borderRadius: '999px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontWeight: 600,
                  fontSize: '1rem',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                }}
              >
                <Volume2 size={20} />
                {autoplayBlocked ? 'Tap to start sync' : 'Tap to unmute'}
              </div>
              <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                Browser blocked autoplay sound
              </span>
            </button>
          )}
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

      <ControlsBar
        duration={duration}
        onSeek={seekTo}
        currentTime={localTime}
        getCurrentTime={getCurrentTime}
      />
    </div>
  );
};

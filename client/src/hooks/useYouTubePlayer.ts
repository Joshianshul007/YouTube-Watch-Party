import { useEffect, useState, useRef, useCallback } from 'react';
import { useRoom } from '../context/RoomContext';

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

export const useYouTubePlayer = (containerId: string) => {
  const { videoState, setVideoState } = useRoom();
  const playerRef = useRef<YT.Player | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [duration, setDuration] = useState(0);

  // Load YouTube IFrame API dynamically
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        setIsReady(true);
      };
    } else {
      setIsReady(true);
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []);

  // Initialize player when we have a video and API is ready
  useEffect(() => {
    if (!isReady || !videoState.videoId) return;

    if (!playerRef.current) {
      playerRef.current = new window.YT.Player(containerId, {
        videoId: videoState.videoId,
        playerVars: {
          autoplay: videoState.isPlaying ? 1 : 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (event: YT.OnReadyEvent) => {
            setDuration(event.target.getDuration());
            if (videoState.isPlaying) {
              event.target.playVideo();
            }
          },
          onStateChange: (event: YT.OnStateChangeEvent) => {
            // Wait for Phase 7 to broadcast this to the server
            // For now, we manually sync the local UI
            if (event.data === window.YT.PlayerState.PLAYING) {
              setVideoState(prev => ({ ...prev, isPlaying: true }));
            }
            if (event.data === window.YT.PlayerState.PAUSED) {
              setVideoState(prev => ({ ...prev, isPlaying: false }));
            }
          }
        }
      });
    } else {
      const currentUrl = playerRef.current.getVideoUrl();
      if (currentUrl && !currentUrl.includes(videoState.videoId)) {
        playerRef.current.loadVideoById(videoState.videoId);
      }
    }
  }, [isReady, videoState.videoId]);

  // Sync play/pause from external changes (e.g. controls bar)
  useEffect(() => {
    if (!playerRef.current || !isReady || typeof playerRef.current.getPlayerState !== 'function') return;

    const state = playerRef.current.getPlayerState();
    
    if (videoState.isPlaying && state !== window.YT.PlayerState.PLAYING) {
      playerRef.current.playVideo();
    } else if (!videoState.isPlaying && state === window.YT.PlayerState.PLAYING) {
      playerRef.current.pauseVideo();
    }
  }, [videoState.isPlaying, isReady]);

  // Sync seek/timestamp jumps from server
  useEffect(() => {
    if (!playerRef.current || !isReady || typeof playerRef.current.getCurrentTime !== 'function') return;
    
    const localTime = playerRef.current.getCurrentTime();
    const driftToleranceSeconds = videoState.isPlaying ? 0.6 : 0.2;
    
    // Keep clients tightly aligned after pause/play resume transitions.
    if (Math.abs(localTime - videoState.currentTime) > driftToleranceSeconds) {
      playerRef.current.seekTo(videoState.currentTime, true);
    }
  }, [videoState.currentTime, videoState.isPlaying, isReady]);

  // Progress tracker loop
  useEffect(() => {
    if (!playerRef.current || !videoState.isPlaying) return;

    const interval = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        const time = playerRef.current.getCurrentTime();
        setVideoState(prev => ({ ...prev, currentTime: time }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [videoState.isPlaying]);

  const seekTo = useCallback((seconds: number) => {
    if (playerRef.current && isReady) {
      playerRef.current.seekTo(seconds, true);
    }
  }, [isReady]);

  return { playerRef, isReady, duration, seekTo };
};

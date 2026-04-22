import { useEffect, useState, useRef, useCallback } from 'react';
import { useRoom } from '../context/RoomContext';
import type { VideoState } from '../types';

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

const PLAY_DRIFT_TOLERANCE_SEC = 1.0;
const PAUSE_DRIFT_TOLERANCE_SEC = 0.3;

export const useYouTubePlayer = (containerId: string) => {
  const { videoState, role, socket } = useRoom();
  const playerRef = useRef<YT.Player | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [localTime, setLocalTime] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const latestSyncRef = useRef<VideoState>(videoState);
  const lastAppliedUpdateRef = useRef<number>(0);
  const lastAppliedVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    latestSyncRef.current = videoState;
  }, [videoState]);

  const computeTargetTime = (s: VideoState) => {
    if (!s.isPlaying) return s.currentTime;
    const base = typeof s.lastUpdated === 'number' ? s.lastUpdated : Date.now();
    const elapsedSec = Math.max(0, (Date.now() - base) / 1000);
    return s.currentTime + elapsedSec;
  };

  const applyAuthoritativeState = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const s = latestSyncRef.current;
    if (!s.videoId) return;

    const target = computeTargetTime(s);

    try {
      const currentUrl = typeof player.getVideoUrl === 'function' ? player.getVideoUrl() : '';
      if (currentUrl && !currentUrl.includes(s.videoId)) {
        player.loadVideoById({
          videoId: s.videoId,
          startSeconds: Math.max(0, Math.floor(target)),
        });
        lastAppliedVideoIdRef.current = s.videoId;
        lastAppliedUpdateRef.current = s.lastUpdated;
        if (!s.isPlaying) {
          setTimeout(() => {
            try { playerRef.current?.pauseVideo(); } catch { /* ignore */ }
          }, 200);
        }
        return;
      }
    } catch { /* ignore */ }

    try {
      const localT = typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : 0;
      const drift = Math.abs(localT - target);
      const tol = s.isPlaying ? PLAY_DRIFT_TOLERANCE_SEC : PAUSE_DRIFT_TOLERANCE_SEC;
      if (drift > tol) {
        player.seekTo(target, true);
      }
    } catch { /* ignore */ }

    try {
      if (s.isPlaying) player.playVideo();
      else player.pauseVideo();
    } catch { /* ignore */ }

    lastAppliedUpdateRef.current = s.lastUpdated;
    lastAppliedVideoIdRef.current = s.videoId;
  }, []);

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = () => setApiReady(true);
    } else {
      setApiReady(true);
    }

    return () => {
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
      setPlayerReady(false);
    };
  }, []);

  useEffect(() => {
    if (!apiReady) return;
    if (playerRef.current) return;

    const initial = latestSyncRef.current;
    if (!initial.videoId) return;

    const startSeconds = Math.max(0, Math.floor(computeTargetTime(initial)));

    playerRef.current = new window.YT.Player(containerId, {
      videoId: initial.videoId,
      playerVars: {
        autoplay: initial.isPlaying ? 1 : 0,
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        origin: window.location.origin,
        start: startSeconds,
        mute: 1,
        playsinline: 1,
      },
      events: {
        onReady: (event: YT.OnReadyEvent) => {
          try {
            setDuration(event.target.getDuration());
          } catch { /* ignore */ }
          try {
            event.target.mute();
            setIsMuted(true);
          } catch { /* ignore */ }
          setPlayerReady(true);
          applyAuthoritativeState();

          setTimeout(() => {
            try {
              const p = playerRef.current;
              if (!p) return;
              const s = latestSyncRef.current;
              if (s.isPlaying && typeof p.getPlayerState === 'function') {
                const state = p.getPlayerState();
                if (state !== 1 && state !== 3) {
                  setAutoplayBlocked(true);
                }
              }
            } catch { /* ignore */ }
          }, 1500);
        },
        onStateChange: () => {
          // Server is authoritative for play/pause/seek.
        },
      },
    });

    lastAppliedVideoIdRef.current = initial.videoId;
  }, [apiReady, videoState.videoId, containerId, applyAuthoritativeState]);

  useEffect(() => {
    if (!playerReady) return;
    const sameUpdate = videoState.lastUpdated === lastAppliedUpdateRef.current;
    const sameVideo = videoState.videoId === lastAppliedVideoIdRef.current;
    if (sameUpdate && sameVideo) return;
    applyAuthoritativeState();
  }, [playerReady, videoState.lastUpdated, videoState.videoId, applyAuthoritativeState]);

  useEffect(() => {
    if (!playerReady) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        if (typeof player.getCurrentTime === 'function') {
          const t = player.getCurrentTime();
          if (typeof t === 'number' && !isNaN(t)) setLocalTime(t);
        }
      } catch { /* ignore */ }
      try {
        if (typeof player.getDuration === 'function') {
          const d = player.getDuration();
          if (d && d !== duration) setDuration(d);
        }
      } catch { /* ignore */ }
    }, 500);

    return () => clearInterval(interval);
  }, [playerReady, duration]);

  useEffect(() => {
    if (!playerReady || !socket) return;
    if (role !== 'host' && role !== 'moderator') return;
    if (!videoState.isPlaying) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;
      try {
        const t = player.getCurrentTime();
        if (typeof t === 'number' && !isNaN(t)) {
          socket.emit('host_heartbeat', {
            currentTime: t,
            isPlaying: latestSyncRef.current.isPlaying,
          });
        }
      } catch { /* ignore */ }
    }, 5000);

    return () => clearInterval(interval);
  }, [playerReady, socket, role, videoState.isPlaying]);

  const seekTo = useCallback((seconds: number) => {
    if (playerRef.current && playerReady) {
      try { playerRef.current.seekTo(seconds, true); } catch { /* ignore */ }
    }
  }, [playerReady]);

  const getCurrentTime = useCallback(() => {
    const player = playerRef.current;
    if (player && typeof player.getCurrentTime === 'function') {
      try {
        const t = player.getCurrentTime();
        if (typeof t === 'number' && !isNaN(t)) return t;
      } catch { /* ignore */ }
    }
    return localTime;
  }, [localTime]);

  const unmuteAndPlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (typeof player.unMute === 'function') player.unMute();
      setIsMuted(false);
    } catch { /* ignore */ }
    try {
      const s = latestSyncRef.current;
      if (s.isPlaying) player.playVideo();
    } catch { /* ignore */ }
    setAutoplayBlocked(false);
    applyAuthoritativeState();
  }, [applyAuthoritativeState]);

  return {
    playerRef,
    isReady: playerReady,
    duration,
    localTime,
    seekTo,
    getCurrentTime,
    isMuted,
    autoplayBlocked,
    unmuteAndPlay,
  };
};

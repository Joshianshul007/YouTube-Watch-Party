declare namespace YT {
  interface PlayerOptions {
    videoId?: string | null;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (event: OnReadyEvent) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
    };
  }

  interface Player {
    destroy(): void;
    getDuration(): number;
    getCurrentTime(): number;
    getPlayerState(): number;
    getVideoUrl(): string;
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    loadVideoById(videoId: string): void;
    loadVideoById(options: { videoId: string; startSeconds?: number; endSeconds?: number; suggestedQuality?: string }): void;
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
  }

  interface OnReadyEvent {
    target: Player;
  }

  interface OnStateChangeEvent {
    target: Player;
    data: number;
  }

  const Player: {
    new (elementId: string, options: PlayerOptions): Player;
  };

  const PlayerState: {
    PLAYING: number;
    PAUSED: number;
  };
}

interface Window {
  YT: typeof YT;
  onYouTubeIframeAPIReady: () => void;
}

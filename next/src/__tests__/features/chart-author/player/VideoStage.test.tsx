import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, it, expect } from 'vitest';
import { VideoStage } from '@/features/chart-author/player/VideoStage';
import type { VideoKey } from '@/features/chart-author/types';

const VIDEO_KEY: VideoKey = {
  fileName: 'battle.mp4',
  durationMs: 65_432,
  width: 1920,
  height: 1080,
};

describe('VideoStage', () => {
  it('読み込んだ動画を閲覧用の要素として表示する', () => {
    const ref = createRef<HTMLVideoElement>();

    render(<VideoStage videoRef={ref} objectUrl="blob:mock-1" videoKey={VIDEO_KEY} />);

    const video = screen.getByTestId('chart-author-video');
    expect(video.getAttribute('src')).toBe('blob:mock-1');
    expect(ref.current).toBe(video);
  });

  it('読み込んだ動画の尺と解像度を表示する', () => {
    render(
      <VideoStage videoRef={createRef()} objectUrl="blob:mock-1" videoKey={VIDEO_KEY} />,
    );

    expect(screen.getByTestId('video-meta').textContent).toContain('battle.mp4');
    expect(screen.getByTestId('video-meta').textContent).toContain('01:05.432');
    expect(screen.getByTestId('video-meta').textContent).toContain('1920×1080');
  });

  it('動画が未読み込みなら案内だけを出す', () => {
    render(<VideoStage videoRef={createRef()} objectUrl={null} videoKey={null} />);

    expect(screen.queryByTestId('chart-author-video')).toBeNull();
    expect(screen.getByTestId('video-placeholder')).toBeDefined();
  });

  it('動画の上に重ねる要素を受け取れる', () => {
    render(
      <VideoStage videoRef={createRef()} objectUrl="blob:mock-1" videoKey={VIDEO_KEY}>
        <div data-testid="overlay" />
      </VideoStage>,
    );

    expect(screen.getByTestId('overlay')).toBeDefined();
  });
});

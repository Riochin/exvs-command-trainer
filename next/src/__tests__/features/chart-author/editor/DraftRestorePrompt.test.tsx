import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DraftRestorePrompt } from '@/features/chart-author/editor/DraftRestorePrompt';
import { CHART_AUTHOR_DRAFT_VERSION } from '@/features/chart-author/constants';
import type { ChartAuthorDraft, EditorStep, VideoKey } from '@/features/chart-author/types';

const VIDEO_KEY: VideoKey = {
  fileName: 'clip.mp4',
  durationMs: 60_000,
  width: 1920,
  height: 1080,
};

const OTHER_KEY: VideoKey = { ...VIDEO_KEY, fileName: 'other.mp4' };

const STEP: EditorStep = {
  id: 'a',
  tMs: 1_000,
  input: 'shot',
  confidence: 1,
  origin: 'manual',
  detector: null,
  caveat: 'none',
};

function draft(patch: Partial<ChartAuthorDraft> = {}): ChartAuthorDraft {
  return {
    version: CHART_AUTHOR_DRAFT_VERSION,
    videoKey: VIDEO_KEY,
    source: { type: 'file', offsetMs: 0 },
    steps: [STEP, { ...STEP, id: 'b', tMs: 2_000 }],
    savedAt: '2026-09-15T10:20:30.000Z',
    ...patch,
  };
}

let handlers: { onRestore: ReturnType<typeof vi.fn>; onDiscard: ReturnType<typeof vi.fn> };

beforeEach(() => {
  handlers = { onRestore: vi.fn(), onDiscard: vi.fn() };
});

function renderPrompt(props: Partial<React.ComponentProps<typeof DraftRestorePrompt>> = {}) {
  return render(
    <DraftRestorePrompt
      draft={draft()}
      currentVideoKey={VIDEO_KEY}
      {...handlers}
      {...props}
    />,
  );
}

describe('DraftRestorePrompt - 出す条件', () => {
  it('下書きがなければ何も出さない', () => {
    renderPrompt({ draft: null });

    expect(screen.queryByTestId('draft-restore')).toBeNull();
  });

  it('ステップを持たない下書きでは何も出さない', () => {
    renderPrompt({ draft: draft({ steps: [] }) });

    expect(screen.queryByTestId('draft-restore')).toBeNull();
  });

  it('下書きがあれば件数と保存時刻を添えて確認する', () => {
    renderPrompt();

    const shown = screen.getByTestId('draft-restore').textContent ?? '';
    expect(shown).toContain('2');
    expect(shown).toContain('2026-09-15');
  });
});

describe('DraftRestorePrompt - どの動画の作業か', () => {
  it('同じ動画の下書きならそう伝える', () => {
    renderPrompt();

    expect(screen.getByTestId('draft-restore').textContent).toContain('この動画');
  });

  it('別の動画の下書きなら注意とファイル名を添える', () => {
    renderPrompt({ currentVideoKey: OTHER_KEY });

    const shown = screen.getByTestId('draft-restore').textContent ?? '';
    expect(shown).toContain('別の動画');
    expect(shown).toContain('clip.mp4');
  });

  it('動画を読み込む前でも、どのファイルの作業かを示す', () => {
    renderPrompt({ currentVideoKey: null });

    expect(screen.getByTestId('draft-restore').textContent).toContain('clip.mp4');
  });

  it('尺が違えば同じファイル名でも別の動画として扱う', () => {
    renderPrompt({ currentVideoKey: { ...VIDEO_KEY, durationMs: 30_000 } });

    expect(screen.getByTestId('draft-restore').textContent).toContain('別の動画');
  });
});

describe('DraftRestorePrompt - 操作', () => {
  it('復元を選べる', () => {
    renderPrompt();

    fireEvent.click(screen.getByRole('button', { name: '作業中の譜面を復元する' }));

    expect(handlers.onRestore).toHaveBeenCalledTimes(1);
  });

  it('破棄を選べる', () => {
    renderPrompt();

    fireEvent.click(screen.getByRole('button', { name: '作業中の譜面を使わない' }));

    expect(handlers.onDiscard).toHaveBeenCalledTimes(1);
  });
});

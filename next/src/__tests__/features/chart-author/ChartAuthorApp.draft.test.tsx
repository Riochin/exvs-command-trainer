import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CHART_AUTHOR_DRAFT_VERSION,
  DRAFT_AUTOSAVE_DELAY_MS,
  DRAFT_STORAGE_KEY,
} from '@/features/chart-author/constants';
import type { ChartAuthorDraft, EditorStep } from '@/features/chart-author/types';
import { loadVideo, renderApp, stepRows, videoFile, VIDEO_KEY } from './appHarness';

const STEP: EditorStep = {
  id: 'a',
  tMs: 3_000,
  input: 'melee',
  confidence: 1,
  origin: 'manual',
  detector: null,
  caveat: 'none',
};

function seedDraft(patch: Partial<ChartAuthorDraft> = {}): void {
  const draft: ChartAuthorDraft = {
    version: CHART_AUTHOR_DRAFT_VERSION,
    videoKey: VIDEO_KEY,
    source: { type: 'file', fileName: VIDEO_KEY.fileName, offsetMs: 0 },
    steps: [STEP],
    savedAt: '2026-09-15T10:20:30.000Z',
    ...patch,
  };
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function controllerButton(label: '射撃' | '格闘' | 'ジャンプ'): HTMLElement {
  const controller = within(screen.getByTestId('chart-author-controller'));
  const button = controller.getByText(label).closest('button');
  if (button === null) throw new Error(`${label} ボタンが見つかりません`);
  return button;
}

async function tapShot(): Promise<void> {
  const shot = controllerButton('射撃');
  fireEvent.pointerDown(shot, { pointerId: 1 });
  fireEvent.pointerUp(shot, { pointerId: 1 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
}

/** 自動保存の debounce を実時間で越えさせる */
async function waitForAutoSave(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, DRAFT_AUTOSAVE_DELAY_MS + 120));
  });
}

function storedDraft(): ChartAuthorDraft | null {
  const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as ChartAuthorDraft);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChartAuthorApp - 下書きの自動保存', () => {
  it('編集すると作業中譜面がブラウザに残る', async () => {
    renderApp();
    await loadVideo();

    await tapShot();
    await waitForAutoSave();

    const saved = storedDraft();
    expect(saved?.steps).toHaveLength(1);
    expect(saved?.steps[0].input).toBe('shot');
  });

  it('保存内容にどの動画の作業かの手がかりを含める', async () => {
    renderApp();
    await loadVideo();

    await tapShot();
    await waitForAutoSave();

    expect(storedDraft()?.videoKey).toEqual(VIDEO_KEY);
  });
});

describe('ChartAuthorApp - 下書きの復元', () => {
  it('下書きがなければ復元の確認は出さない', () => {
    renderApp();

    expect(screen.queryByTestId('draft-restore')).toBeNull();
  });

  it('再読み込みしても作業中譜面は残り、復元を確認される', () => {
    seedDraft();
    renderApp();

    expect(screen.getByTestId('draft-restore')).toBeTruthy();
  });

  it('復元すると一覧に戻る', () => {
    seedDraft();
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: '作業中の譜面を復元する' }));

    expect(stepRows()).toHaveLength(1);
    expect(stepRows()[0].textContent).toContain('00:03.000');
    expect(screen.queryByTestId('draft-restore')).toBeNull();
  });

  it('使わないと決めれば一覧は空のままで、確認も消える', () => {
    seedDraft();
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: '作業中の譜面を使わない' }));

    expect(stepRows()).toHaveLength(0);
    expect(screen.queryByTestId('draft-restore')).toBeNull();
  });

  it('別の動画を読み込んだときは、別の動画の下書きであることを伝える', async () => {
    seedDraft();
    renderApp();

    await loadVideo('loaded', videoFile('other.mp4'));

    const shown = screen.getByTestId('draft-restore').textContent ?? '';
    expect(shown).toContain('別の動画');
    expect(shown).toContain(VIDEO_KEY.fileName);
  });

  it('同じ動画を読み込んだときは、その動画の作業だと伝える', async () => {
    seedDraft();
    renderApp();

    await loadVideo();

    expect(screen.getByTestId('draft-restore').textContent).toContain('この動画');
  });
});

describe('ChartAuthorApp - 保存の失敗', () => {
  it('容量超過でもその旨を示して編集を続けられる', async () => {
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === DRAFT_STORAGE_KEY) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      original.call(this, key, value);
    });

    renderApp();
    await loadVideo();
    await tapShot();
    await waitForAutoSave();

    const notice = screen.getByTestId('draft-storage-error').textContent ?? '';
    expect(notice).toContain('エクスポート');
    // 保存に失敗しても編集そのものは続いている
    expect(stepRows()).toHaveLength(1);
    await tapShot();
    expect(stepRows()).toHaveLength(2);
  });
});

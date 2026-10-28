import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalysisPanel } from '@/features/chart-author/analysis-run/AnalysisPanel';
import {
  DEFAULT_ANALYSIS_PARAMS,
  MAX_SCAN_DURATION_MS,
} from '@/features/chart-author/constants';

let handlers: {
  onCancel: ReturnType<typeof vi.fn>;
  onChangeParams: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  handlers = { onCancel: vi.fn(), onChangeParams: vi.fn() };
});

function renderPanel(props: Partial<React.ComponentProps<typeof AnalysisPanel>> = {}) {
  return render(
    <AnalysisPanel
      phase="idle"
      progress={{ ratio: 0, elapsedMs: 0, processedFrames: 0 }}
      summary={null}
      params={DEFAULT_ANALYSIS_PARAMS}
      failure={null}
      warning={null}
      {...handlers}
      {...props}
    />,
  );
}

describe('AnalysisPanel - 進捗', () => {
  it('走査中は処理済みの割合と経過時間を表示する', () => {
    renderPanel({
      phase: 'scanning',
      progress: { ratio: 0.42, elapsedMs: 2500, processedFrames: 126 },
    });

    expect(screen.getByTestId('analysis-ratio').textContent).toBe('42%');
    expect(screen.getByTestId('analysis-elapsed').textContent).toBe('2.5 秒');
  });

  it('進捗の状態を支援技術にも伝える', () => {
    renderPanel({
      phase: 'scanning',
      progress: { ratio: 0.42, elapsedMs: 2500, processedFrames: 126 },
    });

    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
  });

  it('走査中はキャンセルを操作できる', () => {
    renderPanel({ phase: 'scanning' });

    const cancel = screen.getByRole('button', { name: '走査をキャンセル' });
    expect(cancel.hasAttribute('disabled')).toBe(false);
    fireEvent.click(cancel);

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
  });

  it('走査していないときはキャンセルできない', () => {
    renderPanel({ phase: 'done' });

    expect(
      screen.getByRole('button', { name: '走査をキャンセル' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});

describe('AnalysisPanel - 解析パラメータ', () => {
  it('ブースト急減の閾値を調整できる', () => {
    renderPanel();

    const slider = screen.getByRole('slider', { name: 'ブースト急減の閾値' });
    fireEvent.change(slider, { target: { value: '0.12' } });

    expect(handlers.onChangeParams).toHaveBeenCalledWith({
      ...DEFAULT_ANALYSIS_PARAMS,
      boostDropThreshold: 0.12,
    });
  });

  it('閾値の既定値を明示する', () => {
    renderPanel();

    expect(screen.getByTestId('boost-threshold-default').textContent).toContain(
      String(DEFAULT_ANALYSIS_PARAMS.boostDropThreshold),
    );
  });

  it('いまの閾値を表示する', () => {
    renderPanel({ params: { ...DEFAULT_ANALYSIS_PARAMS, boostDropThreshold: 0.2 } });

    expect(screen.getByTestId('boost-threshold-value').textContent).toContain('0.2');
  });
});

describe('AnalysisPanel - 検出結果の集計', () => {
  it('完了時に総数と入力種別ごとの件数を表示する', () => {
    renderPanel({
      phase: 'done',
      summary: { total: 5, countsByInput: { shot: 3, bd: 2 } },
    });

    expect(screen.getByTestId('detection-total').textContent).toContain('5');
    const counts = screen.getByTestId('detection-counts');
    expect(counts.textContent).toContain('射撃');
    expect(counts.textContent).toContain('3');
    expect(counts.textContent).toContain('BD');
    expect(counts.textContent).toContain('2');
  });

  it('走査中は件数を表示しない', () => {
    renderPanel({ phase: 'scanning', summary: null });

    expect(screen.queryByTestId('detection-counts')).toBeNull();
  });
});

describe('AnalysisPanel - 知らせ', () => {
  it('走査できなかった理由を表示する', () => {
    renderPanel({
      phase: 'failed',
      failure: { kind: 'frame_source_unavailable', reason: 'decode_failed' },
    });

    expect(screen.getByTestId('analysis-failure').textContent).toContain('読み込め');
  });

  it('校正の不備で失敗した場合は不足項目の件数を伝える', () => {
    renderPanel({
      phase: 'failed',
      failure: { kind: 'calibration_invalid', defects: [{ kind: 'no_boost_gauge' }] },
    });

    expect(screen.getByTestId('analysis-failure').textContent).toContain('校正');
  });

  it('長尺の動画では時間がかかる旨を知らせる', () => {
    renderPanel({
      warning: {
        kind: 'duration_exceeds_max',
        durationMs: MAX_SCAN_DURATION_MS + 60_000,
        maxMs: MAX_SCAN_DURATION_MS,
      },
    });

    expect(screen.getByTestId('analysis-warning')).toBeDefined();
  });

  it('知らせるものが無ければ何も出さない', () => {
    renderPanel();

    expect(screen.queryByTestId('analysis-warning')).toBeNull();
    expect(screen.queryByTestId('analysis-failure')).toBeNull();
  });
});

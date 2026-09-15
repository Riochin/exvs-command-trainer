import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportPanel } from '@/features/chart-author/io/ExportPanel';
import type { ChartSource } from '@/types/chart';

let handlers: {
  onChangeSource: ReturnType<typeof vi.fn>;
  onDownloadJson: ReturnType<typeof vi.fn>;
  onDownloadCsv: ReturnType<typeof vi.fn>;
  onImportFile: ReturnType<typeof vi.fn>;
};

const FILE_SOURCE: ChartSource = { type: 'file', fileName: 'clip.mp4', offsetMs: 0 };

beforeEach(() => {
  handlers = {
    onChangeSource: vi.fn(),
    onDownloadJson: vi.fn(),
    onDownloadCsv: vi.fn(),
    onImportFile: vi.fn(),
  };
});

function renderPanel(props: Partial<React.ComponentProps<typeof ExportPanel>> = {}) {
  return render(
    <ExportPanel
      source={FILE_SOURCE}
      stepCount={3}
      importErrors={null}
      {...handlers}
      {...props}
    />,
  );
}

describe('ExportPanel - 出典の設定', () => {
  it('出典の種別を切り替えられる', () => {
    renderPanel();

    fireEvent.change(screen.getByRole('combobox', { name: '出典の種別' }), {
      target: { value: 'youtube' },
    });

    expect(handlers.onChangeSource).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'youtube' }),
    );
  });

  it('ファイル出典では動画 ID を求めない', () => {
    renderPanel();

    expect(screen.queryByRole('textbox', { name: '動画 ID' })).toBeNull();
  });

  it('YouTube 出典では動画 ID を設定できる', () => {
    renderPanel({ source: { type: 'youtube', videoId: '', offsetMs: 0 } });

    fireEvent.change(screen.getByRole('textbox', { name: '動画 ID' }), {
      target: { value: 'abc123' },
    });

    expect(handlers.onChangeSource).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: 'abc123' }),
    );
  });

  it('出力の時刻補正を設定できる', () => {
    renderPanel();

    fireEvent.change(screen.getByRole('spinbutton', { name: '出力オフセット（ミリ秒）' }), {
      target: { value: '-80' },
    });

    expect(handlers.onChangeSource).toHaveBeenCalledWith(
      expect.objectContaining({ offsetMs: -80 }),
    );
  });

  it('編集用のオフセットとの違いを明示する', () => {
    renderPanel();

    const note = screen.getByTestId('export-offset-note').textContent ?? '';
    expect(note).toContain('出力');
    expect(note).toContain('編集');
  });
});

describe('ExportPanel - ダウンロード', () => {
  it('JSON をダウンロードできる', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'JSON をダウンロード' }));

    expect(handlers.onDownloadJson).toHaveBeenCalledTimes(1);
  });

  it('CSV も選べる', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'CSV をダウンロード' }));

    expect(handlers.onDownloadCsv).toHaveBeenCalledTimes(1);
  });

  it('ステップが 1 件もなければ出力できない', () => {
    renderPanel({ stepCount: 0 });

    expect(
      (screen.getByRole('button', { name: 'JSON をダウンロード' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'CSV をダウンロード' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('ExportPanel - 読み込み', () => {
  it('譜面ファイルを渡せる', () => {
    renderPanel();
    const file = new File(['{}'], 'chart.json', { type: 'application/json' });

    fireEvent.change(screen.getByLabelText('譜面ファイル'), { target: { files: [file] } });

    expect(handlers.onImportFile).toHaveBeenCalledWith(file);
  });

  it('拒否された理由を場所とともにすべて並べる', () => {
    renderPanel({
      importErrors: [
        { kind: 'unsupported_version', found: 99 },
        { kind: 'invalid_button_type', path: 'steps[2].input', value: 'dash' },
      ],
    });

    const shown = screen.getByTestId('import-errors').textContent ?? '';
    expect(shown).toContain('99');
    expect(shown).toContain('steps[2].input');
    expect(shown).toContain('dash');
  });

  it('拒否がなければ理由の欄自体を出さない', () => {
    renderPanel();

    expect(screen.queryByTestId('import-errors')).toBeNull();
  });
});

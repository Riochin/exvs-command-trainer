'use client';

/**
 * 出力前の出典設定と、譜面ファイルの出し入れ。
 *
 * ここで設定する時刻補正は「出力に記録する補正」であり、編集画面の
 * 全体オフセット（譜面そのものを動かす操作）とは別物。取り違えると
 * 補正が二重に掛かるため、両方の画面で役割を言葉にして示す。
 *
 * 読み込みの可否はここでは判定しない。検証は codec が持ち、この画面は
 * 返ってきた理由を余さず並べるだけにする（Req 8.7）。
 */
import { isChartSourceType, type ChartParseError, type ChartSource } from '@/types/chart';
import styles from './ExportPanel.module.css';

export type ExportPanelProps = {
  readonly source: ChartSource;
  /** 出力できるステップ数。0 件の譜面はファイルにしない */
  readonly stepCount: number;
  /** 直前の読み込みが拒否された理由。成功や未実施なら null */
  readonly importErrors: readonly ChartParseError[] | null;
  onChangeSource(next: ChartSource): void;
  onDownloadJson(): void;
  onDownloadCsv(): void;
  onImportFile(file: File): void;
};

export function describeParseError(error: ChartParseError): string {
  switch (error.kind) {
    case 'unsupported_version':
      return `対応していない譜面バージョンです（${String(error.found)}）`;
    case 'invalid_shape':
      return `${error.path}: ${error.message}`;
    case 'invalid_button_type':
      return `${error.path}: 入力種別 ${String(error.value)} は使えません`;
    case 'out_of_range':
      return `${error.path}: 値 ${String(error.value)} が範囲外です`;
  }
}

export function ExportPanel({
  source,
  stepCount,
  importErrors,
  onChangeSource,
  onDownloadJson,
  onDownloadCsv,
  onImportFile,
}: ExportPanelProps) {
  const empty = stepCount === 0;

  return (
    <section className={styles.panel} data-testid="export-panel">
      <h2 className={styles.heading}>出力と読み込み</h2>

      <label className={styles.control}>
        <span className={styles.term}>出典の種別</span>
        <select
          className={styles.select}
          aria-label="出典の種別"
          value={source.type}
          onChange={(event) => {
            if (isChartSourceType(event.target.value)) {
              onChangeSource({ ...source, type: event.target.value });
            }
          }}
        >
          <option value="file">ファイル</option>
          <option value="youtube">YouTube</option>
        </select>
      </label>

      {source.type === 'youtube' && (
        <label className={styles.control}>
          <span className={styles.term}>動画 ID</span>
          <input
            type="text"
            className={styles.text}
            aria-label="動画 ID"
            value={source.videoId ?? ''}
            onChange={(event) => onChangeSource({ ...source, videoId: event.target.value })}
          />
        </label>
      )}

      <div className={styles.offset}>
        <label className={styles.control}>
          <span className={styles.term}>出力オフセット</span>
          <input
            type="number"
            className={styles.number}
            aria-label="出力オフセット（ミリ秒）"
            step={1}
            value={source.offsetMs}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) onChangeSource({ ...source, offsetMs: next });
            }}
          />
          <span className={styles.unit}>ms</span>
        </label>
        <p className={styles.note} data-testid="export-offset-note">
          出力する譜面に記録する補正です。編集オフセット（譜面そのものを動かす操作）とは別に扱われます
        </p>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          onClick={onDownloadJson}
          disabled={empty}
        >
          JSON をダウンロード
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={onDownloadCsv}
          disabled={empty}
        >
          CSV をダウンロード
        </button>
      </div>

      <label className={styles.control}>
        <span className={styles.term}>譜面ファイル</span>
        <input
          type="file"
          accept="application/json,.json"
          aria-label="譜面ファイル"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) onImportFile(file);
          }}
        />
      </label>

      {importErrors !== null && importErrors.length > 0 && (
        <ul className={styles.errors} data-testid="import-errors">
          {importErrors.map((error, index) => (
            <li key={`${error.kind}-${index}`}>{describeParseError(error)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

'use client';

/**
 * 前回の作業中譜面を復元するかの確認。
 *
 * 下書きは編集のたびに自動で書かれる（Req 8.8）が、読み戻しは黙って行わない。
 * 別の動画の下書きをそのまま適用すると、時刻の合わない譜面ができあがり、
 * しかもそれが正しい下書きを上書きしてしまう。どの動画の作業かを示したうえで、
 * 適用するかどうかは必ずユーザーに選ばせる。
 */
import type { ChartAuthorDraft, VideoKey } from '../types';
import styles from './DraftRestorePrompt.module.css';

export type DraftRestorePromptProps = {
  readonly draft: ChartAuthorDraft | null;
  readonly currentVideoKey: VideoKey | null;
  onRestore(): void;
  onDiscard(): void;
};

/** ファイル名だけでは同じ動画と言えない。尺と解像度まで一致して初めて同一とみなす */
function sameVideo(a: VideoKey, b: VideoKey): boolean {
  return (
    a.fileName === b.fileName &&
    a.durationMs === b.durationMs &&
    a.width === b.width &&
    a.height === b.height
  );
}

/** ISO 文字列を秒までの読みやすい形に。地域設定に依存させない */
function formatSavedAt(savedAt: string): string {
  return savedAt.slice(0, 19).replace('T', ' ');
}

function describeOrigin(
  draftKey: VideoKey | null,
  currentVideoKey: VideoKey | null,
): string {
  const name = draftKey?.fileName ?? '不明なファイル';
  if (draftKey !== null && currentVideoKey !== null && sameVideo(draftKey, currentVideoKey)) {
    return 'この動画の作業中譜面です';
  }
  if (currentVideoKey === null) return `${name} の作業中譜面です`;
  return `別の動画（${name}）の作業中譜面です。時刻が合わない可能性があります`;
}

export function DraftRestorePrompt({
  draft,
  currentVideoKey,
  onRestore,
  onDiscard,
}: DraftRestorePromptProps) {
  if (draft === null || draft.steps.length === 0) return null;

  return (
    <section className={styles.prompt} data-testid="draft-restore">
      <p className={styles.message}>
        {describeOrigin(draft.videoKey, currentVideoKey)}
      </p>
      <p className={styles.detail}>
        {draft.steps.length} 件 / {formatSavedAt(draft.savedAt)} 保存
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onRestore}>
          作業中の譜面を復元する
        </button>
        <button type="button" className={styles.secondary} onClick={onDiscard}>
          作業中の譜面を使わない
        </button>
      </div>
    </section>
  );
}

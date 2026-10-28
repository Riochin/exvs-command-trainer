/**
 * ツール全体がいまどの段階にいるかの判定。
 *
 * 段階そのものを別の状態として持たせると、動画・校正・解析・編集の 4 つと
 * 食い違ったまま画面だけが進んでしまう。ここでは「4 つの事実から段階を導く」
 * 純関数に留め、段階を書き換える手段を与えない。
 *
 * 解析を始めてよいかの判定（Req 2.1）と、再解析の確認が要るかの判定
 * （Req 5.4）も同じ場所に置く。画面ごとに条件を書くと、片方だけ緩んだときに
 * 校正前の解析や、手動ステップの黙殺が起きる。
 */
import type { AnalysisPhase } from './analysis-run/useAnalysisRun';
import type { WorkflowPhase } from './types';

export type WorkflowInputs = {
  readonly hasVideo: boolean;
  /** 校正画面を開いているか。解析後にやり直す場合も真になる */
  readonly calibrating: boolean;
  /** 校正が検証を通過しているか */
  readonly calibrationReady: boolean;
  readonly analysisPhase: AnalysisPhase;
  /** 編集中の譜面が持つステップ数 */
  readonly stepCount: number;
};

export function resolveWorkflowPhase(inputs: WorkflowInputs): WorkflowPhase {
  if (!inputs.hasVideo) return 'idle';
  // 走査とグリフ解決は進行中の処理なので、他の事情より先に見る
  if (inputs.analysisPhase === 'scanning') return 'scanning';
  if (inputs.analysisPhase === 'resolving') return 'resolving';
  // 校正のやり直しは編集中でも割り込める（Req 2.7）
  if (inputs.calibrating) return 'calibrating';
  if (inputs.analysisPhase === 'done' || inputs.stepCount > 0) return 'editing';
  return inputs.calibrationReady ? 'ready' : 'loaded';
}

/** 解析を始めてよいか。校正を通さずに走査へ入らせない（Req 2.1, 2.5） */
export function canStartAnalysis(inputs: WorkflowInputs): boolean {
  if (!inputs.hasVideo || !inputs.calibrationReady) return false;
  return inputs.analysisPhase !== 'scanning' && inputs.analysisPhase !== 'resolving';
}

/**
 * 再解析の前に方針をユーザーへ問う必要があるか。
 *
 * 判定を「手動ステップがあるか」ではなく「ステップがあるか」に置く。
 * 自動ステップしかないつもりでも、由来の判定を誤れば黙って消すことになる。
 */
export function needsRerunDecision(stepCount: number): boolean {
  return stepCount > 0;
}

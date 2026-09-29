'use client';

/**
 * 譜面作成ツールの最上位コンポーネント。
 *
 * ここが持つのは配線と、段階に応じた出し分けだけ。動画・校正・走査・編集・
 * 入出力の状態はそれぞれのフックが所有し、この層は「いつ何を呼ぶか」を決める。
 *
 * アプリ全体が本文スクロールを禁じている（globals.css で html / body を
 * overflow: hidden にしている）ため、ページは高さいっぱいのグリッドとし、
 * 縦に伸びうる領域だけが内部でスクロールする構造をここで用意する。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArcadeController } from '@/features/arcade-controller/ArcadeController';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { ButtonType, StorageError } from '@/types';
import type { ChartParseError } from '@/types/chart';
import { AnalysisPanel } from './analysis-run/AnalysisPanel';
import { GlyphTutor } from './analysis-run/GlyphTutor';
import { RerunDecisionDialog } from './analysis-run/RerunDecisionDialog';
import { useAnalysisRun, type UseAnalysisRunDeps } from './analysis-run/useAnalysisRun';
import { CalibrationOverlay } from './calibration/CalibrationOverlay';
import { CalibrationPanel } from './calibration/CalibrationPanel';
import { sampleVideoRegion } from './calibration/sampleVideoRegion';
import { useCalibrationDraw } from './calibration/useCalibrationDraw';
import { useCalibrationStore } from './calibration/useCalibrationStore';
import { DraftRestorePrompt } from './editor/DraftRestorePrompt';
import { StepInspector } from './editor/StepInspector';
import { StepList } from './editor/StepList';
import { Timeline } from './editor/Timeline';
import { useChartEditor } from './editor/useChartEditor';
import { toEditorSteps } from './io/chartCodec';
import { ExportPanel } from './io/ExportPanel';
import { useChartIo } from './io/useChartIo';
import { TransportBar } from './player/TransportBar';
import { useVideoController, type UseVideoControllerOptions } from './player/useVideoController';
import { VideoStage } from './player/VideoStage';
import { DRAFT_STORAGE_KEY } from './constants';
import type { ChartAuthorDraft, DetectedStep, Rect, RerunStrategy } from './types';
import { canStartAnalysis, needsRerunDecision, resolveWorkflowPhase } from './workflow';
import styles from './ChartAuthorApp.module.css';

export type ChartAuthorAppProps = {
  /** 動画要素まわりの差し替え口。テストが検証用 video を渡す */
  readonly videoOptions?: UseVideoControllerOptions;
  /** 走査まわりの差し替え口。テストがフレーム供給と画素取り出しを渡す */
  readonly analysisDeps?: UseAnalysisRunDeps;
};

function describeLoadFailure(fileName: string, reason: string): string {
  const cause =
    reason === 'decode_failed'
      ? 'この形式をブラウザが再生できません'
      : '読み込みに時間がかかりすぎました';
  return `${fileName} を読み込めませんでした（${cause}）。別の形式へ変換してからお試しください`;
}

export function ChartAuthorApp({ videoOptions, analysisDeps }: ChartAuthorAppProps = {}) {
  const video = useVideoController(videoOptions);
  const calibrationStore = useCalibrationStore(video.videoKey);
  const analysis = useAnalysisRun(analysisDeps);
  const io = useChartIo();
  const editor = useChartEditor({ videoKey: video.videoKey, source: io.source });

  /** 校正画面を開いているか。読み込み直後と、やり直しのときに真になる */
  const [calibrating, setCalibrating] = useState(false);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [rerunAsked, setRerunAsked] = useState(false);
  /** 直前の読み込みが拒否された理由。取り込みに成功したら消す */
  const [importErrors, setImportErrors] = useState<readonly ChartParseError[] | null>(null);
  const [calibrationSaveError, setCalibrationSaveError] = useState<StorageError | null>(null);
  /** 下書きの確認を済ませたか。復元でも破棄でも、一度答えたら二度と尋ねない */
  const [draftAnswered, setDraftAnswered] = useState(false);

  /**
   * 起動時点の下書き。
   *
   * 自動保存は `useChartEditor` が別の口から書くので、ここで読む値は
   * 画面を開いた時点のまま動かない。復元の確認に使うのはこの断面でよく、
   * 編集のたびに確認が出し直されることもない。
   */
  const { value: storedDraft } = useLocalStorage<ChartAuthorDraft | null>(
    DRAFT_STORAGE_KEY,
    null,
  );

  const videoRef = video.videoRef;
  const sampleIndicator = useCallback(
    (rect: Rect) => sampleVideoRegion(videoRef, rect),
    [videoRef],
  );
  const draw = useCalibrationDraw(calibrationStore, sampleIndicator);

  const inputs = {
    hasVideo: video.videoKey !== null,
    calibrating,
    calibrationReady: calibrationStore.validate().ok,
    analysisPhase: analysis.phase,
    stepCount: editor.steps.length,
  };
  const phase = resolveWorkflowPhase(inputs);
  const startable = canStartAnalysis(inputs);

  /**
   * 次の検出結果をどう取り込むか。
   * 既定は自動分の差し替え。全破棄はユーザーが選んだ 1 回きりに限る（Req 5.4）。
   */
  const strategyRef = useRef<RerunStrategy>('replace_auto_only');
  /** 取り込み済みの検出結果。同じ結果を二度取り込まないための目印 */
  const adoptedRef = useRef<readonly DetectedStep[] | null>(null);
  const { adoptDetections } = editor;

  useEffect(() => {
    if (analysis.phase !== 'done') return;
    if (adoptedRef.current === analysis.steps) return;
    adoptedRef.current = analysis.steps;
    adoptDetections(analysis.steps, strategyRef.current);
    strategyRef.current = 'replace_auto_only';
  }, [adoptDetections, analysis.phase, analysis.steps]);

  const { calibration, persist: persistCalibration, saveGlyphBank } = calibrationStore;

  const saveCalibration = (): void => {
    const saved = persistCalibration();
    // 保存できなくても作業は続けられる。次回の再利用が効かないだけ
    setCalibrationSaveError(saved.ok ? null : saved.error);
  };

  /**
   * 解決した数字を校正へ焼き込んで保存する。
   *
   * 走査は校正の `glyphBank` を出発点にするので（Req 2.6）、ここで残しておけば
   * 同じ配信者の別クリップでは同じ数字を尋ねられない。
   *
   * 束が校正へ載ったあとは条件に掛からなくなるので、ラベルを付け終えた 1 度だけ走る。
   * この保存が失敗しても画面には出さない。校正そのものは走査の開始時に保存して
   * あり、容量不足はそこで報告済みで、ここで重ねて言う意味がない。
   */
  useEffect(() => {
    if (analysis.phase !== 'done' || calibration === null) return;
    const bank = analysis.glyphBank;
    if (calibration.glyphBank === bank) return;
    if (!bank.templates.some((template) => template.digit !== null)) return;
    saveGlyphBank(bank);
  }, [analysis.glyphBank, analysis.phase, calibration, saveGlyphBank]);

  const loadVideoFile = async (file: File): Promise<void> => {
    const result = await video.loadFile(file);
    if (!result.ok) {
      setLoadFailure(describeLoadFailure(result.fileName, result.reason));
      return;
    }
    // 新しい動画は必ず校正から。走査結果は前の動画のものなので捨てる
    setLoadFailure(null);
    analysis.reset();
    adoptedRef.current = null;
    setCalibrationSaveError(null);
    setCalibrating(true);
  };

  const beginScan = (): void => {
    if (calibration === null || video.objectUrl === null) return;
    setCalibrating(false);
    adoptedRef.current = null;
    // 校正段階を抜けるここが「校正が完了したとき」。次に同じ動画を読んだら
    // 再利用を提案できるよう、走り出す前に保存する（Req 2.6）
    saveCalibration();
    void analysis.start(video.objectUrl, calibration);
  };

  /** 解析の開始要求。既存のステップがあるうちは必ず方針を尋ねる（Req 5.4） */
  const requestScan = (): void => {
    if (needsRerunDecision(editor.steps.length)) {
      setRerunAsked(true);
      return;
    }
    beginScan();
  };

  const decideRerun = (strategy: RerunStrategy): void => {
    strategyRef.current = strategy;
    setRerunAsked(false);
    beginScan();
  };

  /**
   * 校正のやり直し（Req 2.7）。
   *
   * 校正が変われば走査結果も自動検出も前提を失うので、両方を無効にする。
   * 手で足した・直したステップは校正と無関係なので残す。
   */
  const recalibrate = (): void => {
    analysis.reset();
    adoptedRef.current = null;
    editor.adoptDetections([], 'replace_auto_only');
    setCalibrating(true);
  };

  /** 一時停止中のコントローラ入力だけを手動ラベル付けとして受け取る（Req 7.2） */
  const onControllerPress = (button: ButtonType): void => {
    if (video.isPlaying) return;
    editor.addStep(video.currentTimeMs, button);
  };

  /**
   * 譜面ファイルの取り込み。
   * 検証は codec が持つので、ここは「通ったら丸ごと差し替える / 通らなければ
   * 何も変えずに理由を出す」の二択に徹する（Req 8.7）。
   */
  const importChart = async (file: File): Promise<void> => {
    const result = await io.importFromFile(file);
    if (!result.ok) {
      setImportErrors(result.errors);
      return;
    }
    setImportErrors(null);
    io.setSource(result.chart.source);
    editor.replaceAll(toEditorSteps(result.chart));
  };

  const restoreDraft = (): void => {
    if (storedDraft === null) return;
    io.setSource(storedDraft.source);
    editor.replaceAll(storedDraft.steps);
    setDraftAnswered(true);
  };

  const selectStep = (id: string): void => {
    editor.select(id);
    const target = editor.steps.find((step) => step.id === id);
    if (target !== undefined) video.seekTo(target.tMs);
  };

  const selectedStep = editor.steps.find((step) => step.id === editor.selectedId) ?? null;
  const showEditor = editor.steps.length > 0 || phase === 'editing';
  // 作業机が空のうちだけ尋ねる。何か載っていれば、それを黙って押しのけない
  const offerDraft = !draftAnswered && editor.steps.length === 0;

  return (
    <div className={styles.app} data-testid="chart-author-app" data-phase={phase}>
      <header className={styles.header}>
        <h1 className={styles.title}>譜面作成ツール</h1>
        <p className={styles.note}>開発者向け。メニューからは辿れません</p>
        <label className={styles.file}>
          <span>動画ファイル</span>
          <input
            type="file"
            accept="video/*"
            aria-label="動画ファイル"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) void loadVideoFile(file);
            }}
          />
        </label>
        {loadFailure !== null && (
          <p className={styles.failure} data-testid="video-load-failure">
            {loadFailure}
          </p>
        )}
      </header>

      <div className={styles.scrollRegion} data-testid="chart-author-scroll-region">
        <div className={styles.columns}>
          <div className={styles.stage}>
            <VideoStage
              videoRef={video.videoRef}
              objectUrl={video.objectUrl}
              videoKey={video.videoKey}
            >
              {calibrating && (
                <CalibrationOverlay
                  rects={draw.rects}
                  activeLabel={draw.activeLabel}
                  disabled={calibrationStore.calibration === null}
                  onDraw={draw.draw}
                />
              )}
            </VideoStage>

            <TransportBar
              currentTimeMs={video.currentTimeMs}
              durationMs={video.videoKey?.durationMs ?? 0}
              isPlaying={video.isPlaying}
              disabled={video.videoKey === null}
              onPlay={video.play}
              onPause={video.pause}
              onSeek={video.seekTo}
              onStepFrame={video.stepFrame}
            />

            {showEditor && (
              <Timeline
                steps={editor.visibleSteps}
                durationMs={video.videoKey?.durationMs ?? 0}
                currentTimeMs={video.currentTimeMs}
                selectedId={editor.selectedId}
                onSelect={selectStep}
              />
            )}

            {video.videoKey !== null && (
              <div className={styles.controller} data-testid="chart-author-controller">
                <ArcadeController onButtonPress={onControllerPress} />
              </div>
            )}
          </div>

          <div className={styles.side}>
            {calibrating && (
              <CalibrationPanel
                store={calibrationStore}
                draw={draw}
                onStartAnalysis={requestScan}
              />
            )}

            {video.videoKey !== null && !calibrating && (
              <>
                <AnalysisPanel
                  phase={analysis.phase}
                  progress={analysis.progress}
                  summary={analysis.summary}
                  params={analysis.params}
                  failure={analysis.failure}
                  warning={analysis.warning}
                  onCancel={analysis.cancel}
                  onChangeParams={analysis.setParams}
                />
                <div className={styles.actions}>
                  <button type="button" className={styles.button} onClick={recalibrate}>
                    校正をやり直す
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={requestScan}
                    disabled={!startable}
                  >
                    再解析する
                  </button>
                </div>
              </>
            )}

            <GlyphTutor glyphs={analysis.unresolvedGlyphs} onLabel={analysis.labelGlyph} />

            {offerDraft && (
              <DraftRestorePrompt
                draft={storedDraft}
                currentVideoKey={video.videoKey}
                onRestore={restoreDraft}
                onDiscard={() => setDraftAnswered(true)}
              />
            )}

            {calibrationSaveError !== null && (
              <p className={styles.failure} data-testid="calibration-save-error">
                校正を保存できませんでした（
                {calibrationSaveError.type === 'quota_exceeded'
                  ? 'ブラウザの保存容量が足りません'
                  : '保存に失敗しました'}
                ）。解析は続けられますが、次に同じ動画を読んでも再利用できません
              </p>
            )}

            {editor.lastStorageError !== null && (
              <p className={styles.failure} data-testid="draft-storage-error">
                作業中譜面を保存できませんでした（
                {editor.lastStorageError.type === 'quota_exceeded'
                  ? 'ブラウザの保存容量が足りません'
                  : '保存に失敗しました'}
                ）。編集は続けられますが、こまめにエクスポートしてください
              </p>
            )}

            <ExportPanel
              source={io.source}
              stepCount={editor.steps.length}
              importErrors={importErrors}
              onChangeSource={io.setSource}
              onDownloadJson={() => io.downloadJson(editor.steps)}
              onDownloadCsv={() => io.downloadCsv(editor.steps)}
              onImportFile={(file) => void importChart(file)}
            />

            {showEditor && (
              <>
                <StepList
                  steps={editor.visibleSteps}
                  selectedId={editor.selectedId}
                  currentTimeMs={video.currentTimeMs}
                  filter={editor.filter}
                  onSelect={selectStep}
                  onChangeFilter={editor.setFilter}
                />
                <StepInspector
                  step={selectedStep}
                  canUndo={editor.canUndo}
                  onRemove={editor.removeStep}
                  onNudge={editor.nudgeStep}
                  onChangeInput={editor.changeStepInput}
                  onApplyGlobalOffset={editor.applyGlobalOffset}
                  onUndo={editor.undo}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <RerunDecisionDialog
        open={rerunAsked}
        manualStepCount={editor.steps.filter((step) => step.origin === 'manual').length}
        onDecide={decideRerun}
        onCancel={() => setRerunAsked(false)}
      />
    </div>
  );
}

'use client';

/**
 * 走査（Pass A）の駆動と、進捗・キャンセルの管理。
 *
 * ここは繋ぐだけで、何も判断しない。フレームの出どころは frame-source が、
 * 画素の意味づけは analysis が、校正の可否は useCalibrationStore が持つ。
 * オーケストレーションに徹しているので、フレーム供給を差し替えれば
 * 画面描画の無い環境でも同じ経路を通せる。
 *
 * 走査は「観測」だけを行い、ステップの検出は行わない。両者を分けておくと、
 * 閾値の調整やグリフのラベル付けのたびに動画を開き直さずに済む（Req 4.5）。
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { collectDefects } from '../calibration/useCalibrationStore';
import { EMPTY_BANK } from '../analysis/glyphBank';
import {
  DEFAULT_ANALYSIS_PARAMS,
  MAX_SCAN_DURATION_MS,
  SCAN_YIELD_INTERVAL_FRAMES,
} from '../constants';
import {
  computeFillRatio,
  computeGlyphDescriptor,
  computeNormalizedLuminance,
} from '../analysis/descriptors';
import {
  assignGlyph,
  labelGlyph as applyGlyphLabel,
  unresolvedGlyphs,
} from '../analysis/glyphBank';
import { runDetectors } from '../analysis/runDetectors';
import { createFrameSource, type CreateFrameSourceResult } from '../frame-source/createFrameSource';
import { createRegionSampler } from '../frame-source/regionSampler';
import type { RegionSamplerService, SampledRegions } from '../frame-source/types';
import type {
  AnalysisParams,
  CalibrationDefect,
  DetectedStep,
  DetectionSummary,
  FrameSample,
  GlyphBank,
  GlyphKey,
  GlyphTemplate,
  HudCalibration,
  SampleTimeline,
  SlotSample,
} from '../types';

export type AnalysisPhase = 'idle' | 'scanning' | 'resolving' | 'done' | 'failed';

export type AnalysisProgress = {
  /** 0..1 */
  readonly ratio: number;
  readonly elapsedMs: number;
  readonly processedFrames: number;
};

export type AnalysisFailure =
  | {
      readonly kind: 'frame_source_unavailable';
      readonly reason: 'decode_failed' | 'metadata_timeout';
    }
  | { readonly kind: 'calibration_invalid'; readonly defects: readonly CalibrationDefect[] };

/** 走査を止めはしないが、始める前に知らせておくべきこと */
export type AnalysisWarning = {
  readonly kind: 'duration_exceeds_max';
  readonly durationMs: number;
  readonly maxMs: number;
};

export type UseAnalysisRunDeps = {
  readonly openFrameSource?: (objectUrl: string) => Promise<CreateFrameSourceResult>;
  readonly createSampler?: () => RegionSamplerService;
  readonly now?: () => number;
  readonly yieldToMain?: () => Promise<void>;
};

export interface UseAnalysisRunReturn {
  readonly phase: AnalysisPhase;
  readonly progress: AnalysisProgress;
  readonly timeline: SampleTimeline | null;
  readonly calibration: HudCalibration | null;
  readonly failure: AnalysisFailure | null;
  readonly warning: AnalysisWarning | null;
  readonly params: AnalysisParams;
  /** 走査済みの観測列から導いたステップ。走査していなければ空 */
  readonly steps: readonly DetectedStep[];
  readonly summary: DetectionSummary | null;
  /** いまの数字ラベルの解決状況。校正へ載せて保存すれば次の走査で再利用できる */
  readonly glyphBank: GlyphBank;
  readonly unresolvedGlyphs: readonly GlyphTemplate[];
  start(objectUrl: string, calibration: HudCalibration): Promise<void>;
  cancel(): void;
  /** 走査済み timeline に対して検出のみ再実行する（Req 4.5） */
  setParams(next: AnalysisParams): void;
  /** 未解決グリフへ数字ラベルを与える。動画は開き直さない（Req 3.3） */
  labelGlyph(key: GlyphKey, digit: number): void;
  reset(): void;
}

const IDLE_PROGRESS: AnalysisProgress = { ratio: 0, elapsedMs: 0, processedFrames: 0 };

/** 走査前の空の結果。毎描画で新しい配列を作らないよう共有する */
const EMPTY_STEPS: readonly DetectedStep[] = [];

/** 走査を始める前に長尺かどうかを判定する。UI は開始前の警告にこれを使う */
export function exceedsScanDuration(durationMs: number): boolean {
  return durationMs > MAX_SCAN_DURATION_MS;
}

function defaultYieldToMain(): Promise<void> {
  // setTimeout(0) は現在のタスクを終わらせる。描画とユーザー操作がここで通る
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * CHARGE 判定の余裕度。閾値からどれだけ離れているかを 0..1 で表す。
 * 閾値ぎりぎりでの点灯・消灯は、検出器が「要確認」に落とすための材料になる。
 */
function chargeMarginOf(luminance: number, threshold: number): number {
  const span = luminance >= threshold ? 1 - threshold : threshold;
  if (span <= 0) return 1;
  return Math.min(1, Math.abs(luminance - threshold) / span);
}

/**
 * 1 フレームぶんの画素を観測値へ還元する。
 * グリフの束は走査の間ずっと育つので、更新後の束も一緒に返す。
 *
 * 公開しているのは、性能計測が「本番と同じ経路」を測れるようにするため。
 * 写しを作って測ると、実装が変わったときに測定値だけが古いまま残る。
 */
export function reduceFrame(
  tMs: number,
  regions: SampledRegions,
  bank: GlyphBank,
  params: AnalysisParams,
): { readonly sample: FrameSample; readonly bank: GlyphBank } {
  let currentBank = bank;
  const slots: SlotSample[] = [];

  for (const region of regions.slots) {
    const digits = region.ammoCells.map((cell) => {
      const assigned = assignGlyph(
        currentBank,
        computeGlyphDescriptor(cell),
        params.glyphMatchDistance,
      );
      currentBank = assigned.bank;
      return assigned.key;
    });

    const luminance = region.charge === null ? 0 : computeNormalizedLuminance(region.charge);
    slots.push({
      slotId: region.slotId,
      digits,
      chargeOn: region.charge !== null && luminance >= params.chargeLuminanceThreshold,
      chargeMargin:
        region.charge === null
          ? 0
          : chargeMarginOf(luminance, params.chargeLuminanceThreshold),
    });
  }

  return {
    sample: { tMs, slots, boostFill: computeFillRatio(regions.boost) },
    bank: currentBank,
  };
}

export function useAnalysisRun(deps: UseAnalysisRunDeps = {}): UseAnalysisRunReturn {
  // 既定の実装はここで 1 度だけ固める。毎描画で作り直すと start が作り直され、
  // 走査中に配線が入れ替わったように見えてしまう
  const { openFrameSource: openDep, createSampler: samplerDep, now: nowDep } = deps;
  const openFrameSource = useMemo(
    () => openDep ?? ((objectUrl: string) => createFrameSource({ objectUrl })),
    [openDep],
  );
  const createSampler = useMemo(
    () => samplerDep ?? ((): RegionSamplerService => createRegionSampler()),
    [samplerDep],
  );
  const now = useMemo(() => nowDep ?? ((): number => Date.now()), [nowDep]);
  const yieldToMain = deps.yieldToMain ?? defaultYieldToMain;

  const [phase, setPhase] = useState<AnalysisPhase>('idle');
  const [progress, setProgress] = useState<AnalysisProgress>(IDLE_PROGRESS);
  const [timeline, setTimeline] = useState<SampleTimeline | null>(null);
  const [calibration, setCalibration] = useState<HudCalibration | null>(null);
  const [failure, setFailure] = useState<AnalysisFailure | null>(null);
  const [warning, setWarning] = useState<AnalysisWarning | null>(null);
  const [params, setParams] = useState<AnalysisParams>(DEFAULT_ANALYSIS_PARAMS);

  /** 進行中の走査を外から止めるための取っ手。同時に走るのは常に 1 本 */
  const abortRef = useRef<AbortController | null>(null);
  /**
   * 走査の世代。始め直しで席を譲った古い走査が、後から結果を書き戻さないための印。
   * キャンセルとは区別する必要がある。キャンセルされた走査は打ち切り済みの
   * 結果を残すが、追い越された走査は何も残してはいけない。
   */
  const runIdRef = useRef(0);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setPhase('idle');
    setProgress(IDLE_PROGRESS);
    setTimeline(null);
    setCalibration(null);
    setFailure(null);
    setWarning(null);
    setParams(DEFAULT_ANALYSIS_PARAMS);
  }, [cancel]);

  const start = useCallback(
    async (objectUrl: string, target: HudCalibration): Promise<void> => {
      // 走り始める前に前の走査を確実に畳む。2 本が同じ状態へ書き込む余地を作らない
      cancel();
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      const isCurrent = (): boolean => runIdRef.current === runId;

      setTimeline(null);
      setFailure(null);
      setProgress(IDLE_PROGRESS);
      setCalibration(target);

      const defects = collectDefects(target);
      if (defects.length > 0) {
        setPhase('failed');
        setFailure({ kind: 'calibration_invalid', defects });
        return;
      }

      const durationMs = target.videoKey.durationMs;
      setWarning(
        exceedsScanDuration(durationMs)
          ? { kind: 'duration_exceeds_max', durationMs, maxMs: MAX_SCAN_DURATION_MS }
          : null,
      );

      const opened = await openFrameSource(objectUrl);
      if (!opened.ok) {
        setPhase('failed');
        setFailure({ kind: 'frame_source_unavailable', reason: opened.reason });
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setPhase('scanning');

      const source = opened.source;
      const sampler = createSampler();
      // 走査の進捗は「いま流れている動画」の尺で測る。校正側の尺は開始前の警告用
      const scanDurationMs = source.durationMs > 0 ? source.durationMs : durationMs;
      const samples: FrameSample[] = [];
      const gaps: (readonly [number, number])[] = [];
      // 保存済みのテンプレートから始める。同じ配信者の別クリップで解決済みの数字が効く
      let bank = target.glyphBank;
      let processed = 0;
      let lastTMs = 0;
      const startedAt = now();

      try {
        for await (const handle of source.frames(controller.signal)) {
          const reduced = reduceFrame(
            handle.tMs,
            sampler.sample(handle.source, target),
            bank,
            params,
          );
          bank = reduced.bank;
          samples.push(reduced.sample);

          // 飛ばされた区間は観測していない。またぐ変化は検出器が信頼度を下げる
          if (handle.skippedFrames > 0) gaps.push([lastTMs, handle.tMs]);
          lastTMs = handle.tMs;
          processed += 1;

          if (isCurrent()) {
            setProgress({
              // 時刻を基準にすれば、取りこぼしがあっても割合が破綻しない
              ratio:
                scanDurationMs > 0 ? Math.min(1, Math.max(0, handle.tMs / scanDurationMs)) : 0,
              elapsedMs: now() - startedAt,
              processedFrames: processed,
            });
          }

          if (processed % SCAN_YIELD_INTERVAL_FRAMES === 0) await yieldToMain();
        }
      } finally {
        sampler.dispose();
        source.dispose();
      }

      const truncated = controller.signal.aborted;
      if (abortRef.current === controller) abortRef.current = null;
      // 追い越された走査はここで黙って消える。新しい走査の状態を踏まない
      if (!isCurrent()) return;

      const scanned: SampleTimeline = {
        videoKey: target.videoKey,
        frameDurationMs: source.frameDurationMs,
        samples,
        gaps,
        glyphBank: bank,
        truncated,
      };
      setTimeline(scanned);
      // 打ち切られた走査でも、最後まで走った走査と同じ経路で結果を扱う
      if (!truncated) {
        setProgress((previous) => ({ ...previous, ratio: 1 }));
      }
      setPhase(unresolvedGlyphs(bank).length > 0 ? 'resolving' : 'done');
    },
    [cancel, createSampler, now, openFrameSource, params, yieldToMain],
  );

  /**
   * 検出は観測列の従属物として導く。
   *
   * 走査の結果・校正・パラメータが同じなら結果も同じなので、状態として
   * 抱える必要がない。ラベル付けや閾値の変更で「検出だけが走り直す」のは、
   * 再計算の入口をここ 1 つに絞った結果であって、特別な経路ではない。
   */
  const detection = useMemo(
    () =>
      timeline === null || calibration === null
        ? null
        : runDetectors(timeline, calibration, params),
    [calibration, params, timeline],
  );

  const glyphBank = timeline?.glyphBank ?? EMPTY_BANK;
  const unresolved = useMemo(() => unresolvedGlyphs(glyphBank), [glyphBank]);

  const labelGlyph = useCallback((key: GlyphKey, digit: number) => {
    setTimeline((previous) => {
      if (previous === null) return previous;
      const labeled = applyGlyphLabel(previous.glyphBank, key, digit);
      if (labeled === previous.glyphBank) return previous;
      return { ...previous, glyphBank: labeled };
    });
  }, []);

  // 未解決が残っている間は解決の段階に留まる。全部片付いたら編集へ進める
  const settledPhase =
    phase === 'resolving' && unresolved.length === 0 ? 'done' : phase;

  return {
    phase: settledPhase,
    progress,
    timeline,
    calibration,
    failure,
    warning,
    params,
    steps: detection?.steps ?? EMPTY_STEPS,
    summary: detection?.summary ?? null,
    glyphBank,
    unresolvedGlyphs: unresolved,
    start,
    cancel,
    setParams,
    labelGlyph,
    reset,
  };
}

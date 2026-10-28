import { describe, it, expect } from 'vitest';
import {
  canStartAnalysis,
  needsRerunDecision,
  resolveWorkflowPhase,
  type WorkflowInputs,
} from '@/features/chart-author/workflow';

function inputs(patch: Partial<WorkflowInputs> = {}): WorkflowInputs {
  return {
    hasVideo: true,
    calibrating: false,
    calibrationReady: false,
    analysisPhase: 'idle',
    stepCount: 0,
    ...patch,
  };
}

describe('resolveWorkflowPhase', () => {
  it('動画がなければ何も始まっていない段階とする', () => {
    expect(resolveWorkflowPhase(inputs({ hasVideo: false }))).toBe('idle');
  });

  it('動画があっても解析前の状態は読み込み済みの段階とする', () => {
    expect(resolveWorkflowPhase(inputs())).toBe('loaded');
  });

  it('校正中は校正の段階とする', () => {
    expect(resolveWorkflowPhase(inputs({ calibrating: true }))).toBe('calibrating');
  });

  it('校正が揃えば解析可能の段階とする', () => {
    expect(resolveWorkflowPhase(inputs({ calibrationReady: true }))).toBe('ready');
  });

  it('走査中は走査の段階とする', () => {
    expect(
      resolveWorkflowPhase(inputs({ calibrating: true, analysisPhase: 'scanning' })),
    ).toBe('scanning');
  });

  it('グリフ解決中は解決の段階とする', () => {
    expect(resolveWorkflowPhase(inputs({ analysisPhase: 'resolving' }))).toBe('resolving');
  });

  it('解析が終われば編集の段階とする', () => {
    expect(
      resolveWorkflowPhase(inputs({ calibrationReady: true, analysisPhase: 'done' })),
    ).toBe('editing');
  });

  it('ステップが残っていれば解析前でも編集の段階とする', () => {
    expect(resolveWorkflowPhase(inputs({ stepCount: 3 }))).toBe('editing');
  });

  it('編集中でも校正へ戻れば校正の段階が優先される', () => {
    expect(
      resolveWorkflowPhase(
        inputs({ calibrating: true, analysisPhase: 'done', stepCount: 3 }),
      ),
    ).toBe('calibrating');
  });

  it('動画を外せば段階も初期へ戻る', () => {
    expect(
      resolveWorkflowPhase(
        inputs({ hasVideo: false, analysisPhase: 'done', stepCount: 5 }),
      ),
    ).toBe('idle');
  });
});

describe('canStartAnalysis', () => {
  it('校正が揃うまでは解析を始められない', () => {
    expect(canStartAnalysis(inputs({ calibrating: true }))).toBe(false);
  });

  it('動画がなければ校正が揃っていても始められない', () => {
    expect(canStartAnalysis(inputs({ hasVideo: false, calibrationReady: true }))).toBe(false);
  });

  it('校正が揃えば始められる', () => {
    expect(canStartAnalysis(inputs({ calibrationReady: true }))).toBe(true);
  });

  it('走査中は重ねて始められない', () => {
    expect(
      canStartAnalysis(inputs({ calibrationReady: true, analysisPhase: 'scanning' })),
    ).toBe(false);
  });

  it('グリフ解決中も始められない', () => {
    expect(
      canStartAnalysis(inputs({ calibrationReady: true, analysisPhase: 'resolving' })),
    ).toBe(false);
  });

  it('解析後でも校正が揃っていれば再解析を始められる', () => {
    expect(
      canStartAnalysis(inputs({ calibrationReady: true, analysisPhase: 'done', stepCount: 4 })),
    ).toBe(true);
  });
});

describe('needsRerunDecision', () => {
  it('ステップが 1 件もなければ確認は要らない', () => {
    expect(needsRerunDecision(0)).toBe(false);
  });

  it('既存のステップがあるなら必ず確認を要する', () => {
    expect(needsRerunDecision(1)).toBe(true);
  });
});

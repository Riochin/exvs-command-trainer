/**
 * 操作性のテスト用の道具。
 *
 * - createKeyboardHarness: キーボードの keydown / keyup をアケコン（ArcadeController）の判定に通して sim に送る。
 *   生の押下・解放と解釈済みの入力が届く順序と遅れを、実際の画面と同じに再現する。
 *   起きたこと（入力、行動の切り替わり、HUD の出来事）を時系列で記録し、trace() で読める
 * - runUntil: 条件を満たすまで sim を進める。上限を超えたら投げるので、テストが止まらなくなることがない
 *
 * 使う前に vi.useFakeTimers() しておくこと。
 */
import { render, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import { ArcadeController, type ArcadePhysicalButton } from '@/features/arcade-controller/ArcadeController';
import { snapshotWorld } from '@/features/input-relay/sim/debug';
import {
  advanceWorld,
  applyInput,
  applyRawInput,
  createWorld,
  FIXED_DT,
  setLever,
  stepWorld,
  type CreateWorldOptions,
} from '@/features/input-relay/sim/step';
import type { LeverDirection, SimWorld } from '@/features/input-relay/sim/types';

/** 3D ビューと同じキー割り当て（J / O / [） */
export const KEYBOARD_KEYS: Readonly<Record<string, ArcadePhysicalButton>> = { j: 'shot', o: 'melee', '[': 'jump' };
const STEP_MS = 4;

/** 条件を満たすまで sim を固定刻みで進める。maxSeconds を超えたら投げる */
export function runUntil(world: SimWorld, done: (world: SimWorld) => boolean, maxSeconds = 10): void {
  const limit = world.time + maxSeconds;
  while (!done(world)) {
    if (world.time > limit) {
      const s = snapshotWorld(world);
      throw new Error(`runUntil: ${maxSeconds} 秒たっても条件を満たさない（${JSON.stringify(s)}）`);
    }
    stepWorld(world, FIXED_DT);
  }
}

export type KeyboardHarness = ReturnType<typeof createKeyboardHarness>;

export function createKeyboardHarness(options?: CreateWorldOptions) {
  const world = createWorld(options);
  let carry = 0;
  let elapsedMs = 0;
  const log: string[] = [];
  const note = (text: string) => log.push(`${String(elapsedMs).padStart(5)}ms  ${text}`);

  render(
    <ArcadeController
      keyboardKeys={KEYBOARD_KEYS}
      onButtonPress={(button) => {
        note(`入力 ${button} → ${applyInput(world, button)}`);
      }}
      onRawInput={(input) => {
        note(`生 ${input.button} ${input.phase}`);
        applyRawInput(world, input);
      }}
    />,
  );

  let lastState = '';
  let seenEvents = 0;
  const recordChanges = () => {
    const s = snapshotWorld(world);
    const state = `${s.action}${s.grounded ? ' 接地' : ''}${s.landingLag > 0 ? ' 硬直' : ''}${s.overheat ? ' OH' : ''}`;
    if (state !== lastState) {
      note(`状態 ${state}  y=${s.y} vy=${s.vy} 敵との角度=${s.angleToEnemy}° 距離=${s.distanceToEnemy}`);
      lastState = state;
    }
    for (; seenEvents < world.events.length; seenEvents++) {
      const e = world.events[seenEvents];
      note(`HUD ${e.kind === 'reject' ? '× ' : ''}${e.label}`);
    }
  };

  /** アケコンのタイマーと sim を同じ時間だけ進める */
  const wait = (ms: number) => {
    for (let t = 0; t < ms; t += STEP_MS) {
      act(() => {
        vi.advanceTimersByTime(STEP_MS);
      });
      carry = advanceWorld(world, STEP_MS / 1000, carry);
      elapsedMs += STEP_MS;
      recordChanges();
    }
  };
  const down = (key: string) => {
    fireEvent.keyDown(window, { key });
  };
  const up = (key: string) => {
    fireEvent.keyUp(window, { key });
  };
  const tap = (key: string, holdMs = 40) => {
    down(key);
    wait(holdMs);
    up(key);
  };

  return {
    world,
    wait,
    down,
    up,
    tap,
    /** BD: ジャンプを 2 回。2 回目は holdMs だけ押し続ける */
    bd(holdMs = 250) {
      tap('[', 40);
      wait(50);
      down('[');
      wait(holdMs);
      up('[');
    },
    lever(direction: LeverDirection, pressed: boolean) {
      note(`レバー ${direction} ${pressed ? '倒す' : '戻す'}`);
      setLever(world, direction, pressed);
    },
    /** HUD に出た出来事のラベル */
    labels: () => world.events.map((e) => e.label),
    snapshot: () => snapshotWorld(world),
    /** 起きたことの時系列。失敗したテストの原因を追うときに console.log(h.trace()) する */
    trace: () => log.join('\n'),
  };
}

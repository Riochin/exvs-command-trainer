import type { ActionDef, AssistKind } from '@/features/input-relay/sim/actions';
import type { ActionKind, MechAction } from '@/features/input-relay/sim/types';
import { isRejection, type LeverKind, type ResolveContext, type UnitDef } from '@/features/input-relay/sim/units';

/**
 * どの機体にも当てはまる約束ごと。機体データの書き間違い（キャンセル先の id の打ち間違い、
 * ammo のキーの付け忘れなど）を見つける。
 */

export const SLOTS: ReadonlyArray<MechAction> = [
  'shot',
  'melee',
  'jump',
  'bd',
  'step',
  'sub',
  'special-shot',
  'special-melee',
  'shot-cs',
  'melee-cs',
];
const LEVERS: ReadonlyArray<LeverKind> = ['N', 'front', 'side', 'back'];
const FLAGS = [false, true] as const;
/** 出ているアシストの組み合わせ。何も出ていないときと、1 種類ずつ出ているとき */
const ASSIST_SETS: ReadonlyArray<ReadonlyArray<AssistKind>> = [
  [],
  ...(['murasame', 'freedom-shot', 'freedom-melee', 'ootori', 'esbit', 'gfred-shot', 'gfred-melee'] as const).map((k) => [k]),
];

/** resolve に渡しうる状況をひと通り作る（今出している技ごと） */
function contexts(current: ActionDef | null, currentSlot: ActionKind): ResolveContext[] {
  const list: ResolveContext[] = [];
  for (const lever of LEVERS)
    for (const inBd of FLAGS)
      for (const seed of FLAGS)
        for (const packOut of FLAGS)
          for (const seedCooldown of [0, 5])
            for (const assists of ASSIST_SETS)
              list.push({ lever, inBd, seed, packOut, seedCooldown, assists, current, currentSlot });
  return list;
}

/**
 * 何もしていない状態から出せる技と、そこから追加入力・派生で出せる技を全部集める。
 * 返り値は技と、それを出したスロットの組。
 */
export function reachableActions(unit: UnitDef): Array<{ slot: MechAction; action: ActionDef }> {
  // SEED 中の強化版のように resolve のたびに作られる技もあるので、中身で同じものを見分ける
  const found = new Map<string, { slot: MechAction; action: ActionDef }>();
  let frontier: Array<{ slot: ActionKind; action: ActionDef | null }> = [{ slot: 'idle', action: null }];
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const from of frontier) {
      for (const ctx of contexts(from.action, from.slot)) {
        for (const slot of SLOTS) {
          const result = unit.resolve(slot, ctx);
          if (isRejection(result)) continue;
          const key = `${slot}:${JSON.stringify(result)}`;
          if (found.has(key)) continue;
          found.set(key, { slot, action: result });
          next.push({ slot, action: result });
        }
      }
    }
    frontier = next;
  }
  return [...found.values()];
}

/** 機体データの約束ごとを確かめ、破っているものを文で返す（空なら問題なし） */
export function unitProblems(unit: UnitDef): string[] {
  const problems: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(unit.id)) problems.push(`id は kebab-case にする: ${unit.id}`);
  if (!(unit.boostScale > 0)) problems.push('boostScale は 0 より大きくする');
  if (unit.commands.length === 0) problems.push('技表 commands が空');
  for (const [key, color] of Object.entries(unit.look)) {
    if ((key === 'frame' || key === 'chest' || key === 'accent' || key === 'trim') && !/^#[0-9a-f]{6}$/i.test(color))
      problems.push(`look.${key} は #rrggbb で書く: ${color}`);
  }

  const reachable = reachableActions(unit);
  const ids = new Set(reachable.map((r) => r.action.id).filter((id): id is string => id !== undefined));
  const targets = new Set<string>([...SLOTS, ...ids]);
  for (const { action } of reachable) {
    const name = action.id ?? action.label;
    if (!(action.duration > 0)) problems.push(`${name}: duration は 0 より大きくする`);
    if (action.ammo !== undefined && !(action.ammo in unit.ammo)) problems.push(`${name}: ammo '${action.ammo}' が unit.ammo にない`);
    if (action.fireAt !== undefined && action.fireAt > action.duration) problems.push(`${name}: fireAt が duration より後`);
    if (action.buff === 'seed' && unit.seedDuration === undefined) problems.push(`${name}: 時限強化を使うなら seedDuration を書く`);
    for (const into of [...(action.cancels?.into ?? []), ...(action.cancels?.early ?? [])]) {
      if (!targets.has(into)) problems.push(`${name}: キャンセル先 '${into}' はスロット名でも出せる技の id でもない`);
    }
  }
  return problems;
}

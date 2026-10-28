import { GENERIC_UNIT } from './generic';
import { GQUUUUUUX } from './gquuuuuux';
import { STRIKE_ROUGE_OOTORI } from './strike-rouge-ootori';
import type { UnitDef } from './types';

export * from './types';
export { GENERIC_UNIT } from './generic';
export { STRIKE_ROUGE_OOTORI } from './strike-rouge-ootori';
export { GQUUUUUUX } from './gquuuuuux';

/**
 * 機体選択に並べる機体。新しい機体はファイルを作ってここに足す。
 * 手順は `.kiro/steering/unit-authoring.md`。
 */
export const UNITS: ReadonlyArray<UnitDef> = [GENERIC_UNIT, STRIKE_ROUGE_OOTORI, GQUUUUUUX];

export function unitById(id: string): UnitDef {
  return UNITS.find((u) => u.id === id) ?? GENERIC_UNIT;
}

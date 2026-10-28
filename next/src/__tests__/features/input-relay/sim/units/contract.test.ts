import { describe, it, expect } from 'vitest';
import { TEMPLATE_UNIT } from '@/features/input-relay/sim/units/_template';
import { UNITS } from '@/features/input-relay/sim/units';
import { unitProblems } from './unitContract';

describe('機体データの約束ごと', () => {
  it('機体の id は重ならない', () => {
    const ids = UNITS.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([...UNITS, TEMPLATE_UNIT].map((u) => [u.name, u] as const))('%s', (_, unit) => {
    expect(unitProblems(unit)).toEqual([]);
  });
});

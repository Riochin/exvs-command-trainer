import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MechHud } from '@/features/input-relay/viewer/MechHud';
import { createWorld } from '@/features/input-relay/sim/step';

// HUD は間引いて sim を読むので、最初の読み取りを待ってから確かめる
async function renderHud(props: { showLever?: boolean; touchButtons?: boolean }) {
  const worldRef = { current: createWorld() };
  render(<MechHud worldRef={worldRef} {...props} />);
  return screen.findByTestId('mech-hud');
}

describe('MechHud のタッチ操作向けの出し分け', () => {
  it('ふだんはレバー表示を出し、タッチ用ボタンの印は付けない', async () => {
    const hud = await renderHud({});
    expect(screen.queryByLabelText('レバー')).not.toBeNull();
    expect(hud.getAttribute('data-touch-buttons')).toBe('false');
  });

  it('タッチのスティックを出している間はレバー表示を消す', async () => {
    await renderHud({ showLever: false });
    expect(screen.queryByLabelText('レバー')).toBeNull();
  });

  it('タッチ用ボタンを出している間は印を付ける（残弾の札をよける）', async () => {
    const hud = await renderHud({ touchButtons: true });
    expect(hud.getAttribute('data-touch-buttons')).toBe('true');
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlotInspector } from '@/features/chart-author/calibration/SlotInspector';
import { LOW_CLASSIFICATION_CONFIDENCE } from '@/features/chart-author/constants';
import type { WeaponSlotCalibration } from '@/features/chart-author/types';

function slot(patch: Partial<WeaponSlotCalibration> = {}): WeaponSlotCalibration {
  return {
    id: 'slot-1',
    index: 0,
    inputType: 'sub',
    inputTypeSource: 'auto',
    ammoRect: { x: 0.8, y: 0.2, width: 0.06, height: 0.04 },
    digitCount: 2,
    buttonIndicatorRect: { x: 0.75, y: 0.2, width: 0.04, height: 0.02 },
    chargeRect: null,
    chargeKind: null,
    ...patch,
  };
}

let handlers: {
  onUpdateSlot: ReturnType<typeof vi.fn>;
  onRemoveSlot: ReturnType<typeof vi.fn>;
  onSelectTarget: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  handlers = {
    onUpdateSlot: vi.fn(),
    onRemoveSlot: vi.fn(),
    onSelectTarget: vi.fn(),
  };
});

function renderInspector(
  props: Partial<React.ComponentProps<typeof SlotInspector>> = {},
) {
  return render(
    <SlotInspector
      slots={[slot()]}
      classifications={{ 'slot-1': { inputType: 'sub', confidence: 0.9 } }}
      {...handlers}
      {...props}
    />,
  );
}

describe('SlotInspector', () => {
  it('推定された入力種別と確からしさを示す', () => {
    renderInspector();

    const row = screen.getByTestId('slot-row-slot-1');
    expect(row.textContent).toContain('推定');
    expect(row.textContent).toContain('0.90');
  });

  it('確からしさが低いスロットを明示する', () => {
    renderInspector({
      classifications: {
        'slot-1': { inputType: 'sub', confidence: LOW_CLASSIFICATION_CONFIDENCE - 0.01 },
      },
    });

    expect(screen.getByTestId('slot-low-confidence-slot-1')).toBeDefined();
  });

  it('推定できなかったスロットも明示する', () => {
    renderInspector({ classifications: { 'slot-1': null } });

    expect(screen.getByTestId('slot-low-confidence-slot-1')).toBeDefined();
  });

  it('確からしさが十分なら明示しない', () => {
    renderInspector();

    expect(screen.queryByTestId('slot-low-confidence-slot-1')).toBeNull();
  });

  it('入力種別を上書きすると手動の指定として扱う', () => {
    renderInspector();

    fireEvent.change(screen.getByLabelText('スロット 1 の入力種別'), {
      target: { value: 'special-shot' },
    });

    expect(handlers.onUpdateSlot).toHaveBeenCalledWith('slot-1', {
      inputType: 'special-shot',
      inputTypeSource: 'manual',
    });
  });

  it('選べる入力種別は画面から判定しうる 4 種に限る', () => {
    renderInspector();

    const options = Array.from(
      screen.getByLabelText('スロット 1 の入力種別').querySelectorAll('option'),
    ).map((option) => option.getAttribute('value'));
    expect(options).toEqual(['shot', 'sub', 'special-shot', 'special-melee']);
  });

  it('桁数を上書きできる', () => {
    renderInspector();

    fireEvent.change(screen.getByLabelText('スロット 1 の桁数'), {
      target: { value: '3' },
    });

    expect(handlers.onUpdateSlot).toHaveBeenCalledWith('slot-1', { digitCount: 3 });
  });

  it('CHARGE の種別を上書きできる', () => {
    renderInspector({
      slots: [slot({ chargeRect: { x: 0.9, y: 0.2, width: 0.02, height: 0.02 } })],
    });

    fireEvent.change(screen.getByLabelText('スロット 1 の CHARGE 種別'), {
      target: { value: 'melee' },
    });

    expect(handlers.onUpdateSlot).toHaveBeenCalledWith('slot-1', { chargeKind: 'melee' });
  });

  it('CHARGE 種別を「なし」に戻せる', () => {
    renderInspector({
      slots: [
        slot({
          chargeRect: { x: 0.9, y: 0.2, width: 0.02, height: 0.02 },
          chargeKind: 'shot',
        }),
      ],
    });

    fireEvent.change(screen.getByLabelText('スロット 1 の CHARGE 種別'), {
      target: { value: '' },
    });

    expect(handlers.onUpdateSlot).toHaveBeenCalledWith('slot-1', { chargeKind: null });
  });

  it('ボタン表示領域と CHARGE 領域を描き直す対象に選べる', () => {
    renderInspector();

    fireEvent.click(screen.getByRole('button', { name: 'スロット 1 のボタン表示領域を描く' }));
    expect(handlers.onSelectTarget).toHaveBeenCalledWith({
      kind: 'slot_indicator',
      slotId: 'slot-1',
    });

    fireEvent.click(screen.getByRole('button', { name: 'スロット 1 の CHARGE 領域を描く' }));
    expect(handlers.onSelectTarget).toHaveBeenCalledWith({
      kind: 'slot_charge',
      slotId: 'slot-1',
    });
  });

  it('スロットを削除できる', () => {
    renderInspector();

    fireEvent.click(screen.getByRole('button', { name: 'スロット 1 を削除' }));

    expect(handlers.onRemoveSlot).toHaveBeenCalledWith('slot-1');
  });

  it('スロットが 1 件もなければ描き方を案内する', () => {
    renderInspector({ slots: [], classifications: {} });

    expect(screen.getByTestId('slot-empty')).toBeDefined();
  });
});

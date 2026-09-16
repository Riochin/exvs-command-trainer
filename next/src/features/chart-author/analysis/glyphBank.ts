/**
 * 桁グリフのクラスタリングと数字解決。
 *
 * この層が持つのは「見た目が同じものをまとめる」ことだけで、
 * 「その塊が数字の何なのか」は持たない。意味付けは外（ユーザーのラベル付け、
 * あるいは保存済みテンプレート）から与えられる。推測で数字を埋めると、
 * 誤った弾数から誤ったステップが生まれ、原因が追えなくなる。
 */
import { EMPTY_GLYPH } from '../constants';
import type { GlyphBank, GlyphDescriptor, GlyphKey, GlyphTemplate } from '../types';
import { descriptorDistance, isEmptyGlyph } from './descriptors';

/** クラスタが 1 つも無い初期状態 */
export const EMPTY_BANK: GlyphBank = { templates: [] };

/** 既存キーと衝突しないクラスタ識別子を作る */
function nextKey(templates: readonly GlyphTemplate[]): GlyphKey {
  const used = new Set(templates.map((t) => t.key));
  let n = templates.length + 1;
  while (used.has(`g${n}`)) n += 1;
  return `g${n}`;
}

/**
 * 記述子を既存クラスタへ照合する。合致しなければ新規クラスタを作る。
 *
 * 空セルはクラスタを作らず EMPTY_GLYPH を返す。空白の見え方は
 * 数字と違って個体差が無く、クラスタとして抱えても未解決が増えるだけのため。
 */
export function assignGlyph(
  bank: GlyphBank,
  descriptor: GlyphDescriptor,
  maxDistance: number,
): { readonly bank: GlyphBank; readonly key: GlyphKey } {
  if (isEmptyGlyph(descriptor)) return { bank, key: EMPTY_GLYPH };

  let best: GlyphTemplate | null = null;
  let bestDistance = Infinity;
  for (const template of bank.templates) {
    const distance = descriptorDistance(descriptor, template.descriptor);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = template;
    }
  }

  if (best !== null && bestDistance <= maxDistance) {
    return { bank, key: best.key };
  }

  const created: GlyphTemplate = {
    key: nextKey(bank.templates),
    descriptor,
    digit: null,
    previewDataUrl: null,
  };
  return { bank: { templates: [...bank.templates, created] }, key: created.key };
}

/**
 * クラスタに切り出し画像を持たせる。
 *
 * 画像そのものを作るのは描画の仕事（frame-source/glyphPreview）で、ここは
 * 受け取った結果を束へ収めるだけ。この層が canvas を知らずに済むよう、
 * 生成と保管を分けている。
 */
export function attachGlyphPreview(
  bank: GlyphBank,
  key: GlyphKey,
  previewDataUrl: string,
): GlyphBank {
  if (!bank.templates.some((template) => template.key === key)) return bank;
  return {
    templates: bank.templates.map((template) =>
      template.key === key ? { ...template, previewDataUrl } : template,
    ),
  };
}

/** ラベル未付与のクラスタのみを返す。GlyphTutor が表示する対象 */
export function unresolvedGlyphs(bank: GlyphBank): readonly GlyphTemplate[] {
  return bank.templates.filter((t) => t.digit === null);
}

/**
 * ユーザーが与えた数字ラベルを反映した新しい bank を返す。
 * 対象が無い場合や範囲外の数字は、黙って何もしない（元の bank を返す）。
 */
export function labelGlyph(bank: GlyphBank, key: GlyphKey, digit: number): GlyphBank {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) return bank;
  if (!bank.templates.some((t) => t.key === key)) return bank;
  return {
    templates: bank.templates.map((t) => (t.key === key ? { ...t, digit } : t)),
  };
}

/**
 * 桁セル列を整数へ解決する。1 つでも未解決のクラスタを含むなら null。
 *
 * 桁は左詰めで、末尾の空セルは桁として数えない。途中に空セルが挟まる列は
 * 走査の失敗を意味するため、値を作らず null を返す。
 */
export function resolveGlyphValue(
  bank: GlyphBank,
  digits: readonly GlyphKey[],
): number | null {
  let end = digits.length;
  while (end > 0 && digits[end - 1] === EMPTY_GLYPH) end -= 1;
  if (end === 0) return null;

  let value = 0;
  for (let i = 0; i < end; i += 1) {
    const template = bank.templates.find((t) => t.key === digits[i]);
    if (template === undefined || template.digit === null) return null;
    value = value * 10 + template.digit;
  }
  return value;
}

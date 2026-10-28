'use client';

/**
 * 未解決の桁クラスタに数字ラベルを付ける画面。
 *
 * 数字を推測で埋めないという解析層の方針（glyphBank）を、人の目で
 * 埋めるための唯一の入口。切り出し画像を見せたうえで選ばせるので、
 * 画像が用意できなかったクラスタでも入力の手段は塞がない。
 */
import type { GlyphKey, GlyphTemplate } from '../types';
import styles from './GlyphTutor.module.css';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type GlyphTutorProps = {
  readonly glyphs: readonly GlyphTemplate[];
  onLabel(key: GlyphKey, digit: number): void;
};

export function GlyphTutor({ glyphs, onLabel }: GlyphTutorProps) {
  if (glyphs.length === 0) return null;

  return (
    <section className={styles.tutor} data-testid="glyph-tutor">
      <h2 className={styles.heading}>
        未解決の数字
        <span className={styles.remaining} data-testid="glyph-remaining">
          残り {glyphs.length} 件
        </span>
      </h2>

      <ul className={styles.list}>
        {glyphs.map((glyph) => (
          <li key={glyph.key} className={styles.row}>
            {glyph.previewDataUrl === null ? (
              <span className={styles.noPreview} data-testid={`glyph-no-preview-${glyph.key}`}>
                画像なし
              </span>
            ) : (
              // 走査中に切り出した data URL。next/image は最適化できず、
              // 桁セル 1 個ぶんの画素にローダを挟む意味もない
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.preview}
                src={glyph.previewDataUrl}
                alt={`${glyph.key} の切り出し画像`}
              />
            )}

            <div className={styles.digits}>
              {DIGITS.map((digit) => (
                <button
                  key={digit}
                  type="button"
                  className={styles.digit}
                  data-testid={`glyph-digit-${glyph.key}`}
                  onClick={() => onLabel(glyph.key, digit)}
                  aria-label={`${glyph.key} を ${digit} として登録`}
                >
                  {digit}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

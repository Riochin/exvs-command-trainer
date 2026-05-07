# Research & Design Decisions

---
**Purpose**: ディスカバリーフェーズの調査結果、アーキテクチャ選定の根拠を記録する。

---

## Summary
- **Feature**: `cyberpunk-ui-theme`
- **Discovery Scope**: Extension（既存UIへのスタイリング拡張）
- **Key Findings**:
  - 現在のスタイリングは CSS Modules + 最小限の `globals.css`（変数2個のみ）。デザイントークン基盤はゼロから構築が必要
  - `next/font/google` で `Geist_Mono` が既にロード済み（`--font-geist-mono` 変数として利用可能）。サイバーパンク向けモノスペースフォントとして再利用できる
  - `BackToHomeNav`, `CommandDetail`, `CommandList`, `SessionResult`, `ConfirmDialog`, `LandscapeGuard`, `CommandHint`, `PracticeHistory` の8コンポーネントが CSS モジュールを持たない。サイバーパンクスタイル適用には新規 CSS モジュールとコンポーネントへのインポート追加が必要
  - `ControllerButton` の色は `data-button` 属性セレクタで制御されており、グロー効果はこのパターンを踏襲して追加できる

## Research Log

### 既存スタイリング構造の調査
- **Context**: サイバーパンクテーマをどう既存コードに統合するかを把握するための調査
- **Findings**:
  - `globals.css`: `--background` / `--foreground` の2変数のみ。`prefers-color-scheme: dark` で白/黒を切り替えるシンプルな構成
  - CSS Modules: `ControllerButton.module.css`, `ArcadeController.module.css`, `CommandForm.module.css`, `PracticeSession.module.css`, `page.module.css`（ホーム）, `page.module.css`（コマンド新規）の6ファイルが存在
  - `src/styles/` ディレクトリは未存在。要件で指定されたデザイントークンファイルの置き場として新規作成が必要
  - Next.js 16.2.4（AGENTS.md に「breaking changes あり」の警告）。既存パターン（App Router + CSS Modules）は安全に踏襲できる
- **Implications**: CSS `@import` を `globals.css` に追加して `theme.css` を取り込む方式が最もクリーン

### フォント戦略の調査
- **Context**: 要件2.1（モノスペース/サイバーパンクフォント）の実現方法
- **Findings**:
  - `layout.tsx` で `Geist_Mono` が `--font-geist-mono` CSS 変数としてロード済み
  - Google Fonts 追加（`Share Tech Mono` 等）は可能だが、追加 HTTP リクエストが発生する
  - `Geist_Mono` はラテン文字向け。日本語テキストはシステムフォントが引き続き表示される（これは望ましい動作）
- **Implications**: 新規 Google Font の追加は不要。`--font-geist-mono` を見出し・ボタンラベルの英数字部分に適用する

### CSS カスタムプロパティの可用性
- **Context**: デザイントークンを全コンポーネントから参照できるか確認
- **Findings**:
  - CSS Custom Properties は `:root` に定義することでカスケードにより全要素から参照可能
  - CSS Modules はファイルを `@import` しなくても、`:root` に定義された CSS 変数を `var()` で使用できる
  - `@import '../styles/theme.css'` は `globals.css` の先頭に置くことで有効（PostCSS 処理）
- **Implications**: CSS Modules は `theme.css` をインポートせず `var(--token-name)` を直接使用できる

### ControllerButton の色管理
- **Context**: 要件6.1（グロー効果追加）時に既存の色設定と競合しないか確認
- **Findings**:
  - 現在は `data-button="shot"` → `background: #d42f2f`（赤）など属性セレクタで色設定
  - `aria-pressed="true"` → `transform: scale(0.93)` で押下表現
  - `data-highlighted="true"` → 金色のリングで強調
- **Implications**: `box-shadow` によるグロー効果は既存の `background` 設定と競合しない。`data-highlighted` の金色リングはサイバーパンク向けにシアン系へ変更するべき

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A: globals.css に直接定義 | デザイントークンを `globals.css` に追記 | ファイル数増加なし | `globals.css` が肥大化。要件で `src/styles/` を指定 | 不採用 |
| B: `src/styles/theme.css` を新規作成して `globals.css` から @import | 専用ファイルに分離 | 単一責任。要件準拠。CSS Modules から @import 不要 | `globals.css` に1行追加が必要 | **採用** |
| C: JS/TS 定数として管理 | TypeScript でデザイントークンを管理し CSS 変数に注入 | 型安全 | CSS Modules との相性悪い。複雑性増加 | 不採用 |

## Design Decisions

### Decision: `CapsuleButton` を新規共有コンポーネントとして分離

- **Context**: カプセル型ボタン（両端シアンキャップ）は疑似要素で端キャップを実現するため、複数ページで HTML 構造の一貫性が必要
- **Alternatives Considered**:
  1. 各ページのHTML要素に CSS Module クラスを直接適用 — 各ページで異なる実装になりドリフトのリスク
  2. グローバル CSS クラスとして定義 — CSS Modules の原則（スコープ分離）と相反する
  3. `CapsuleButton` 共有コンポーネントとして `src/components/` に追加 — 一貫した HTML 構造を保証
- **Selected Approach**: `src/components/CapsuleButton.tsx` + `CapsuleButton.module.css` を新規作成
- **Rationale**: 端キャップ（`::before`/`::after`）の疑似要素実装は構造に依存するため、コンポーネント化が最も安全
- **Trade-offs**: 既存の `<Link>` や `<button>` を `CapsuleButton` でラップする変更が必要。テストへの影響は最小限（ボタンの text content や role は変わらない）
- **Follow-up**: 既存テストが `role="button"` や `type="button"` を検索している場合は確認が必要

### Decision: アーケードコントローラボタンは円形を維持

- **Context**: 要件6.1はグロー効果追加。ボタン形状変更は要件に含まれない
- **Selected Approach**: `border-radius: 50%` は維持。`box-shadow` でシアングローを追加
- **Rationale**: 円形ボタンはアーケードコントローラの物理的な形状を模しており、ゲームプレイの直感性に直結する

### Decision: `prefers-reduced-motion` の実装場所

- **Context**: 要件5.4, 7.4でアニメーション無効化が必要
- **Selected Approach**: `theme.css` 内に `@media (prefers-reduced-motion: reduce)` ブロックを配置し、`--transition-fast/base/slow` を `0ms` に上書き。`@keyframes` アニメーションも同ブロックで無効化
- **Rationale**: トークンレベルで制御することで、すべてのコンポーネントが自動的に対応できる

## Risks & Mitigations

- `globals.css` の `prefers-color-scheme: dark` ブロックがサイバーパンクトークンを上書きする可能性 — `theme.css` 側で `:root` に無条件で定義し、`prefers-color-scheme` ブロックを削除または上書き
- CapsuleButton 導入により既存テストが `<Link>` の直接レンダリングを期待している場合に失敗するリスク — テスト内の `getByRole('link')` 等は変わらないが、実装前に確認
- Next.js 16.2.4 の breaking changes が CSS 処理に影響する可能性 — 既存の CSS Modules パターンが動作しているため、`@import` 追加も問題ないと判断。実装時に `pnpm dev` で動作確認を実施

## References

- EXVS2 公式サイトUI: ユーザー提供スクリーンショット（ビジュアルリファレンス）
- CSS Custom Properties MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties
- `prefers-reduced-motion` MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

# Implementation Plan

- [x] 1. Foundation: デザイントークン基盤とグローバルスタイルの構築
- [x] 1.1 CSS カスタムプロパティ（デザイントークン）ファイルの新規作成
  - `src/styles/` ディレクトリを作成し、`theme.css` に全カラー・タイポグラフィ・グロー・トランジション・スキャンラインのトークンを定義する
  - カラートークン（`--color-bg-base: #050a14`、`--color-bg-mid: #0a1628`、`--color-bg-card`、`--color-accent-primary: #4fc8e8`、`--color-accent-deep: #1a6080`、`--color-accent-glow`、`--color-text: #e8f4f8`、`--color-text-muted: #7ab8cc`、`--color-success: #39d98a`、`--color-error: #ff4560`、`--color-warning: #f59e0b`）を定義する
  - グロートークン（`--glow-cyan-sm/md/lg`、`--glow-success`、`--glow-error`、`--border-cyan`）とトランジショントークン（`--transition-fast: 150ms ease-out`、`--transition-base: 200ms ease-out`、`--transition-slow: 300ms ease-out`）を定義する
  - スキャンライントークン（`--scanline-opacity: 0.08`、`--scanline-size: 4px`）を定義する
  - `@media (prefers-reduced-motion: reduce)` ブロックで全トランジショントークンを 0ms に変更し、`*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }` を追加する
  - ブラウザ DevTools の `:root` で全 CSS 変数が確認できる状態になる
  - _Requirements: 1.1, 1.2, 2.4, 5.4, 7.1, 7.4_

- [x] 1.2 グローバルスタイルシートの全面刷新
  - `globals.css` の先頭に `@import '../styles/theme.css'` を追加してトークンをカスケード展開する
  - `prefers-color-scheme` ブロックを削除し、常時ダークテーマとする
  - `body` の背景色を `var(--color-bg-base)` に、文字色を `var(--color-text)` に、フォントを `var(--font-body)` に設定する
  - `body::before` で縦グラデーション背景（`#050a14` → `#0a1628`）を `position: fixed; z-index: -2` で実装する
  - `body::after` で横スキャンライン（`repeating-linear-gradient`）を `position: fixed; z-index: -1; opacity: var(--scanline-opacity)` で実装し、透明度を 5〜15% 程度に設定する
  - `h1`〜`h3` に `font-family: var(--font-mono)`、`font-weight: 700`、`letter-spacing: 0.12em`、`text-shadow: var(--glow-cyan-sm)` を設定する
  - `body` に `font-family: var(--font-body)` を設定し、日本語テキストの可読性を維持する
  - ページ遷移に `view-transition` または opacity フェードを適用する
  - ホームページをブラウザで開いてスキャンライン付きディープネイビー背景が全画面に表示される
  - _Requirements: 1.3, 2.1, 2.2, 2.3, 5.1, 5.2, 5.3, 5.4, 7.3_

- [x] 2. CapsuleButton 共有コンポーネントの実装
- [x] 2.1 カプセルボタンの TSX コンポーネントと CSS Module の作成
  - `src/components/CapsuleButton.tsx` を新規作成し、`variant`（primary / danger）、`size`（sm / md / lg）、`disabled`、`onClick`、`href`、`type`、`className`、`children` の props を受け取る
  - `href` prop 指定時は `next/link` の `Link` コンポーネントとしてレンダリングし、未指定時は `<button>` としてレンダリングする
  - `CapsuleButton.module.css` で `border-radius: 9999px`・ダークネイビー縦グラデーション本体・`::before / ::after` 疑似要素による両端シアン縦帯アクセントを実装する
  - ホバー・フォーカス時に `box-shadow: var(--glow-cyan-md)` を適用し、押下（:active）時に `filter: brightness(0.85)` で暗化する
  - `variant='danger'` 時のアクセントカラーを `var(--color-error)` に切り替える
  - `disabled` 状態でポインターイベントを無効化し、`opacity: 0.4` を適用する
  - ブラウザで CapsuleButton を表示してカプセル形状・両端シアンキャップ・ホバーグロー効果が確認できる
  - _Requirements: 1.4, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x]* 2.2 CapsuleButton の単体テスト
  - `variant='primary'` / `'danger'` / `disabled` の各 props が正しい CSS クラスを付与することをテストする
  - `href` 指定時に `<a>` タグ（Link コンポーネント由来）としてレンダリングされることをテストする
  - テストが全件グリーンで通過する
  - _Requirements: 3.1, 3.4, 3.5_

- [x] 3. (P) ControllerButton のネオングロービジュアル実装
  - `ControllerButton.tsx` に `state?: 'success' | 'fail' | 'neutral'` prop を追加し、`data-state` 属性としてレンダリングする（既存の `isActive`・`highlighted` props と共存させる）
  - `ControllerButton.module.css` の `.button` セレクタに `box-shadow: var(--glow-cyan-sm)` を追加し、基本グロー効果を付与する
  - `[aria-pressed="true"]` セレクタに `box-shadow: var(--glow-cyan-md)` を強化適用し、`[data-highlighted="true"]` のグローを `var(--glow-cyan-lg)` に更新する
  - `[data-state="success"]` セレクタに `box-shadow: var(--glow-success)`、`[data-state="fail"]` に `box-shadow: var(--glow-error)` を追加する
  - `ArcadeController.module.css` にコンテナ背景（`var(--color-bg-card)` + `var(--border-cyan)`）を適用する
  - `@media (orientation: landscape)` ブロックのレイアウトプロパティは変更せず、グロー効果のみ追加する
  - ブラウザでコントローラ UI を表示してボタンに薄いシアングローが表示される
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Boundary: ControllerButton, ArcadeController_

- [x] 4. (P) HUD パネルスタイル群の実装
- [x] 4.1 (P) 共有コンポーネントの HUD スタイル実装
  - `BackToHomeNav.module.css` を新規作成し、メカゲーム HUD スタイルのナビゲーションリンク（シアン文字・ホバーグロー・`var(--letter-spacing-ui)` 字間）を実装する
  - `ConfirmDialog.module.css` を新規作成し、`var(--color-bg-card)` 半透明背景・`var(--border-cyan)` ボーダーのダイアログスタイルを実装する
  - `LandscapeGuard.module.css` を新規作成し、縦画面警告の HUD スタイルを実装する
  - 各 TSX ファイル（`BackToHomeNav.tsx`、`ConfirmDialog.tsx`、`LandscapeGuard.tsx`）に CSS Module をインポートしクラス名を適用する
  - `BackToHomeNav` が表示されるページをブラウザで開いてシアン系 HUD スタイルのナビが確認できる
  - _Requirements: 4.1, 4.2, 4.3_
  - _Boundary: src/components/ (BackToHomeNav, ConfirmDialog, LandscapeGuard)_

- [x] 4.2 (P) コマンド管理フィーチャーの HUD スタイル実装
  - `CommandList.module.css` を新規作成し、コマンドリストカードに `var(--color-bg-card)` 背景・`var(--border-cyan)` ボーダー・セクション区切り線（`border-bottom: var(--border-cyan)`）を実装する
  - `CommandDetail.module.css` を新規作成し、コマンド詳細パネルの HUD スタイル（カード背景・見出し `var(--font-mono)`・`var(--letter-spacing-ui)` 字間）を実装する
  - `CommandForm.module.css` を更新し、バリデーションエラー状態に `var(--color-error)` アクセントを適用する
  - `CommandList.tsx`・`CommandDetail.tsx` に CSS Module をインポートしクラス名を適用する
  - コマンド一覧ページをブラウザで開いてカード形式の HUD スタイルが表示される
  - _Requirements: 3.6, 4.1, 4.3_
  - _Boundary: src/features/command-editor/_

- [x] 4.3 (P) 練習・履歴フィーチャーの HUD スタイルとネオンアニメーション実装
  - `PracticeSession.module.css` を更新し、セッションコンテナに HUD カードスタイルを適用する
  - `CommandHint.module.css` を新規作成し、ヒントパネルに `var(--color-bg-card)` 背景と `var(--border-cyan)` ボーダーを実装する
  - `SessionResult.module.css` を新規作成し、結果見出しに `@keyframes neon-pulse`（`text-shadow` の強度を 0→max→min で繰り返すパルス、duration `var(--transition-slow)`）を実装する
  - `PracticeHistory.module.css` を新規作成し、履歴パネルの HUD スタイル（シアンボーダー・区切り線）を実装する
  - `SessionResult.tsx`・`CommandHint.tsx`・`PracticeHistory.tsx` に CSS Module をインポートしクラス名を適用する
  - 練習結果画面をブラウザで確認してネオンパルスアニメーションが表示される
  - _Requirements: 2.2, 4.1, 4.3, 7.2_
  - _Boundary: src/features/practice/, src/features/practice-history/_

- [x] 5. 統合: CapsuleButton のページ適用と ControllerButton 状態連携
- [x] 5.1 ホームページと詳細ページへの CapsuleButton 統合
  - `src/app/page.tsx` でコマンドリストの遷移リンクを `CapsuleButton`（`href` prop）に変更する
  - `src/app/commands/[id]/CommandDetailContent.tsx` のアクションボタンを `CapsuleButton` に変更する
  - `src/app/page.module.css` をサイバーパンクホームページスタイルに更新する（カードレイアウト・HUD スタイル）
  - `src/app/layout.tsx` のメタデータ（title・`lang="ja"`）を更新する
  - ホームページを開いてカプセル形状のボタンでコマンド詳細ページへ遷移できる
  - _Requirements: 1.4, 3.1, 3.2, 3.3, 3.4, 3.5_
  - _Depends: 2.1_

- [x] 5.2 ControllerButton の成功・失敗状態を練習セッションから接続
  - `ArcadeController` または `PracticeSession` の既存状態（練習判定結果）を確認し、`ControllerButton` の `state` prop（`'success'` / `'fail'` / `'neutral'`）に渡すロジックを追加する
  - 成功判定時に対象ボタンへ `state='success'`（緑グロー）、失敗判定時に `state='fail'`（赤グロー）が適用されることを確認する
  - 次のコマンド入力開始時に `state` を `'neutral'` に戻す
  - 練習モードで成功・失敗を繰り返してコントローラボタンのグロー色が切り替わる
  - _Requirements: 6.3_
  - _Depends: 3._

- [x] 6. Validation: 統合テストと動作確認
- [x]* 6.1 ホームページの統合テスト
  - ホームページでコマンドリストが表示され、CapsuleButton が正しくクリックイベントを発火することをテストする
  - テストが全件グリーンで通過する
  - _Requirements: 3.1, 3.4, 3.5_
  - _Depends: 5.1_

- [x]* 6.2 練習セッションの統合テスト
  - 練習セッションで成功・失敗後に `SessionResult` コンポーネントが DOM に存在することをテストする（ビジュアルではなく DOM 確認）
  - テストが全件グリーンで通過する
  - _Requirements: 7.2_
  - _Depends: 4.3, 5.2_

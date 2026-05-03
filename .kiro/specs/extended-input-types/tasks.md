# Implementation Plan

## Task Format Template

---

- [x] 1. Foundation: ButtonType 型システムの拡張
- [x] 1.1 ButtonType union に5種を追加し isButtonType 型ガードを実装する
  - `src/types/index.ts` の `ButtonType` に `melee-charge`, `shot-charge`, `sub`, `special-shot`, `special-melee` を追加する
  - `isButtonType(value: unknown): value is ButtonType` 型ガード関数を公開する
  - `Record<ButtonType, string>` 型の `BUTTON_LABELS` を持つファイル（`ControllerButton.tsx`, `CommandHint.tsx`）にコンパイルエラーが発生することを確認し、型安全の自動検証が機能していることを確かめる
  - `pnpm typecheck` がラベル追加前はエラーを出し、追加後にエラーなしでビルドが通ること
  - _Requirements: 1.1, 1.2_

- [x] 1.2 useCommandStore でストレージ読み込み時の ButtonType バリデーションを追加する
  - `isButtonType` を使って `useCommandStore` が読み込んだコマンドの `sequence[].buttons[]` を検証する処理を追加する
  - 不正な ButtonType 値を含む要素を含むコマンドを `parse_error` として `StorageResult` に返す
  - 不正な ButtonType 文字列（例: `"unknown-type"`）を含む保存データを読み込んだ場合にエラーが返却されるユニットテストを追加する
  - _Requirements: 1.3_

---

- [x] 2. Core: useChargeInput フックとラベル辞書整備
- [x] 2.1 (P) useChargeInput フックを実装する
  - `src/hooks/useChargeInput.ts` を新規作成し、`CHARGE_THRESHOLD_MS = 300` 定数を公開する
  - `ChargeableButton = 'melee' | 'shot'` 型を定義する
  - `pointerDown` で保持開始時刻（`Date.now()`）を `pointerId` をキーにした Map に記録する
  - `pointerUp` で経過時間を計算し、`CHARGE_THRESHOLD_MS` 以上なら charge 型（`'melee-charge'`/`'shot-charge'`）、未満なら tap 型（`'melee'`/`'shot'`）でコールバックを1回呼ぶ
  - `pointerCancel` はコールバックを呼ばずに内部状態をクリアする
  - `activeChargeButtons: ReadonlySet<ChargeableButton>` を公開して押下中ボタンを外部から参照できるようにする
  - `src/__tests__/hooks/useChargeInput.test.ts` に tap/charge/cancel/しきい値境界/マルチタッチのユニットテストを作成し、すべてパスすること（`vi.setSystemTime()` で時刻を制御）
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - _Boundary: useChargeInput_

- [x] 2.2 (P) BUTTON_LABELS を全コンシューマで新5種に拡張する
  - `src/features/arcade-controller/ControllerButton.tsx` の `BUTTON_LABELS` に `melee-charge: '格闘チャージ'`, `shot-charge: '射撃チャージ'`, `sub: 'サブ'`, `special-shot: '特射'`, `special-melee: '特格'` を追加する
  - `src/features/practice/CommandHint.tsx` の `BUTTON_LABELS` に同5種のラベルを追加する
  - `src/features/command-editor/CommandForm.tsx` の `BUTTON_LABELS` 型を `Record<string, string>` から `Record<ButtonType, string>` に変更し同5種を追加する
  - `pnpm typecheck` がエラーなしで通り、すべての ButtonType に対応するラベルが定義されていること
  - _Requirements: 4.3, 5.1, 6.4, 6.5_
  - _Boundary: ControllerButton, CommandHint, CommandForm_

---

- [x] 3. Integration: ArcadeController の8ボタン対応
- [x] 3.1 ArcadeController で複合入力（サブ・特射・特格）の**同時押し検出**を実装する
  - 要件どおり **サブ＝射撃+格闘**、**特射＝射撃+ジャンプ**、**特格＝格闘+ジャンプ** の2キー同時押下で1回だけ対応する `ButtonType` を `onButtonPress` / `onStepAdded` に送る（専用ボタンは置かない）
  - 合成成立後の `pointerUp` で単体の tap/charge が重複しないよう抑止すること
  - `ArcadeController.test.tsx` に同時押しの表示（3ボタンのみ）・発火テストを追加してパスすること
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 5.1, 5.2, 5.4_
  - _Depends: 2.2_

- [x] 3.2 ArcadeController に useChargeInput を統合してチャージボタン検出を実装する
  - `ArcadeController.tsx` で `useChargeInput` をインスタンス化し、`melee`/`shot` ボタンを `useChargeInput.getChargeHandlers` で管理する（`useControllerInput.getButtonHandlers` からの切り替え）
  - `onButtonPress`/`onStepAdded` 共通コールバックを `useControllerInput.setOnButtonPress` と `useChargeInput.setOnInput` の両方に登録する
  - `melee`/`shot` ボタンの `isActive` 計算を `activeChargeButtons.has(button)` に変更する
  - `onStepAdded` モードで格闘を300ms以上保持して離すと `{ buttons: ['melee-charge'] }` がシーケンスに追加されること
  - 格闘を短押し（300ms未満）した場合は `{ buttons: ['melee'] }` が記録されること
  - _Requirements: 2.1, 2.2, 2.3, 5.2, 5.3, 5.4_
  - _Depends: 2.1, 3.1_

---

- [x] 4. Validation: テストと練習セッション確認
- [x] 4.1 (P) ArcadeController のチャージ・複合入力統合テストを追加する
  - 格闘ボタン長押し（300ms以上）→ `onButtonPress` が `'melee-charge'` で呼ばれること
  - 格闘ボタン短押し（300ms未満）→ `onButtonPress` が `'melee'` で呼ばれること
  - サブボタン押下 → `onButtonPress` が `'sub'` で呼ばれること
  - `onStepAdded` モードで射撃を長押し → `onStepAdded({ buttons: ['shot-charge'] })` が呼ばれること
  - 格闘保持中は `aria-pressed="true"` が格闘ボタンに設定されること
  - すべてのテストが `pnpm test` でパスすること
  - _Requirements: 3.2, 3.3, 3.4, 5.2, 5.3, 5.4, 6.1, 6.2_
  - _Boundary: ArcadeController.test_

- [x] 4.2 (P) PracticeSession でチャージステップのハイライト表示を調整する
  - `PracticeSession.tsx` の `highlightedButton` 計算ロジックに、チャージ型を対応する基本ボタン型にマップする処理を追加する（`melee-charge` → `melee`, `shot-charge` → `shot`）
  - `melee-charge` ステップ練習中に格闘ボタンがハイライト（`data-highlighted="true"`）されること
  - `shot-charge` ステップ練習中に射撃ボタンがハイライトされること
  - `sub`, `special-shot`, `special-melee` ステップでは対応する専用ボタンがハイライトされること
  - _Requirements: 5.5_
  - _Boundary: PracticeSession_

- [x] 4.3 新入力タイプを使ったコマンドの登録・練習フローを統合テストで検証する
  - `melee-charge` ステップを含むコマンドを登録し、格闘長押しで成功判定・タップで失敗判定されることを確認するテストを作成する
  - `sub` ステップを含むコマンドを登録し、サブボタン押下で成功判定されることを確認する
  - 新型 ButtonType を含むコマンドがローカルストレージに正しく保存・読み込みできることを確認する
  - `pnpm test` ですべての新規テストがパスすること
  - _Requirements: 4.4, 6.1, 6.2, 6.3_
  - _Depends: 3.2, 4.2_

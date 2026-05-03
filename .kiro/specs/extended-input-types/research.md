# Research & Design Decisions — extended-input-types

---

## Summary

- **Feature**: `extended-input-types`
- **Discovery Scope**: Extension（既存システムへの段階的拡張）
- **Key Findings**:
  - `ButtonType` union に5種追加するだけで `Record<ButtonType, string>` を持つコンポーネントがコンパイルエラーを出し、ラベル追加漏れを自動検出できる（型安全設計が既に機能している）
  - チャージ検出は `useControllerInput` を改変せず、新規 `useChargeInput` フックに分離するのが最もリスクが低い
  - `usePracticeSession.handleButtonPress` は `ButtonType` 値を受け取るだけなので、チャージ型 `'melee-charge'` を渡せば既存の判定ロジックがそのまま機能する（変更不要）

---

## Research Log

### チャージ入力の検出アルゴリズム選定

- **Context**: 「押しっぱなしでチャージ判定したい」が、しきい値なしは技術的に不明確。pointerDown / pointerUp の2イベントを使って tap と charge を区別する方法を調査。
- **Sources Consulted**: MDN Web Docs (Pointer Events), React event model, vi.useFakeTimers() pattern
- **Findings**:
  - 案α（遅延発火型）: `pointerDown` でタイマー開始 → しきい値内に `pointerUp` なら tap イベント、しきい値超過後 `pointerUp` でチャージイベント
  - 案γ（pointerUp 発火型）: `pointerDown` で開始時刻記録のみ → `pointerUp` で経過時間を見て tap / charge を決定
  - 案αは「しきい値経過後すぐにチャージ判定される」UX（指を離さなくても判定）で、FPSゲームのチャージ感覚に近い
  - 案γは「離したときに初めて判定される」UX で、意図的なリリースが必要
  - エクバのゲーム操作は「押しっぱなし中に効果が発動」ではなく「押しっぱなしで入力完了」のためゲーム外練習アプリには案γが適切
  - 案γはステートマシンがシンプル（timeoutなし、`Date.now()` 比較のみ）でテストが容易
- **Implications**: **案γ（pointerUp 発火型）を採用**。`setTimeout` を使わないため `vi.useFakeTimers()` への依存が不要。ただし `Date.now()` のモック化は `vi.setSystemTime()` で対応可能。

### チャージしきい値の決定

- **Context**: 「秒数は設定しない」とユーザーが述べているが、tap と charge を区別するには何らかの値が必要。
- **Sources Consulted**: Web標準のロングプレス検出（300ms）、Material Design長押しガイドライン（500ms）、ゲームコントローラ操作感
- **Findings**:
  - Web 標準のロングプレスは 300〜500ms が一般的
  - ゲームコントローラのチャージ操作は「意識的に押しっぱなし」なので 300ms で十分区別可能
  - ユーザーが「秒数はあえて設定しない」→ ユーザーが設定するUIは不要だが、コード上の定数は必要
- **Implications**: `export const CHARGE_THRESHOLD_MS = 300` を `useChargeInput.ts` で公開。将来的な調整が容易。

### 複合入力の実装方式（専用ボタン vs 同時押し検出）

- **Context**: サブ・特射・特格を「射撃+格闘」等の物理同時押しで検出するか、専用ボタンで実装するかの判断。
- **Sources Consulted**: 既存 `useControllerInput` の multitouch 実装、Requirement 3.5
- **Findings**:
  - 同時押し検出: `activeButtons` が `{shot, melee}` になったタイミングで `sub` イベントを発火する設計。実機に近いが「どのタイミングで複合判定するか」が曖昧（片方だけ押した瞬間は？）
  - 専用ボタン: `sub`, `special-shot`, `special-melee` それぞれをコントローラに追加し、`pointerDown` で即時発火。シンプルで要件 3.5（「個別ボタンを別々に押さなくてよい」）を満たす
  - 練習アプリとしては専用ボタンの方が操作性が高い（スマートフォンで2本指同時押しは難しい）
- **Implications**: **専用ボタン方式を採用**。`sub`, `special-shot`, `special-melee` を `useControllerInput` の通常ボタンとして追加。

### `useControllerInput` 改変 vs 新規フック分離

- **Context**: チャージ検出ロジックを既存の `useControllerInput` に組み込むか、新規フックに分離するかの判断。
- **Sources Consulted**: 既存 `useControllerInput.ts` のコード、`useControllerInput.test.ts` の14テストケース
- **Findings**:
  - `useControllerInput` は pointerDown 即時発火の設計。チャージロジックを追加すると「即時発火」と「遅延発火」が混在し複雑化
  - 既存14テストが全て pointerDown 即時発火を前提に書かれており、改変すると全テスト修正が必要
  - 新規フック `useChargeInput` として分離すれば `useControllerInput` の安定性を維持できる
- **Implications**: **`useChargeInput` を新規フックとして分離**。`useControllerInput` はゼロ変更。`ArcadeController` 内で両フックを使い分ける。

### `ButtonType` 検証ガード

- **Context**: ローカルストレージから読み込んだデータに未知の `ButtonType` が含まれる可能性。現状 `useCommandStore` は `JSON.parse` するだけで型検証がない。
- **Sources Consulted**: `useCommandStore.ts`, `useLocalStorage.ts`
- **Findings**:
  - 現在: `useLocalStorage` で `JSON.parse` → `T` にキャスト（実行時検証なし）
  - Requirement 1.3: 未知の ButtonType を parse_error としてリジェクトすること
  - `isButtonType(value: unknown): value is ButtonType` 型ガードを `src/types/index.ts` に追加することで解決
  - `useCommandStore.addCommand` での検証（書き込み時）と `useLocalStorage` 読み込み後の検証（読み込み時）の二段階が理想だが、MVP としては書き込み時検証（addCommand のバリデーション）で十分
- **Implications**: `src/types/index.ts` に `isButtonType` 型ガードを追加。`useCommandStore` での書き込み前バリデーションに使用。

---

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A: useControllerInput に全機能追加 | 既存フックにチャージ検出とチャージ型を追加 | ファイル数が増えない | 既存14テストが全破綻、単一責任原則違反 | 採用しない |
| B: useChargeInput 新規フック | チャージ検出を専用フックに分離、useControllerInput は不変 | 既存テスト保護、単一責任、独立テスト可能 | ArcadeController が2フックを保持 | **採用** |
| C: useChargeInput が useControllerInput をラップ | useChargeInput が useControllerInput を内部利用 | インターフェースが1つ | 内部依存で複雑化、不要な間接層 | 採用しない |

---

## Design Decisions

### Decision: pointerUp 発火型チャージ検出

- **Context**: チャージとタップを `pointerDown` / `pointerUp` の経過時間で区別する
- **Alternatives Considered**:
  1. 案α（遅延発火型）— `setTimeout` でしきい値後にチャージイベント自動発火
  2. 案γ（pointerUp 発火型）— `pointerUp` 時に `Date.now() - holdStartTime` で判定
- **Selected Approach**: 案γ（pointerUp 発火型）
- **Rationale**: setTimeout 不要でステートマシンがシンプル。テストでは `vi.setSystemTime()` で制御可能。ユーザーが意識的に「離す」操作をするため練習アプリとして自然なUX。
- **Trade-offs**: チャージ後、指を離すまで結果がわからない（タップとの差異がUX上明確）
- **Follow-up**: 300ms しきい値が実際のプレイ感に合うか実装後に確認

### Decision: 複合型を `ButtonType` として独立定義

- **Context**: `sub` = 射撃+格闘 を `{ buttons: ['shot', 'melee'] }` として保存するか `{ buttons: ['sub'] }` とするか
- **Alternatives Considered**:
  1. 多要素配列 — `{ buttons: ['shot', 'melee'] }` で保存、既存の同時押し判定を活用
  2. 独立型 — `{ buttons: ['sub'] }` として保存、`sub` を第一級の ButtonType として扱う
- **Selected Approach**: 独立型（`ButtonType` として `'sub'`, `'special-shot'`, `'special-melee'` を追加）
- **Rationale**: 「サブ」はゲーム用語として意味的にひとつの技。物理入力（2ボタン同時）と論理入力（サブ射撃）を分離する方が拡張性が高い。
- **Trade-offs**: 9 ButtonType に増えるが、既存の `CommandStep.buttons: ButtonType[]` モデルには完全に収まる
- **Follow-up**: 将来的に物理同時押し検出を追加する場合も独立型の方が変更が局所的

---

## Risks & Mitigations

- `Date.now()` に依存したチャージしきい値がテスト環境で不安定になる可能性 → `vi.setSystemTime()` / `vi.useFakeTimers()` でシステム時刻を制御してテストを記述
- `ArcadeController` が `useControllerInput` と `useChargeInput` の2フックを持つことでのイベント競合 → `melee`, `shot` ボタンは `useChargeInput` のみが担当、`jump`, `sub`, `special-shot`, `special-melee` は `useControllerInput` のみが担当（重複なし）
- スマートフォン横画面での8ボタン配置が手狭になる可能性 → CSSレイアウトは実装フェーズで検証（グループ別2行レイアウト推奨）
- `CommandHint` の `BUTTON_LABELS` が `Record<ButtonType, string>` のため新型追加時にコンパイルエラーで漏れを強制検出 → これは良い設計として維持する

---

## References

- MDN: Pointer Events — https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- Vitest fake timers — https://vitest.dev/guide/mocking#fake-timers (`vi.setSystemTime`)

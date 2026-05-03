# ギャップ分析レポート — extended-input-types

---

## 1. 現状調査

### 型定義 (`src/types/index.ts`)

| 現状 | 内容 |
|------|------|
| `ButtonType` | `'shot' \| 'melee' \| 'jump' \| 'awaken'`（4種のみ） |
| `CommandStep` | `{ buttons: ButtonType[] }` — **複数ボタン配列を既にサポート** |
| `Command` | `{ id, mobileSuit, name, sequence: CommandStep[], createdAt }` |

### フック層

| ファイル | 役割 | 注目点 |
|----------|------|--------|
| `useControllerInput.ts` | PointerEvent を監視しアクティブボタンを追跡 | `pointerDown` 時にコールバックを**即時**発火。保持時間の概念なし。`pointerId → ButtonType` マップで多点タッチ対応済み |
| `usePracticeSession.ts` | 練習の進行管理 | `handleButtonPress(button: ButtonType)` で単発イベント受理。`stepAccumulatorRef` で同時押し蓄積済み |
| `usePracticeLog.ts` | 試行結果をローカルストレージに保存 | 入力タイプに依存しない汎用設計 |

### UIコンポーネント

| ファイル | 注目点 |
|----------|--------|
| `ArcadeController.tsx` | `BUTTONS = ['shot', 'melee', 'jump']` とハードコード。`awaken` は型にあるが表示なし |
| `ControllerButton.tsx` | `BUTTON_LABELS: Record<ButtonType, string>` — TypeScript が新型追加時に未定義ラベルをコンパイルエラーとして検出できる |
| `CommandForm.tsx` | `BUTTON_LABELS: Record<string, string>` — 弱い型付け。新型追加してもコンパイルエラーにならない |
| `CommandHint.tsx` | `BUTTON_LABELS: Record<ButtonType, string>` — 強い型付け。新型追加時にコンパイルエラーで漏れを検出 |
| `PracticeSession.tsx` | `highlightedButton = sequence[currentIndex].buttons[0]` とハードコード。複合型の最初のボタンを表示するだけ |

---

## 2. 要件別フィージビリティ分析

### Requirement 1: 新規入力タイプのモデル定義

| 技術ニーズ | 現状 | ギャップ |
|-----------|------|---------|
| `ButtonType` 拡張 | 4種のみ | **Missing** — 5種追加が必要 |
| ストレージ検証 | `useCommandStore` でパース — バリデーションロジックなし | **Missing** — 未知の ButtonType をリジェクトする検証が必要 |

既存アーキテクチャ上の制約：
- `ControllerButton` と `CommandHint` の `BUTTON_LABELS` が `Record<ButtonType, string>` のため、型拡張時にコンパイルエラーでラベル追加漏れを検出できる（良い設計）
- `CommandForm` の `BUTTON_LABELS` は `Record<string, string>` のため型チェックが効かない → 修正推奨

### Requirement 2: チャージ入力の検出

| 技術ニーズ | 現状 | ギャップ |
|-----------|------|---------|
| 保持時間の計測 | なし | **Missing** — タイマー管理ロジックが一切存在しない |
| タップとチャージの区別 | なし | **Missing** — `pointerDown` で即時発火する現設計と競合 |
| テスト可能な設計 | `vi.useFakeTimers()` で可能 | タイマーを injectable にする必要あり |

**設計選択肢（Research Needed）**:
- **案α — 遅延発火型**: `pointerDown` でタイマー開始 → 閾値内に `pointerUp` なら通常タップイベント、閾値超過後の `pointerUp` でチャージイベント発火
- **案β — 即時＋保持デュアル**: `pointerDown` でタップイベント即発火 → 閾値経過後に別途チャージイベント発火（タップとチャージを独立させる）
- **案γ — `pointerUp` 発火型**: `pointerDown` でタイマー開始のみ → `pointerUp` 時に経過時間を見てタップ or チャージを決定

エクバの操作感に近いのは **案α（遅延発火型）** と推測されるが、UX 検証が必要。

### Requirement 3: 複合ボタン入力（サブ・特射・特格）

| 技術ニーズ | 現状 | ギャップ |
|-----------|------|---------|
| `sub`/`special-shot`/`special-melee` の入力手段 | なし | **Missing** — ボタンが存在しない |
| 1ステップとして登録 | `CommandStep.buttons[]` は複数要素をサポート済み | **一部対応** — データモデルはOK、UIが未対応 |
| 練習時の判定 | `stepAccumulatorRef` で複数ボタン蓄積は既存 | **一部対応** — 新型を1つのイベントとして扱えれば流用可能 |

**設計選択肢（Research Needed）**:
- **案A — 専用ボタン**: `sub`/`special-shot`/`special-melee` を独立ボタンとして `ArcadeController` に追加。押下で単一 `ButtonType` イベントとして発火
- **案B — 同時物理押し検出**: `activeButtons` Set が特定の組み合わせになったタイミングで複合型イベントを発火。実機操作に近い
- **案C — ハイブリッド**: 専用ボタン（コマンド登録）＋ 同時押し検出（練習モード）

Requirement 3.5「構成ボタンを個別に押さなくてよい」→ **案A か案C** が要件を満たす。案B はユーザーが同時押しを意識的に行う必要あり。

### Requirement 4: コマンド編集UIへの統合

| 技術ニーズ | 現状 | ギャップ |
|-----------|------|---------|
| 全8種をフォームに表示 | 3種のみ | **Missing** — `ArcadeController.BUTTONS` 拡張が必要 |
| ラベル表示 | `BUTTON_LABELS` 辞書が既存 | **一部対応** — 新型ラベル追加のみで対応可能 |
| ストレージ保存 | `onStepAdded → { buttons: [button] }` | **Missing** — チャージ型は `{ buttons: ['melee-charge'] }` として保存する必要あり。現在は内部で `{ buttons: [button] }` と固定ラップ |

### Requirement 5: アーケードコントローラUIへの統合

| 技術ニーズ | 現状 | ギャップ |
|-----------|------|---------|
| 新ボタンのUI表示 | `BUTTONS` 配列がハードコード | **Missing** — 配列拡張 + レイアウト調整が必要 |
| チャージ中の視覚フィードバック | `aria-pressed` / `activeButtons.has()` で既存 | **一部対応** — チャージ中かどうかを別途追跡する必要あり |
| ハイライト対応 | `highlightedButton?: ButtonType` で既存 | **一部対応** — 新型 `ButtonType` 追加で自動対応 |

### Requirement 6: 練習セッションでの判定

| 技術ニーズ | 現状 | ギャップ |
|-----------|------|---------|
| チャージイベントの評価 | `handleButtonPress` は型で評価 | **一部対応** — `melee-charge` イベントが届けば既存ロジックで評価可能 |
| 複合型の評価 | `stepAccumulatorRef` で蓄積済み | **一部対応** — 単一イベントとして届ければ既存ロジックで評価可能 |
| ヒント表示（新型） | `BUTTON_LABELS: Record<ButtonType>` | **Missing** — 新型ラベル追加のみで対応可能 |
| `highlightedButton` の計算 | `buttons[0]` のみ参照 | **Constraint** — 複合型のハイライトは現状 `sub` 等の最初の要素のみが光る。要設計判断 |

---

## 3. 実装アプローチ選択肢

### Option A: 既存コンポーネントの拡張（Extend Existing）

**変更対象**:
- `src/types/index.ts` — `ButtonType` 拡張
- `src/hooks/useControllerInput.ts` — チャージタイマー追加
- `src/features/arcade-controller/ArcadeController.tsx` — `BUTTONS` 配列拡張
- `src/features/arcade-controller/ControllerButton.tsx` — ラベル追加
- `src/features/command-editor/CommandForm.tsx` — ラベル追加
- `src/features/practice/CommandHint.tsx` — ラベル追加
- `src/features/practice/PracticeSession.tsx` — `highlightedButton` ロジック調整

**Trade-offs**:
- ✅ ファイル数が増えない、既存パターン踏襲
- ✅ `handleButtonPress` の型変更不要
- ❌ `useControllerInput` が「即時発火」と「遅延発火」を同居させることになり複雑化
- ❌ チャージ検出ロジックのテストが `useControllerInput` に混入する

### Option B: 新規コンポーネント作成（New Components）

**新規作成**:
- `src/hooks/useChargeInput.ts` — チャージ検出専用フック（`useControllerInput` をラップ or 独立）
- 複合ボタン専用 UI コンポーネント（例: `CompositeButtons.tsx`）

**変更対象**（最小）:
- `src/types/index.ts` — 型拡張のみ
- `ArcadeController.tsx` — 新フックを組み込み
- ラベル辞書への追加

**Trade-offs**:
- ✅ `useControllerInput` の単一責任を維持（PointerEvent 追跡のみ）
- ✅ チャージ検出ロジックを単独でテスト可能
- ✅ 複合ボタンUIを独立して設計・スタイリング可能
- ❌ ファイル数が増える
- ❌ フック間の責務境界を明確に設計する必要あり

### Option C: ハイブリッドアプローチ（Hybrid）**推奨**

1. **型拡張（R1）**: `src/types/index.ts` に5種追加 — 最小変更
2. **チャージ検出（R2）**: 新規 `useChargeInput` フックとして分離。`useControllerInput` は手を入れない
3. **複合ボタン（R3）**: 専用UIボタン方式（案A）を採用。`ArcadeController` に拡張ボタンエリアを追加
4. **コマンド編集・コントローラUI（R4, R5）**: `ArcadeController` 拡張 + ラベル辞書更新
5. **練習セッション（R6）**: `ArcadeController` が新フックからイベントを受け取り、既存 `handleButtonPress` に渡す。セッションロジック自体は変更最小

**Trade-offs**:
- ✅ 既存 `useControllerInput` を破壊しない
- ✅ チャージロジックを独立してテスト可能
- ✅ 段階的実装が可能（R1 → R3/R4/R5 → R2/R6 の順でも進められる）
- ❌ `ArcadeController` が2種のフックを持つため、フック間の責務を明確にする必要あり

---

## 4. 実装複雑度・リスク

| 要件 | 努力量 | リスク | 理由 |
|------|--------|--------|------|
| R1: 型定義拡張 | S | Low | 型追加のみ。TS コンパイルエラーで影響箇所が自動検出される |
| R2: チャージ検出 | M | Medium | タイマー管理・タップとチャージの区別・テスト設計に設計判断が必要 |
| R3: 複合ボタンUI | S–M | Low | 専用ボタン方式なら既存パターンの踏襲。同時押し検出にすると Medium |
| R4: コマンド編集統合 | S | Low | R1+R3 完了後はラベル追加と `BUTTONS` 配列更新のみ |
| R5: コントローラUI統合 | S–M | Low | ボタン追加 + CSS レイアウト調整。既存パターンで対応可 |
| R6: 練習セッション統合 | S | Low | チャージイベントを `melee-charge` として届ければ既存判定ロジックが流用可能 |
| **全体** | **M（3〜7日）** | **Medium** | チャージ設計決定とUIレイアウト調整が主リスク |

---

## 5. デザインフェーズへの推奨事項

### 推奨アプローチ
**Option C（ハイブリッド）** を推奨。`useControllerInput` の安定した設計を維持しつつ、チャージ検出を分離したフックで実装する。

### 優先的に決定すべき設計事項

1. **チャージ判定しきい値**: 推奨値は `300ms`（一般的なロングプレス閾値）だが、エクバの操作感に合わせた調整が必要か検討
2. **チャージ検出アルゴリズム**: 案α（遅延発火型）vs 案γ（pointerUp発火型）— UX観点の判断
3. **複合ボタンのUI配置**: アーケードコントローラの物理レイアウト上でサブ・特射・特格をどこに配置するか（既存3ボタンとのレイアウト関係）
4. **`highlightedButton` の型変更**: 現在 `ButtonType | null` — 複合型に対応するため `ButtonType[] | null` に変更する選択肢あり（`PracticeSession` の変更が必要）

### Research Needed

- [ ] エクバ実機のチャージ操作感（何ms程度の保持をチャージとみなすか）
- [ ] スマートフォン横画面での8ボタン配置の視認性・操作性（プロトタイプ `prototype/` の参考価値あり）
- [ ] `pointerDown` から `pointerUp` の間に `setTimeout` が動く場合の React 状態更新タイミング（`act()` とフェイクタイマーの組み合わせテスト）

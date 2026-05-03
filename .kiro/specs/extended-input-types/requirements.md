# Requirements Document

## Project Description (Input)
現在はコマンドが「格闘・射撃・ジャンプ」しかなく、これを組み合わせるしかないが
・格闘チャージ（秒数はあえてまで設定せず、基本的に押しっぱなしで判定したいが、技術的におすすめの方法がわからないので、検討したい。）
・射撃チャージ
・「サブ」射撃+格闘
・「特射」射撃+ジャンプ
・「特格」格闘+ジャンプ
で、追加したい

---

## Introduction

コマンドトレーナーの入力タイプを拡張し、現在の「格闘・射撃・ジャンプ」3種に加えて、格闘チャージ・射撃チャージ・サブ（射撃+格闘）・特射（射撃+ジャンプ）・特格（格闘+ジャンプ）の5種類を新たに追加する機能。これにより、エクバのコマンドをより正確に再現・練習できるようになる。

## Boundary Context

- **In scope**:
  - `ButtonType` 型の拡張（5種追加）
  - チャージ入力（保持判定）の検出ロジック
  - 複合ボタン入力（サブ・特射・特格）の入力手段と検出ロジック
  - コマンド登録フォームへの新入力タイプ追加
  - アーケードコントローラUIへの新入力タイプ反映
  - 練習セッションでの新入力タイプ判定・ヒント表示
- **Out of scope**:
  - チャージ判定の閾値をユーザーが設定できるUI（設定可能な秒数UIは設けない）
  - `awaken`（覚醒）ボタンの活用（既存型の保持のみ）
  - Firebase連携・ランキング機能
- **Adjacent expectations**:
  - 既存の格闘・射撃・ジャンプ単独入力は従来通り動作すること
  - 既存のコマンドデータ（`CommandStep`）の互換性が保たれること

---

## Requirements

### Requirement 1: 新規入力タイプのモデル定義

**Objective:** As a 開発者, I want システムが5種類の新入力タイプを型として定義している, so that コマンドデータや練習ロジックで型安全に扱えるようになる

#### Acceptance Criteria

1. The コマンドトレーナー shall define the following new `ButtonType` values: `melee-charge`（格闘チャージ）, `shot-charge`（射撃チャージ）, `sub`（サブ）, `special-shot`（特射）, `special-melee`（特格）
2. The コマンドトレーナー shall allow all new `ButtonType` values to be stored as elements of `CommandStep.buttons`
3. When loading command data from storage, the コマンドトレーナー shall validate that all `ButtonType` values in the sequence are known types and reject unknown values as parse errors

---

### Requirement 2: チャージ入力の検出

**Objective:** As a ユーザー, I want 格闘・射撃ボタンを押しっぱなしにするとチャージ入力として判定される, so that チャージ系技のコマンドを練習できるようになる

#### Acceptance Criteria

1. When a user continuously holds down the melee button, the コマンドトレーナー shall detect it as `melee-charge` input
2. When a user continuously holds down the shot button, the コマンドトレーナー shall detect it as `shot-charge` input
3. When a user briefly taps and releases a melee or shot button, the コマンドトレーナー shall NOT treat it as a charge input
4. The コマンドトレーナー shall distinguish charge input from tap input based on a hold duration threshold
5. The コマンドトレーナー shall apply a single fixed threshold value (no user-configurable setting); the appropriate threshold value shall be determined in the design phase

---

### Requirement 3: 複合ボタン入力の検出（サブ・特射・特格）

**Objective:** As a ユーザー, I want サブ・特射・特格の入力をアーケードコントローラーUIで操作できる, so that エクバの複合技コマンドを実機に近い感覚で練習できる

#### Acceptance Criteria

1. The コマンドトレーナー shall provide dedicated input mechanisms (ボタンまたは同時押し検出) to trigger `sub`, `special-shot`, and `special-melee`
2. When the user activates a `sub` input, the コマンドトレーナー shall register it as a single `CommandStep` with type `sub`
3. When the user activates a `special-shot` input, the コマンドトレーナー shall register it as a single `CommandStep` with type `special-shot`
4. When the user activates a `special-melee` input, the コマンドトレーナー shall register it as a single `CommandStep` with type `special-melee`
5. The コマンドトレーナー shall not require the user to press individual constituent buttons separately to trigger a composite input type

---

### Requirement 4: コマンド編集UIへの統合

**Objective:** As a ユーザー, I want コマンド登録フォームで新しい入力タイプを選択・追加できる, so that チャージや複合ボタンを含むコマンドを登録できるようになる

#### Acceptance Criteria

1. When a user is editing a command, the コマンドトレーナー shall present all 8 input types（既存3種 + 新規5種）as selectable options in the step-addition interface
2. When a user selects a new input type and confirms the step, the コマンドトレーナー shall append a `CommandStep` containing that type to the command sequence
3. The コマンドトレーナー shall display each input type with a clear Japanese label（格闘チャージ / 射撃チャージ / サブ / 特射 / 特格）
4. When a user saves a command containing new input types, the コマンドトレーナー shall persist the command correctly to local storage

---

### Requirement 5: アーケードコントローラUIへの統合

**Objective:** As a ユーザー, I want アーケードコントローラーのUI上でチャージ・複合入力を視覚的・操作的に行える, so that 実機に近いインターフェースで練習できる

#### Acceptance Criteria

1. The コマンドトレーナー shall display visual affordances for the 5 new input types in the arcade controller UI
2. When a new input type is activated via the controller UI, the コマンドトレーナー shall emit the corresponding input event (`onButtonPress` または `onStepAdded`)
3. While a charge input button is being held, the コマンドトレーナー shall visually indicate the button is in an active/held state
4. When the controller UI is in command-editing mode (`onStepAdded` active), the コマンドトレーナー shall allow new input types to trigger `onStepAdded` with the appropriate `CommandStep`
5. If a new input type button is displayed, the コマンドトレーナー shall highlight it when it corresponds to the currently expected step in practice mode

---

### Requirement 6: 練習セッションでの判定

**Objective:** As a ユーザー, I want 練習セッション中に新しい入力タイプが正しく判定される, so that チャージや複合技のコマンドを実際に練習・評価できるようになる

#### Acceptance Criteria

1. When a user performs a `melee-charge` or `shot-charge` input during practice, the コマンドトレーナー shall evaluate it against the expected `CommandStep` and advance or fail accordingly
2. When a user performs a `sub`, `special-shot`, or `special-melee` input during practice, the コマンドトレーナー shall evaluate it against the expected `CommandStep` and advance or fail accordingly
3. If the user performs a tap instead of a hold when a charge input step is expected, the コマンドトレーナー shall record the attempt as a failure and reset to the first step
4. While practicing a command sequence containing new input types, the コマンドトレーナー shall display visual hints consistent with existing hint behavior for each new type
5. The コマンドトレーナー shall display the correct Japanese label for each new input type in the command hint display

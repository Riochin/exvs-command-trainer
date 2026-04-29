# 要件定義書

## はじめに

エクバコマンド練習アプリ（コマンドトレーナー）のMVP要件定義。「機動戦士ガンダム エクストリームバーサス」シリーズの初心者〜中級者プレイヤーが、機体ごとのコマンド（ボタン列）をスマートフォン横画面で繰り返し練習・習得するための最小機能セットを定義する。

プロトタイプ（`prototype/`）では射撃・格闘・ジャンプの3ボタンとズンダコマンド判定を実証済みであり、本要件はそのUXを発展させたものとなる。

## スコープ

- **対象**: アーケードコントローラUIでのコマンド入力・判定、コマンド登録・管理（ローカルストレージ）、練習セッションと結果の確認
- **対象外**: ユーザー認証、Firebase連携、ランキング公開・スコア共有、オンライン機能
- **隣接仕様**: プロトタイプ（`prototype/`）のUI・コマンド判定ロジックを参考に、React + TypeScriptで再実装する

## 要件

### Requirement 1: アーケードコントローラUI

**目的:** エクバプレイヤーとして、実機に近いアーケードコントローラのボタン配置をスマートフォン画面上でタッチ操作できる環境がほしい。そうすることで、外出先でも指運びを身体で練習できる。

#### 受け入れ基準

1. The コマンドトレーナー shall display arcade controller action buttons (射撃、格闘、ジャンプ) and an activation button (覚醒) arranged in landscape-oriented layout optimized for one-handed or two-handed touch play.
2. When ユーザーがボタン領域をタッチしたとき, the コマンドトレーナー shall register the corresponding button press and apply a pressed visual state to the button.
3. When ユーザーがボタン領域のタッチを離したとき, the コマンドトレーナー shall register the button release and restore the button to its default visual state.
4. While スマートフォンが横画面（landscape）で表示されているとき, the コマンドトレーナー shall render all controller buttons within the visible viewport without requiring scrolling.
5. If デバイスが縦画面（portrait）で開かれたとき, the コマンドトレーナー shall display a message prompting the user to rotate to landscape orientation.
6. The コマンドトレーナー shall support simultaneous multi-touch input so that combination button presses (e.g., 射撃+格闘) are detected correctly.
7. The コマンドトレーナー shall apply the logical-to-physical coordinate transformation pattern (established in the prototype) to ensure correct touch hit detection on all supported devices and viewport sizes.

### Requirement 2: コマンド登録・管理

**目的:** エクバプレイヤーとして、機体ごとに練習したいコマンド（ボタン列）を登録・一覧・削除できるようにしたい。そうすることで、特定機体のコマンドに絞って練習を管理できる。

#### 受け入れ基準

1. When ユーザーが機体名・コマンド名・ボタン列を入力して登録を実行したとき, the コマンドトレーナー shall save the command to local storage and display it in the command list.
2. The コマンドトレーナー shall display all registered commands grouped by mobile suit name.
3. When ユーザーが一覧からコマンドを選択したとき, the コマンドトレーナー shall show the full button sequence of that command.
4. When ユーザーがコマンド削除を操作したとき, the コマンドトレーナー shall request confirmation before permanently removing the command from local storage.
5. If ローカルストレージへの書き込みが失敗したとき, the コマンドトレーナー shall display an error message and retain the unsaved data in the form for retry.
6. The コマンドトレーナー shall validate that a command name and at least one button input are provided before enabling the save action.

### Requirement 3: 練習モード

**目的:** エクバプレイヤーとして、登録したコマンドをアーケードコントローラUIで繰り返し入力練習したい。そうすることで、正確な指運びをリズムごと身体に定着させられる。

#### 受け入れ基準

1. When ユーザーが練習するコマンドを選択して練習を開始したとき, the コマンドトレーナー shall display the target command sequence as a reference guide throughout the session.
2. While 練習セッションが進行中のとき, the コマンドトレーナー shall capture the user's button input sequence in real time via the arcade controller UI.
3. When ユーザーの入力シーケンスが目標コマンドと完全に一致したとき, the コマンドトレーナー shall judge the attempt as success, display a success indicator, and record the result to the practice log.
4. When ユーザーの入力シーケンスに誤ったボタンが含まれたとき, the コマンドトレーナー shall judge the attempt as failure, display a failure indicator, and record the result to the practice log.
5. When 1回の試行（成功または失敗）が完了したとき, the コマンドトレーナー shall automatically reset the input sequence buffer and be ready for the next attempt without requiring additional user action.
6. When ユーザーが練習セッションを終了する操作をしたとき, the コマンドトレーナー shall stop capturing input and transition to the result summary screen.

### Requirement 4: 練習進捗ヒント表示

**目的:** エクバプレイヤーとして、練習中に目標コマンドの次に押すべきボタンを視覚的に把握したい。そうすることで、迷わずに練習リズムを維持できる。

#### 受け入れ基準

1. While 練習セッションが進行中のとき, the コマンドトレーナー shall highlight the next expected button in the target command sequence on the controller UI or command display.
2. When ユーザーが正しいボタンを押したとき, the コマンドトレーナー shall advance the highlight to the next expected button in the sequence.
3. When ユーザーが誤ったボタンを押したとき, the コマンドトレーナー shall reset the highlight to the first button of the command sequence.

### Requirement 5: 練習結果の確認

**目的:** エクバプレイヤーとして、練習セッションの成功率・試行回数をリアルタイムと事後の両方で確認したい。そうすることで、自分の上達度合いと課題を把握できる。

#### 受け入れ基準

1. While 練習セッションが進行中のとき, the コマンドトレーナー shall display the current session's attempt count and success count.
2. When 練習セッションが終了したとき, the コマンドトレーナー shall display a summary screen showing total attempts, success count, and success rate (%).
3. The コマンドトレーナー shall display the practice history per command, showing success rate and last practiced date, using logs stored in local storage.
4. If 対象コマンドの練習ログが存在しないとき, the コマンドトレーナー shall display a message indicating that no practice history exists for that command.

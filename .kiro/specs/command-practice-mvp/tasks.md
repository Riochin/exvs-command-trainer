# 実装計画

## タスク一覧

- [ ] 1. Foundation: プロジェクト基盤とドメイン型
- [x] 1.1 Next.js App Router プロジェクトの初期化
  - pnpm + TypeScript strict モードで Next.js App Router プロジェクトを作成する
  - `tsconfig.json` の `strict: true` と `@/` パスエイリアス（`src/` 向け）を設定する
  - パスエイリアスが `import { ButtonType } from '@/types'` の形式で解決できることを確認する
  - _Requirements: 1.1, 2.1_

- [x] 1.2 ドメイン型の定義
  - ボタン種別（射撃・格闘・ジャンプ・覚醒）を表す `ButtonType` 型を定義する
  - 同時押しを含む1ステップを表す `CommandStep` 型を定義する（`buttons: ButtonType[]`）
  - 登録済みコマンド（`Command`）、練習試行結果（`PracticeAttempt`）、練習ログ（`PracticeLog`）の型を定義する
  - 練習セッション状態（`PracticeSessionState`）と状態区分（`PracticeSessionStatus: 'idle' | 'active' | 'completed'`）を定義する
  - `StorageResult<T>` と `StorageError` の判別型でストレージエラーを型安全に表現できる
  - 型定義ファイルをインポートした TypeScript ファイルが型エラーなくコンパイルされることを確認する
  - _Requirements: 1.1, 1.2, 1.6, 2.1, 3.2, 3.3_

- [x] 2. Foundation: SSR 安全な汎用ストレージフックの実装
  - Next.js の SSR フェーズでは `defaultValue` を返し、クライアント mount 後に localStorage の値を反映するフックを実装する
  - 任意の JSON シリアライズ可能な型 `T` に対してジェネリクスで型安全な読み書きを提供する
  - `QuotaExceededError` および `JSON.parse` 失敗を `StorageResult<T>` の `ok: false` として返す
  - hydration 前後を区別する `isLoading` フラグを公開する
  - `useLocalStorage('key', [])` を呼び出すと、SSR 環境でエラーが発生せず `[]` が返ることを確認する
  - _Requirements: 2.1, 2.5_

- [x] 3. Core: コマンドとログのストレージドメインフック
- [x] 3.1 (P) コマンド CRUD を提供する useCommandStore の実装
  - コマンドの追加・削除・検索（ID指定・機体名フィルタ）機能を実装する
  - 追加時は UUID v4 形式の ID と `createdAt` タイムスタンプを自動付与する
  - 機体名・コマンド名・1ステップ以上のシーケンスが揃わない場合、保存を拒否してバリデーションエラーを返す
  - コマンド削除時は対応する練習ログを `usePracticeLog` から同時に削除する（孤立データ防止）
  - `addCommand` 呼び出し後、`commands` 配列に新コマンドが含まれ localStorage の `ct_commands` キーに永続化されることを確認する
  - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6_
  - _Boundary: useCommandStore_

- [x] 3.2 (P) 練習ログを管理する usePracticeLog の実装
  - コマンド ID 単位で試行結果（成功/失敗・タイムスタンプ）を追記記録する機能を実装する
  - コマンド ID を指定して練習ログを取得する機能を実装する（ログ未存在時は `null` を返す）
  - ログが存在しない場合は `null` ではなく適切なフォールバックを公開する
  - `recordAttempt` 呼び出し後、`getLog(commandId)` が追記された試行結果を含んで返ることを確認する
  - _Requirements: 3.3, 3.4, 5.3, 5.4_
  - _Boundary: usePracticeLog_

- [ ] 4. (P) Core: タッチ入力と横画面検出フック
- [x] 4.1 (P) マルチタッチ入力を追跡する useControllerInput の実装
  - Pointer Events API（`onPointerDown`/`onPointerUp`/`onPointerCancel`）で各ボタンの押下状態を追跡する
  - `pointerId` を使って複数タッチポイントを独立管理し、同時に複数ボタンを押下できる
  - 各ボタンコンポーネントに渡す Pointer Events ハンドラをボタン種別ごとに返すファクトリ関数を提供する
  - 練習セッション中に呼ばれるボタン押下コールバック（`onButtonPress`）を登録・解除できる
  - 2本指で別々のボタンを同時タッチした場合、`activeButtons` に両方が含まれることを確認する
  - _Requirements: 1.2, 1.6, 1.7_
  - _Boundary: useControllerInput_

- [x] 4.2 (P) 横画面状態を検出する useLandscapeMode の実装
  - `window.matchMedia("(orientation: landscape)")` を使ってリアクティブに横/縦画面を検出する
  - Safari の `screen.orientation` 非対応を回避するため `matchMedia` API のみを使用する
  - SSR フェーズでは `isLandscape: null` を返し、クライアント mount 後に実際の向きを反映する
  - デバイスを縦から横に回転させると `isLandscape` が `false` から `true` に切り替わることを確認する
  - _Requirements: 1.3, 1.4_
  - _Boundary: useLandscapeMode_

- [x] 5. Core: アーケードコントローラ UI コンポーネントの実装
- [x] 5.1 個別ボタンコンポーネント（ControllerButton）の実装
  - ボタン種別に対応した日本語ラベル（射撃・格闘・ジャンプ・覚醒）を表示する
  - `touch-action: none` を CSS で設定し、ブラウザのデフォルトタッチ動作を抑制する
  - 押下中（`activeButtons` に含まれる）の場合、視覚的に押下状態スタイルを適用する
  - ハイライト指定（`highlighted`）の場合、次のボタンとして区別できる視覚スタイルを適用する
  - タッチ・マウスの両入力で押下スタイルが正しく切り替わることを確認する
  - _Requirements: 1.1, 1.2_

- [x] 5.2 コントローラ全体レイアウトコンポーネント（ArcadeController）の実装
  - 射撃・格闘・ジャンプ・覚醒の4ボタンを横画面レイアウトに配置する
  - 練習モードと登録モードを `onButtonPress`（練習）と `onStepAdded`（登録）Props で切り替える
  - `useControllerInput` を内部で使用し、`onButtonPress`/`onStepAdded` をコールバックとして接続する
  - ハイライトすべきボタンを `CommandHint` から受け取り、`ControllerButton` に伝達する
  - 4ボタンがスマートフォン横画面（320×568px 相当のビューポート）でスクロールなく表示されることを確認する
  - _Requirements: 1.1, 1.2, 1.3, 1.6_

- [x] 6. (P) Core: 縦画面ガードコンポーネント（LandscapeGuard）の実装
  - `useLandscapeMode` を内部で使用し、縦画面（`isLandscape === false`）の場合にコンテンツをブロックする
  - 縦画面時は横向きへの回転を促すメッセージと回転アイコンを表示する
  - SSR hydration 前（`isLandscape === null`）は CLS を防ぐためコンテンツをそのまま表示する
  - デバイスを縦向きにすると練習UIの代わりに回転促進メッセージが表示されることを確認する
  - _Requirements: 1.4, 1.5_
  - _Boundary: LandscapeGuard_
  - _Depends: 4.2_

- [x] 7. Core: コマンド管理 UI コンポーネントの実装
- [x] 7.1 (P) コマンド一覧と削除確認（CommandList + ConfirmDialog）の実装
  - 登録済みコマンドを機体名でグループ化し一覧表示する
  - 各コマンドの削除操作をクリックすると確認ダイアログを表示する
  - ユーザーが確認した場合のみ `useCommandStore.removeCommand` を呼び出してコマンドを削除する
  - ダイアログでキャンセルした場合はコマンドが削除されず一覧に残ることを確認する
  - _Requirements: 2.2, 2.4_
  - _Boundary: CommandList, ConfirmDialog_

- [x] 7.2 (P) コマンド登録フォーム（CommandForm）の実装
  - 機体名・コマンド名の入力フィールドと、`ArcadeController` を組み込んだシーケンス構築エリアを提供する
  - ボタンをタップするたびに `CommandStep` がシーケンスプレビューに追加される
  - 機体名・コマンド名が未入力、またはシーケンスが空の場合は保存ボタンを無効化する
  - localStorage 書き込みエラー時はエラーメッセージを表示し、入力データを保持する
  - 有効なコマンドを登録すると `ct_commands` に保存され、コマンド一覧に表示されることを確認する
  - _Requirements: 2.1, 2.5, 2.6_
  - _Boundary: CommandForm_

- [x] 7.3 (P) コマンド詳細表示（CommandDetail）の実装
  - コマンド名・機体名・ボタンシーケンスを視覚的に表示する
  - ボタンシーケンスは各ステップの同時押しボタンを区別できる形で表現する
  - 存在しないコマンド ID を指定した場合は「コマンドが見つかりません」メッセージを表示する
  - コマンドのボタン列が正しい順序と同時押し表現でレンダリングされることを確認する
  - _Requirements: 2.3_
  - _Boundary: CommandDetail_

- [x] 8. (P) Core: 練習セッション機能の実装
- [x] 8.1 コマンドシーケンス照合ステートマシン（usePracticeSession）の実装
  - `useReducer` で練習セッション状態（`idle`/`active`/`completed`）を管理する
  - ボタン押下イベントを受け取り、現在のシーケンスステップと照合する（同時押しは集合の部分集合判定）
  - 照合成功でインデックスを進め、最終ステップ到達で成功判定・自動リセットする
  - 誤入力で失敗判定・インデックスをゼロにリセットし、次の試行を即座に受け付ける
  - 各試行（成功・失敗）の結果を `usePracticeLog.recordAttempt` で自動記録する
  - ズンダコマンド（ジャンプ→ジャンプ→射撃）を入力して3ステップ目の射撃で成功判定されることを確認する
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 4.2, 4.3_
  - _Boundary: usePracticeSession_

- [x] 8.2 (P) 次ボタンハイライト表示（CommandHint）の実装
  - 目標コマンドのステップ列を表示し、現在のインデックスに対応するボタンをハイライトする
  - セッション状態の `currentIndex` が変化すると、ハイライト位置がリアクティブに更新される
  - 誤入力によるリセット後は先頭ステップが再ハイライトされることを確認する
  - _Requirements: 4.1, 4.2, 4.3_
  - _Boundary: CommandHint_

- [x] 8.3 (P) セッション終了サマリ（SessionResult）の実装
  - セッション内の総試行数・成功数・成功率（%）を計算して表示する
  - 「もう一度」（セッション再開）と「終了」（一覧へ戻る）のアクションを提供する
  - 試行が0回の場合でも表示がクラッシュせず「まだ練習していません」等を表示することを確認する
  - _Requirements: 5.2_
  - _Boundary: SessionResult_

- [x] 8.4 練習セッションコンテナ（PracticeSession）の実装
  - コマンド選択後に練習を開始し、`ArcadeController`・`CommandHint`・試行カウンタを統合する
  - セッション中はリアルタイムで試行回数と成功数を表示する
  - セッション終了操作で `usePracticeSession.end()` を呼び出し、`SessionResult` に遷移する
  - コマンド選択から練習開始→複数回試行→セッション終了→サマリ表示の一連のフローが動作することを確認する
  - _Requirements: 3.1, 3.2, 3.6, 5.1_
  - _Boundary: PracticeSession_

- [ ] 9. (P) Core: 練習履歴コンポーネント（PracticeHistory）の実装
  - コマンドごとの練習履歴（成功率・最終練習日時・試行回数）を一覧表示する
  - `usePracticeLog.getLog` でログを取得し、統計値を計算して表示する
  - 指定コマンドの練習ログが存在しない場合は「まだ練習していません」メッセージを表示する
  - 練習セッションを3回実施した後、履歴画面に成功率と試行回数が正しく表示されることを確認する
  - _Requirements: 5.3, 5.4_
  - _Boundary: PracticeHistory_
  - _Depends: 3.2_

- [ ] 10. Integration: App Route ページの実装
- [ ] 10.1 ホームページ（コマンド一覧）の実装
  - `/` ルートに `CommandList` と `LandscapeGuard` を組み込み、登録コマンドの一覧と練習開始への導線を提供する
  - コマンドが0件の場合は登録を促すメッセージと登録ページへのリンクを表示する
  - `/` にアクセスするとコマンドが機体名でグループ化されて表示されることを確認する
  - _Requirements: 1.4, 2.2, 2.4_

- [ ] 10.2 コマンド登録・詳細ページの実装
  - `/commands/new` に `CommandForm` を配置し、コマンド登録から一覧へのリダイレクトを実装する
  - `/commands/[id]` に `CommandDetail` と `PracticeHistory` を配置し、練習開始ボタンへの導線を提供する
  - 存在しないコマンド ID のページを開くと 404 相当のメッセージが表示されることを確認する
  - _Requirements: 2.1, 2.3, 2.6, 5.3, 5.4_

- [ ] 10.3 練習セッションページの実装
  - `/practice/[commandId]` に `PracticeSession` と `LandscapeGuard` を配置する
  - 縦画面時は `LandscapeGuard` が練習UIをブロックし回転促進メッセージを表示する
  - URL でコマンド ID を直接指定して練習セッションが正常に開始されることを確認する
  - _Requirements: 1.4, 3.1, 3.2, 3.6_

- [ ] 11. Validation: テストの実装
- [ ] 11.1 ストレージフックの単体テスト
  - `useLocalStorage` の SSR 安全性（`window` 未定義環境での `defaultValue` 返却）をテストする
  - `useCommandStore` のコマンド追加・削除・バリデーション失敗をテストする
  - `usePracticeLog` の試行記録と取得をテストする
  - _Requirements: 2.1, 2.5, 2.6, 5.3, 5.4_

- [ ] 11.2 usePracticeSession シーケンス照合の単体テスト
  - 正しいボタン順序での成功判定をテストする（単押し・同時押し両方）
  - 誤ったボタン入力での失敗判定とインデックスリセットをテストする
  - セッション開始・終了のステータス遷移をテストする
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 4.2, 4.3_

- [ ] 11.3 コマンド登録フローの統合テスト
  - `CommandForm` → `useCommandStore` → localStorage のコマンド登録 End-to-End をテストする
  - 削除確認ダイアログでのキャンセルでコマンドが保持されることをテストする
  - _Requirements: 2.1, 2.4, 2.6_

- [ ]* 11.4 ズンダコマンド練習の E2E テスト
  - ズンダコマンド（ジャンプ→ジャンプ→射撃）を登録し、練習セッションで成功するフルパスをテストする
  - 練習終了後のサマリで成功率が正しく計算されることをテストする
  - _Requirements: 3.1, 3.2, 3.3, 3.6, 5.1, 5.2_

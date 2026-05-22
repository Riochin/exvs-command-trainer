# 実装タスクリスト: data-analytics

## タスク概要

| フェーズ | 内容 |
|---------|------|
| 1. Foundation | 依存パッケージ・DB基盤・OAuth 設定 |
| 2. Core: Server | アナリティクス Route Handler 群 |
| 3. Core: Client（Task 2 と並列実行可） | クライアント側アナリティクス基盤 |
| 4. Core: Hooks | アナリティクスフック群 |
| 5. Integration | 既存コードへの統合 |
| 6. Validation | テスト |

---

- [x] 1. Foundation: 依存パッケージ・DB基盤・認証設定
- [x] 1.1 依存パッケージのインストールと環境変数テンプレートの整備
  - `next-auth@beta`・`drizzle-orm`・`drizzle-kit`・`@libsql/client`・`uuid` を pnpm でインストール
  - `.env.local.example` に `AUTH_SECRET`・`AUTH_GOOGLE_ID`・`AUTH_GOOGLE_SECRET`・`TURSO_DATABASE_URL`・`TURSO_AUTH_TOKEN` を追記
  - `pnpm dev` が必要な環境変数をセット後に正常起動すること
  - _Requirements: 1.1_

- [x] 1.2 Drizzle ORM スキーマと Turso DB クライアントの実装
  - `users`・`practice_sessions`・`practice_attempts`・`page_views`・`events` の 5 テーブルを Drizzle スキーマで定義
  - `client_id`・`user_id`・`session_id`・`command_id` 等に必要なインデックスを定義
  - Drizzle + Turso クライアントのシングルトンを実装し、`TURSO_DATABASE_URL` で接続する
  - `drizzle.config.ts` を作成し、`pnpm drizzle-kit push` でスキーマが Turso に適用できること
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 7.1, 8.1, 8.2_

- [x] 1.3 Auth.js Google OAuth 設定と認証 Route Handler の実装
  - `lib/auth.ts` に `next-auth@beta` を使って Google OAuth プロバイダーを設定
  - `signIn` コールバック内で `users` テーブルへの UPSERT を実装し、ログイン後に必ずユーザーレコードが存在すること
  - `app/api/auth/[...nextauth]/route.ts` に Auth.js ハンドラを配置
  - `GET /api/auth/signin/google` が Google 認証リダイレクトを返すこと
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

---

- [x] 2. Core: アナリティクス API Route Handler 群
- [x] 2.1 練習セッション作成・更新 Route Handler の実装
  - `POST /api/analytics/sessions` でセッションレコードを作成し `{ sessionId }` を返す
  - `PATCH /api/analytics/sessions/[id]` でセッション終了情報（`ended_at`・`total_attempts`・`success_count`・`duration_ms`・`abandoned`・`attempts_to_first_success`・`best_attempt_ms`）を更新
  - `INSERT OR IGNORE` で冪等性を保証し、重複リクエスト時も安全に処理すること
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 2.2 (P) 練習試行記録 Route Handler の実装
  - `POST /api/analytics/attempts` で試行レコードを作成し `{ ok: true }` を返す
  - `step_timings`（JSON）・`input_sequence`（JSON）を含む全フィールドを処理すること
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - _Boundary: attempts Route Handler_

- [x] 2.3 (P) ページビュー・行動イベント記録 Route Handler の実装
  - `POST /api/analytics/pageviews` でページビューレコードを作成し `{ ok: true }` を返す
  - `POST /api/analytics/events` でイベントレコードを作成し `{ ok: true }` を返す
  - `payload` フィールドを汎用 JSON で保持し、スキーマ変更なしに新規イベント種別を追加できること
  - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4_
  - _Boundary: pageviews Route Handler, events Route Handler_

- [x] 2.4 (P) 統計取得 Route Handler の実装
  - `GET /api/analytics/stats` でコマンドごとの練習回数・成功率・平均入力速度・ステップ別失敗率を集計して返す
  - 過去 N 日間の日次練習回数推移を集計する
  - 未認証時は `?clientId=` クエリパラメータで匿名データを絞り込んで返す
  - 統計データが存在しない場合は空の `StatsResponse` を返し、エラーにしないこと
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - _Boundary: stats Route Handler_

- [x] 2.5 (P) localStorage マイグレーション Route Handler の実装
  - `POST /api/analytics/migrate` で認証チェックを行い、`commands` と `practice_logs` を DB に一括 INSERT する
  - 未認証時は 401 を返す
  - `INSERT OR IGNORE` で冪等性を保証し、成功時 `{ migratedCommands, migratedLogs }` を返すこと
  - _Requirements: 7.1, 7.2, 7.3_
  - _Boundary: migrate Route Handler_

---

- [x] 3. (P) Core: クライアント側アナリティクス基盤
- [x] 3.1 アナリティクス型定義と API クライアントモジュールの実装
  - `features/analytics/types.ts` に `StatsResponse`・`CommandStat`・`StepFailureRate`・`DailyPractice` を定義
  - `features/analytics/apiClient.ts` に全 API 呼び出し関数を実装（`postSession`・`patchSession`・`postAttempt`・`postPageView`・`postEvent`・`postMigrate`・`getStats`）
  - `void` 返却の関数は `fetch().catch(() => {})` パターンで例外をサイレント処理し、API 失敗時に例外をスローしないこと
  - _Requirements: 4.6, 5.3, 8.1_
  - _Boundary: analyticsApiClient, analytics types_

- [x] 3.2 (P) useClientId フックの実装
  - `features/analytics/useClientId.ts` を実装し、初回アクセス時に UUID を生成して `localStorage` の `ct_client_id` に保存する
  - SSR 中は空文字列を返し、`useEffect` 実行後に必ず非空の UUID を返すこと
  - 2 回目以降のアクセスでは `localStorage` から同一 UUID を読み込むこと
  - _Requirements: 2.1_
  - _Boundary: useClientId_

---

- [x] 4. Core: アナリティクスフック群
- [x] 4.1 useAnalytics 統合フックの実装
  - `features/analytics/useAnalytics.ts` を実装し、認証状態に応じて `userId`（認証済み）と `clientId`（常時）を各 API リクエストに付与する
  - `trackSessionStart`・`trackAttempt`・`trackSessionEnd`・`trackPageView`・`trackEvent` を全て実装
  - 全メソッドが fire-and-forget で戻り値なし・例外なしで動作すること
  - _Requirements: 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.1, 6.1, 6.2, 6.3, 6.4_
  - _Depends: 3.1, 3.2_

- [x] 4.2 (P) useMigration フックの実装
  - `features/analytics/useMigration.ts` を実装し、認証済みかつ `ct_synced_at` が未設定の場合にマイグレーション API を自動呼び出しする
  - 成功時のみ `ct_synced_at` を `localStorage` に書き込む
  - 失敗時は `ct_synced_at` を書き込まず、`localStorage` データを保持したまま次回ログイン時に再試行できる状態を維持すること
  - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - _Boundary: useMigration_
  - _Depends: 3.1_

- [x] 4.3 (P) AuthButton コンポーネントの実装
  - `components/AuthButton.tsx` を `'use client'` コンポーネントとして実装し、認証済み時はアバター画像と表示名を表示する
  - 未認証時はログインボタンを表示し、タップで `signIn('google')` を呼び出す
  - ログアウトボタンで `signOut()` を呼び出し、未認証状態に戻ること
  - _Requirements: 1.6_
  - _Boundary: AuthButton_

---

- [x] 5. Integration: 既存コードへのアナリティクス統合
- [x] 5.1 usePracticeSession フックへのタイミング計測・コールバック拡張
  - `UsePracticeSessionOptions` インターフェース（`sessionId`・`onSessionStart`・`onAttemptComplete`・`onSessionEnd`）を既存フックに追加
  - ステップごとのタイミング計測を `useRef` で実装し、再レンダリングを引き起こさない
  - `options` が未指定の場合、既存の動作と完全互換であること（既存テストが変化しない）
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5.2 PracticeSession.tsx への useAnalytics 連携
  - `PracticeSession.tsx` から `usePracticeSession` に analytics options を渡し、セッション開始・試行完了・セッション終了を自動記録する
  - 練習画面の既存 UX に一切変更がなく、analytics 処理の失敗が練習操作をブロックしないこと
  - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5_
  - _Depends: 5.1_

- [x] 5.3 (P) コマンド管理・フリー練習画面へのイベントトラッキング追加
  - コマンド登録成功時に `command_created` イベント（機体名・ステップ数 payload）を記録する
  - コマンド削除成功時に `command_deleted` イベントを記録する
  - フリー練習画面の利用時に `free_play_used` イベントを記録する
  - イベント送信の失敗が各画面の UI に影響しないこと
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Boundary: commands pages, free play page_

- [x] 5.4 AnalyticsPageViewTracker と Root Layout の統合
  - `features/analytics/AnalyticsPageViewTracker.tsx` を実装し、ルート変化を検知してページビューを自動記録する（null render）
  - `app/layout.tsx` に `SessionProvider` ラッパーと `AnalyticsPageViewTracker` を追加する
  - `components/HamburgerMenu.tsx` に `AuthButton` を組み込む
  - ページ遷移のたびにページビューが非同期・非ブロッキングで自動記録されること
  - _Requirements: 1.6, 5.1, 5.2, 5.3_
  - _Depends: 5.2, 5.3_

---

- [x] 6. Validation: テスト
- [x] 6.1 クライアント側フックのユニットテスト
  - `useClientId`: 初回 UUID 生成・2 回目以降同一値・SSR 中空文字列の各ケースを検証
  - `useMigration`: `ct_synced_at` あり/なし・API 成功/失敗の条件分岐を検証
  - `analyticsApiClient`: `fetch` 失敗時に例外をスローしないことを検証
  - 全ユニットテストが通ること
  - _Requirements: 2.1, 4.6, 7.1, 7.2, 7.3_

- [x] 6.2 Route Handler 統合テスト
  - `POST /api/analytics/sessions` → `PATCH /api/analytics/sessions/[id]` の一連フローを検証
  - `GET /api/analytics/stats`（未認証: `?clientId=` 指定）のデータ返却を検証
  - `signIn` コールバックでの `users` テーブルへの UPSERT（新規作成・重複更新の両方）を検証
  - 全統合テストが通ること
  - _Requirements: 1.2, 3.1, 3.2, 8.3_

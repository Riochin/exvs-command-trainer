# Requirements Document

## Introduction

EXVSコマンド道場において、プレイヤーの練習データ（練習回数・成功率・入力速度・失敗パターンなど）とサービス全体のアクセス状況を収集・分析する基盤を構築する。Turso (libSQL) をバックエンドDBとし、Google OAuth によるユーザー登録を導入することで、デバイスをまたいだデータの永続化と個人の上達履歴の可視化を実現する。匿名ユーザーもブラウザ固有ID (client_id) で追跡し、ログイン後にデータを統合する。

## Boundary Context

- **In scope**: ユーザー認証（Google OAuth）、練習セッション・試行データのDB記録、ページビュー記録、行動イベントログ、匿名ユーザー追跡（client_id）、localStorageからのデータ移行、統計取得API
- **Out of scope**: ランキング公開・比較機能（将来スペック）、管理者ダッシュボードUI（将来スペック）、メール/パスワード認証
- **Adjacent expectations**: 既存の `usePracticeSession`・`useCommandStore`・`usePracticeLog` フックとの統合が必要。UI側のUXは変えない（データ収集は副作用として行う）

---

## Requirements

### Requirement 1: Google OAuth によるユーザー認証

**Objective:** プレイヤーとして、Googleアカウントでログインしたい。デバイスをまたいでも自分の練習データを引き継げるようにするため。

#### Acceptance Criteria

1. When ユーザーがログインボタンをタップした, the Analytics Service shall Google OAuth 認証フローを開始する
2. When Google OAuth 認証が成功した, the Analytics Service shall ユーザーレコードを新規作成または既存レコードと紐付け、認証済み状態にする
3. When 認証済みユーザーがページをリロードした, the Analytics Service shall セッションを復元し認証状態を維持する
4. When ユーザーがログアウトした, the Analytics Service shall セッショントークンを無効化し未認証状態に戻す
5. If Google OAuth 認証が失敗した, the Analytics Service shall エラーを表示しログイン前の状態を維持する
6. The Analytics Service shall ヘッダーにログイン状態（アバター画像・表示名またはログインボタン）を常時表示する

---

### Requirement 2: 匿名ユーザートラッキング（client_id）

**Objective:** サービス運営者として、未ログインユーザーの利用状況も把握したい。全体の利用実態を正確に計測するため。

#### Acceptance Criteria

1. When 未認証ユーザーが初回アクセスした, the Analytics Service shall ブラウザ固有のUUIDを生成し localStorage の `ct_client_id` に保存する
2. The Analytics Service shall すべてのデータ記録（練習試行・ページビュー・イベント）にclient_idを付与する
3. When ユーザーがログインした, the Analytics Service shall そのclient_idをuser_idと紐付け、以降の記録にuser_idとclient_idの両方を付与する
4. While ユーザーが未ログインの間, the Analytics Service shall client_idのみを識別子として練習データとアクセスデータを記録する

---

### Requirement 3: 練習セッション記録

**Objective:** プレイヤーとして、練習セッション単位のデータを記録したい。いつ・何回・どのコマンドを練習したかを後から振り返れるようにするため。

#### Acceptance Criteria

1. When ユーザーが練習画面を開いた, the Analytics Service shall practice_sessions レコードを作成し started_at を記録する
2. When 練習セッションが終了した（画面離脱または完了）, the Analytics Service shall ended_at・total_attempts・success_count・duration_ms・abandoned フラグを更新する
3. The Analytics Service shall セッション開始時点のコマンドスナップショット（JSON）を保存し、コマンド変更後もセッション記録が追跡できるようにする
4. The Analytics Service shall 練習セッションにデバイス種別（mobile / desktop）を記録する
5. Where タイムリミット設定が有効の場合, the Analytics Service shall time_limit_ms を記録する
6. The Analytics Service shall セッション内の初成功までの試行回数（attempts_to_first_success）とセッション内最速成功タイム（best_attempt_ms）を更新する

---

### Requirement 4: 練習試行の詳細記録（入力速度・失敗分析）

**Objective:** プレイヤーとして、1回ごとの試行データを記録したい。どのステップで詰まるか・入力がどれだけ速くなったかを把握し上達に活かすため。

#### Acceptance Criteria

1. When 練習試行が完了（成功または失敗）した, the Analytics Service shall practice_attempts レコードを作成する
2. The Analytics Service shall 各試行に success（0/1）・step_reached・failure_step・total_duration_ms（試行全体の入力速度）を記録する
3. The Analytics Service shall ステップごとの入力時間（step_timings: `[{step: number, duration_ms: number}]`）をJSONで記録する
4. If 試行が失敗した, the Analytics Service shall 実際に入力されたボタン列（input_sequence JSON）を記録する（失敗パターン分析用）
5. The Analytics Service shall セッション内の試行順（attempt_index, 0-indexed）を記録する
6. If API への送信が失敗した, the Analytics Service shall 練習画面のUXに影響を与えず（fire-and-forget）エラーをサイレントに処理する

---

### Requirement 5: ページビュー・アクセス数記録

**Objective:** サービス運営者として、ページごとのアクセス数・流入経路・デバイス比率を把握したい。人気機能と改善優先度を判断するため。

#### Acceptance Criteria

1. When ユーザーがページに遷移した, the Analytics Service shall page_views レコードを作成し path・referrer・user_agent を記録する
2. The Analytics Service shall ログインユーザーには user_id を、未ログインユーザーには client_id のみを付与して記録する
3. The Analytics Service shall ページビュー記録の処理失敗がユーザー体験に影響しないよう非同期かつ非ブロッキングで実行する

---

### Requirement 6: 行動イベントログ

**Objective:** サービス運営者として、コマンド登録・削除・フリー練習利用などのユーザー行動を記録したい。機能ごとのエンゲージメントと利用フローを把握するため。

#### Acceptance Criteria

1. When ユーザーがコマンドを新規登録した, the Analytics Service shall events テーブルに `command_created` イベントを記録する（payload: 機体名・ステップ数）
2. When ユーザーがコマンドを削除した, the Analytics Service shall events テーブルに `command_deleted` イベントを記録する
3. When ユーザーがフリー練習画面を利用した, the Analytics Service shall events テーブルに `free_play_used` イベントを記録する
4. The Analytics Service shall events テーブルの event_type を汎用 JSON payload で管理し、スキーマ変更なしに新規イベント種別を追加できるようにする

---

### Requirement 7: localStorage からの段階的データ移行

**Objective:** プレイヤーとして、ログイン時に過去の練習データを引き継ぎたい。ログイン前に積み上げた記録を失いたくないため。

#### Acceptance Criteria

1. When ユーザーが初回ログインした, the Analytics Service shall localStorage の既存コマンド（`ct_commands`）と練習ログ（`ct_practice_logs`）を Turso に同期する
2. When データ同期が完了した, the Analytics Service shall `ct_synced_at` を localStorage に記録し、次回ログイン時の二重同期を防ぐ
3. If 同期中にエラーが発生した, the Analytics Service shall localStorage のデータを削除せず、次回ログイン時に再試行できる状態を維持する
4. While localStorage データが存在する間, the Analytics Service shall localStorage を primary store として維持し、DB への書き込みは副作用として行う

---

### Requirement 8: 統計・分析データの取得API

**Objective:** プレイヤーとして、自分の練習統計を参照したい。上達の推移と課題を把握するため。

#### Acceptance Criteria

1. When 認証済みユーザーが統計APIをリクエストした, the Analytics Service shall コマンドごとの練習回数・成功率・平均入力速度を返す
2. The Analytics Service shall コマンドのステップ別失敗率を集計し、どのステップが最も難しいかを返す（可視化用）
3. When 未認証ユーザーが統計APIにアクセスした, the Analytics Service shall client_id に紐づく匿名データのみを返す
4. The Analytics Service shall 過去N日間の練習回数推移（日次集計）を返す
5. If 統計データが存在しない場合, the Analytics Service shall 空のデータ構造を返し、エラーではなく「まだデータがありません」として扱う

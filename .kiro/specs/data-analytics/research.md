# リサーチ & 設計判断ログ

---
**Purpose**: data-analytics フィーチャーの技術調査・アーキテクチャ判断の根拠を記録する。
---

## Summary

- **Feature**: `data-analytics`
- **Discovery Scope**: Complex Integration（既存 localStorage-first SPA への認証・バックエンドDB・アナリティクス基盤の追加）
- **Key Findings**:
  - Turso(libSQL) は Drizzle ORM と組み合わせることで型安全な SQLite アクセスが実現できる。Next.js App Router の Route Handler から `@libsql/client` 経由で直接利用可能
  - Auth.js v5（next-auth@beta）は Next.js 16 App Router に対応済み。Google OAuth の設定は `auth.ts` 単一ファイルに集約でき、Route Handler は `handlers` をエクスポートするだけで機能する
  - fire-and-forget パターンは `void fetch(...).catch(() => {})` の一行で実現できる。Route Handler 側は標準の Next.js エラーログに出力するため、クライアント側は完全サイレントでよい

---

## Research Log

### Turso + Drizzle ORM + Next.js App Router の統合パターン

- **Context**: 要件がバックエンドDBとして Turso を指定。ORMの選定と統合方法を調査
- **Sources Consulted**:
  - [Turso Next.js ガイド](https://docs.turso.tech/sdk/ts/guides/nextjs)
  - [Drizzle + Turso ガイド](https://orm.drizzle.team/docs/tutorials/drizzle-with-turso)
- **Findings**:
  - `@libsql/client` でクライアントを作成し、`drizzle-orm/libsql` でラップするのが推奨パターン
  - クライアントは `src/lib/db/client.ts` にシングルトンで置き、Server Components / Route Handler から参照する
  - スキーマは `src/lib/db/schema.ts` に Drizzle テーブル定義として記述
  - マイグレーションは `drizzle-kit generate` + `drizzle-kit migrate` で管理
  - 環境変数: `TURSO_DATABASE_URL`（必須）、`TURSO_AUTH_TOKEN`（本番必須）
  - Turso は SQLite 互換のため、SQLite の型制約（`integer` で boolean、`text` で JSON）を使う
- **Implications**: サーバーサイド専用クライアントとして設計する。クライアントコンポーネントからの直接インポートを禁止する規約を設計に明示する

---

### Auth.js v5（NextAuth）+ Google OAuth の統合

- **Context**: Requirement 1 が Google OAuth 認証を要求。Next.js 16 App Router 対応の認証ライブラリを調査
- **Sources Consulted**:
  - [Auth.js v5 Getting Started](https://authjs.dev/getting-started/migrating-to-v5)
  - [Next.js 15 + NextAuth v5 ガイド](https://codevoweb.com/how-to-set-up-next-js-15-with-nextauth-v5/)
- **Findings**:
  - `next-auth@beta` が App Router と互換性のある最新版
  - 設定は `src/lib/auth.ts` の単一ファイルで完結（`NextAuth({ providers, callbacks })`）
  - Route Handler は `export const { GET, POST } = handlers` のみ
  - セッションは JWT ストラテジー（デフォルト）か Database ストラテジーが選べる
  - `useSession()` クライアントフック、`auth()` サーバー関数の2経路でセッション取得可能
  - Google OAuth は `clientId`/`clientSecret` + Google Cloud Console の設定が必要
  - セッション復元（Req 1.3）は `SessionProvider` ラッパーと JWT Cookie で自動処理
- **Implications**: JWT ストラテジーを採用し、`users` テーブルへの UPSERT は `signIn` callback で実行する。Drizzle Adapter も存在するが、カスタム users テーブル構成のため callback 方式を採用

---

### Firebase vs Turso の選択

- **Context**: ステアリング(`tech.md`)では Firebase が計画されていたが、本スペックの要件では Turso を指定
- **Findings**:
  - Turso は SQLite 互換で Vercel へのデプロイが容易、free tier が充実
  - Firebase (Firestore) は NoSQL のためスキーマ管理が複雑、型安全性も劣る
  - 本スペックの要件（集計クエリ、JOIN、statsAPI）はリレーショナルDBが適切
- **Implications**: ステアリング記載の Firebase 計画はこのスペックで Turso に置き換える。ステアリング `tech.md` も後続で更新が必要

---

### Server Actions vs Route Handlers の選択

- **Context**: fire-and-forget アナリティクス書き込みの実装方式
- **Alternatives Considered**:
  1. **Server Actions**: React 19 の `useTransition` と組み合わせ可能、API エンドポイント不要
  2. **Route Handlers**: 明示的な REST API、クライアントサイドから `fetch` で呼び出し
- **Selected**: Route Handlers
- **Rationale**:
  - fire-and-forget は `void fetch().catch(() => {})` の1行で完結する
  - Server Actions は `pending` 状態を返すため、UI への影響をゼロにするには追加の制御が必要
  - Route Handler は明示的な API 境界を持ち、設計原則（境界を先に定義）に合致する
  - 将来的なモバイルアプリや他クライアントからの呼び出しにも対応できる

---

### client_id の管理戦略

- **Context**: Req 2 が未認証ユーザーのブラウザ固有 ID を要求
- **Alternatives Considered**:
  1. `crypto.randomUUID()` を localStorage に保存
  2. サーバーサイドで Cookie に発行
- **Selected**: localStorage（`ct_client_id`）
- **Rationale**:
  - 既存の `ct_commands`、`ct_practice_logs` と同じ localStorage パターンに統一
  - Cookie はサーバーサイドでアクセスできる利点があるが、プライバシー規制上の懸念がある
  - localStorage は SSR で `undefined` になるため、`useEffect` 内での初期化が必要

---

### セッション ID のクライアント生成

- **Context**: fire-and-forget 環境での session_id 管理（セッション開始 → 試行記録 の非同期タイミング問題）
- **Problem**: POST /sessions のレスポンスを待たずに POST /attempts を呼ぶと session_id が不明
- **Selected**: クライアントサイドで `crypto.randomUUID()` を生成し、セッション ID として使用
- **Rationale**: UUID 衝突確率は無視できるほど小さく、サーバー待ちの競合状態を完全に回避できる

---

### usePracticeSession の拡張方針

- **Context**: Req 4 がステップ別タイミング・入力シーケンスの記録を要求。既存フックは `{success, timestamp}` のみ
- **Alternatives Considered**:
  1. 別フック(`useAnalyticsSession`)が state 変化を観察してタイミング計測
  2. `usePracticeSession` に optional callback パラメータを追加
- **Selected**: Option 2（optional callback パラメータ）
- **Rationale**:
  - ステップ遷移のタイミングはフック内部の dispatch タイミングと完全に同期している必要がある
  - 外部観察は state の差分検知に依存するため、タイミング誤差が生じる可能性がある
  - `options` が未指定の場合は既存動作と完全互換 → 既存テストは変更不要

---

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Side-Effect Analytics Overlay（採用） | 既存フローを変更せず副作用としてDB書き込み | UX影響ゼロ、既存テスト無変更 | アナリティクスデータの欠損可能性 | fire-and-forget の性質上、意図的 |
| Integrated Data Layer | localStorage と DB を同期的に更新 | データ整合性が高い | UX レイテンシ増大、既存フック大改修 | 要件 4.6, 5.3 に違反 |
| Event Sourcing | ブラウザイベントをキューに積み、バッチ送信 | ネットワーク効率よい | 実装複雑度が高く over-engineering | 現スケールでは不要 |

---

## Design Decisions

### Decision: Auth.js JWT ストラテジー採用

- **Context**: Drizzle Adapter vs JWT Callback の選択
- **Alternatives Considered**:
  1. Drizzle Adapter — Auth.js 公式 DB アダプター、セッションをDBに保存
  2. JWT Callback — カスタム callback で `users` テーブルを UPSERT
- **Selected Approach**: JWT Callback（`signIn` callback 内で users テーブルを UPSERT、`user.id` を JWT に注入）
- **Rationale**: `users` テーブルのカラム（`google_id`, `avatar_url`）が Auth.js のデフォルトスキーマと異なるため、カスタム管理が必要
- **Trade-offs**: セッション情報は DB ではなく Cookie に保存されるが、本アプリのスケールでは問題なし
- **Follow-up**: `users` テーブルの `google_id` カラムへのインデックスが必要

### Decision: `practice_sessions.id` のクライアント生成

- **Context**: fire-and-forget での session_id 競合回避
- **Selected Approach**: `usePracticeSession` が受け取る `options.sessionId`（クライアント生成 UUID）を `/api/analytics/sessions` に送信
- **Trade-offs**: サーバーが ID を生成しないため、ID 衝突の責任がクライアントにある（実用上問題なし）
- **Follow-up**: Route Handler は `id` が既存レコードと衝突した場合 `IGNORE` で無視（idempotent）

---

## Risks & Mitigations

- **Auth.js v5 ベータ安定性** — breaking change リスク。本実装時に最新ベータのリリースノートを確認する
- **アナリティクスデータ欠損** — fire-and-forget のため、ネットワークエラー時にデータが失われる。これは要件（4.6）で意図的に許容されている
- **localStorage マイグレーションの冪等性** — `ct_synced_at` フラグで二重実行を防止。ただし、部分的な成功後に失敗した場合は、次回ログイン時に重複レコードが発生する可能性がある → `/api/analytics/migrate` は `INSERT OR IGNORE` で冪等化する
- **SQLite の JSON 型** — Turso/SQLite に JSON 型は存在せず、`text` カラムに JSON 文字列を保存する。`step_timings`, `command_snapshot` などは Drizzle レイヤで parse/stringify する

---

## References

- [Turso Next.js Guide](https://docs.turso.tech/sdk/ts/guides/nextjs)
- [Drizzle ORM with Turso](https://orm.drizzle.team/docs/tutorials/drizzle-with-turso)
- [Auth.js v5 Migration Guide](https://authjs.dev/getting-started/migrating-to-v5)
- [NextAuth v5 + Next.js 15 Setup](https://codevoweb.com/how-to-set-up-next-js-15-with-nextauth-v5/)

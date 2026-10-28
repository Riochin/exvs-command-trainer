# プロジェクト構造

## 組織方針

**フィーチャーファースト**: 機能ドメイン（コマンド管理・練習・ログ・ランキング）を最上位に置き、その下にUI・ロジック・型を配置する。

## ディレクトリパターン

### フィーチャーディレクトリ
**場所**: `src/features/<feature-name>/`  
**目的**: 特定機能に閉じたコンポーネント・フック・型  
**例**: `src/features/practice/`, `src/features/command-editor/`

### 共有UIコンポーネント
**場所**: `src/components/`  
**目的**: 機能横断で使われる汎用UIプリミティブ（ボタン・モーダルなど）  
**ルール**: ビジネスロジックを持たない。デザイン定数のみ参照する

### カスタムフック
**場所**: `src/hooks/`  
**目的**: ローカルストレージアクセス・デバイス向き検出など、ロジックの再利用単位  
**例**: `useCommandStore`, `useLandscapeMode`, `usePracticeSession`

### 型定義
**場所**: `src/types/`  
**目的**: ドメインモデルの型（`Command`, `ButtonInput`, `PracticeLog`）

### Routeページ
**場所**: `src/app/` （Next.js App Router規約に従う）

| URL | 画面 | 主な端末 |
|-----|------|----------|
| `/` | 3D ビュー（スマホの入力どおりに機体を動かす）。ヘッダーなし、ほかの画面へは設定モーダルから | PC |
| `/practice` | フリー練習。PC の QR コードは `/practice?relay=コード` を開く | スマホ横 |
| `/practice/[commandId]` | コマンド練習 | スマホ横 |
| `/commands`, `/commands/new`, `/commands/[id]` | コマンド一覧・登録・詳細 | スマホ |
| `/tools/chart-author` | 譜面作成（メニューには出さない） | PC |

- `/` 以外の画面は `src/app/(site)/` にまとめ、その `layout.tsx` でメニューと「コマンド一覧に戻る」を出す。
- 旧 URL は転送で残す: `/3d`・`/tools/input-relay` → `/`、`/?relay=コード` → `/practice?relay=コード`。

## 命名規則

- **ファイル（コンポーネント）**: PascalCase（例: `CommandCard.tsx`）
- **ファイル（フック・ユーティリティ）**: camelCase（例: `useCommandStore.ts`）
- **ディレクトリ**: kebab-case（例: `command-editor/`）
- **型名**: PascalCase（例: `PracticeLog`）
- **定数**: SCREAMING_SNAKE_CASE（例: `MAX_COMMAND_LENGTH`）

## インポート規約

```typescript
// 外部ライブラリ
import { useState } from 'react'

// 絶対パス（プロジェクト内）
import { CommandCard } from '@/components/CommandCard'
import { useCommandStore } from '@/hooks/useCommandStore'

// 相対パス（同一フィーチャー内）
import { validateCommand } from './utils'
```

**パスエイリアス**: `@/` → `src/`

## コード組織の原則

- フィーチャー間の依存は許可しない（`features/A` が `features/B` をインポートしない）
- フィーチャーから `components/`・`hooks/`・`types/` への依存はOK
- ボタン座標ロジックは「論理座標 → 実座標変換」を明確に分離する（プロトタイプ実績パターン）
- 入力リレーの 3D ビューの機体は 1 機 1 ファイル（`features/input-relay/sim/units/<機体id>.ts`）で、`units/index.ts` の `UNITS` に登録する。sim（`sim/`）は描画に依存しない純粋な TS に保つ。手順は `unit-authoring.md`

---
_パターンを記録。ファイルツリーの列挙はしない。新規ファイルが既存パターンに従う限りステアリング更新不要_

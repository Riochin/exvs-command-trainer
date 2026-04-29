# 技術スタック

## アーキテクチャ

フロントエンド中心のSPA。当面はローカルストレージで練習データを管理し、将来的にFirebaseへ移行する。

## コア技術

- **言語**: TypeScript（strict モード）
- **フレームワーク**: Next.js（App Router）
- **UIライブラリ**: React
- **スタイリング**: TBD（プロトタイプはp5.jsキャンバス）
- **データ永続化**: ローカルストレージ（MVP）→ Firebase（Firestore + Auth）

## 開発標準

### 型安全
- TypeScript strict モードを原則とし、`any` は使用しない
- コマンドデータ・ボタン入力・練習ログは型定義を先に作る

### 画面・デバイス対応
- スマートフォン横画面（landscape）を第一ターゲット
- キャンバス/ボタン座標は論理座標系で管理し、`windowResized` 相当の処理で実座標に変換するパターン（プロトタイプ実績）

### 状態管理
- UIローカル状態: React useState / useReducer
- 練習ログ・コマンドデータ: ローカルストレージ経由のカスタムフック（`useCommandStore` など）で抽象化

## 開発環境

### 必要なツール
- Node.js 20+
- pnpm

### 主要コマンド（TBD）
```bash
# 開発: pnpm dev
# ビルド: pnpm build
# 型チェック: pnpm typecheck
```

## 重要な技術的判断

- **バックエンドはFirebase**: Firestore（DB）+ Firebase Auth（認証）を採用。ランキング公開機能のタイミングで導入する
- **p5.jsプロトタイプの扱い**: `prototype/` の実装はUXの参考資料。本実装ではReact + CSS/SVGまたはCanvasで再実装する
- **横画面レイアウト**: `transform: rotate` や `logicalWidth/Height` の分離パターンを本実装でも踏襲する

---
_標準とパターンを記録。依存ライブラリの全列挙は行わない_

# 実装ギャップ分析: chart-authoring-tool

---
**Purpose**: 要件（requirements.md）と既存コードベースの差分を整理し、設計フェーズの判断材料と調査項目を提示する。
**Status**: 要件は生成済み・未承認。本分析は要件の見直しにも使える。
---

## 1. 現状調査

### 既存資産（再利用候補）

| 資産 | 場所 | 本フィーチャーでの使い方 |
|------|------|--------------------------|
| `ButtonType` / `isButtonType` | `src/types/index.ts` | 譜面 `steps[].input` の値域と検証にそのまま使う |
| `ArcadeController` | `src/features/arcade-controller/` | `onButtonPress` コールバックで `ButtonType` を受け取れる。チャージ・サブ・特射・特格の合成判定込み。Req 7.2 の手動ラベル付けに無改変で使える |
| `useLocalStorage` | `src/hooks/useLocalStorage.ts` | 校正データ（Req 2.6）と作業中譜面（Req 8.8）の永続化。`StorageResult` でクォータ超過も扱える |
| `useCommandStore` の検証パターン | `src/hooks/useCommandStore.ts` | 読み込み時に `isButtonType` で検証し `parse_error` を返す流儀。譜面インポート検証（Req 8.7）に踏襲 |
| `CapsuleButton` / `ConfirmDialog` | `src/components/` | 操作ボタン、再解析時の確認（Req 5.4）。ただし `ConfirmDialog` は文言が「削除する」固定 |
| テーマトークン | `src/styles/theme.css` | 色・グロー・フォントを流用。タイムライン・マーカーの色は `--color-accent-primary` / `--color-warning` / `--color-success` を割り当てられる |
| テスト基盤 | `vitest` + `jsdom` + Testing Library | フック・コンポーネントの単体テストとフローの結合テストが `src/__tests__/` に揃っている |

### 既存の慣習・制約

- **フィーチャーファースト**: `src/features/<name>/` にUI・ロジック・型を閉じ込め、フィーチャー間の import は禁止。`components/`・`hooks/`・`types/` への依存は可。
- **CSS Modules + テーマ変数**: 全コンポーネントが `*.module.css` を持つ。
- **ルートレイアウトのグローバル要素**: `HamburgerMenu`・`BackToHomeNav`・`AnalyticsPageViewTracker`・Google Analytics スクリプトが全ページに乗る。`BackToHomeNav` は `/` と `/commands` 以外で必ず表示される。
- **`globals.css` の `html, body { height: 100%; overflow: hidden }`**: ページ内スクロールは各ページが自前のスクロールコンテナを持つ必要がある。
- **横画面前提の設計**: `LandscapeGuard` は各ページが明示的に包む方式なので、包まなければ適用されない（Req 9.2 は自然に満たせる）。
- **canvas / video / Worker の利用実績はゼロ**: 本フィーチャーが初めて映像処理をコードベースに持ち込む。
- **jsdom は canvas を実装しない**: `drawImage` / `getImageData` は jsdom 上で動かない。検出ロジックは canvas に依存しない純関数として切り出さないとテストできない。

### 統合面

- データモデル: 譜面型（`Chart`, `ChartStep`, `ChartSource`）は `src/types/` に新設し、後続の練習モードスペックと共有する（Req 8.2）。
- 校正データ型（`HudCalibration`）は本フィーチャー内に閉じてよいが、エクスポート JSON に同梱するかは設計判断。
- API・認証・DB: 不要。完全にクライアント完結。

## 2. 要件と資産の対応（ギャップ表）

| 要件 | 技術要素 | 既存資産 | ギャップ |
|------|----------|----------|----------|
| Req 1 動画読み込み・コマ送り | `<input type=file>` → `URL.createObjectURL` → `<video>`；1/30秒シーク | なし | **Missing**。コマ送りの正確性（`currentTime` 設定後にそのフレームが描画される保証）は **Unknown** |
| Req 2 校正 UI | 動画上に矩形を描く canvas オーバーレイ、スロット種別の自動分類 | なし | **Missing**。3つ丸のボタン表示の色・形状からの分類は **Research Needed** |
| Req 3 射撃系検出 | 弾数の「減少」判定。方向判定には数字の読み取りが必要 | なし | **Missing / Research Needed**。ピクセル差分だけでは減少と増加（リロード）を区別できない。桁のテンプレート照合か OCR が要る |
| Req 3.6–3.7 CHARGE 検出 | 領域の明度・色の二値化 | なし | Missing だが単純 |
| Req 4 ブースト検出 | ゲージ矩形の充填率 → 1次元信号 → 微分の閾値 | なし | Missing だが単純。閾値の妥当値は **Research Needed**（実映像が必要） |
| Req 5 進捗・キャンセル・応答性 | Web Worker + `OffscreenCanvas`、または `requestVideoFrameCallback` によるメインスレッド処理 | なし | **Missing**。フレーム供給方式が最大の設計判断（後述） |
| Req 5.5 60秒を3分以内 | デコード速度 | なし | **Unknown**。`<video>` シークで1フレームずつ取ると 1800 フレーム × 数十ms で数分かかる可能性。WebCodecs なら実時間より速い |
| Req 6 一覧・タイムライン | リスト、フィルタ、マーカー描画 | `CapsuleButton`、テーマ | Missing だが通常の UI 実装 |
| Req 7 手動修正・Undo | ステップ配列の reducer、履歴スタック | `usePracticeSession` の reducer パターン | Missing。`ArcadeController` は流用可 |
| Req 8 譜面型・エクスポート・インポート | JSON 生成・ダウンロード、検証 | `isButtonType`、`useLocalStorage` | 型は **Missing**。ダウンロードは `Blob` + `<a download>` で可 |
| Req 8.8 作業中譜面の保存 | localStorage | `useLocalStorage` | 動画ファイル自体はリロードで失われる（再選択が必要）。**Constraint** |
| Req 9.1 メニュー非掲載ルート | `src/app/tools/chart-author/page.tsx` 等 | App Router | 可。ただし `BackToHomeNav` が表示される（**Constraint**、許容か非表示化の判断） |
| Req 9.3 アナリティクス非送信 | ルートレイアウトの `AnalyticsPageViewTracker` と GA が全ページに乗る | — | **Constraint**。ページビューは自動送信される。`useAnalytics` を呼ばなければイベントは出ないが、ページビュー除外にはトラッカー側の除外パス指定かルートグループ分割が必要 |

### 複雑度シグナル

- 映像フレーム処理と信号処理（アルゴリズム寄り）
- 校正・解析・編集・出力の多段ワークフロー
- 外部連携なし

## 3. 実装アプローチの選択肢

### Option A: 既存コンポーネントを拡張する

- `command-editor` や `practice` フィーチャーに編集 UI を足す案。
- **評価**: 不適。譜面作成は既存フィーチャーと責務が異なり、フィーチャー間依存禁止の規約とも噛み合わない。既存の練習体験に影響を与えないという Req 9 の意図にも反する。

### Option B: 新規フィーチャーとして独立させる（推奨候補）

- `src/features/chart-author/` を新設し、内部を責務ごとに分ける:
  - `analysis/`: 純関数の検出ロジック（`ImageData` 相当の型付き配列を受け取り、イベント列を返す）。canvas 非依存でテスト可能
  - `frame-source/`: 動画からフレームを供給する層（方式は後述の選択肢）
  - `calibration/`: 矩形指定 UI と `HudCalibration` 型
  - `editor/`: ステップ一覧・タイムライン・reducer・Undo
  - `export/`: 譜面 JSON/CSV の生成と検証
- 譜面型は `src/types/chart.ts` に置き、`src/types/index.ts` から再エクスポート
- ページは `src/app/tools/chart-author/page.tsx`
- **統合点**: `ArcadeController`（無改変）、`useLocalStorage`、`isButtonType`、テーマトークン
- **トレードオフ**: ✅ 既存コードに触らない ✅ 検出ロジックを単体テストしやすい ❌ ファイル数が多い ❌ フレーム供給層の設計が必要

### Option C: 段階的ハイブリッド

- **第1段階**: メインスレッドで `<video>` を 1/30 秒ずつシークし `drawImage` → `getImageData` で解析（実装最小、速度は遅い可能性）
- **第2段階**: 速度が要件（Req 5.5）を満たさなければ、WebCodecs（`VideoDecoder`）＋ MP4 デマクサで Worker 内デコードに置き換える。`analysis/` を純関数にしておけば供給層の差し替えだけで済む
- **トレードオフ**: ✅ 早く動くものが出て、実映像で検出精度を先に検証できる ✅ Req 5.6 の応答性は第1段階でも `requestAnimationFrame` 分割で最低限確保できる ❌ 第1段階が要件未達なら二度手間

### フレーム供給方式の比較（設計フェーズで決める）

| 方式 | 速度 | 対応ブラウザ | 実装量 | 備考 |
|------|------|--------------|--------|------|
| `<video>` シーク + `drawImage` | 遅い（1フレーム 20〜100ms） | 全ブラウザ | 小 | シーク完了は `seeked` イベント待ち。精度は `requestVideoFrameCallback` で補える |
| `<video>` 再生 + `requestVideoFrameCallback` | 実時間（1倍速、`playbackRate` で最大 4〜16 倍） | Chrome / Safari / Firefox 130+ | 小〜中 | フレーム落ちの可能性。表示中の動画と解析が同居できる |
| WebCodecs `VideoDecoder` + `mp4box.js` | 実時間より速い | Chrome / Edge / Safari 16.4+ / Firefox 130+ | 大 | Worker で完結。mov（QuickTime）コンテナの扱いは要確認 |

## 4. 工数とリスク

| 領域 | 工数 | リスク | 根拠 |
|------|------|--------|------|
| 譜面型・エクスポート・インポート | S | Low | 既存の型・検証・ストレージの流儀を踏襲するだけ |
| 動画読み込み・コマ送り・タイムライン・一覧・手動修正 | M | Low〜Medium | 通常の React UI。コマ送りの正確性だけ要検証 |
| 校正 UI | S〜M | Medium | 矩形描画は定型。スロット種別の自動分類は精度未知 |
| 検出アルゴリズム（弾数・CHARGE・ブースト） | M | **High** | 実映像での精度が未検証。弾数の方向判定に桁読み取りが要る |
| フレーム供給層（速度・応答性） | M（段階2まで含めると L） | Medium〜High | 方式選定次第で工数が大きく変わる |
| **全体** | **L（1〜2週間）** | **Medium〜High** | 映像処理はコードベース初。検出精度は実データでしか確かめられない |

## 5. 設計フェーズへの推奨

### 推奨アプローチ

**Option B の構造で Option C の段階戦略**を取る。検出ロジックを canvas 非依存の純関数として先に作り、フレーム供給は `<video>` シーク方式で最小実装し、実映像で精度と速度を測ってから WebCodecs 化を判断する。

### 主要な設計判断（design.md で確定させる）

1. フレーム供給方式の初期選択と、差し替え可能なインターフェース（`FrameSource`）の形
2. 弾数の方向判定の方法: (a) 校正時にその動画から 0〜9 の桁画像をユーザーに1回教えてもらうテンプレート照合、(b) Tesseract.js による OCR、(c) 「変化＝発射」と割り切りリロードは手動削除に委ねる（要件 3.3 の緩和）
3. 解析結果の中間表現（1次元信号列）を保持するか。保持すればブースト閾値（Req 4.5）の再調整を再デコードなしで行える
4. `AnalyticsPageViewTracker` の除外方法（除外パス vs ルートグループ）と `BackToHomeNav` の扱い
5. 作業中譜面と校正の localStorage キー設計と、動画ファイル再選択時の紐付け（ファイル名＋長さで照合など）
6. Undo の粒度（reducer のアクション単位）と履歴の上限

### Research Needed（設計フェーズに持ち越す調査）

- **サンプル映像の入手**: アーケード EXVS2 OB/XB の画面録画（1080p、手元カメラ有無どちらでも）を1本用意する。これがないと閾値も精度も決められない
- 3つ丸のボタン表示の色・配置（射撃＝赤、格闘＝青、ジャンプ＝緑と推定）と、スロット種別への対応表
- 弾数フォントの桁形状と、「100」など3桁武装、無限弾数表示、リロード中の点滅表示の有無
- CHARGE 表示の点灯時と消灯時の見た目差（色・明度）
- ブーストゲージの初動消費量（BD・ステップ・ジャンプの違い）と、ゲージ色の閾値
- `video.currentTime` 設定後のフレーム描画タイミングと、`requestVideoFrameCallback` の各ブラウザ対応
- WebCodecs + `mp4box.js` の mov コンテナ対応状況（画面録画は QuickTime の mov が既定）
- jsdom での canvas 代替（`@napi-rs/canvas` の導入 vs 純関数化でテストを回避）

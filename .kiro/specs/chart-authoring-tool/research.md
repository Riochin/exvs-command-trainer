# Research & Design Decisions: chart-authoring-tool

---
**Purpose**: 設計フェーズで実施した調査と、`design.md` に反映した判断の根拠を記録する。
**Status**: design 生成時点（2026-09-15）。実映像による検証は未実施。
---

## Summary

- **Feature**: `chart-authoring-tool`
- **Discovery Scope**: New Feature（既存コードベースに映像処理が存在しないためフル調査）
- **Key Findings**:
  - `requestVideoFrameCallback`（rVFC）は Chrome 83+ / Safari 15.4+ / Firefox 132+ で利用可能になっており、2026 年時点では PC ブラウザ前提のツールで実用的な既定手段として選べる。等倍再生＋`playbackRate` 引き上げにより、シーク総当たりよりも桁違いに速くフレームを供給できる。
  - `.mov`（QuickTime コンテナ）は Chrome / Firefox が `video/quicktime` の MIME を拒否するため、`<video>` に素直に渡すと再生できない。Blob の MIME を `video/mp4` に付け替えて `URL.createObjectURL` する回避策が必要で、それでも失敗する場合は Req 1.3 のエラー表示に落とす。
  - 弾数の「減少」判定はピクセル差分だけでは成立しない。解析を「フレーム走査（重い・1回）」と「検出（軽い・純関数・何度でも）」の2パスに分け、中間表現 `SampleTimeline` を保持する構成にすると、桁ラベルの後付け解決とブースト閾値の再調整（Req 4.5）が再デコードなしで成り立つ。
  - `<video>` は Worker へ転送できず、Worker 化には WebCodecs + デマクサが必須になる。プロトタイプの工数に見合わないため、解析はメインスレッドで行い、Req 5.6 の応答性は「解析用の隠し `<video>` と閲覧用 `<video>` を分離する」ことで満たす。

---

## Research Log

### フレーム供給方式の選定

- **Context**: Req 3.1（毎フレームまたは 30fps 以上でサンプリング）と Req 5.5（60 秒 1080p を 3 分以内）、Req 5.6（解析中もスクラブ可能）を同時に満たす方式を決める必要があった。gap-analysis で 3 方式が候補として挙がっていた。
- **Sources Consulted**:
  - [MDN: HTMLVideoElement.requestVideoFrameCallback()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)
  - [Web platform features explorer: requestVideoFrameCallback()](https://web-platform-dx.github.io/web-features-explorer/features/request-video-frame-callback/)
  - [Can I use: requestVideoFrameCallback](https://caniuse.com/mdn-api_htmlvideoelement_requestvideoframecallback)
  - [W3C WebCodecs sample: video decode & display](https://w3c.github.io/webcodecs/samples/video-decode-display/)
  - [bilibili/web-demuxer](https://github.com/bilibili/web-demuxer)
- **Findings**:
  - rVFC は Firefox 132（2024-10）で実装され、Chrome 83 / Safari 15.4 と合わせて主要ブラウザで揃った。Interop 2024 の対象項目でもある。DRM 再生時に Safari で壊れる既知の問題があるが、本ツールはローカルファイルのみを扱うため該当しない。
  - rVFC のコールバックは `mediaTime`（そのフレームのメディア時刻）と `presentedFrames` を渡すため、フレームの取りこぼしを検出できる。`playbackRate` を上げるとフレームがスキップされうるが、`presentedFrames` の増分で欠落を検出し、欠落区間を後段の検出器で「不明」として扱える。
  - `<video>` の `currentTime` を 1/30 秒ずつ進めて `seeked` を待つ方式は 1 フレームあたり 20〜100ms 程度かかり、1800 フレームで 36〜180 秒。Req 5.5 の上限に張り付く。
  - WebCodecs は `VideoDecoder` を提供するがデマクサを含まないため、`mp4box.js`（MP4 のみ）または `web-demuxer`（mov/mkv 等を含むが WASM 同梱で重い）の追加依存が要る。現行 `package.json` は映像系の依存を一切持たないため、プロトタイプ段階で持ち込むのは過剰。
- **Implications**:
  - 既定を rVFC 方式（`PlaybackFrameSource`）、フォールバックをシーク方式（`SeekingFrameSource`）とし、両者を `FrameSource` インターフェースの背後に置く。WebCodecs 実装は同インターフェースの第3実装として後から差し込める余地を残すが、本スペックでは非対象。
  - 解析用に閲覧用とは別の `<video>` 要素（非表示）を持つ。解析が再生位置を占有しても、ユーザーは閲覧用の要素を自由にスクラブできる（Req 5.6）。

### `.mov` コンテナの `<video>` 再生可否

- **Context**: Req 1.1 は mp4 と mov の両方を読み込み対象にしている。画面録画（macOS QuickTime Player 等）の既定出力は `.mov`。
- **Sources Consulted**:
  - [Chrome does not play some videos with type "video/quicktime"](https://secure.phabricator.com/T13135)
  - [video.js issue #423: Video not played with type="video/quicktime"](https://github.com/videojs/video.js/issues/423)
- **Findings**:
  - Chrome / Firefox は `video/quicktime` の MIME を `<video>` で受け付けない。中身が H.264/AAC であっても、MIME 宣言だけを理由に再生を拒否する。Safari は QuickTime 由来の実装のため H.264/AAC の `.mov` を再生できるが、ProRes 等は不可。
  - `URL.createObjectURL(file)` は `File.type`（`video/quicktime`）をそのまま Blob の MIME として使うため、この拒否がそのまま起きる。
- **Implications**:
  - ファイル読み込み時に `.mov` を検出したら `new Blob([file], { type: 'video/mp4' })` として MIME を付け替えたうえで Object URL を作る。これで H.264 in QuickTime は多くの環境で再生できる。
  - それでも `HTMLMediaElement.error` が立つ場合（ProRes / HEVC 非対応環境など）は Req 1.3 に従い、ファイル名と「mp4 (H.264) への変換」を案内するエラーを出し、直前の状態を保持する。

### 弾数の増減判定（最大の技術リスク）

- **Context**: Req 3.2 / 3.3 は「減少のみを入力として記録し、リロードによる増加は記録しない」と定めている。領域のピクセル差分は変化の有無しか示さず、方向を与えない。
- **Sources Consulted**: 既存コードの検証パターン（`useCommandStore` の `isButtonType` 検証）、gap-analysis の選択肢整理、ブラウザ内 OCR（Tesseract.js）の一般的な精度特性。
- **Findings**:
  - Tesseract.js は依存が重く（WASM + 学習データ数 MB）、かつゲーム HUD の小さい装飾フォントに対する精度が読めない。毎フレーム 5 スロット分を回すのは Req 5.5 に対して明らかに過大。
  - 弾数表示は桁数が固定（スロットごとに 1〜3 桁）でフォントも固定であるため、桁セルを等分割して切り出した小画像を正規化すれば、テンプレート照合で十分に分離できる見込みが高い。問題は「テンプレートをどこから得るか」に集約される。
  - 1 本のクリップに現れる数字の種類は限られる（多くても 0〜9 の 10 種）。全フレームの桁セルを記述子化してクラスタリングすれば、未知クラスタは通常 10 個以下に収束する。
- **Implications**:
  - **グリフを「読む」のではなく「クラスタリングして後からラベル付けする」** 方式を採る。走査パス（Pass A）では桁セルの記述子を求めてクラスタ ID を振るだけにし、数字としての意味付けは走査後にユーザーが未解決クラスタへ数字を入力して確定させる（`GlyphTutor`）。
  - ラベルが揃えば弾数は厳密な整数として復元でき、Req 3.2 / 3.3 / 3.4 を仕様どおり満たせる。ラベルが揃わない間は「変化あり・方向不明」の低信頼ステップとして提示し、ユーザーの手動確認に委ねる（Req 3.5 の confidence が意味を持つ）。
  - この方式は中間表現 `SampleTimeline` の保持を前提とする。ラベル追加のたびに再デコードしていては成立しないため、2パス構成は必須要件になる。

### 解析中間表現の保持とストレージ

- **Context**: gap-analysis の設計判断 3（1 次元信号列を保持するか）と Req 4.5（ブースト閾値の調整）、Req 8.8（作業中譜面の永続化）。
- **Findings**:
  - 60 秒 1080p・30fps・5 スロットで `SampleTimeline` はおよそ 1800 フレーム × （5 スロット × 数バイト + ブースト 1 値）。クラスタ ID と真偽値に圧縮すれば数百 KB 規模で収まり、メモリ保持は容易。
  - 一方 localStorage は実質 5MB 前後の制約があり、既存の `ct_commands` / `ct_practice_logs` と共有する。`SampleTimeline` を localStorage に載せるとクォータを圧迫する。
  - 既存 `useLocalStorage` は `StorageResult<T>` で `quota_exceeded` を返す設計になっており、永続化対象を絞れば既存の流儀のまま使える。
- **Implications**:
  - `SampleTimeline` はメモリ専用。ページリロードで失われ、その場合は再走査となる（動画ファイル自体もリロードで失われるため、挙動として一貫する）。
  - localStorage に載せるのは「校正（Req 2.6）」と「作業中譜面（Req 8.8）」のみ。どちらも `useLocalStorage` を直接使う。

### アナリティクスの除外（Req 9.3）

- **Context**: ルートレイアウトが `AnalyticsPageViewTracker` と Google Analytics の `<Script>` を全ページに適用しているため、新ルートも自動的に計測対象になる。
- **Findings**:
  - `AnalyticsPageViewTracker` は `usePathname()` を読んで `trackPageView` を呼ぶだけの薄いクライアントコンポーネント。除外パス判定を足すのは 1 条件分岐で済み、既存テストへの影響も小さい。
  - GA の `gtag('config', ...)` は初期ロード時に自動で page_view を送る。これはルートレイアウト（サーバーコンポーネント）に置かれた `<Script>` のため、`usePathname()` で条件分岐できない。
  - ルートグループ（`(main)` / `(tools)`）に分けてレイアウトを分離する案もあるが、既存の全ページを移動させる変更になり、プロトタイプ 1 ルートのために払うコストとして重い。
- **Implications**:
  - GA の 2 つの `<Script>` を薄いクライアントコンポーネント `GoogleAnalyticsScripts` に切り出し、除外パスでは何もレンダリングしない。除外パス以外の挙動は現状と完全に同一に保つ。
  - 除外パス定義は `src/features/analytics/excludedPaths.ts` に単一のソースとして置き、トラッカーと GA スクリプトの両方が参照する。
  - 本ツールは `useAnalytics` を一切呼ばないため、`/api/analytics/*` へのイベント送信は発生しない。

### 既存コードベースの慣習確認

- **Findings**:
  - フィーチャー間 import 禁止・`components/` `hooks/` `types/` への依存は可、という規約が steering に明記されている。`ArcadeController` は `features/arcade-controller/` にあり、本フィーチャーからの import は規約違反になる。
  - ただし Req 9.4 は `ArcadeController` の再利用を明示的に要求している。
  - `globals.css` が `html, body { height: 100%; overflow: hidden }` を敷いているため、ページ側でスクロールコンテナを用意しないと縦に長い UI が破綻する。
  - `ConfirmDialog` の確定ボタン文言が「削除する」で固定されている。Req 5.4 の再解析確認（3 択）には形が合わない。
  - `LandscapeGuard` は各ページが明示的に包む方式なので、包まなければ Req 9.2 は自動的に満たされる。
- **Implications**:
  - フィーチャー間 import 禁止の例外として `ArcadeController` の import を設計上明示的に許可し、その旨を `design.md` の Allowed Dependencies に記す（暗黙の違反にしない）。
  - ツールページは自前の高さ 100% グリッドと内部スクロール領域を持つ。
  - Req 5.4 の確認は `ConfirmDialog` を使わず、フィーチャー内の専用ダイアログ（3 択）として実装する。`ConfirmDialog` 自体は変更しない。

---

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A: 既存フィーチャーの拡張 | `command-editor` / `practice` に編集 UI を足す | 新規ディレクトリ不要 | 責務が全く異なる。フィーチャー間依存禁止と衝突。Req 9 の「本番体験を乱さない」に反する | 却下 |
| B: 独立フィーチャー + 単層構成 | `features/chart-author/` にコンポーネントとロジックを平置き | 素早く書ける | 映像処理・検出・編集・入出力が混ざり、canvas 非依存のテストが書けない | 却下 |
| C: 独立フィーチャー + パイプライン層分離（採用） | `analysis`（純関数）/ `frame-source`（DOM）/ `editor`（状態）/ `io`（入出力）に分離し、`FrameSource` と `SampleTimeline` を境界にする | 検出ロジックを jsdom 上で単体テストできる。フレーム供給方式を差し替えられる。閾値調整が再デコード不要 | ファイル数が増える。中間表現の型を先に固める必要がある | 採用 |
| D: Worker + WebCodecs 前提 | デコードを Worker で完結させる | 最速。メインスレッドを一切塞がない | デマクサの追加依存（mp4box.js / web-demuxer）。mov 対応の検証コスト。プロトタイプに対して過大 | 将来の `FrameSource` 追加実装として保留 |

---

## Design Decisions

### Decision: 解析を「走査パス」と「検出パス」の 2 段に分ける

- **Context**: Req 3.2〜3.4 の弾数方向判定、Req 4.5 の閾値再調整、Req 5.2 のキャンセル後の部分結果保持を、再デコードなしで同時に成立させる必要がある。
- **Alternatives Considered**:
  1. 1 パス — フレームを読みながら直接ステップを生成する。閾値を変えるたびに全フレーム再走査。
  2. 2 パス — フレーム走査で中間表現 `SampleTimeline` を作り、検出は純関数で何度でも回す。
- **Selected Approach**: 2 パス。Pass A（`FrameSource` → `RegionSampler` → 記述子化 → `SampleTimeline`）と Pass B（`SampleTimeline` + `AnalysisParams` → `DetectedStep[]`）。
- **Rationale**: Pass B が純関数になるため jsdom 上で完全にテストでき、canvas 非実装という制約を回避できる。グリフラベルの後付け解決も Pass B の再実行で済む。
- **Trade-offs**: 中間表現の型設計が先に必要になる。メモリを数百 KB 消費する。
- **Follow-up**: 実映像で `SampleTimeline` の実サイズを測り、長尺クリップでのメモリ上限（打ち切り時間）を決める。

### Decision: 弾数はグリフクラスタリング + 事後ラベル付けで読む

- **Context**: Req 3.3 の「増加は記録しない」を満たすには弾数の数値そのものが要る。
- **Alternatives Considered**:
  1. Tesseract.js による OCR — 依存が重く、小さい装飾フォントの精度が未知。
  2. 校正時にユーザーが 0〜9 のテンプレートを事前登録 — 対象動画に現れない数字まで要求され、手間が大きい。
  3. 「変化＝発射」と割り切る — Req 3.3 を満たせない。
  4. 走査時はクラスタ ID のみ、走査後に未解決クラスタだけラベル付け（採用）。
- **Selected Approach**: 桁セルの正規化記述子をクラスタリングし、既知テンプレート（校正に保存済み）と照合。未照合クラスタは走査後に `GlyphTutor` でユーザーが数字を入力して確定させ、以後は校正とともに永続化して再利用する。
- **Rationale**: ユーザーの負担が「その動画に実際に現れた数字の種類」だけに限定され、多くても 10 回で済む。2 回目以降の同一動画・同一配信者ではテンプレートが再利用される。追加依存ゼロ。
- **Trade-offs**: ラベル付けが完了するまでは弾数変化の方向が確定せず、低信頼ステップとして出る。桁の分割が校正矩形の精度に依存する。
- **Follow-up**: 実映像で桁セルの等分割が成立するか（プロポーショナルフォントでないか）を確認する。成立しない場合は投影プロファイルによる桁境界検出を追加する。

### Decision: 解析用と閲覧用で `<video>` 要素を分ける

- **Context**: Req 5.6「解析中もスクラブできる」と、rVFC 方式が再生位置を占有することの両立。
- **Alternatives Considered**:
  1. 単一要素を共有し、解析中はスクラブを禁止する — Req 5.6 に反する。
  2. 解析を Worker + WebCodecs に移す — 依存が重い。
  3. 同一 Object URL を指す 2 つ目の非表示 `<video>` を解析専用に持つ（採用）。
- **Selected Approach**: `VideoStage` が閲覧用要素を、`PlaybackFrameSource` が解析専用の非表示要素を持つ。デコーダは 2 本動くが、メモリ・CPU とも PC ブラウザ前提では許容範囲。
- **Rationale**: 追加依存なしで Req 5.6 を素直に満たせる。解析のキャンセルも要素の `pause()` で完結する。
- **Trade-offs**: デコーダ 2 本分のリソース消費。低スペック機では解析速度が落ちうる。
- **Follow-up**: 実測で解析速度が Req 5.5 を割る場合、閲覧用要素を解析中は一時停止するオプションを足す。

### Decision: ステップの同一性は編集用 ID で担保し、エクスポート時に落とす

- **Context**: Req 7.3〜7.6（削除・時刻調整・種別変更・origin 遷移）と Req 7.7（20 件の Undo）を実装するには、ステップの安定した同一性が要る。一方 Req 8.1 が定める譜面フォーマットに ID は含まれない。
- **Selected Approach**: 内部型 `EditorStep = ChartStep & { id: string }` を使い、`chartCodec` がエクスポート時に `id` を除去して `tMs` 昇順に整列する。インポート時は `id` を新規採番する。
- **Rationale**: フォーマットの契約（Req 8.1）を汚さずに、React のキーと Undo の差分適用を安定させられる。
- **Trade-offs**: 内部型と外部型の 2 つを保つ必要がある。
- **Follow-up**: `chartCodec` の往復テスト（export → import → export が同一になること）を用意する。

### Decision: Undo は「全体スナップショット」ではなく「逆操作」で持つ

- **Context**: Req 7.7 は直近 20 操作の Undo を要求する。Req 7.8 の全体オフセットのように全件を動かす操作も含まれる。
- **Alternatives Considered**:
  1. 操作ごとにステップ配列全体をスナップショット — 実装は最も簡単。1000 ステップ × 20 件でも数 MB 未満。
  2. 逆操作（inverse action）をスタックに積む — メモリ効率は良いが、各操作の逆を正しく定義する必要がある。
- **Selected Approach**: 2 の逆操作方式。`chartReducer` の各アクションが `{ next, inverse }` を返す形にする。
- **Rationale**: 全体オフセット（Req 7.8）の逆が単純な負オフセットで表せ、スナップショットより意図が明確。`usePracticeSession` の reducer 流儀とも揃う。
- **Trade-offs**: アクションを追加するたびに逆を定義する必要がある。定義漏れが Undo のバグになる。
- **Follow-up**: reducer のテストで「任意のアクション列 → 全 Undo → 初期状態に一致」の性質を検証する。

### Decision: GA スクリプトをクライアントコンポーネントへ切り出す

- **Context**: Req 9.3 を満たすには `AnalyticsPageViewTracker` だけでなく GA の自動 page_view も抑える必要がある。
- **Alternatives Considered**:
  1. ルートグループ（`(main)` / `(tools)`）でレイアウトを分ける — 既存全ページの移動を伴う。
  2. GA の `<Script>` を `usePathname()` を読むクライアントコンポーネントに切り出す（採用）。
  3. 何もせず既知の制約として受け入れる — 要件が「shall NOT」であり不可。
- **Selected Approach**: 2。除外パス一覧は `excludedPaths.ts` に単一定義し、トラッカーと GA スクリプトの双方が参照する。
- **Rationale**: 変更が 1 ファイルの切り出しと 1 定数の追加に収まり、除外パス以外の挙動は変わらない。
- **Trade-offs**: ルートレイアウトに手を入れるため、既存の全ページに回帰リスクが及ぶ。テストで既定パスの GA 描画を担保する。
- **Follow-up**: 既存ページで GA スクリプトが従来どおり出力されることを回帰テストで固定する。

---

## Risks & Mitigations

- **検出精度が実映像で成立しない** — 実映像なしに閾値は決められない。`AnalysisParams` を UI から調整可能にし（Req 4.5）、Pass B が純関数で即時再実行できる構成にすることで、実データ入手後のチューニングを設計変更なしに吸収する。
- **桁セルの等分割が成立しない（プロポーショナル表示・可変桁）** — 校正で桁数を指定させ、記述子の照合距離が閾値を超えるセルは「未解決」として低信頼に落とす。投影プロファイルによる桁境界検出は必要になった時点で `descriptors` 内に閉じて追加できる。
- **rVFC 高速再生時のフレーム欠落** — `presentedFrames` の増分で欠落を検出し、欠落区間を `SampleTimeline` に「欠測」として記録する。欠測区間をまたぐ変化は信頼度を落とす。
- **`.mov` が環境によって再生できない** — MIME 付け替えで大半を救い、残りは Req 1.3 のエラー表示で mp4 変換を案内する。
- **Req 5.5 の性能目標を割る** — `FrameSource` を差し替え可能にしてあるため、WebCodecs 実装の追加で対処できる。本スペックでは非対象とし、別スペックに切り出す。
- **ルートレイアウト変更による既存ページへの回帰** — GA スクリプト切り出しは描画内容を変えない純粋な移動に留め、既存パスでの出力を回帰テストで固定する。
- **フィーチャー間 import 禁止規約との衝突** — `ArcadeController` の import は Req 9.4 に基づく明示的な例外として `design.md` に記録し、それ以外のフィーチャーへの依存は禁止のまま維持する。

---

## References

- [MDN: HTMLVideoElement.requestVideoFrameCallback()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) — フレーム供給方式の中核 API。`mediaTime` / `presentedFrames` の意味を確認
- [Web platform features explorer: requestVideoFrameCallback()](https://web-platform-dx.github.io/web-features-explorer/features/request-video-frame-callback/) — 2024-10 以降クロスブラウザで利用可能になったことの確認
- [Can I use: requestVideoFrameCallback](https://caniuse.com/mdn-api_htmlvideoelement_requestvideoframecallback) — 対応バージョンの確認
- [W3C WebCodecs sample: video decode & display](https://w3c.github.io/webcodecs/samples/video-decode-display/) — WebCodecs 方式を採らない判断の根拠（デマクサが別途必要）
- [bilibili/web-demuxer](https://github.com/bilibili/web-demuxer) — mov を含む多コンテナ対応デマクサ。将来の `FrameSource` 追加実装の候補
- [Chrome does not play some videos with type "video/quicktime"](https://secure.phabricator.com/T13135) — `.mov` MIME 拒否の挙動
- [video.js issue #423](https://github.com/videojs/video.js/issues/423) — 同上の追認と MIME 付け替え回避策

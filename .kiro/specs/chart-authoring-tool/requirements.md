# Requirements Document

## Project Description (Input)
実況者のプレイ動画（画面録画ファイル）から「何分何秒にどの入力があったか」を抽出し、修正・エクスポートするための譜面作成ツール（プロトタイプ）。Next アプリ内の新ページとしてブラウザ内で完結させる。機能：(1) 画面録画ファイル（mp4/mov）をローカルで読み込み <video>+canvas で解析、動画はどこにも送信しない。(2) 校正ステップ：ユーザーが HUD 領域（右側の武装スロット×最大5、弾数数字、CHARGE表示、下部ブーストゲージ）を矩形指定。対象はアーケード EXVS2 OB/XB の HUD レイアウト。(3) 自動検出：弾数の変化（減少）で射撃系入力（射撃/サブ/特射/特格、スロット横の3つ丸のボタン表示で種別を判定）、CHARGE表示の点灯/消灯でチャージ開始/終了、ブーストゲージの急減で BD/ステップ候補を検出。格闘は自動検出しない。(4) GUI での手動微修正：動画をコマ送り（1/30秒）しながら、検出結果の一覧を時刻順に表示し、追加・削除・時刻調整・入力種別変更（ButtonType に準拠）ができる。既存 ArcadeController の入力を流用してラベル付けできてもよい。(5) エクスポート：{ source: {type:'file'|'youtube', videoId?, offsetMs}, steps: [{ tMs, input, confidence, origin:'auto'|'manual' }] } 形式の JSON をダウンロード（後続の練習モードが読む譜面フォーマット）。CSV は任意。非対象：YouTube からの動画取得、格闘の自動検出、譜面を使った練習モード本体（別スペック）。既存の ButtonType（src/types）と整合させる。

---

## Introduction

譜面作成ツールは、実況者のプレイ動画を画面録画したファイルを入力として、「何分何秒にどの入力があったか」を表す譜面データを作るための、開発者（譜面作成者）向けのブラウザ内ツールである。HUD の弾数・CHARGE 表示・ブーストゲージの変化から入力タイミングを自動検出し、検出結果をコマ送り GUI で人が確認・修正した上で、後続の「譜面を使った練習モード」が読み込める JSON として書き出す。

このスペックはプロトタイプであり、譜面作成者が PC のブラウザで使うことを前提とする。動画ファイルはブラウザの外へ送信せず、解析はすべてローカルで完結する。

## Boundary Context

- **In scope**:
  - 画面録画ファイル（mp4 / mov）のローカル読み込みと再生
  - アーケード版 EXVS2 OB/XB の HUD レイアウトを対象とした校正（HUD 領域の矩形指定・スロットと入力種別の対応付け）
  - 弾数減少による射撃系入力（射撃・サブ・特射・特格）の自動検出
  - CHARGE 表示の点灯・消灯によるチャージ開始・終了の自動検出
  - ブーストゲージの急減によるブースト系入力候補（BD）の自動検出
  - 検出結果の時系列一覧表示と、コマ送りによる目視確認
  - 検出結果の手動修正（追加・削除・時刻調整・入力種別変更）
  - 譜面 JSON のエクスポートと、既存譜面 JSON の再読み込み（再編集）
- **Out of scope**:
  - YouTube などの外部サービスからの動画取得・ダウンロード
  - 格闘入力の自動検出
  - ステップ入力を表す `ButtonType` の新設（既存の `ButtonType` の範囲で表現する）
  - 譜面を使った練習モード本体（別スペック `chart-practice` で扱う）
  - 家庭用 MBON など、アーケード版以外の HUD レイアウトへの対応
  - スマートフォンでの利用（本ツールは PC ブラウザ前提とし、横画面ガードは適用しない）
  - 動画のサーバーアップロード、譜面のサーバー保存
- **Adjacent expectations**:
  - エクスポートする譜面の `input` は既存の `ButtonType`（`src/types`）の値のみを使うこと
  - 譜面 JSON は後続の練習モードスペックが読み込む共通フォーマットとなるため、型定義を `src/types` に置き、両スペックで共有すること
  - 既存のアーケードコントローラ UI（`ArcadeController`）を手動ラベル付けの入力手段として流用できること

---

## Requirements

### Requirement 1: 動画ファイルの読み込みとローカル再生

**Objective:** As a 譜面作成者, I want 画面録画ファイルをブラウザに読み込んで再生できる, so that 動画をどこにも送信せずに解析と確認ができる

#### Acceptance Criteria

1. When a user selects a local video file (mp4 or mov), the 譜面作成ツール shall load it into an in-browser video player and display its duration and resolution
2. The 譜面作成ツール shall keep the selected video file entirely in the browser and shall not transmit it to any server
3. If the selected file cannot be decoded by the browser, then the 譜面作成ツール shall display an error message naming the unsupported file and keep the previous state
4. While a video is loaded, the 譜面作成ツール shall provide play, pause, and seek controls operating in milliseconds
5. When a user requests frame stepping, the 譜面作成ツール shall move the playback position forward or backward by one frame (1/30 second) and display that frame
6. The 譜面作成ツール shall display the current playback position in `mm:ss.mmm` format at all times while a video is loaded

---

### Requirement 2: HUD 領域の校正

**Objective:** As a 譜面作成者, I want 動画ごとに HUD の各領域を指定できる, so that 配信者ごとに異なる拡大率や配置でも自動解析が正しく動く

#### Acceptance Criteria

1. When a video is loaded, the 譜面作成ツール shall enter a calibration step before analysis can be started
2. While in the calibration step, the 譜面作成ツール shall let the user draw rectangular regions on the current video frame for: up to 5 weapon slots (each with an ammo-count area and a button-indicator area), a CHARGE indicator area per slot where present, and the boost gauge
3. When a weapon slot region is defined, the 譜面作成ツール shall attempt to classify the slot's input type (`shot`, `sub`, `special-shot`, `special-melee`) from its button-indicator area and display the proposed type
4. While in the calibration step, the 譜面作成ツール shall allow the user to override the input type assigned to each weapon slot
5. If analysis is started without at least one weapon slot region or without a boost gauge region, then the 譜面作成ツール shall block the analysis and indicate which regions are missing
6. When calibration is completed, the 譜面作成ツール shall persist the calibration in browser storage keyed by the video file name, and shall offer to reuse it when the same file name is loaded again
7. The 譜面作成ツール shall allow the user to adjust or redo the calibration at any time after analysis without discarding manual edits

---

### Requirement 3: 射撃系入力の自動検出

**Objective:** As a 譜面作成者, I want 弾数の変化から射撃系入力のタイミングが自動で検出される, so that 射撃・サブ・特射・特格を手で置かなくてよい

#### Acceptance Criteria

1. When analysis is run, the 譜面作成ツール shall sample every frame of the video (or at least 30 frames per second) within the calibrated regions only
2. When the ammo count of a weapon slot decreases between consecutive samples, the 譜面作成ツール shall record a detected step with that slot's input type at the time of the first frame showing the decreased value
3. When the ammo count of a weapon slot increases (reload), the 譜面作成ツール shall NOT record a detected step
4. When the ammo count of a weapon slot decreases continuously over consecutive frames (sustained fire), the 譜面作成ツール shall record a single detected step at the start of the decrease
5. The 譜面作成ツール shall attach a confidence value between 0 and 1 to every detected step, reflecting the clarity of the observed change
6. When the CHARGE indicator of a slot changes from off to on, the 譜面作成ツール shall record a detected step of the slot's charge-start type (`shot-charge-start` or `melee-charge-start`)
7. When the CHARGE indicator of a slot changes from on to off, the 譜面作成ツール shall record a detected step of the slot's charge-end type (`shot-charge-end` or `melee-charge-end`)
8. The 譜面作成ツール shall NOT attempt to detect melee (`melee`) inputs automatically

---

### Requirement 4: ブースト系入力候補の自動検出

**Objective:** As a 譜面作成者, I want ブーストゲージの急減からブースト系入力の候補が検出される, so that ズンダのような BD を含むコマンドの下書きが得られる

#### Acceptance Criteria

1. When the boost gauge decreases by more than a threshold within a short window (an instantaneous chunk consumption), the 譜面作成ツール shall record a detected step of type `bd` at the start of the drop
2. When the boost gauge decreases gradually (continuous consumption), the 譜面作成ツール shall NOT record a detected step for that gradual decrease
3. When the boost gauge increases (recovery), the 譜面作成ツール shall NOT record a detected step
4. The 譜面作成ツール shall assign boost-derived steps a lower default confidence than ammo-derived steps and visually mark them as candidates requiring confirmation
5. The 譜面作成ツール shall expose the boost drop threshold as an adjustable analysis parameter with a documented default

---

### Requirement 5: 解析の実行と進捗

**Objective:** As a 譜面作成者, I want 解析の進行状況が見えて途中で止められる, so that 長い動画でも安心して待てる

#### Acceptance Criteria

1. When the user starts analysis, the 譜面作成ツール shall display progress as the percentage of the video processed and the elapsed time
2. While analysis is running, the 譜面作成ツール shall allow the user to cancel, and when cancelled shall keep the steps detected up to that point
3. When analysis completes, the 譜面作成ツール shall display the total count of detected steps grouped by input type
4. When analysis is re-run after manual edits exist, the 譜面作成ツール shall ask the user whether to replace only auto-detected steps or discard all steps, and shall never silently delete manually added steps
5. The 譜面作成ツール should complete analysis of a 60-second 1080p clip within 3 minutes on a typical laptop browser
6. While analysis is running, the 譜面作成ツール shall keep the page responsive so that the user can still scrub the video

---

### Requirement 6: 検出結果の一覧とタイムライン

**Objective:** As a 譜面作成者, I want 検出結果を時刻順に一覧で見て動画の該当箇所へ飛べる, so that 目視確認が素早くできる

#### Acceptance Criteria

1. The 譜面作成ツール shall display all steps in a list sorted by time, showing time (`mm:ss.mmm`), input type label, confidence, and origin (`auto` or `manual`)
2. When the user selects a step in the list, the 譜面作成ツール shall seek the video to that step's time and display that frame
3. While the video is playing or being scrubbed, the 譜面作成ツール shall highlight the step nearest to the current playback position
4. The 譜面作成ツール shall render steps as markers on a timeline aligned with the video's duration, and when a marker is clicked shall seek to its time
5. The 譜面作成ツール shall allow filtering the list by input type, origin, and a minimum confidence

---

### Requirement 7: 検出結果の手動修正

**Objective:** As a 譜面作成者, I want 検出結果を追加・削除・時刻調整・種別変更できる, so that 自動検出の取りこぼしや誤検出、格闘入力を自分で補える

#### Acceptance Criteria

1. When the user adds a step at the current playback position, the 譜面作成ツール shall create a step with origin `manual`, confidence 1, and the input type chosen by the user
2. When the user presses a button on the arcade controller UI while the video is paused, the 譜面作成ツール shall add a step of that input type at the current playback position
3. When the user deletes a step, the 譜面作成ツール shall remove it from the list and the timeline
4. When the user adjusts a step's time by one frame forward or backward, the 譜面作成ツール shall move the step by 1/30 second and re-sort the list
5. When the user changes a step's input type, the 譜面作成ツール shall accept only values of the existing `ButtonType` and keep the step's time
6. When the user edits an auto-detected step, the 譜面作成ツール shall change its origin to `manual` and its confidence to 1
7. The 譜面作成ツール shall provide undo for the most recent 20 edit operations
8. When the user applies a global time offset, the 譜面作成ツール shall shift all steps by that offset without changing their relative order

---

### Requirement 8: 譜面フォーマットとエクスポート・再読み込み

**Objective:** As a 譜面作成者, I want 譜面を共通フォーマットの JSON として書き出し、後で読み込んで再編集できる, so that 練習モードに渡せて、作業を中断・再開できる

#### Acceptance Criteria

1. The 譜面作成ツール shall define the chart format as a versioned JSON object with `version`, `source` (`type` of `file` or `youtube`, optional `videoId`, optional `fileName`, `offsetMs`), and `steps` (each with `tMs`, `input`, `confidence`, `origin`)
2. The 譜面作成ツール shall place the chart type definition in the shared types module (`src/types`) so that other features can import it
3. When the user exports, the 譜面作成ツール shall download a JSON file containing all current steps sorted by `tMs`, with every `input` being a valid `ButtonType`
4. When the user exports, the 譜面作成ツール shall let the user set `source.type`, `source.videoId` (when `youtube`), and `source.offsetMs` before download
5. Where CSV export is enabled, the 譜面作成ツール shall download a CSV with one row per step and the same columns as the JSON step fields
6. When the user imports a previously exported chart JSON alongside a video, the 譜面作成ツール shall restore all steps into the list and timeline for further editing
7. If an imported chart JSON has an unknown `version` or contains an `input` that is not a valid `ButtonType`, then the 譜面作成ツール shall reject the import and report the offending field
8. The 譜面作成ツール shall keep the working chart in browser storage so that reloading the page does not lose unsaved edits

---

### Requirement 9: ツールの配置とアクセス

**Objective:** As a 開発者, I want 譜面作成ツールが既存アプリの一般ユーザー導線に混ざらない, so that プロトタイプが本番の練習体験を乱さない

#### Acceptance Criteria

1. The 譜面作成ツール shall be provided as a dedicated route in the Next application that is not linked from the main navigation menu
2. The 譜面作成ツール shall NOT apply the landscape-orientation guard used by the practice screens
3. The 譜面作成ツール shall NOT send analytics events for its own operations
4. The 譜面作成ツール shall reuse the existing arcade controller UI component without modifying its input-detection behavior

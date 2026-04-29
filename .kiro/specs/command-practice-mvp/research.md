# リサーチ・設計決定ログ

---

## Summary

- **Feature**: `command-practice-mvp`
- **Discovery Scope**: New Feature（グリーンフィールド）
- **Key Findings**:
  - Pointer Events API（`onPointerDown`/`onPointerUp` + `pointerId`追跡）がマルチタッチゲーム入力の現代標準であり、Touch Events より統一的で React とも相性が良い
  - Next.js App Router 環境での localStorage アクセスは SSR 対策として `useEffect` 内で行うパターンが確立しており、ジェネリック型のカスタムフック（`useLocalStorage<T>`）として抽象化するのが定石
  - コマンドシーケンス照合は XState 等の外部 FSM ライブラリなしで `useReducer` ベースの軽量ステートマシンで十分対応可能

---

## Research Log

### タッチ入力: Pointer Events vs Touch Events

- **Context**: Requirement 1.2, 1.6 のマルチタッチ対応実装方法の選定
- **Sources Consulted**:
  - [MDN Pointer Events Multi-touch](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Multi-touch_interaction)
  - [W3C Pointer Events Level 3 (2025)](https://www.w3.org/TR/2025/CR-pointerevents3-20251106/)
- **Findings**:
  - Pointer Events API はタッチ・マウス・スタイラスを単一インターフェースで処理できる現代標準
  - `pointerId` でアクティブタッチポイントを個別追跡でき、複数ボタン同時押しを実現可能
  - CSS `touch-action: none` をボタン要素に設定することで、ブラウザのデフォルトスクロール・ズームを無効化し、`pointercancel` イベントの誤発火を防止できる
  - `touch-action: manipulation` はダブルタップズームの 300ms 遅延を排除する軽量オプション（スクロールは残す場合に有効）
- **Implications**: `onPointerDown`/`onPointerUp` を React の合成イベントとして使用し、`pointerId` を `Map<number, ButtonType>` で管理する。ボタン要素に `touch-action: none` を適用する

### localStorage の SSR 安全なパターン（Next.js App Router）

- **Context**: Requirement 2.1, 2.4 のコマンドデータ永続化と Next.js の SSR 制約
- **Sources Consulted**:
  - [useLocalStorage hook for Next.Js (Medium)](https://medium.com/@lean1190/uselocalstorage-hook-for-next-js-typed-and-ssr-friendly-4ddd178676df)
  - [shadcn hooks - useLocalStorage](https://www.shadcn.io/hooks/use-local-storage)
  - [usehooks-ts useLocalStorage](https://usehooks-ts.com/react-hook/use-local-storage)
- **Findings**:
  - Next.js の SSR フェーズでは `window` オブジェクトが存在しないため、`localStorage` への直接アクセスはランタイムエラーになる
  - 解決策: `useEffect` 内でのみ localStorage にアクセスし、初期値はデフォルト値で hydration する
  - ジェネリック型 `useLocalStorage<T>(key: string, defaultValue: T)` パターンが型安全かつ再利用可能
  - クロスタブ同期は `storage` イベントで実現可能だが MVP スコープ外
- **Implications**: `useLocalStorage<T>` を `src/hooks/` に実装し、`useCommandStore`・`usePracticeLog` はこのプリミティブフックを組み合わせる形で構築する

### 画面向き検出（横画面ファースト）

- **Context**: Requirement 1.3, 1.4 の横画面レイアウト対応
- **Sources Consulted**:
  - [MDN Screen Orientation API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Object_Model/Managing_screen_orientation)
  - [MDN Screen.orientation](https://developer.mozilla.org/en-US/docs/Web/API/Screen/orientation)
- **Findings**:
  - `window.matchMedia("(orientation: landscape)")` がクロスブラウザで最も互換性が高い（Safari の `screen.orientation` 未対応を回避）
  - `MediaQueryList.addEventListener("change", handler)` で向き変更をリアクティブに検出可能
  - CSS メディアクエリ `@media (orientation: portrait)` で縦画面時のフォールバックUIをスタイリングできる
- **Implications**: `useLandscapeMode` フックを `matchMedia` ベースで実装する。縦画面検出時に `LandscapeGuard` コンポーネントが回転促進UIを表示する

### コマンドシーケンス照合: 軽量 FSM vs XState

- **Context**: Requirement 3.2, 3.3, 3.4 の入力シーケンスと目標コマンドの照合ロジック
- **Sources Consulted**:
  - [How to use finite state machines in React (TSH Blog)](https://tsh.io/blog/finite-state-machines-in-react)
  - [useStateMachine - 1kb FSM hook](https://github.com/cassiozen/useStateMachine)
- **Findings**:
  - プロトタイプの `zundaState` 変数によるステートマシンは単一コマンド専用の手動実装であり、汎用化が必要
  - XState は強力だが MVPの規模に対してオーバーエンジニアリング
  - `useReducer` で `{ currentIndex: number, status: 'idle' | 'active' | 'completed' }` を管理する軽量パターンが最適
  - ボタン入力毎にインデックスを進め、末端到達で成功判定・ミスでリセットする線形照合で十分
- **Implications**: `usePracticeSession` フックが `useReducer` で内部状態を管理する。外部FSMライブラリは導入しない

---

## Architecture Pattern Evaluation

| オプション | 説明 | 強み | リスク・制限 | 備考 |
|-----------|------|------|--------------|------|
| フィーチャーファースト（採用） | `src/features/` 配下に機能ドメインを配置 | ステアリング方針に合致、スケーラブル | 機能間のインポート規律が必要 | steering/structure.md の標準パターン |
| ページドリブン | `src/app/` にロジックを集中 | シンプル | 再利用性低、テスト困難 | MVP 初期には魅力的だが保守性に難あり |
| Atomic Design | Atoms/Molecules/Organisms 分割 | UI 一貫性 | 本プロジェクトの用語と合わない | オーバーエンジニアリング |

---

## Design Decisions

### Decision: Pointer Events API を採用（Touch Events ではなく）

- **Context**: Req 1.2, 1.6 - ボタンのタッチ入力とマルチタッチ同時押し
- **Alternatives Considered**:
  1. `onTouchStart`/`onTouchEnd` — 伝統的アプローチ
  2. `onPointerDown`/`onPointerUp` — 現代標準
- **Selected Approach**: Pointer Events API（`onPointerDown`/`onPointerUp`）+ `pointerId` 追跡
- **Rationale**: Pointer Events はマウス・タッチ・スタイラスを統一処理でき、PC ブラウザでのテスト（マウスクリック）も自然にサポートされる。`touch-action: none` で誤 cancel を防止できる
- **Trade-offs**: Pointer Events は Touch Events より抽象度が高いが、ゲームコントローラUIのような単純タップには十分
- **Follow-up**: 実機（iOS Safari）での `pointercancel` 発火パターンを実装時に確認する

### Decision: CommandStep を buttons 配列で表現（同時押し対応）

- **Context**: Req 1.6 - ボタン同時押し（射撃+格闘など）の表現
- **Alternatives Considered**:
  1. `button: ButtonType`（単一ボタンのみ）
  2. `buttons: ButtonType[]`（同時押し配列）
- **Selected Approach**: `CommandStep = { buttons: ButtonType[] }` の配列で表現
- **Rationale**: ズンダ以外のコマンドでも射撃+格闘の同時押し等が想定されるため、データモデルの段階から同時押しを正規表現に含める
- **Trade-offs**: 照合ロジックがやや複雑になるが、MVP 段階で型を正しくしておくことで将来の変更コストを削減できる
- **Follow-up**: MVP の照合ロジックでは順序不問の集合比較（`Set`）で同時押しを判定する

### Decision: ローカルストレージキースキームの定義

- **Context**: Req 2.1 - データ永続化
- **Selected Approach**: プレフィックス `ct_`（Command Trainer）を使用
  - `ct_commands` → `Command[]`
  - `ct_practice_logs` → `Record<string, PracticeLog>`
- **Rationale**: 他のアプリとの localStorage キー衝突を防ぐため名前空間を設ける

---

## Risks & Mitigations

- **iOS Safari の Pointer Events サポート不完全** — 実装時に `pointerId` の挙動を検証する。必要なら Touch Events へのフォールバックを `useControllerInput` 内で実装する
- **localStorage の容量制限（約5MB）** — 練習ログが肥大化する可能性。MVP 段階では上限を設けず、将来の Firebase 移行時にクリーンアップ戦略を策定する
- **Next.js SSR での hydration ミスマッチ** — `useLocalStorage` フックが `useEffect` で初期化されるため、サーバーとクライアントの初期レンダリングは同じデフォルト値を返す。hydration 完了まではデータが表示されない（loading state が必要）
- **横画面強制によるUX問題** — iOS では `screen.orientation.lock()` が PWA（フルスクリーン）以外で使用不可。ユーザーに物理回転を促すUIで対処する

---

## References

- [MDN Pointer Events Multi-touch](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Multi-touch_interaction)
- [W3C Pointer Events Level 3](https://www.w3.org/TR/2025/CR-pointerevents3-20251106/)
- [useLocalStorage hook for Next.js (SSR-safe)](https://medium.com/@lean1190/uselocalstorage-hook-for-next-js-typed-and-ssr-friendly-4ddd178676df)
- [MDN Screen Orientation API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Object_Model/Managing_screen_orientation)
- [useStateMachine](https://github.com/cassiozen/useStateMachine) — 参考のみ、MVPでは不採用

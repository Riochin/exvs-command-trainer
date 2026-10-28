---
name: add-unit
description: 入力リレーの 3D ビュー（next/src/features/input-relay）に EXVS の機体を 1 機足す。wiki の機体ページ URL（または機体名）を受け取り、参照元・手順書に沿って機体データ・見た目・技表・テストを作る。「機体を追加して」「〇〇を 3D ビューに入れて」「/add-unit <URL>」で使う。
argument-hint: <EXVS2IB wiki の機体ページ URL または機体名>
---

# 機体を足す

引数: `$ARGUMENTS`（wiki の機体ページ URL か機体名）

## 最初に読むもの

次の 3 つを読んでから始める。手順と判断はこれらに従う。

1. `.kiro/steering/exvs-references.md` — 参照してよい wiki と読み方
2. `.kiro/steering/unit-authoring.md` — 機体データの作り方（対応表・キャンセルルート・テスト・チェックリスト）
3. `.kiro/steering/unit-modeling.md` — 3D モデル（新しい背中の装備・武器が要るときだけ）

見本のコード: `next/src/features/input-relay/sim/units/_template.ts`（雛形）と `strike-rouge-ootori.ts`（実例）。

## 手順

1. **ページを開く**: 引数が URL ならそのページ、機体名なら EXVS2IB wiki の機体一覧（https://w.atwiki.jp/exvs2infiniteboost/pages/123.html ）から探す。atwiki は WebFetch だと 403 なので、アプリ内ブラウザ（`mcp__Claude_Browser__navigate` → `mcp__Claude_Browser__get_page_text`、`max_chars` は 30000 程度）で読む。
2. **書き出す**: 基本情報（コスト・BD 回数・パイロット・作品枠）、武装一覧、キャンセルルート、各武装の動き（足が止まるか・移動撃ちか・照射か・アメキャン対応か）とリロード。
3. **sim 本体を触る必要があるか判断する**: 既存の `AssistKind`・`ProjectileKind`・`buff: 'seed'`・`BackpackKind`・`MeleeWeaponKind` で表せない武装がある場合、どこに何を足すかを `unit-authoring.md`「新しい種類のアシスト・弾・時限強化が要るとき」で確かめる。大きな追加（新しいアシストの動きなど）はユーザーに方針を一言伝えてから進める。
4. **機体データ**: `_template.ts` を `sim/units/<機体id>.ts` にコピーして書く。先頭に wiki の URL・作品版・確認日。
5. **見た目**: `look` を書く。新しい装備が要れば `viewer/parts/equipment.tsx` に足す。
6. **登録**: `sim/units/index.ts` の export と `UNITS`。
7. **テスト**: `_template.test.ts` をコピーして `__tests__/features/input-relay/sim/units/<機体id>.test.ts`。world を動かすテスト（弾数・キャンセル・アメキャン・時限強化）は `rouge.test.ts` を見本に。
8. **確かめる**: `next/` で `pnpm test`・`pnpm typecheck`・`pnpm lint`。可能なら `pnpm dev` で `/3d` を開いて選び、主な技を出してみる。
9. **コミット**: 区切りごと（機体データ、見た目、テスト）に小さくコミットする。パッケージマネージャーは pnpm。

## 守ること

- 威力・ダウン値・よろけ・耐久・覚醒技は扱わない。慣性の残り方は機体ごとに変えない。
- wiki に無い数値は汎用機（`sim/actions.ts` の `ACTIONS`）の値から始め、「実機の値は未確認」とコメントを残す。
- 既存機体の挙動を変えない（既存のテストが通ること）。
- 文書・コメント・技表は日本語。
- 最後に `unit-authoring.md` のチェックリストを埋めて、満たしていない項目があれば報告する。

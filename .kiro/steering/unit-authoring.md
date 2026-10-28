# 機体の足し方（入力リレー 3D ビュー）

PC 側の 3D ビュー（`/3d`）に機体と技を足す手順。参照する wiki は `exvs-references.md`、見た目（3D モデル）の作り方は `unit-modeling.md`。Claude Code からは `/add-unit <wiki の機体ページ URL>`（`.claude/skills/add-unit/`）でこの手順を呼び出せる。

## 方針

- 再現するのは **動き・技のつながり（キャンセルルート）・弾数とリロード・時限強化・アシスト**。威力・ダウン値・よろけ・耐久・覚醒技は扱わない。
- 慣性の残り方・BD やステップの速さ・重力は全機体共通（`sim/actions.ts` の定数）。機体ごとに変えるのはブースト消費（`boostScale`）と技の中身だけ。
- 技は機体データ（`UnitDef`）に閉じる。sim の本体（`sim/step.ts`）を触るのは、新しい種類のアシスト・弾・時限強化が要るときだけ。
- 基準は EXVS2 INFINITEBOOST。wiki に無い数値（弾速・発生・硬直など）は汎用機の値から始めて、見た目で合わせる。

## ファイル構成

```
next/src/features/input-relay/
  sim/
    actions.ts          技の型 ActionDef・移動の仕方 MoveMode・姿勢 MovePose・アシスト AssistKind・汎用の技 ACTIONS
    cancel.ts           スロットの標準キャンセルルート CANCEL_RULES と、キャンセルの判定 cancelState
    step.ts             sim 本体。入力 → 技 → 動き・弾・アシスト・弾数
    types.ts            world の状態。弾の種類 ProjectileKind
    units/
      types.ts          機体データの型 UnitDef / ResolveContext / AmmoDef / UnitLook / CommandRow
      helpers.ts        actionMaker（id に接頭辞を付ける）、BOOST_STEP
      index.ts          UNITS（機体選択に並ぶ機体）と unitById
      generic.ts        汎用機
      strike-rouge-ootori.ts   ストライクルージュ（オオトリ装備）。レバー入れ・派生・時限強化・アシストの実例
      gquuuuuux.ts      GQuuuuuuX。追従アシストの再入力射撃・アシスト解除・特殊移動・鞭（長いリーチ）の実例
      _template.ts      新しい機体の雛形（UNITS には入れない）
  viewer/
    MechModel.tsx       機体モデル本体（姿勢とアニメーション）
    parts/equipment.tsx 背中の装備・格闘武器のモデル
    Assists.tsx         アシストのモデル
    Projectiles.tsx     弾の見た目
  UnitSelect.tsx        機体選択（UNITS と look・commands を表示する）
next/src/__tests__/features/input-relay/sim/
  rouge.test.ts         world を動かす機体テストの実例
  units/
    gquuuuuux.test.ts   world を動かす機体テストの実例（アサキャン・特殊移動・鞭など）
    contract.test.ts    全機体に共通の約束ごと（UNITS に足せば自動で確かめる）
    unitContract.ts     約束ごとの中身（キャンセル先の id、ammo のキーなど）
    _template.test.ts   機体テストの雛形
```

## 手順

1. **wiki を読む**: 機体一覧から機体ページを開き（`exvs-references.md` の読み方）、基本情報・武装一覧・キャンセルルート・各武装の解説（足が止まるか、アメキャン対応か、リロード）を書き出す。
2. **雛形をコピー**: `sim/units/_template.ts` を `sim/units/<機体id>.ts` にコピーする。機体 id は kebab-case の英語（例 `strike-rouge-ootori`）。接頭辞（`actionMaker('tpl')` の `'tpl'`）は短い英語（例 `rouge`）にする。先頭のコメントに wiki の URL・作品版・確認日を書く。
3. **技を書く**: 下の対応表に沿って武装ごとに `ActionDef` を作る。
4. **resolve を書く**: スロット × レバー × 状況（BD 中・時限強化中・装備射出中・今出している技）から技を返す。出せないときは `{ reject: '理由' }`。
5. **キャンセルルートを書く**: wiki のキャンセルルート欄を各技の `cancels.into` に写す。
6. **弾数・BD 回数・時限強化**: `ammo`、`boostScale`、`seed*` を書く。
7. **見た目と技表**: `look`（配色・背中の装備・格闘武器）と `commands` を書く。新しい装備のモデルが要るときは `unit-modeling.md`。
8. **登録**: `sim/units/index.ts` で export し、`UNITS` に足す。
9. **テスト**: `_template.test.ts` をコピーして `units/<機体id>.test.ts` を作る。world を動かすテストは `rouge.test.ts` を見本にする。`contract.test.ts` は UNITS を全部見るので書き足さなくてよい。
10. **確かめる**: `next/` で `pnpm test`・`pnpm typecheck`・`pnpm lint`。`pnpm dev` で `/3d` を開き、機体選択（設定モーダル）から選んで動かす（キーボード: WASD・十字キーと J/O/[ など）。

## wiki の項目 → 機体データの対応表

### 入力とスロット

| wiki の入力 | スロット（`MechAction`） | resolve での出し分け |
|------|------|------|
| メイン射撃 | `shot` | |
| 射撃CS | `shot-cs` | |
| N/前/横/後 サブ射撃 | `sub` | `ctx.lever`（`'N' \| 'front' \| 'side' \| 'back'`） |
| N特殊射撃・レバー入れ特殊射撃 | `special-shot` | `ctx.lever` |
| N格闘・前格闘・横格闘 | `melee` | `ctx.lever` |
| 後格闘 | `melee` | `ctx.lever === 'back'`（格闘中の後ろ入力は後派生なので先に判定する） |
| BD格闘 | `melee` | `ctx.inBd` |
| 格闘の 2・3 段目 | `melee` | `ctx.currentSlot === 'melee'` かつ `ctx.current` が同じ格闘なら `current` をそのまま返す。段数は `comboMax` |
| 派生（後派生・前派生・射撃派生） | 派生を入れるボタンのスロット | `ctx.current?.id` が派生元で、`ctx.lever` が派生の向き。返した技の id を派生元の `cancels.into` に入れる |
| N/横/後 特殊格闘 | `special-melee` | `ctx.lever` |
| 格闘CS | `melee-cs` | |
| ジャンプ・BD・ステップ | `jump` / `bd` / `step` | 機体で変えない。`default: return ACTIONS[slot]` |

- レバーは「後ろ ＞ 横 ＞ 前」の順で優先される（斜め後ろは後ろ）。
- その機体に無い武装は `{ reject: '○○なし' }` を返す（HUD に出る）。

### 技の性質（`ActionDef`）

| wiki の記述 | 書き方 |
|------|------|
| 普通の BR（移動撃ち。慣性が残る） | `move: 'free'`。`cancels.early: ['step']` で撃ちながらステップできる |
| 足を止めて撃つ（構え撃ち・照射・アシスト呼出） | `move: 'halt'` |
| 横に移動しながら撃つ（バレルロールなど） | `move: 'roll'`、`speed`、`boostCost` |
| 格闘の踏み込み | `move: 'lunge'`、`speed`、`lungeTime`、`strike: true`、`fireAt` を判定が出る時刻に |
| 回り込む横格 | `curve`（m/s） |
| N段の格闘 | `comboMax: N` |
| 照射・連射・ミサイル一斉発射 | `volley: { count, interval }` |
| 2 種類の弾を同時に撃つ（ビーム＋レールガン） | `projectiles: [A, B]`（`projectile` の代わり） |
| 弾数を 2 使う | `ammoCost: 2` |
| アシスト呼出 | `assist: '<AssistKind>'`、`pose: 'summon'` |
| メインに連動して撃つ追従アシスト | 呼出の技に `assist`、メインに `linkAssists: true` |
| 時限強化（SEED 発現など） | `buff: 'seed'` と、`UnitDef` の `seedDuration`・`seedCooldown`・`seedBoostScale`・`seedSpeedScale` |
| 時限強化中だけ変わる技 | resolve で `ctx.seed` を見て別の技を返す（強化版は `{ ...base, label, projectiles }` で作ってよい） |
| 時限強化をまた使えるまでの待ち | resolve で `ctx.seedCooldown > 0` なら `{ reject: '○○チャージ中' }` |
| 背中の装備を射出（オオトリなど） | `assist: 'ootori'`。射出中は `ctx.packOut` が true |
| 追従アシストを展開し、再入力でアシストだけ撃つ（エスビットなど） | 展開の技に `assist`。resolve で `ctx.assists.includes(…)` なら、弾を持たず `linkAssists: true` の技（`move: 'free'`）を返す |
| アシストが出ているあいだは出せない | resolve で `ctx.assists` を見て `{ reject: '…' }` |
| 追従アシストを投げつけて解除する | `dismissAssist: '<AssistKind>'`（fireAt で消える） |
| 特殊移動（レバーで前・横・後ろへ動く） | `move: 'roll'`、`moveDir: 'front' \| 'side' \| 'back'`、`speed`。弾も判定も無くても `fireAt` を小さく書くと、そこからキャンセルが開く。連続入力できるなら `comboMax` を大きく |
| 鞭・巨大サーベルのような長いリーチの格闘 | `reach`（m。省略時は 5） |
| 投げる・構える姿勢 | `pose: 'throw'` など（`MovePose`）。省略するとスロットから決まる |

弾（`ProjectileSpec`）は機体ファイルの先頭に定数で置く。`kind` は `sim/types.ts` の `ProjectileKind` から選び、見た目は `viewer/Projectiles.tsx` の `LOOKS`。

### 弾数とリロード（`ammo`）

wiki の各武装のリロード表を写す。キーは技の `ammo` に書く名前。

| wiki | `AmmoDef` |
|------|------|
| 弾数 8、常時/3秒 | `{ label: 'BR', max: 8, reload: 3, mode: 'each' }` |
| 撃ち切り/14秒 | `mode: 'empty'`（撃ち切ってから全弾戻る） |
| 時限強化中はリロードが速い | `seedReload` |
| 時限強化の発動で全回復 | `refillOnSeed: true` |
| 射出した装備が戻るまでリロードしない | `waitsForPack: true` |
| アシストが消えてからリロード（「アシスト消滅 7 秒」など） | `waitsForAssists: ['<AssistKind>', …]` |
| 弾数「-」（無限）、CS | `ammo` を書かない |

### 右下の武装パネル（`weapons`）とチャージ時間（`chargeTime`）

画面右下に、上から 1 行ずつ出す。行の左に押すボタン（射撃・格闘・ジャンプ）が並び、`buttons` に書いたものだけ光る。パネルの名前は武装の固有名ではなく、押し方から決まる呼び名（ビームライフル・サブ射撃・特殊射撃・特殊格闘・後格闘・格闘チャージ）で統一している（`weaponPanelName`）。

| 武装 | `WeaponPanelDef` |
|------|------|
| メイン（射撃 CS あり） | `{ ammo: 'main', buttons: ['shot'], charge: 'shot' }`（CHARGE ゲージがメインの行の 2 段目に出る） |
| サブ | `{ ammo: 'sub', buttons: ['shot', 'melee'] }` |
| 特射 / 特格 | `buttons: ['shot', 'jump']` / `['melee', 'jump']` |
| 後格など、レバーが要る技 | `buttons: ['melee'], lever: 'back'` |
| 格闘 CS（弾なし） | `{ buttons: ['melee'], charge: 'melee' }`（コマンドの上に CHARGE!。時限強化中は残り秒数） |
| 時限強化中だけ使える武装（オメガ中の鞭など） | `onlyInSeed: true` |

- `ammo` のキーはどれも 1 行ずつ `weapons` に入れる（契約テストで確かめる）。弾もチャージもない技（弾数「-」の特格など）は入れない。
- CS は満タンになってから離したときだけ出る。満タンまでの秒数（チャージ開始から）は `chargeTime: { shot, melee }`。wiki に「チャージ 2 秒」などがあれば写し、無ければ省いて標準の 2 秒にする。

### BD 回数（`boostScale`）

汎用機の BD 回数をおよそ 4 回として、`boostScale = 4 / BD回数`。時限強化中に BD 回数が増える機体は `seedBoostScale = 4 / 強化中のBD回数`。

## キャンセルルートの書き方

- 技に `cancels` を書くと、その技からは **スロットの標準ルート（`cancel.ts` の `CANCEL_RULES`）の代わりに** これを使う。書かなければ標準ルート。
- `into` には **スロット名**（`'sub'` ならそのスロットのどの技でも）か **技の id**（`'rouge-ootori'` ならその技だけ）を書く。
  - wiki の「メイン→各サブ」は `'sub'`。
  - 「メイン→後格」は `'melee'` ではなく後格の id（`'melee'` と書くと N格・横格にもキャンセルできてしまう）。
- BD とステップへのキャンセルはほぼ全技にあるので `...BOOST_STEP` を入れる。
- `opens: 'afterFire'` は弾や攻撃が出たあとから受け付ける（ふつうはこれ）。`'always'` は最初から。
- `early` は `afterFire` でも弾が出る前から出せるもの（移動撃ち BR からのステップ）。
- 時限強化中だけ増えるルートは、resolve で `ctx.seed` のときに `cancels.into` を足した技を返す（ストライクルージュのメインが実例）。
- 格闘の追加入力（同じ技の次の段）は `into` に `'melee'` を入れておき、段数は `comboMax` で止める。
- 派生は、派生先の id を派生元の `into` に入れる（例: 後特格 → `'rouge-throw-derive'`）。

`contract.test.ts` が、`into` に書いた名前がスロット名か「resolve から出せる技の id」かを確かめる（打ち間違いを見つける）。

## アメキャン・キャンセル落下（`fallCancel`）

wiki に「アメキャン対応」「メインでキャンセルすると落下」とある技に `fallCancel: true` を付け、`cancels.into` に `'shot'` を入れる。メインでキャンセルすると上昇を打ち消して落ち始める。HUD には、アシストかサブなら「アメキャン」、それ以外は「キャンセル落下」と出る。後格メインのような降りテクも同じ書き方（後格に `fallCancel`、`into` に `'shot'`）。

メイン以外で落ちる技（追従アシストに撃たせるサブで降りる「アサキャン」など）は、落ちる側の技に `fallOnCancel: true` を付ける。キャンセル元の技の `fallCancel` と `cancels.into`（落ちる側の技の id かスロット名）が要るのはメインと同じ。HUD には「アサキャン」と出る。

## 技表（`commands`）と説明

機体選択の画面に出す。1 行 1 武装で、`input` に入力（「サブ（射撃＋格闘）」「後格」）、`name` に武装名、`note` にキャンセルや降りテクなど練習で大事なことを短く書く。

ボタンの組み合わせ: サブ＝射撃＋格闘、特射＝射撃＋ジャンプ、特格＝格闘＋ジャンプ、CS＝長押しして離す。

## 新しい種類のアシスト・弾・時限強化が要るとき

機体データだけでは足りないので、sim と描画を触る。触る場所:

| 足すもの | 場所 |
|------|------|
| アシスト | `sim/actions.ts` の `AssistKind` → `sim/step.ts` の `ASSIST_LIFE`・`spawnAssist`・`stepAssists`（動きと射撃）・`LINKED_ASSIST_SHOTS`（`linkAssists` で撃つ追従アシストの弾）→ `viewer/Assists.tsx` の `POOL`・`MODELS`。展開中は出せない、などは resolve で `ctx.assists` を見て書く |
| 弾の種類 | `sim/types.ts` の `ProjectileKind` → `viewer/Projectiles.tsx` の `LOOKS` |
| 時限強化 | いまは `buff: 'seed'` だけ。別の名前の強化（トランザムなど）も、まず `seed` の仕組み（`seedTime`・`ctx.seed`・`seed*`）で書けないか考える。オーラの色は `viewer/parts/Part.tsx` の `SEED_AURA` 固定 |
| 背中の装備・格闘武器 | `unit-modeling.md` |

追加した型（`Record<AssistKind, …>` など）は描画側の表に足し忘れると型エラーになるので、`pnpm typecheck` を手がかりにする。

## テストの書き方

- **resolve のテスト**（`_template.test.ts` の形）: 各スロット × レバーで出る技の id、BD 格、追加入力と派生、時限強化中の差し替え、`cancels.into` の中身、出せないときの理由。
- **world のテスト**（`rouge.test.ts` の形）: `createWorld({ unitId })` → `applyInput(world, 'shot')`・`setLever(world, 'back', true)` → `stepWorld(world, FIXED_DT)` で進める。確かめるとよいもの:
  - 弾数が減り、撃ち切ると「弾切れ」、リロード秒数で戻る
  - wiki のキャンセルルートにある組み合わせが `'canceled'`、無い組み合わせが `'rejected'`（「キャンセル不可」）
  - アメキャン対応の技 → メインで `vel.y <= 0` になり、HUD に「アメキャン」
  - 時限強化の発動・終了・再使用までの待ち、強化中のリロード
- 弾が出るまで進めるには `for (…; !world.mech.actionFired; …) stepWorld(…)`。
- 機体は原点、敵は z=-40 にいる（前レバー・敵へ向かう動きは z が減る）。距離を変えるときは `world.mech.pos.z` を書き換え、敵の左右の揺れを止めるなら `world.enemy.moves = false`。

## チェックリスト

- [ ] 機体ファイルの先頭に wiki の URL・作品版・確認日
- [ ] 武装一覧のすべての行が resolve のどこかで出る（無い武装は reject）
- [ ] キャンセルルート欄の全項目を `cancels.into` に写した（後格などは id で）
- [ ] アメキャン対応の技に `fallCancel` と `into: [..., 'shot']`
- [ ] 弾数・リロード方式（常時 / 撃ち切り）・時限強化中のリロード
- [ ] `boostScale = 4 / BD回数`（強化中は `seedBoostScale`）
- [ ] `look`（配色 4 色・背中の装備・格闘武器）と `commands`
- [ ] `weapons`（右下の武装パネル。弾ごとの行・押すボタン・チャージ）と、wiki にあれば `chargeTime`
- [ ] `units/index.ts` の export と `UNITS`
- [ ] `units/<機体id>.test.ts`
- [ ] `pnpm test`・`pnpm typecheck`・`pnpm lint` が通る
- [ ] `/3d` で選んで、主な技とキャンセルを実際に出してみた

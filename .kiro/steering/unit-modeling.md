# 機体の 3D モデルの作り方（入力リレー 3D ビュー）

3D ビューの機体・装備・アシストのモデルの作り方。技や弾数などのデータは `unit-authoring.md`。

## 方針

- **箱（`boxGeometry`）と円柱（`cylinderGeometry`）だけで組む**。外部の 3D モデルファイル（glTF など）は読み込まない。機体の見分けは配色と、背中の装備・武器のシルエットで付ける。
- 全機体で **体（脚・腰・胴・頭・腕）は共通**（`viewer/MechModel.tsx`）。機体ごとに変えるのは配色と、背中の装備・格闘武器（`viewer/parts/equipment.tsx`）。
- 姿勢は React の state を通さず、`useFrame` で sim の状態（`worldRef.current.mech`）を読んで ref の `rotation`・`visible`・`scale` を直接書き換える（毎フレームの再描画を避ける）。
- 大きさの目安: 機体の高さはおよそ 2.6 m（足元 y=0、頭 y≈2.6）。z が前（敵の方向）、x が右。

## 部品の構成（`MechModel.tsx`）

```
root            位置と向き（mech.pos, mech.yaw）
└ body          前傾・ステップの傾き・着地の沈み込み
  ├ 脚 ×2       leftLeg / rightLeg。股関節（y=1.15）を支点に rotation.x
  ├ 腰・フロントスカート
  ├ 胴          胸（chest 色）・ダクト（trim 色）・コクピット（accent 色）
  ├ 頭          V アンテナ（trim）・目（EYE、発光）
  ├ バックパック（共通の灰色の箱）＋ スラスター ×2（Flame）
  ├ 背中の装備  BACKPACKS[look.backpack]
  ├ 右腕        肩（y=2.0）を支点に rightArm.rotation.x。手先にライフル（muzzleGlow）
  ├ 左腕        leftArm。手先にシールド（shield）と格闘武器（saber グループの中に MELEE_WEAPONS[look.meleeWeapon]）
  ├ SEED オーラ・被弾の光・格闘の軌跡（saberTrail）
```

部品は `viewer/parts/Part.tsx` の `Part`（箱 1 つ。`args` が幅・高さ・奥行き、`position`、`rotation`、`color`、`emissive` で発光）で置く。

## 配色トークン（`UnitLook`）

機体データの `look` に 4 色と装備の名前を書く（`sim/units/types.ts`）。

| トークン | 使う場所 | 例（汎用機 / ルージュ） |
|------|------|------|
| `frame` | 手足・頭・腰など外装の大部分、翼 | `#eef0f3` / `#e5557f` |
| `chest` | 胸、肩の帯 | `#2546c9` / `#f2f2f4` |
| `accent` | 腰の中央・足先・脛・コクピット・シールドの縁・オオトリの胴 | `#d8352c` / `#2f3340` |
| `trim` | V アンテナ・胸のダクト・シールドの模様 | `#f2c21a` / `#f2c21a` |
| `backpack` | 背中の装備の名前（`BackpackKind`） | `'standard'` / `'ootori'` |
| `meleeWeapon` | 格闘武器の名前（`MeleeWeaponKind`） | `'saber'` / `'blade'` |

機体によらない色（関節の灰色 `GREY`、銃や砲身の `DARK`、目の `EYE`、スラスターの `THRUST`、ビームの `SABER`、実体剣の `BLADE`）は `viewer/parts/Part.tsx` に置いてある。

色は公式の配色をそのまま使わず、「外装の主色 → frame、胸の色 → chest、関節や差し色 → accent」と振り分けて、機体選択の色見本（`UnitSelect.tsx` が 4 色を並べる）で見分けがつくようにする。

## 背中の装備・武器を足す

触る場所は 2 か所だけ。

1. `sim/units/types.ts` の `BackpackKind`（または `MeleeWeaponKind`）に名前を足す
2. `viewer/parts/equipment.tsx` にモデルの関数を書いて、`BACKPACKS`（または `MELEE_WEAPONS`）に足す

`BACKPACKS` は `Record<BackpackKind, …>` なので、1 だけして 2 を忘れると型エラーになる。

```tsx
/** エールストライカー: 大きな 2 枚翼 */
function AileBackpack({ look }: BackpackProps) {
  return (
    <group position={[0, 2.0, -0.7]}>
      <Part args={[0.5, 0.5, 0.4]} position={[0, 0, 0]} color={look.accent} />
      {([-1, 1] as const).map((side) => (
        <Part key={side} args={[0.12, 1.4, 0.5]} position={[side * 0.55, 0.3, -0.1]} rotation={[0, 0, side * -0.5]} color={look.frame} />
      ))}
    </group>
  );
}
```

- 背中の装備の座標は胴（body）基準。共通のバックパックが `z≈-0.42` にあるので、それより後ろ（`z<-0.6`）に置く。
- 射出できる装備（オオトリのように `assist` で飛んでいくもの）は、射出される部分の `group` に `ref={detachRef}` を付ける。`packOut` の間、MechModel が隠す。射出したあとのモデルはアシストとして `Assists.tsx` に描く。
- 格闘武器は左手の先（`saber` グループ）に付き、原点が柄で `+y` が刃先。格闘中と格闘チャージ中だけ見え、それ以外はシールドが見える。
- ビーム状のもの（サーベルの刃、ビームの芯）は `meshBasicMaterial` に `transparent`・`blending={AdditiveBlending}`・`depthWrite={false}` で光らせる。
- 射撃武器（右手のライフル）はいまは全機体共通。機体ごとに変える必要が出たら、格闘武器と同じ形（`RangedWeaponKind` と `RANGED_WEAPONS`）で切り出す。銃口の光（`muzzleGlow`）の ref はライフルの先に付け直すこと。

## 姿勢（`pose`）とアニメーション

技の姿勢は `sim/actions.ts` の `MovePose`。技に `pose` を書けばそれを使い、書かなければスロットから決まる（`poseOf`）。

| `pose` | 体の動き（`MechModel.tsx` の `useFrame`） | 既定のスロット |
|------|------|------|
| `'shoot'` | 右腕を前に構え、撃った瞬間に反動 | 射撃・サブ・特射・射CS |
| `'throw'` | `shoot` と同じ腕の動き（投擲） | — |
| `'slash'` | 左腕を振りかぶって振り下ろす。踏み込み中は前傾。段ごとに振る向きを変える。軌跡を出す | 格闘・特格・格CS |
| `'summon'` | 右腕を高く掲げる（アシスト呼出・時限強化） | — |
| `'none'` | 構えない | ジャンプ・BD・ステップ |

ほかに、`mech` の状態でかかる動き:

- BD: 前傾し、脚を後ろへ流す。スラスターの炎（`isBoosting`）
- ステップ: 進む向きへ体を傾ける
- 空中: 脚をたたむ
- 着地硬直: 体を沈める
- 汎用機の特格（`move.id === 'special-melee'`）: 体を回す
- 時限強化中: オーラ（`seedAura`）。被弾: 赤い光（`hitGlow`）

新しい姿勢を足すときは、`MovePose` に名前を足し、`MechModel.tsx` の `isShooting` / `isSlashing` / `isSummoning` のような判定と、`useFrame` の中で腕や体の目標角度を決めるところに分岐を足す。角度は `ease(current, target, k)` で毎フレーム少しずつ寄せる（`k` が大きいほど速い）。技の進み具合は `progress(mech)`（0→1）、弾や判定が出たかは `mech.actionFired`。

特定の技だけ動きを変えたいとき（回転斬りなど）は、`mech.move?.id` で分岐する。

## アシストのモデル（`Assists.tsx`）

- 1 種類につき決まった数のモデル（`POOL`）を用意し、sim の `world.assists` に合わせて位置・向き・大きさ（出始めと消え際は小さく）を割り当てる。
- モデルは機体より小さめ（`scale` 0.75〜0.9）。戦闘機形態なら細長い胴と翼、人型なら機体と同じ組み方を簡略にする。
- 足すときは `AssistKind` に名前を足し、`POOL`（同時に何機出るか）と `MODELS`（モデルの関数）に足す。動き（追従・突撃・射撃）は `sim/step.ts` の `stepAssists` に書く（`unit-authoring.md` の「新しい種類のアシスト」）。

## 弾の見た目（`Projectiles.tsx`）

弾は全種類同じ円柱（白い芯 ＋ 加算合成の外殻）を `LOOKS` の `color`・`length`・`width` で伸縮して描く。新しい弾の種類は `ProjectileKind` に名前を足し、`LOOKS` に色と大きさを書く。

## 確かめ方

- `next/` で `pnpm dev` → `/3d` を開き、機体選択で選ぶ。キーボード（WASD・十字キーと J/O/[ など）で技を出して、構え・振り・装備の出し入れを見る。
- 背中の装備は、機体を回り込んで後ろから見る（敵を動かす設定にするとカメラが回り込む）。
- `pnpm typecheck` と `pnpm lint`（描画はテストしていない）。

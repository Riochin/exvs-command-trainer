// 縦キャンバスそのまま、ボタンだけ横向きに回したアケコンUI
// これは完全に「ズンダ」コマンドに特化した仕様になっている。アケコンボタンのUI配置はこれを参考にするべし。

let buttons = [];
let commandLog = [];
const MAX_LOG = 20;

let lastMessage = ""; // 表示中メッセージ
let messageTimer = 0; // 残りフレーム
let zundaCombo = 0; // 現在のズンダ連続回数
let messageMode = "none"; // 'none' | 'zunda' | 'summary'

let zundaState = 0;

// ボタン用の「論理的な画面サイズ」（横長として扱う）
let logicalWidth;
let logicalHeight;

// ボタン座標系の配置位置・角度
// （縦画面キャンバスの中で、どこにどの向きで置くか）
let padOriginX; // キャンバス上での原点X
let padOriginY; // キャンバス上での原点Y
let padRotation; // 回転角（度）

function setup() {
  createCanvas(windowWidth, windowHeight);
  angleMode(DEGREES);
  textFont("sans-serif");

  updateLayout();
  initButtons();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateLayout();
  initButtons();
}

// キャンバスサイズから「ボタンエリア」のサイズと位置・角度を決める
function updateLayout() {
  // ボタンレイアウト自体は横長想定
  logicalWidth = max(width, height) * 0.9; // 画面より少し小さめ
  logicalHeight = min(width, height) * 0.6; // 高さも少し小さめ

  // 縦画面の下の方に、右向きで置くイメージ
  padRotation = 0; // ここを 0 にすると「右向き」、90 にすると「上向き」など変えられる

  padOriginX = width * 0.5; // 画面中央X
  padOriginY = height * 0.6; // 画面のやや下寄り
}

// ボタン配置（論理座標系：横長）
function initButtons() {
  buttons = [];

  const marginSide = logicalWidth * 0.08; // 左右マージン
  const marginTop = logicalHeight * 0.2; // 上段のY位置
  const rowGap = logicalHeight * 0.22; // 今は未使用でもOK

  // 上段3ボタン用の幅
  const topWidth = logicalWidth - marginSide * 2;
  const baseX = marginSide + topWidth / 2; // 真ん中(K)のX

  // ボタン半径（4倍に拡大済み）
  const r = min(topWidth / 7, logicalHeight * 0.1) * 4;

  // 指の長さイメージで微妙に高さを変える
  const yIndex = marginTop + r * 0.3; // P（人差し指）少し上
  const yMiddle = marginTop; // K（中指）基準
  const yRing = marginTop + r * 0.6; // S（薬指）少し下

  // 横方向の配置（間隔広め）
  const dx = r * 2.3;

  // ★ ラベルを日本語に変更
  const labels = ["射撃", "格闘", "ジャンプ"];

  // P（左上）→ 射撃
  buttons.push({
    x: baseX - dx,
    y: yIndex,
    r,
    label: labels[0],
    pressed: false,
    prevPressed: false,
  });

  // K（中央上）→ 格闘
  buttons.push({
    x: baseX,
    y: yMiddle,
    r,
    label: labels[1],
    pressed: false,
    prevPressed: false,
  });

  // S（右上）→ ジャンプ
  buttons.push({
    x: baseX + dx,
    y: yRing,
    r,
    label: labels[2],
    pressed: false,
    prevPressed: false,
  });
}

function draw() {
  background(0);

  // 通常のUIなど（必要ならここで描画）

  // ボタンパッド用の座標系に切り替え
  push();
  translate(padOriginX, padOriginY); // 画面上の置き場所
  rotate(padRotation); // 回転（ここで向きだけ変えられる）

  // 原点を左上に合わせて、(0,0)〜(logicalWidth, logicalHeight) を使いやすくする
  translate(-logicalWidth / 2, -logicalHeight / 2);

  // パッド背景
  drawPadBackground();

  // ボタン入力判定（タッチ座標をこの座標系に変換してから使う）
  updateButtonState();

  // ボタン・ログ・ヒント描画
  drawButtons();
  drawCommandLog();
  drawHint();

  // ★ ズンダなどのメッセージを表示
  drawMessage();

  pop();
}

function drawMessage() {
  if (messageMode === "none" || !lastMessage) return;

  if (messageTimer > 0) {
    messageTimer--;
  }

  // ★ タイマー切れのときの挙動
  if (messageTimer === 0) {
    if (messageMode === "zunda") {
      // ズンダ表示が消える瞬間に「連続N回」を1回出す
      if (zundaCombo > 1) {
        lastMessage = `連続 ${zundaCombo} 回`;
        messageMode = "summary";
        messageTimer = 60; // サマリ表示時間
      } else {
        // 1回だけならサマリは出さずにリセット
        messageMode = "none";
        lastMessage = "";
        zundaCombo = 0;
      }
    } else if (messageMode === "summary") {
      // サマリ表示が終わったら完全リセット
      messageMode = "none";
      lastMessage = "";
      zundaCombo = 0;
    }
  }

  if (messageMode === "none" || !lastMessage) return;

  // 表示処理
  textAlign(CENTER, CENTER);
  textSize(32);
  fill(0, 0, 0, 180);

  const cx = logicalWidth / 2;
  const cy = logicalHeight * 0.35;
  rectMode(CENTER);
  noStroke();
  rect(cx, cy, logicalWidth * 0.6, 70, 10);

  fill(0, 255, 0);
  text(lastMessage, cx, cy);

  rectMode(CORNER);
}

// パッドの枠
function drawPadBackground() {
  noFill();
  stroke(180);
  strokeWeight(4);
  const margin = 10;
  rect(
    margin,
    margin,
    logicalWidth - margin * 2,
    logicalHeight - margin * 2,
    20,
  );

  noStroke();
  fill(255);
  textSize(18);
  textAlign(LEFT, TOP);
  text("p5.js Arcade Command Trainer", margin + 10, margin + 8);
}

// キャンバス座標 → ボタン座標系（論理座標）への変換
function screenToPad(px, py) {
  // 1. 原点を padOrigin に平行移動
  let x = px - padOriginX;
  let y = py - padOriginY;

  // 2. 回転の逆をかける（-padRotation）
  const rad = (-padRotation * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  let xr = x * cosR - y * sinR;
  let yr = x * sinR + y * cosR;

  // 3. 左上原点に合わせるために、logicalWidth/2, logicalHeight/2 を足す
  let lx = xr + logicalWidth / 2;
  let ly = yr + logicalHeight / 2;

  return { x: lx, y: ly };
}

function updateButtonState() {
  let points = [];

  // touches → パッド座標系に変換
  for (let t of touches) {
    const p = screenToPad(t.x, t.y);
    points.push(p);
  }

  // マウス (PC) も同様
  if (mouseIsPressed && touches.length === 0) {
    const p = screenToPad(mouseX, mouseY);
    points.push(p);
  }

  for (let btn of buttons) {
    btn.prevPressed = btn.pressed;
    btn.pressed = false;

    for (let p of points) {
      const d = dist(p.x, p.y, btn.x, btn.y);
      if (d <= btn.r) {
        btn.pressed = true;
        break;
      }
    }

    if (btn.pressed && !btn.prevPressed) {
      addCommand(btn.label);
    }
  }
}

function addCommand(label) {
  if (!label) return;
  commandLog.push(label);
  if (commandLog.length > MAX_LOG) {
    commandLog.shift();
  }

  handleZundaState(label);
}

// ★ ズンダ状態マシン
function handleZundaState(label) {
  const isJump = label === "ジャンプ";
  const isShot = label === "射撃";

  // 射撃・ジャンプ以外（例: 格闘）が来たら完全リセット
  if (!isJump && !isShot) {
    resetZundaCombo();
    zundaState = 0;
    return;
  }

  if (zundaState === 0) {
    // まだ何も揃っていない
    if (isJump) {
      zundaState = 1; // 「ジャンプ」スタート
    } else {
      // 射撃だけ来てもパターンにはならないので、完全リセット状態のまま
      resetZundaCombo();
      zundaState = 0;
    }
    return;
  }

  if (zundaState === 1) {
    // 「ジャンプ」までは揃っている
    if (isJump) {
      zundaState = 2; // 「ジャンプジャンプ」まで進行
    } else {
      // ここで射撃が来るのは「ジャ射」で失敗
      resetZundaCombo();
      zundaState = 0;
    }
    return;
  }

  if (zundaState === 2) {
    // 「ジャンプジャンプ」まで揃っている
    if (isShot) {
      // ★ ここで「ジャンプジャンプ射撃」が完成 → ズンダ成功
      if (messageMode === "zunda" && messageTimer > 0) {
        zundaCombo += 1; // 連続ズンダ中ならコンボ+1
      } else {
        zundaCombo = 1; // 新しいコンボ開始
      }

      lastMessage = `ズンダ！ x${zundaCombo}`;
      messageMode = "zunda";
      messageTimer = 60; // 約1秒表示
      zundaState = 0; // 1セット終わったので次のパターン待ち
    } else {
      // ここでジャンプが来るのは「ジャジャジャンプ」で失敗
      // ただし、このジャンプを「新しい1手目」として扱う
      resetZundaCombo();
      zundaState = 1; // このジャンプを1手目として再スタート
    }
    return;
  }
}

function resetZundaCombo() {
  zundaCombo = 0;
  messageMode = "none";
  lastMessage = "";
  messageTimer = 0;
}

function drawButtons() {
  if (buttons.length === 0) return;

  textAlign(CENTER, CENTER);
  textSize(buttons[0].r * 0.5);

  for (let btn of buttons) {
    if (btn.pressed) {
      fill(255, 80, 80);
    } else {
      fill(200, 50, 50);
    }
    noStroke();
    ellipse(btn.x, btn.y, btn.r * 2, btn.r * 2);

    noFill();
    stroke(0);
    strokeWeight(3);
    ellipse(btn.x, btn.y, btn.r * 2, btn.r * 2);

    noStroke();
    fill(255);
    text(btn.label, btn.x, btn.y);
  }
}

function drawCommandLog() {
  const margin = 20;
  const boxW = logicalWidth * 0.6;
  const boxH = logicalHeight * 0.22;

  const x = margin * 1.5;
  const y = logicalHeight - boxH - margin;

  noStroke();
  fill(0, 150);
  rect(x, y, boxW, boxH, 12);

  fill(255);
  textAlign(LEFT, TOP);
  textSize(14);
  text("Command Log (Right-hand buttons)", x + 12, y + 8);

  textSize(18);
  let logText = commandLog.join("  ");
  text(logText, x + 12, y + 32);
}

function drawHint() {
  const margin = 20;
  const x = margin * 1.5;
  const y = margin * 2.2;

  fill(255);
  noStroke();
  textAlign(LEFT, TOP);
  textSize(12);
  text(
    "操作説明:\n" +
      "- スマホ: ブラウザで開き、スマホ自体を回転させてください\n" +
      "- 押した順が下部の Command Log に表示されます\n" +
      "できる練習: ズンダ",
    x,
    y,
  );
}

// main.js
import { ClapDetector } from "./clap.js";

const W = 960;
const H = 540;

const world = {
  groundY: 410,
  gravity: 1300,
  runSpeed: 220,
  jumpVel: 560,
  fallKillY: 560,
  // 关卡长度（到福字）
  finishX: 5600,
};

const colors = {
  sky: 0x79c7ff,
  far: 0x73b3f3,
  grass: 0x52d273,
  ground: 0x2b8f49,
  dirt: 0x1e5e34,
  river: 0x2b7bff,
  hazard: 0x111c2f,
  cloud: 0xffffff,
  pony: 0xffe7a3,
  pony2: 0xffb7c5,
  obstacle: 0x1f2a44,
  fuRed: 0xff2b2b,
};

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

class Boot extends Phaser.Scene {
  constructor() { super("Boot"); }
  preload() {}
  create() {
    this.scene.start("Menu");
  }
}

class Menu extends Phaser.Scene {
  constructor() { super("Menu"); }
  create() {
    this.cameras.main.setBackgroundColor("#0b1020");

    const title = this.add.text(W/2, H/2 - 60, "PIXEL PONY\nCLAP JUMP", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "44px",
      fontStyle: "900",
      align: "center",
      color: "#ffffff",
    }).setOrigin(0.5);

    const sub = this.add.text(W/2, H/2 + 10, "点击启用麦克风，然后拍手跳跃", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "18px",
      color: "rgba(255,255,255,.85)"
    }).setOrigin(0.5);

    const btn = this.add.rectangle(W/2, H/2 + 80, 220, 52, 0xffffff, 1).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const btnText = this.add.text(W/2, H/2 + 80, "启用麦克风", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "18px",
      color: "#0b1020"
    }).setOrigin(0.5);

    btn.on("pointerdown", async () => {
      this.scene.start("Play");
    });

    // 允许键盘空格作为备用，避免你开发时被麦克风折磨
    this.add.text(W/2, H - 40, "开发备用：空格也能跳", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "14px",
      color: "rgba(255,255,255,.55)"
    }).setOrigin(0.5);

    this.tweens.add({ targets: title, y: title.y - 6, duration: 1200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }
}

class Play extends Phaser.Scene {
  constructor() { super("Play"); }

  create() {
    this.score = 0;
    this.combo = 0;
    this.passed = new Set();
    this.gameEnded = false;

    this._setupUI();
    this._setupWorld();
    this._setupInput();
  }

  _setupUI() {
    this.micStateEl = document.getElementById("micState");
    const setMic = (t) => { if (this.micStateEl) this.micStateEl.textContent = t; };

    this.hud = this.add.text(14, 14, "", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "16px",
      color: "#0b1020",
      backgroundColor: "rgba(255,255,255,.85)",
      padding: { x: 10, y: 8 }
    }).setScrollFactor(0).setDepth(999);

    this.hud2 = this.add.text(14, 58, "", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "14px",
      color: "#0b1020",
      backgroundColor: "rgba(255,255,255,.75)",
      padding: { x: 10, y: 8 }
    }).setScrollFactor(0).setDepth(999);

    this._setMic = setMic;
  }

  _setupInput() {
    // 拍手检测，成功触发时只调用 this._jump()
    this.clap = new ClapDetector({
      sensitivity: 1.15,
      threshold: 0.055,
      cooldownMs: 320,
      floor: 0.012,
      stateText: (t) => this._setMic(t),
      onClap: (m) => {
        if (this.gameEnded) return;
        this._jump();
      }
    });

    // 启动麦克风
    this.clap.start().catch(() => {
      this._setMic("麦克风权限未开启。你仍可用空格测试。");
    });

    // 备用键盘
    this.space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  _setupWorld() {
    this.cameras.main.setBackgroundColor(Phaser.Display.Color.IntegerToColor(colors.sky).rgba);

    this.physics.world.gravity.y = world.gravity;
    this.physics.world.setBounds(0, 0, world.finishX + 900, H);

    // 背景视差层（纯色矩形模拟）
    this.bgFar = this.add.tileSprite(0, 140, world.finishX + 900, 220, null)
      .setOrigin(0, 0).setScrollFactor(0.25);
    this.bgMid = this.add.tileSprite(0, 280, world.finishX + 900, 220, null)
      .setOrigin(0, 0).setScrollFactor(0.5);

    this._paintBackgroundStrips();

    // 地面段（坑/河就是缺口）
    this.groundGroup = this.physics.add.staticGroup();
    this.hazardRects = []; // 记录坑/河的 x 区间，用于判定掉落/越界
    this._buildGround();

    // 云平台
    this.cloudGroup = this.physics.add.staticGroup();
    this._buildClouds();

    // 障碍（草/花）
    this.obstacleGroup = this.physics.add.staticGroup();
    this._buildObstacles();

    // 终点福字
    this.finish = this._makeFu(world.finishX, world.groundY - 110);
    this.physics.add.existing(this.finish, true);

    // 小马
    this.pony = this._makePony(140, world.groundY - 40);
    this.physics.add.existing(this.pony);
    this.pony.body.setSize(28, 26, true);
    this.pony.body.setOffset(2, 6);
    this.pony.body.setCollideWorldBounds(false);
    this.pony.body.setMaxVelocity(600, 900);
    this.pony.body.setDragX(0);

    this.pony.body.setVelocityX(world.runSpeed);

    // 相机跟随
    this.cameras.main.startFollow(this.pony, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(160, 120);

    // 碰撞：地面 + 云
    this.physics.add.collider(this.pony, this.groundGroup);
    this.physics.add.collider(this.pony, this.cloudGroup);

    // 终点触发
    this.physics.add.overlap(this.pony, this.finish, () => {
      if (this.gameEnded) return;
      this._win();
    });

    // 障碍判定：进入障碍区间时，如果还在地上就结束；空中过则加分
    this.obstacleSensors = this._buildObstacleSensors();
  }

  _paintBackgroundStrips() {
    // 直接用 Graphics 画两条视差带
    const g1 = this.add.graphics().setScrollFactor(0.25);
    g1.fillStyle(colors.far, 1);
    g1.fillRect(0, 120, world.finishX + 900, 220);

    const g2 = this.add.graphics().setScrollFactor(0.5);
    g2.fillStyle(0x6ed18c, 1);
    g2.fillRect(0, 300, world.finishX + 900, 240);

    // 装饰点点（像素云/小点）
    const deco = this.add.graphics().setScrollFactor(0.35);
    deco.fillStyle(0xffffff, 0.85);
    for (let i = 0; i < 90; i++) {
      const x = 80 + i * 70;
      const y = 70 + (i % 7) * 8;
      deco.fillRect(x, y, 6, 3);
    }
  }

  _buildGround() {
    // 关卡地面：一段段 200 宽；随机留洞做坑/河
    // 河用蓝色贴片画在背景层，地面缺口一样是致命
    const segmentW = 200;
    const baseY = world.groundY;
    const total = Math.ceil((world.finishX + 900) / segmentW);

    const rng = this._mulberry32(42);

    for (let i = 0; i < total; i++) {
      const x = i * segmentW;
      const nearStart = x < 600;
      const nearFinish = x > world.finishX - 600;

      let gap = false;
      let river = false;

      if (!nearStart && !nearFinish) {
        const r = rng();
        if (r < 0.14) gap = true;       // 坑
        if (r >= 0.14 && r < 0.23) { gap = true; river = true; } // 河
      }

      if (!gap) {
        const ground = this._makeGroundSegment(x, baseY, segmentW);
        this.groundGroup.add(ground);
      } else {
        const gapStart = x;
        const gapEnd = x + segmentW;

        this.hazardRects.push({ x1: gapStart, x2: gapEnd, type: river ? "river" : "pit" });

        if (river) {
          const water = this.add.graphics();
          water.fillStyle(colors.river, 1);
          water.fillRect(gapStart, baseY + 18, segmentW, 200);
          water.setDepth(-1);
        } else {
          const dark = this.add.graphics();
          dark.fillStyle(colors.hazard, 1);
          dark.fillRect(gapStart, baseY + 18, segmentW, 200);
          dark.setDepth(-1);
        }
      }
    }
  }

  _makeGroundSegment(x, y, w) {
    const c = this.add.container(x, 0);
    const g = this.add.graphics();

    // 上层草
    g.fillStyle(colors.grass, 1);
    g.fillRect(0, y, w, 18);

    // 下层土
    g.fillStyle(colors.ground, 1);
    g.fillRect(0, y + 18, w, 70);

    // 更深
    g.fillStyle(colors.dirt, 1);
    g.fillRect(0, y + 88, w, 140);

    // 像素纹理点
    g.fillStyle(0x000000, 0.08);
    for (let i = 0; i < 40; i++) {
      g.fillRect((i * 23) % w, y + 26 + (i * 17) % 140, 3, 3);
    }

    c.add(g);

    // static body 用 invisible rect
    const bodyRect = this.add.rectangle(w/2, y + 10, w, 28, 0x000000, 0).setOrigin(0.5);
    c.add(bodyRect);
    this.physics.add.existing(bodyRect, true);
    // 让 container 作为静态体的视觉载体
    c.setDepth(1);
    bodyRect.body.setOffset(x, 0); // 不需要精确

    // Phaser staticGroup 需要直接添加 GameObject
    // 这里返回 bodyRect 作为碰撞体，视觉仍由 container 在同位置展示
    c.x = x;
    bodyRect.x = x + w/2;
    bodyRect.y = 0; // y 已经在 rect 内
    c.y = 0;

    // 把视觉 container 跟随 rect
    bodyRect._visual = c;
    bodyRect.preUpdate = function() {
      if (this._visual) this._visual.x = this.x - w/2;
    };

    return bodyRect;
  }

  _buildClouds() {
    const rng = this._mulberry32(7);
    for (let i = 0; i < 26; i++) {
      const x = 800 + i * 190 + Math.floor(rng() * 160);
      const y = 190 + Math.floor(rng() * 140);
      // 让部分云靠后段更密，给你“能跳上云”的体验
      const isPlatform = rng() > 0.35;

      const cloud = this._makeCloud(x, y, isPlatform ? 120 : 90, isPlatform ? 26 : 22);
      this.cloudGroup.add(cloud);

      // 如果不是平台，就把碰撞体做薄一点，几乎踩不到
      if (!isPlatform) cloud.body.setSize(40, 6, true);
    }
  }

  _makeCloud(x, y, w, h) {
    const g = this.add.graphics();
    g.fillStyle(colors.cloud, 0.95);
    g.fillRoundedRect(x, y, w, h, 10);
    g.fillStyle(0x000000, 0.06);
    g.fillRect(x + 10, y + h - 6, w - 20, 3);
    g.setDepth(0);

    // 用 invisible rect 作为碰撞体
    const r = this.add.rectangle(x + w/2, y + h/2, w, h, 0x000000, 0);
    this.physics.add.existing(r, true);
    r._visual = g;
    r.preUpdate = function() {
      if (this._visual) {
        // 不移动，不需要同步
      }
    };
    return r;
  }

  _buildObstacles() {
    // 草/花作为必须跳的“判定门”，视觉放在地面上
    const rng = this._mulberry32(99);

    for (let x = 680; x < world.finishX - 260; x += 260) {
      const r = rng();
      if (r < 0.55) {
        this._spawnObstacle(x + Math.floor(rng() * 90), "grass");
      } else {
        this._spawnObstacle(x + Math.floor(rng() * 90), "flower");
      }
    }

    // 终点前加几个连续障碍，让结尾更像“冲刺”
    for (let i = 0; i < 5; i++) {
      this._spawnObstacle(world.finishX - 760 + i * 130, i % 2 === 0 ? "flower" : "grass");
    }
  }

  _spawnObstacle(x, kind) {
    const y = world.groundY - 8;
    const o = this._makeObstacle(x, y, kind);
    this.obstacleGroup.add(o);
  }

  _makeObstacle(x, y, kind) {
    const g = this.add.graphics();
    if (kind === "grass") {
      g.fillStyle(0x1a5f2e, 1);
      g.fillRect(x, y, 22, 30);
      g.fillStyle(0x2fbf56, 1);
      g.fillRect(x + 3, y + 6, 16, 22);
      g.fillStyle(0x0b3b1b, 0.35);
      g.fillRect(x + 6, y + 10, 2, 18);
      g.fillRect(x + 12, y + 10, 2, 18);
    } else {
      g.fillStyle(0x2fbf56, 1);
      g.fillRect(x + 10, y + 10, 4, 22);
      g.fillStyle(0xff5fb2, 1);
      g.fillRect(x + 4, y, 16, 16);
      g.fillStyle(0xffffff, 1);
      g.fillRect(x + 10, y + 6, 4, 4);
    }
    g.setDepth(2);

    // sensor rect：不做碰撞，只用于区间判定
    const w = 54;
    const h = 52;
    const r = this.add.rectangle(x + 11, world.groundY - 26, w, h, 0x000000, 0);
    r.kind = kind;
    r.sensorX1 = (x - 12);
    r.sensorX2 = (x + 34);
    r.visual = g;
    return r;
  }

  _buildObstacleSensors() {
    // 这些 sensor 不走 physics overlap，直接用 x 区间判断更干净
    return this.obstacleGroup.getChildren();
  }

  _makePony(x, y) {
    const c = this.add.container(x, y);

    const g = this.add.graphics();
    // 身体
    g.fillStyle(colors.pony, 1);
    g.fillRect(0, 10, 34, 18);
    // 头
    g.fillStyle(colors.pony, 1);
    g.fillRect(22, 2, 16, 16);
    // 鬃毛
    g.fillStyle(colors.pony2, 1);
    g.fillRect(22, 0, 10, 6);
    // 腿
    g.fillStyle(0x2b2b2b, 1);
    g.fillRect(6, 28, 6, 10);
    g.fillRect(22, 28, 6, 10);
    // 眼睛
    g.fillStyle(0x1a1a1a, 1);
    g.fillRect(33, 8, 3, 3);
    // 尾巴
    g.fillStyle(colors.pony2, 1);
    g.fillRect(-6, 12, 6, 10);

    c.add(g);
    c.setDepth(3);

    return c;
  }

  _makeFu(x, y) {
    const c = this.add.container(x, y).setDepth(3);

    const g = this.add.graphics();
    g.fillStyle(colors.fuRed, 1);
    g.fillRoundedRect(-70, -70, 140, 140, 18);

    // 简化像素“福”字：不用字体，直接矩形拼
    g.fillStyle(0xfff1d6, 1);
    // 上横
    g.fillRect(-34, -40, 68, 10);
    // 中竖
    g.fillRect(-6, -40, 12, 88);
    // 左竖
    g.fillRect(-34, -40, 10, 88);
    // 中横
    g.fillRect(-34, -2, 68, 10);
    // 底横
    g.fillRect(-34, 36, 68, 10);
    // 右小竖
    g.fillRect(24, -2, 10, 58);

    // 外边框暗角
    g.fillStyle(0x000000, 0.12);
    g.fillRoundedRect(-70, -70, 140, 140, 18);

    c.add(g);

    // 终点碰撞体
    const r = this.add.rectangle(x, y, 120, 120, 0x000000, 0);
    r._visual = c;
    r.preUpdate = function() {
      if (this._visual) { /* 不同步 */ }
    };
    return r;
  }

  update(time, delta) {
    if (this.gameEnded) return;

    // 备用：空格跳
    if (Phaser.Input.Keyboard.JustDown(this.space)) this._jump();

    // 保持水平速度（避免落到云上摩擦导致减速）
    this.pony.body.setVelocityX(world.runSpeed);

    // 障碍判定：进入 sensor 区间且人在地上 -> Game Over；空中过 -> 加分
    for (const s of this.obstacleSensors) {
      if (!s || this.passed.has(s)) continue;
      const px = this.pony.x;
      if (px >= s.sensorX1 && px <= s.sensorX2) {
        if (this.pony.body.blocked.down) {
          this._gameOver(`撞上${s.kind === "grass" ? "草" : "花"}，需要跳。`);
          return;
        } else {
          this.passed.add(s);
          this.combo = clamp(this.combo + 1, 0, 999);
          this.score += 10 + Math.min(30, this.combo * 2);
        }
      }
    }

    // 掉落判定：y 太低直接结束
    if (this.pony.y > world.fallKillY) {
      this._gameOver("掉下去了。");
      return;
    }

    // 距离分：每帧按速度加一点
    this.score += (world.runSpeed * (delta / 1000)) * 0.06;

    // 走到终点附近时，给一点“冲刺提示”
    const remain = Math.max(0, world.finishX - this.pony.x);
    this.hud.setText(`Score: ${Math.floor(this.score)}    Combo: ${this.combo}`);
    this.hud2.setText(remain < 900 ? `终点剩余: ${Math.floor(remain)}px` : `拍手跳跃。掉坑/河 Game Over。`);
  }

  _jump() {
    if (this.gameEnded) return;
    const body = this.pony.body;

    // 只允许在地面或云上起跳
    if (body.blocked.down) {
      body.setVelocityY(-world.jumpVel);
      // 起跳时如果连击之前中断，重置会更干净：这里选择不重置，让玩家追求“空中连跳”更爽
    }
  }

  _win() {
    this.gameEnded = true;
    this.pony.body.setVelocity(0, 0);
    this.pony.body.allowGravity = false;

    this._setMic("通关。");

    const cam = this.cameras.main;
    const cx = cam.scrollX + W / 2;
    const cy = cam.scrollY + H / 2;

    const panel = this.add.rectangle(cx, cy, 520, 220, 0x000000, 0.45).setScrollFactor(0).setDepth(2000);
    const t1 = this.add.text(cx, cy - 50, "到达福字，通关", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "26px",
      color: "#ffffff"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    const t2 = this.add.text(cx, cy + 8, `Score: ${Math.floor(this.score)}`, {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "18px",
      color: "rgba(255,255,255,.9)"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    const t3 = this.add.text(cx, cy + 54, "点击重新开始", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "16px",
      color: "rgba(255,255,255,.8)"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    this.input.once("pointerdown", () => this.scene.restart());

    this.tweens.add({
      targets: [panel, t1, t2, t3],
      alpha: { from: 0, to: 1 },
      duration: 220,
      ease: "Sine.easeOut"
    });
  }

  _gameOver(reason) {
    this.gameEnded = true;
    this.combo = 0;

    this._setMic("Game Over。");

    // 停止物理
    this.pony.body.setVelocity(0, 0);
    this.pony.body.allowGravity = false;

    const cam = this.cameras.main;
    const cx = cam.scrollX + W / 2;
    const cy = cam.scrollY + H / 2;

    const panel = this.add.rectangle(cx, cy, 560, 240, 0x000000, 0.5).setScrollFactor(0).setDepth(2000);
    const t1 = this.add.text(cx, cy - 66, "GAME OVER", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "34px",
      color: "#ffffff"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    const t2 = this.add.text(cx, cy - 18, reason, {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "16px",
      color: "rgba(255,255,255,.85)"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    const t3 = this.add.text(cx, cy + 26, `Score: ${Math.floor(this.score)}`, {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "18px",
      color: "rgba(255,255,255,.9)"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    const t4 = this.add.text(cx, cy + 74, "点击重新开始", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "16px",
      color: "rgba(255,255,255,.8)"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    this.input.once("pointerdown", () => this.scene.restart());

    this.tweens.add({
      targets: [panel, t1, t2, t3, t4],
      alpha: { from: 0, to: 1 },
      duration: 220,
      ease: "Sine.easeOut"
    });
  }

  shutdown() {
    try { this.clap && this.clap.stop(); } catch {}
  }

  _mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}

const config = {
  type: Phaser.AUTO,
  parent: "app",
  width: W,
  height: H,
  backgroundColor: "#0b1020",
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: world.gravity },
      debug: false
    }
  },
  scene: [Boot, Menu, Play],
};

new Phaser.Game(config);

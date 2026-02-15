// main.js
import { ClapDetector } from "./clap.js";

const W = 960;
const H = 540;

const world = {
  groundY: 410,
  gravity: 750,
  runSpeed: 110,
  jumpVel: 500,
  fallKillY: 560,
  // Level length (distance to the goal tile)
  finishX: 5600,
};

const colors = {
  sky: 0x360404,
  far: 0x5b0a0a,
  grass: 0xc0392b,
  ground: 0x8c1a1a,
  dirt: 0x5a0d0d,
  river: 0x8c1a1a,
  hazard: 0x3b0505,
  cloud: 0xfff4d0,
  pony: 0x8b5a2b,
  pony2: 0xc58f50,
  obstacle: 0x431313,
  fuRed: 0xcf1e1e,
  lanternGold: 0xffe08a,
  lanternMid: 0xff6b6b,
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

    const sub = this.add.text(W/2, H/2 + 10, "Click to enable the mic, then clap to jump", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "18px",
      color: "rgba(255,255,255,.85)"
    }).setOrigin(0.5);

    const btn = this.add.rectangle(W/2, H/2 + 80, 220, 52, 0xffffff, 1).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const btnText = this.add.text(W/2, H/2 + 80, "Enable Mic", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "18px",
      color: "#0b1020"
    }).setOrigin(0.5);

    btn.on("pointerdown", async () => {
      this.scene.start("Play");
    });

    // Allow the keyboard spacebar as a backup so development isn't blocked by the mic
    this.add.text(W/2, H - 40, "Dev shortcut: spacebar jumps", {
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
    // Clap detection — when it fires we only call this._jump()
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

    // Start the microphone input
    this.clap.start().catch(() => {
      this._setMic("Microphone permission denied. You can still use the spacebar.");
    });

    // Keyboard fallback
    this.space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  _setupWorld() {
    this.cameras.main.setBackgroundColor(Phaser.Display.Color.IntegerToColor(colors.sky).rgba);

    this.physics.world.gravity.y = world.gravity;
    this.physics.world.setBounds(0, 0, world.finishX + 900, H);

    // Parallax background layers (just colored strips)
    this.bgFar = this.add.tileSprite(0, 140, world.finishX + 900, 220, null)
      .setOrigin(0, 0).setScrollFactor(0.25);
    this.bgMid = this.add.tileSprite(0, 280, world.finishX + 900, 220, null)
      .setOrigin(0, 0).setScrollFactor(0.5);

    this._paintBackgroundStrips();

    // Ground segments (pits/rivers are represented by gaps)
    this.groundGroup = this.physics.add.staticGroup();
    this.hazardRects = []; // Track gap x ranges to detect falls/out of bounds
    this._buildGround();

    // Cloud platforms
    this.cloudGroup = this.physics.add.staticGroup();
    this._buildClouds();

    // Obstacles (grass/flowers)
    this.obstacleGroup = this.physics.add.staticGroup();
    this._buildObstacles();

    // Goal tile
    this.finish = this._makeFu(world.finishX, world.groundY - 110);
    this.physics.add.existing(this.finish, true);

    // Pony sprite
    this.pony = this._makePony(140, world.groundY - 40);
    this.physics.add.existing(this.pony);
    this.pony.body.setSize(28, 26, true);
    this.pony.body.setOffset(2, 6);
    this.pony.body.setCollideWorldBounds(false);
    this.pony.body.setMaxVelocity(600, 900);
    this.pony.body.setDragX(0);

    this.pony.body.setVelocityX(world.runSpeed);

    // Camera follow
    this.cameras.main.startFollow(this.pony, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(160, 120);

    // Collisions: ground + clouds
    this.physics.add.collider(this.pony, this.groundGroup);
    this.physics.add.collider(this.pony, this.cloudGroup);

    // Finish trigger
    this.physics.add.overlap(this.pony, this.finish, () => {
      if (this.gameEnded) return;
      this._win();
    });

    // Obstacle detection: touching while grounded is bad, clearing mid-air yields points
    this.obstacleSensors = this._buildObstacleSensors();
  }

  _paintBackgroundStrips() {
    // Use Graphics to paint two parallax strips
    const g1 = this.add.graphics().setScrollFactor(0.25);
    g1.fillStyle(colors.far, 1);
    g1.fillRect(0, 120, world.finishX + 900, 220);

    const g2 = this.add.graphics().setScrollFactor(0.5);
    g2.fillStyle(0x7a1010, 1);
    g2.fillRect(0, 300, world.finishX + 900, 240);

    // Decorative glowing orbs to mimic lantern bokeh
    const deco = this.add.graphics().setScrollFactor(0.35);
    for (let i = 0; i < 110; i++) {
      const x = 40 + i * 60;
      const y = 80 + (i % 9) * 10;
      const radius = 4 + (i % 3);
      deco.fillStyle(i % 2 === 0 ? colors.lanternGold : colors.lanternMid, 0.4);
      deco.fillCircle(x, y, radius);
    }

    // Lantern garlands closer to the camera
    const lanterns = this.add.graphics().setScrollFactor(0.55);
    lanterns.lineStyle(2, colors.lanternGold, 0.6);
    for (let band = 0; band < 3; band++) {
      const baseY = 140 + band * 70;
      lanterns.beginPath();
      lanterns.moveTo(0, baseY);
      const cpX = (world.finishX + 900) / 2;
      const cpY = baseY + 30;
      const steps = 32;
      let prevX = 0;
      let prevY = baseY;
      for (let t = 1; t <= steps; t++) {
        const u = t / steps;
        const bx = (1 - u) * (1 - u) * 0 + 2 * (1 - u) * u * cpX + u * u * (world.finishX + 900);
        const by = (1 - u) * (1 - u) * baseY + 2 * (1 - u) * u * cpY + u * u * baseY;
        lanterns.lineBetween(prevX, prevY, bx, by);
        prevX = bx;
        prevY = by;
      }
      lanterns.strokePath();
      for (let lx = 40; lx < world.finishX + 900; lx += 180) {
        const sway = Math.sin((lx + band * 50) * 0.01) * 10;
        const ly = baseY + 12 + sway;
        lanterns.fillStyle(colors.lanternMid, 0.9);
        lanterns.fillEllipse(lx, ly, 24, 34);
        lanterns.fillStyle(colors.lanternGold, 0.9);
        lanterns.fillRect(lx - 4, ly - 22, 8, 6);
        lanterns.fillRect(lx - 3, ly + 18, 6, 8);
        lanterns.lineStyle(2, colors.lanternGold, 1);
        lanterns.strokeEllipse(lx, ly, 24, 34);
      }
    }
  }

  _buildGround() {
    // Level ground: each 200px chunk could have been a pit/river (disabled for easy mode)
    // Rivers were blue quads below; pits were dark voids
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
        // Easy mode: keep the ground solid everywhere
        gap = false;
        river = false;
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

    // Grass layer
    g.fillStyle(colors.grass, 1);
    g.fillRect(0, y, w, 18);

    // Soil layer
    g.fillStyle(colors.ground, 1);
    g.fillRect(0, y + 18, w, 70);

    // Deeper layer
    g.fillStyle(colors.dirt, 1);
    g.fillRect(0, y + 88, w, 140);

    // Pixel texture dots
    g.fillStyle(0x000000, 0.08);
    for (let i = 0; i < 40; i++) {
      g.fillRect((i * 23) % w, y + 26 + (i * 17) % 140, 3, 3);
    }

    c.add(g);

    // Use an invisible rect as the static body
    const bodyRect = this.add.rectangle(w/2, y + 10, w, 28, 0x000000, 0).setOrigin(0.5);
    c.add(bodyRect);
    this.physics.add.existing(bodyRect, true);
    // Keep the container as the visual for the static body
    c.setDepth(1);
    bodyRect.body.setOffset(x, 0); // Doesn't need to be precise

    // Phaser staticGroup needs direct GameObjects
    // Return bodyRect as the collider, keep the container for visuals
    c.x = x;
    bodyRect.x = x + w/2;
    bodyRect.y = 0; // y is already captured inside the rect
    c.y = 0;

    // Keep the visual container tracking the rect
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
      const minY = world.groundY - 130; // lowered clouds so jumps always reach
      const maxOffset = 40;
      const y = minY + Math.floor(rng() * maxOffset);
      // Denser, lower clouds later in the level to guarantee reachable platforms
      const isPlatform = rng() > 0.05;

      const cloud = this._makeCloud(x, y, isPlatform ? 150 : 110, isPlatform ? 34 : 26);
      this.cloudGroup.add(cloud);

      // Non-platform clouds get a thin collider so you basically fall through
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

    // Use an invisible rect as the collider
    const r = this.add.rectangle(x + w/2, y + h/2, w, h, 0x000000, 0);
    this.physics.add.existing(r, true);
    r._visual = g;
    r.preUpdate = function() {
      if (this._visual) {
        // Static cloud, nothing to sync
      }
    };
    return r;
  }

  _buildObstacles() {
    // Grass/flowers are jump gates sitting on the ground
    const rng = this._mulberry32(99);

    for (let x = 680; x < world.finishX - 260; x += 260) {
      const r = rng();
      if (r < 0.55) {
        this._spawnObstacle(x + Math.floor(rng() * 90), "grass");
      } else {
        this._spawnObstacle(x + Math.floor(rng() * 90), "flower");
      }
    }

    // Add a small obstacle sprint before the finish
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

    // Sensor rect: no collisions, only used for interval checks
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
    // These sensors skip physics overlap—direct x-range checks are cleaner
    return this.obstacleGroup.getChildren();
  }

  _makePony(x, y) {
    const c = this.add.container(x, y);

    const g = this.add.graphics();
    // Body
    g.fillStyle(colors.pony, 1);
    g.fillRect(0, 10, 36, 18);
    // Long neck
    g.fillRect(20, 0, 8, 16);
    // Head
    g.fillRect(24, -6, 18, 18);
    // Mane
    g.fillStyle(colors.pony2, 1);
    g.fillRect(24, -8, 12, 8);
    g.fillRect(18, -4, 8, 10);
    // Legs
    g.fillStyle(0x2b2b2b, 1);
    g.fillRect(6, 28, 6, 12);
    g.fillRect(24, 28, 6, 12);
    // Eyes
    g.fillStyle(0x1a1a1a, 1);
    g.fillRect(36, 0, 3, 3);
    // Tail
    g.fillStyle(colors.pony2, 1);
    g.fillRect(-6, 12, 7, 12);

    c.add(g);
    c.setDepth(3);

    return c;
  }

  _makeFu(x, y) {
    const c = this.add.container(x, y).setDepth(3);

    const g = this.add.graphics();
    g.fillStyle(colors.fuRed, 1);
    g.fillRoundedRect(-70, -70, 140, 140, 18);

    // Simplified lucky tile built with rectangles
    g.fillStyle(0xfff1d6, 1);
    // Top horizontal stroke
    g.fillRect(-34, -40, 68, 10);
    // Middle vertical stroke
    g.fillRect(-6, -40, 12, 88);
    // Left vertical stroke
    g.fillRect(-34, -40, 10, 88);
    // Middle horizontal stroke
    g.fillRect(-34, -2, 68, 10);
    // Bottom horizontal stroke
    g.fillRect(-34, 36, 68, 10);
    // Right mini vertical stroke
    g.fillRect(24, -2, 10, 58);

    // Outer rim shading
    g.fillStyle(0x000000, 0.12);
    g.fillRoundedRect(-70, -70, 140, 140, 18);

    c.add(g);

    // Finish collider
    const r = this.add.rectangle(x, y, 120, 120, 0x000000, 0);
    r._visual = c;
    r.preUpdate = function() {
      if (this._visual) { /* Static, no sync needed */ }
    };
    return r;
  }

  _ensureFireworkTexture() {
    const key = "firework-spark";
    if (this.textures.exists(key)) return key;
    const gfx = this.make.graphics({ x: 0, y: 0, add: false });
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(8, 8, 8);
    gfx.generateTexture(key, 16, 16);
    gfx.destroy();
    return key;
  }

  _launchFireworks(cx, cy) {
    const textureKey = this._ensureFireworkTexture();
    const particles = this.add.particles(textureKey).setDepth(2100).setScrollFactor(0);
    const palette = [0xfff1d6, colors.lanternGold, colors.lanternMid, 0xffffff];

    for (let i = 0; i < 4; i++) {
      const emitter = particles.createEmitter({
        angle: { min: 0, max: 360 },
        speed: { min: 140, max: 320 },
        scale: { start: 0.6, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 700, max: 1500 },
        gravityY: 220,
        blendMode: "ADD",
        tint: palette[i % palette.length],
        on: false,
      });

      this.time.addEvent({
        delay: i * 300,
        repeat: 2,
        callback: () => {
          emitter.explode(45, cx + Phaser.Math.Between(-140, 140), cy + Phaser.Math.Between(-120, -40));
        }
      });
    }

    this.time.addEvent({
      delay: 4800,
      callback: () => particles.destroy()
    });
  }

  update(time, delta) {
    if (this.gameEnded) return;

    // Keyboard backup: space to jump
    if (Phaser.Input.Keyboard.JustDown(this.space)) this._jump();

    // Force constant horizontal speed (cloud friction can slow you otherwise)
    this.pony.body.setVelocityX(world.runSpeed);

    // Obstacle handling: grounded contact hurts, airborne clears reward you
    for (const s of this.obstacleSensors) {
      if (!s || this.passed.has(s)) continue;
      const px = this.pony.x;
      if (px >= s.sensorX1 && px <= s.sensorX2) {
        if (this.pony.body.blocked.down) {
          if (s.kind === "grass") {
            if (!this.passed.has(s)) {
              this.score = Math.max(0, this.score - 40);
            }
            this.combo = 0;
            this.passed.add(s);
          } else {
            this._gameOver("Hit a flower—jump to clear obstacles.");
            return;
          }
        } else {
          this.passed.add(s);
          this.combo = clamp(this.combo + 1, 0, 999);
          this.score += 10 + Math.min(30, this.combo * 2);
        }
      }
    }

    // Falling check: if y too low, end the run
    if (this.pony.y > world.fallKillY) {
      this._gameOver("You fell.");
      return;
    }

    // Distance score: add a tiny bit each frame based on speed
    this.score += (world.runSpeed * (delta / 1000)) * 0.06;

    // Once near the finish, show a sprint reminder
    const remain = Math.max(0, world.finishX - this.pony.x);
    this.hud.setText(`Score: ${Math.floor(this.score)}    Combo: ${this.combo}`);
    this.hud2.setText(remain < 900 ? `Distance to goal: ${Math.floor(remain)}px` : `Clap (or press space) to jump. Falling still ends the run.`);
  }

  _jump() {
    if (this.gameEnded) return;
    const body = this.pony.body;

    // Only jump when grounded (ground or cloud)
    if (body.blocked.down) {
      body.setVelocityY(-world.jumpVel);
      // Let combo persist between jumps for satisfying aerial streaks
    }
  }

  _win() {
    this.gameEnded = true;
    this.pony.body.setVelocity(0, 0);
    this.pony.body.allowGravity = false;

    this._setMic("Cleared!");

    const cam = this.cameras.main;
    const cx = cam.scrollX + W / 2;
    const cy = cam.scrollY + H / 2;

    const panel = this.add.rectangle(cx, cy, 520, 220, 0x000000, 0.45).setScrollFactor(0).setDepth(2000);
    const t1 = this.add.text(cx, cy - 50, "You reached the lucky tile!", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "26px",
      color: "#ffffff"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    const t2 = this.add.text(cx, cy + 8, `Score: ${Math.floor(this.score)}`, {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "18px",
      color: "rgba(255,255,255,.9)"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    const t3 = this.add.text(cx, cy + 54, "Click to restart", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "16px",
      color: "rgba(255,255,255,.8)"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    this._launchFireworks(cx, cy - 80);

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

    this._setMic("Game Over.");

    // Freeze physics
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

    const t4 = this.add.text(cx, cy + 74, "Click to restart", {
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

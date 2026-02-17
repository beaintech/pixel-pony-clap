// main.js
import { ClapDetector } from "./clap.js";

const W = window.innerWidth || 960;
const H = window.innerHeight || 540;


const world = {
  groundY: 410,
  gravity: 850,
  runSpeed: 260,
  jumpVel: 550,
  fallKillY: 560,
  // Level length (distance to the goal tile)
  finishX: 6400,
};

const baseWorld = { ...world };

const colors = {
  sky: 0x360404,
  far: 0x5b0a0a,
  mid: 0x7a1010,
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

const sceneThemes = {
  meadow: {
    key: "meadow",
    label: "Sunny Meadow",
    colors: {
      sky: 0x7ec8ff,
      far: 0xaedc8f,
      mid: 0x7ec46d,
      grass: 0x4caf50,
      ground: 0x7a5030,
      dirt: 0x4b2d19,
      river: 0x3fa9ff,
      hazard: 0x1f2e55,
      cloud: 0xffffff,
    },
  },
  lantern: {
    key: "lantern",
    label: "Lantern Festival",
    colors: {
      sky: 0x360404,
      far: 0x5b0a0a,
      mid: 0x7a1010,
      grass: 0xc0392b,
      ground: 0x8c1a1a,
      dirt: 0x5a0d0d,
      river: 0x651919,
      hazard: 0x3b0505,
      cloud: 0xfff4d0,
    },
  },
};

const tuning = {
  platform: {
    width: { min: 72, max: 128 },
    spacing: { min: 120, max: 185 },
    maxHeightStep: 26,
    nonPlatformChance: 0.15,
  },
  hazards: {
    segmentWidth: 160,
    gapChance: 0.34,
    waterChance: 0.62,
    maxSegmentsWithoutGap: 3,
  },
  sceneSwitchScore: 1200,
};

const baseTuning = JSON.parse(JSON.stringify(tuning));

const levels = [
  {
    key: "level-1",
    label: "Level 1 — Meadow Warmup",
    runSpeed: 240,
    finishX: 5600,
    platformSpacing: { min: 120, max: 185 },
    hazards: { gapChance: 0.28, waterChance: 0.5 },
  },
  {
    key: "level-2",
    label: "Level 2 — Lantern Dash",
    runSpeed: 280,
    finishX: 6800,
    platformSpacing: { min: 110, max: 175 },
    hazards: { gapChance: 0.34, waterChance: 0.6 },
  },
  {
    key: "level-3",
    label: "Level 3 — Night Sprint",
    runSpeed: 320,
    finishX: 7600,
    platformSpacing: { min: 100, max: 165 },
    hazards: { gapChance: 0.4, waterChance: 0.68 },
  },
];

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

    this._hudAccum = 0;
    this._hudLast1 = "";
    this._hudLast2 = "";
    this._statusMsg = "";
    this._statusUntil = 0;

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
  constructor() {
    super("Play");
    this.levelIndex = 0;
  }

  create() {
    this.score = 0;
    this.combo = 0;
    this.passed = new Set();
    this.gameEnded = false;

    this.levelIndex = clamp(this.levelIndex ?? 0, 0, levels.length - 1);
    this.levelConfig = levels[this.levelIndex] || levels[0];
    this._applyLevelConfig();

    this._setupUI();
    this._updateLevelIndicator();
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

    this.levelHud = this.add.text(14, 102, "", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "14px",
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,.55)",
      padding: { x: 10, y: 6 }
    }).setScrollFactor(0).setDepth(999);

    this._setMic = setMic;
  }

  _updateLevelIndicator() {
    if (!this.levelHud) return;
    const label = this.levelConfig?.label || "Level ?";
    this.levelHud.setText(`Level: ${label}`);
  }

  _setupInput() {
    // Clap detection — when it fires we only call this._jump()
    this.clap = new ClapDetector({
      sensitivity: 0.15,
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

  _applyLevelConfig() {
    const cfg = this.levelConfig || levels[0];
    world.runSpeed = baseWorld.runSpeed;
    world.finishX = baseWorld.finishX;
    tuning.platform.spacing.min = baseTuning.platform.spacing.min;
    tuning.platform.spacing.max = baseTuning.platform.spacing.max;
    tuning.hazards.gapChance = baseTuning.hazards.gapChance;
    tuning.hazards.waterChance = baseTuning.hazards.waterChance;

    if (!cfg) return;
    if (typeof cfg.runSpeed === "number") world.runSpeed = cfg.runSpeed;
    if (typeof cfg.finishX === "number") world.finishX = cfg.finishX;

    if (cfg.platformSpacing) {
      if (typeof cfg.platformSpacing.min === "number") {
        tuning.platform.spacing.min = cfg.platformSpacing.min;
      }
      if (typeof cfg.platformSpacing.max === "number") {
        tuning.platform.spacing.max = cfg.platformSpacing.max;
      }
    }

    if (cfg.hazards) {
      if (typeof cfg.hazards.gapChance === "number") {
        tuning.hazards.gapChance = cfg.hazards.gapChance;
      }
      if (typeof cfg.hazards.waterChance === "number") {
        tuning.hazards.waterChance = cfg.hazards.waterChance;
      }
    }
  }

  _setupWorld() {
    this.sceneOrder = ["meadow", "lantern"];
    this.activeSceneIndex = 0;
    this.sceneSwitchScore = tuning.sceneSwitchScore;
    this.sceneSwitched = false;
    this.sceneReady = false;
    this.groundSegments = [];
    this.hazardVisuals = [];
    this.cloudVisuals = [];

    this._activatePalette(this.sceneOrder[this.activeSceneIndex]);

    this.cameras.main.setBackgroundColor(Phaser.Display.Color.IntegerToColor(colors.sky).rgba);

    this.physics.world.gravity.y = world.gravity;
    this.physics.world.setBounds(0, 0, world.finishX + 900, H);

    this._buildSceneBackgrounds();

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

if (!this.gameEnded) this.pony.body.setVelocityX(world.runSpeed);

    // Camera follow
    this.cameras.main.startFollow(this.pony, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(160, 120);

    // Collisions: ground + clouds
    this.physics.add.collider(this.pony, this.groundGroup);
    this.physics.add.collider(
      this.pony,
      this.cloudGroup,
      null,
      (pony, cloud) => {
        const b = pony.body;

        // 向上运动（跳起）时：永远穿透
        if (b.velocity.y <= 0) return false;

        // 向下落时：只有“从云上方落下”才允许碰撞站住
        const ponyBottom = b.y + b.height;
        const cloudTop = cloud.body.y; // static body 的 top
        return ponyBottom <= cloudTop + 10;
      },
      this
    );

    // Finish trigger
    this.physics.add.overlap(this.pony, this.finish, () => {
      if (this.gameEnded) return;
      this._win();
    });

    // Obstacle detection: touching while grounded is bad, clearing mid-air yields points
    this.obstacleSensors = this._buildObstacleSensors();

    this.sceneReady = true;
    this._applySceneTheme(this.sceneOrder[this.activeSceneIndex]);

    this.time.addEvent({
  delay: 1200,
  loop: true,
  callback: () => {
    if (!this.gameEnded) this._popHudFirework();
  }
});

  }

  _buildSceneBackgrounds() {
    const totalWidth = world.finishX + 900;
    this.bgTotalWidth = totalWidth;
    this.bgFar = this.add.graphics().setScrollFactor(0.25).setDepth(-5);
    this.bgMid = this.add.graphics().setScrollFactor(0.5).setDepth(-4);
    this.bgDecorFar = this.add.graphics().setScrollFactor(0.35).setDepth(-3);
    this.bgDecorNear = this.add.graphics().setScrollFactor(0.55).setDepth(-2);
  }

  _activatePalette(themeKey) {
    const theme = sceneThemes[themeKey] || sceneThemes.lantern;
    this.activeThemeKey = theme.key;
    this.activeTheme = theme;
    if (theme.colors) {
      Object.assign(colors, theme.colors);
    }
  }

  _popHudFirework() {
  const key = this._ensureFireworkTexture();

  const manager = this.add.particles(0, 0, key, {
    speed: { min: 80, max: 180 },
    scale: { start: 0.5, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: 300, max: 900 },
    gravityY: 140,
    blendMode: "ADD",
    quantity: 14,
    on: false
  }).setScrollFactor(0).setDepth(5000);

  manager.emitParticleAt(this.scale.width / 2, this.scale.height / 2 - 120, 45);

  this.time.delayedCall(900, () => manager.destroy());
}

  _applySceneTheme(themeKey) {
    this._activatePalette(themeKey);
    if (this.cameras?.main) {
      this.cameras.main.setBackgroundColor(Phaser.Display.Color.IntegerToColor(colors.sky).rgba);
    }
    if (!this.sceneReady) return;
    this._drawSceneBackgrounds();
    this._recolorLevelGeometry();
  }

  _drawSceneBackgrounds() {
    if (!this.bgFar || !this.bgMid) return;
    const totalWidth = this.bgTotalWidth || (world.finishX + 900);

    this.bgFar.clear();
    this.bgFar.fillStyle(colors.far, 1);
    this.bgFar.fillRect(0, 80, totalWidth, 280);

    this.bgMid.clear();
    this.bgMid.fillStyle(colors.mid || colors.far, 1);
    this.bgMid.fillRect(0, 260, totalWidth, 300);

    this.bgDecorFar.clear();
    this.bgDecorNear.clear();

    if (this.activeThemeKey === "meadow") {
      this.bgDecorFar.fillStyle(0xffed8b, 0.8);
      this.bgDecorFar.fillCircle(150, 120, 46);

      for (let i = 0; i < totalWidth; i += 140) {
        const cy = 90 + (i % 280) * 0.08;
        this.bgDecorFar.fillStyle(0xffffff, 0.85);
        this.bgDecorFar.fillRoundedRect(i + 20, cy, 100, 30, 14);
        this.bgDecorFar.fillRoundedRect(i + 60, cy - 12, 80, 26, 12);
      }

      for (let hill = 0; hill < totalWidth; hill += 260) {
        const color = hill % 520 === 0 ? 0x6cb44d : 0x57a13b;
        const width = 360 + (hill % 3) * 80;
        const centerX = hill + 200;
        const centerY = 420 + (hill % 2) * 14;
        this.bgDecorNear.fillStyle(color, 1);
        this.bgDecorNear.fillEllipse(centerX, centerY, width, 220);
      }
    } else {
      for (let i = 0; i < 110; i++) {
        const x = 40 + i * 60;
        const y = 80 + (i % 9) * 10;
        const radius = 4 + (i % 3);
        this.bgDecorFar.fillStyle(i % 2 === 0 ? colors.lanternGold : colors.lanternMid, 0.4);
        this.bgDecorFar.fillCircle(x, y, radius);
      }

      for (let band = 0; band < 3; band++) {
        const baseY = 140 + band * 70;
        const cpX = totalWidth / 2;
        const cpY = baseY + 30;
        const steps = 32;
        this.bgDecorNear.lineStyle(2, colors.lanternGold, 0.6);
        this.bgDecorNear.beginPath();
        this.bgDecorNear.moveTo(0, baseY);
        let prevX = 0;
        let prevY = baseY;
        for (let t = 1; t <= steps; t++) {
          const u = t / steps;
          const bx = (1 - u) * (1 - u) * 0 + 2 * (1 - u) * u * cpX + u * u * totalWidth;
          const by = (1 - u) * (1 - u) * baseY + 2 * (1 - u) * u * cpY + u * u * baseY;
          this.bgDecorNear.lineBetween(prevX, prevY, bx, by);
          prevX = bx;
          prevY = by;
        }
        this.bgDecorNear.strokePath();
        for (let lx = 40; lx < totalWidth; lx += 180) {
          const sway = Math.sin((lx + band * 50) * 0.01) * 10;
          const ly = baseY + 12 + sway;
          this.bgDecorNear.fillStyle(colors.lanternMid, 0.9);
          this.bgDecorNear.fillEllipse(lx, ly, 24, 34);
          this.bgDecorNear.fillStyle(colors.lanternGold, 0.9);
          this.bgDecorNear.fillRect(lx - 4, ly - 22, 8, 6);
          this.bgDecorNear.fillRect(lx - 3, ly + 18, 6, 8);
          this.bgDecorNear.lineStyle(2, colors.lanternGold, 1);
          this.bgDecorNear.strokeEllipse(lx, ly, 24, 34);
        }
      }
    }
  }

  _recolorLevelGeometry() {
    this._redrawGroundSegments();
    this._redrawHazards();
    this._redrawClouds();
  }

  _redrawGroundSegments() {
    if (!this.groundSegments) return;
    for (const segment of this.groundSegments) {
      if (!segment || !segment._visualGraphics) continue;
      this._renderGroundGraphic(segment._visualGraphics, segment._visualWidth, segment._visualY);
    }
  }

  _renderGroundGraphic(graphics, w, y) {
    if (!graphics) return;
    graphics.clear();

    graphics.fillStyle(colors.grass, 1);
    graphics.fillRect(0, y, w, 18);

    graphics.fillStyle(colors.ground, 1);
    graphics.fillRect(0, y + 18, w, 70);

    graphics.fillStyle(colors.dirt, 1);
    graphics.fillRect(0, y + 88, w, 140);

    graphics.fillStyle(0x000000, 0.08);
    for (let i = 0; i < 40; i++) {
      graphics.fillRect((i * 23) % w, y + 26 + (i * 17) % 140, 3, 3);
    }
  }

  _redrawHazards() {
    if (!this.hazardVisuals) return;
    for (const hazard of this.hazardVisuals) {
      this._renderHazardGraphic(hazard);
    }
  }

  _renderHazardGraphic(hazard) {
    if (!hazard || !hazard.graphic) return;
    const height = H - hazard.y;
    const color = hazard.type === "river" ? colors.river : colors.hazard;
    hazard.graphic.clear();
    hazard.graphic.fillStyle(color, 1);
    hazard.graphic.fillRect(hazard.x, hazard.y, hazard.width, height);
    if (hazard.type === "river") {
      hazard.graphic.fillStyle(0xffffff, 0.12);
      hazard.graphic.fillRect(hazard.x, hazard.y + 12, hazard.width, 6);
      hazard.graphic.fillRect(hazard.x, hazard.y + 42, hazard.width, 4);
    }
  }

  _handleHazardRecovery() {
    if (!this.hazardRects || this.hazardRects.length === 0) return;
    if (this.gameEnded) return;
    const body = this.pony.body;
    const px = this.pony.x;
    const py = this.pony.y;
    if (py < world.groundY - 12) return;
    for (const hazard of this.hazardRects) {
      if (px > hazard.x1 && px < hazard.x2) {
        const now = this.time.now || performance.now();
        if (!this._lastHazardBoost || now - this._lastHazardBoost > 260) {
          this._lastHazardBoost = now;
          body.setVelocityY(-world.jumpVel * 0.6);
          body.setVelocityX(world.runSpeed * 0.95);
          this.score = Math.max(0, this.score - 8);
          this.hud2.setText("Splash! Keep jumping to escape hazards.");
          this._popScoreFirework(this.pony.x, this.pony.y - 20);
        }
        break;
      }
    }
  }

  _redrawClouds() {
    if (!this.cloudVisuals) return;
    for (const cloud of this.cloudVisuals) {
      if (!cloud || !cloud._visual || !cloud._visualBounds) continue;
      this._renderCloudGraphic(cloud._visual, cloud._visualBounds);
    }
  }

  _renderCloudGraphic(graphics, bounds) {
    if (!graphics || !bounds) return;
    const { x, y, w, h } = bounds;
    graphics.clear();
    graphics.fillStyle(colors.cloud, 0.96);
    graphics.fillRoundedRect(x, y, w, h, 10);
    graphics.fillStyle(0x000000, 0.05);
    graphics.fillRect(x + 10, y + h - 6, w - 20, 3);
  }

_announceSceneSwitch(label) {
    const viewportWidth = this.scale.width || W;
    const cx = viewportWidth / 2;
    const cy = 70;

  const panel = this.add.rectangle(cx, cy, 420, 90, 0x000000, 0.55)
    .setScrollFactor(0).setDepth(2100);

  const text = this.add.text(cx, cy, label, {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    fontSize: "22px",
    color: "#ffffff"
  }).setOrigin(0.5).setScrollFactor(0).setDepth(2101);

  this.tweens.add({
    targets: [panel, text],
    alpha: { from: 0, to: 1 },
    duration: 200,
    yoyo: true,
    hold: 1500,
    ease: "Sine.easeInOut",
    onComplete: () => {
      panel.destroy();
      text.destroy();
    }
  });
}

  _buildGround() {
    const segmentW = tuning.hazards.segmentWidth;
    const baseY = world.groundY;
    const total = Math.ceil((world.finishX + 900) / segmentW);

    const rng = this._mulberry32(42);
    let segmentsWithoutGap = 0;
    let lastWasGap = false;

    for (let i = 0; i < total; i++) {
      const x = i * segmentW;
      const nearStart = x < 520;
      const nearFinish = x > world.finishX - 520;

      if (nearStart || nearFinish) {
        segmentsWithoutGap = 0;
        lastWasGap = false;
      }

      let gap = false;
      if (!nearStart && !nearFinish) {
        const shouldGap = segmentsWithoutGap >= tuning.hazards.maxSegmentsWithoutGap || rng() < tuning.hazards.gapChance;
        if (shouldGap && !lastWasGap) {
          gap = true;
        }
      }

      if (!gap) {
        segmentsWithoutGap++;
        lastWasGap = false;
        const ground = this._makeGroundSegment(x, baseY, segmentW);
        this.groundGroup.add(ground);
        this.groundSegments.push(ground);
        continue;
      }

      segmentsWithoutGap = 0;
      lastWasGap = true;
      const river = rng() < tuning.hazards.waterChance;
      const hazard = {
        graphic: this.add.graphics().setDepth(-1),
        x: x,
        y: baseY + 18,
        width: segmentW,
        type: river ? "river" : "pit",
      };
      this._renderHazardGraphic(hazard);
      this.hazardVisuals.push(hazard);
      this.hazardRects.push({ x1: x, x2: x + segmentW, type: hazard.type });
    }
  }

  _makeGroundSegment(x, y, w) {
    const c = this.add.container(x, 0);
    const g = this.add.graphics();
    this._renderGroundGraphic(g, w, y);
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
    bodyRect._visualGraphics = g;
    bodyRect._visualWidth = w;
    bodyRect._visualY = y;
    bodyRect.preUpdate = function() {
      if (this._visual) this._visual.x = this.x - w/2;
    };

    return bodyRect;
  }

  _buildClouds() {
    this.cloudVisuals = [];
    const rng = this._mulberry32(7);
    let x = 520;
    let previousY = world.groundY - 120;

    while (x < world.finishX - 140) {
      const spacingRange = tuning.platform.spacing.max - tuning.platform.spacing.min;
      const spacing = tuning.platform.spacing.min + Math.floor(rng() * spacingRange);
      x += spacing;

      const widthRange = tuning.platform.width.max - tuning.platform.width.min;
      const width = tuning.platform.width.min + Math.floor(rng() * widthRange);
      const height = 20 + Math.floor(rng() * 12);

      const delta = (rng() - 0.5) * 2 * tuning.platform.maxHeightStep;
      let y = previousY + delta;
      y = clamp(y, world.groundY - 160, world.groundY - 70);
      previousY = y;

      const solid = rng() > tuning.platform.nonPlatformChance;
      const cloud = this._makeCloud(x, y, width, solid ? height + 8 : height, solid);
      this.cloudGroup.add(cloud);
      this.cloudVisuals.push(cloud);

      if (!solid) {
        cloud.body.setSize(Math.max(32, width * 0.35), 6, true);
      }
    }
  }

  _makeCloud(x, y, w, h, solid = true) {
    const g = this.add.graphics();
    this._renderCloudGraphic(g, { x, y, w, h });
    g.setDepth(0);

    // Use an invisible rect as the collider
    const r = this.add.rectangle(x + w/2, y + h/2, w, h, 0x000000, 0);
    this.physics.add.existing(r, true);
    r._visual = g;
    r._visualBounds = { x, y, w, h };
    r._solid = solid;
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

    // Pixel "马" (horse) using rectangles
    g.fillStyle(0xfff1d6, 1);

    // top stroke
    g.fillRect(-38, -42, 76, 10);

    // left vertical
    g.fillRect(-38, -42, 12, 64);

    // middle bar
    g.fillRect(-38, -12, 68, 10);

    // inner vertical
    g.fillRect(-6, -12, 12, 58);

    // bottom bar
    g.fillRect(-38, 34, 76, 10);

    // three small legs strokes (stylized)
    g.fillRect(-28, 44, 12, 18);
    g.fillRect(-4, 44, 12, 18);
    g.fillRect(20, 44, 12, 18);

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
    const palette = [0xfff1d6, colors.lanternGold, colors.lanternMid, 0xffffff];
    const emitters = [];

    for (let i = 0; i < 4; i++) {
      const tint = palette[i % palette.length];
      const manager = this.add.particles(0, 0, textureKey, {
        angle: { min: 0, max: 360 },
        speed: { min: 140, max: 320 },
        scale: { start: 0.6, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 700, max: 1500 },
        gravityY: 220,
        blendMode: "ADD",
        tint,
        on: false,
      }).setDepth(2100).setScrollFactor(0);
      emitters.push(manager);

      this.time.addEvent({
        delay: i * 300,
        repeat: 2,
        callback: () => {
          const ox = cx + Phaser.Math.Between(-140, 140);
          const oy = cy + Phaser.Math.Between(-120, -40);
          manager.emitParticleAt(ox, oy, 45);
        }
      });
    }

    this.time.addEvent({
      delay: 4800,
      callback: () => emitters.forEach((mgr) => mgr.destroy())
    });
  }

  _popScoreFirework(x, y) {
    const textureKey = this._ensureFireworkTexture();
    const manager = this.add.particles(0, 0, textureKey, {
      speed: { min: 80, max: 180 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 300, max: 900 },
      gravityY: 140,
      blendMode: "ADD",
      tint: [0xffffff, colors.lanternGold, colors.lanternMid],
      quantity: 12,
      on: false,
    }).setDepth(1200);
    manager.emitParticleAt(x, y, 18);
    this.time.addEvent({
      delay: 900,
      callback: () => manager.destroy()
    });
  }

  update(time, delta) {
    if (this.gameEnded) return;

    // hard stop at finish line even if not touching the tile
    if (this.pony.x >= world.finishX - 90) {
      this._win();
      return;
    }

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
          if (!this.passed.has(s)) {
            const penalty = s.kind === "grass" ? 20 : 35;
            this.score = Math.max(0, this.score - penalty);
            this.combo = 0;
            this.passed.add(s);
            this.hud2.setText("Bump! Jump to clear obstacles and keep your combo.");
          }
        } else {
          this.passed.add(s);
          this.combo = clamp(this.combo + 1, 0, 999);
          this.score += 10 + Math.min(30, this.combo * 2);
          this._popScoreFirework(this.pony.x, this.pony.y - 30);
        }
      }
    }

    this._handleHazardRecovery();

    // Falling check: if y too low, gently reset instead of ending the run
    if (this.pony.y > world.fallKillY) {
      this.pony.body.setVelocity(0, -world.jumpVel * 0.8);
      this.pony.y = world.groundY - 20;
      this.score = Math.max(0, this.score - 15);
      this.hud2.setText("Whoops! Let's keep galloping.");
    }

    // Distance score: add a tiny bit each frame based on speed
    this.score += (world.runSpeed * (delta / 1000)) * 0.06;

    if (!this.sceneSwitched) {
      const reachedScore = this.score >= this.sceneSwitchScore;
      const reachedDistance = this.pony.x >= world.finishX * 0.45;
      if (reachedScore || reachedDistance) {
        this.sceneSwitched = true;
        this.activeSceneIndex = Math.min(this.sceneOrder.length - 1, this.activeSceneIndex + 1);
        const sceneKey = this.sceneOrder[this.activeSceneIndex];
        this._applySceneTheme(sceneKey);
        const label = sceneThemes[sceneKey]?.label || "Lantern Festival";
        this._announceSceneSwitch(label);
      }
    }

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

_makePixelFontTexture() {
  // 产出一个 spritesheet：每格 6x8，一个字符一帧
  const sheetKey = "pxfont-sheet";
  if (this.textures.exists(sheetKey)) return sheetKey;

  const cellW = 6, cellH = 8;
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789! ";
  const cols = 16;
  const rows = Math.ceil(chars.length / cols);
  const texW = cols * cellW;
  const texH = rows * cellH;

  const G = {
    "A":["01110","10001","10001","11111","10001","10001","10001"],
    "E":["11111","10000","10000","11110","10000","10000","11111"],
    "H":["10001","10001","10001","11111","10001","10001","10001"],
    "N":["10001","11001","10101","10011","10001","10001","10001"],
    "O":["01110","10001","10001","10001","10001","10001","01110"],
    "P":["11110","10001","10001","11110","10000","10000","10000"],
    "R":["11110","10001","10001","11110","10100","10010","10001"],
    "S":["01111","10000","10000","01110","00001","00001","11110"],
    "W":["10001","10001","10001","10101","10101","11011","10001"],
    "Y":["10001","10001","01010","00100","00100","00100","00100"],
    "0":["01110","10001","10011","10101","11001","10001","01110"],
    "1":["00100","01100","00100","00100","00100","00100","01110"],
    "2":["01110","10001","00001","00010","00100","01000","11111"],
    "3":["11110","00001","00001","01110","00001","00001","11110"],
    "4":["00010","00110","01010","10010","11111","00010","00010"],
    "5":["11111","10000","10000","11110","00001","00001","11110"],
    "6":["01110","10000","10000","11110","10001","10001","01110"],
    "7":["11111","00001","00010","00100","01000","01000","01000"],
    "8":["01110","10001","10001","01110","10001","10001","01110"],
    "9":["01110","10001","10001","01111","00001","00001","01110"],
    "!":["00100","00100","00100","00100","00100","00000","00100"],
    " ":["00000","00000","00000","00000","00000","00000","00000"],
  };

  const rawKey = "pxfont-raw";
  if (!this.textures.exists(rawKey)) {
    const gfx = this.make.graphics({ x: 0, y: 0, add: false });
    gfx.clear();
    gfx.fillStyle(0xffffff, 1);

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const gx = (i % cols) * cellW;
      const gy = Math.floor(i / cols) * cellH;
      const glyph = G[ch] || G[" "];

      for (let r = 0; r < 7; r++) {
        const row = glyph[r];
        for (let c = 0; c < 5; c++) {
          if (row[c] === "1") gfx.fillRect(gx + 1 + c, gy + 1 + r, 1, 1);
        }
      }
    }

    gfx.generateTexture(rawKey, texW, texH);
    gfx.destroy();
  }

  const img = this.textures.get(rawKey).getSourceImage();
  this.textures.addSpriteSheet(sheetKey, img, {
    frameWidth: cellW,
    frameHeight: cellH,
    endFrame: chars.length - 1
  });

  const map = {};
  for (let i = 0; i < chars.length; i++) map[chars[i]] = i;

  this._pxFont = { key: sheetKey, map, cellW, cellH };
  return sheetKey;
}

_makePixelText(text, x, y, opts = {}) {
  const key = this._makePixelFontTexture();
  const { map, cellW } = this._pxFont;

  const scale = opts.scale ?? 6;
  const tint = opts.tint ?? 0xfff1d6;

  const ctn = this.add.container(x, y);
  const chars = (text || "").toUpperCase().split("");

  const totalW = chars.length * cellW * scale;
  let cursorX = -totalW / 2 + (cellW * scale) / 2;

  for (const ch of chars) {
    const frame = map[ch] ?? map[" "];
    const spr = this.add.sprite(cursorX, 0, key, frame)
      .setOrigin(0.5)
      .setScale(scale)
      .setTint(tint);
    ctn.add(spr);
    cursorX += cellW * scale;
  }

  return ctn;
}


  _win() {
    this.gameEnded = true;
    this.pony.x = this.finish.x - 90;
    this.pony.x = world.finishX - 90;

    this.pony.body.setVelocity(0, 0);
    this.pony.body.setAcceleration(0, 0);
    this.pony.body.setDrag(0, 0);
    this.pony.body.allowGravity = false;
    this.pony.body.moves = false;   // 关键：彻底停止 Arcade Physics 更新这个 body

    this._setMic("Cleared!");

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    // 先停掉跟随，排除 camera 还在动导致你以为“没显示”
    this.cameras.main.stopFollow();

    // 单独一个 UI 容器，强制在最上层
    const ui = this.add.container(0, 0).setScrollFactor(0).setDepth(9999999);

    const panel = this.add.rectangle(cx, cy, 520, 220, 0x000000, 0.45);
    const bannerY = cy - 120;

    const bannerBg = this.add.rectangle(cx, bannerY, 880, 104, 0xffd24a, 1)
      .setScrollFactor(0)
      .setDepth(10000001);
  bannerBg.setStrokeStyle(10, 0xcf1e1e, 1); // 喜庆红边

const banner = this._makePixelText("HAPPY HORSE NEW YEAR 2026!", cx, bannerY, {
  scale: 5,          // 4~6 自己试
  tint: 0xcf1e1e     // 字用喜庆红；想要淡金就用 0xfff1d6
})
  .setScrollFactor(0)
  .setDepth(10000002);

// 轻微弹一下（像素字别做 alpha from 0，容易“以为没显示”）
bannerBg.setScale(0.98);
banner.setScale(0.98);

this.tweens.add({
  targets: [bannerBg, banner],
  scaleX: 1,
  scaleY: 1,
  y: { from: bannerY - 10, to: bannerY },
  duration: 220,
  ease: "Sine.easeOut"
});

// 烟花单独 try/catch：烟花炸了也不影响 UI 出现
try {
  this._launchFireworks(cx, cy - 80);
} catch (e) {
  console.error("firework error:", e);
}
  }

  _gameOver(reason) {
    this.gameEnded = true;
    this.combo = 0;

    this._setMic("Game Over.");

    // Freeze physics
    this.pony.body.setVelocity(0, 0);
    this.pony.body.allowGravity = false;

const viewportWidth = this.scale.width || W;
const cx = viewportWidth / 2;
const cy = 70;

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
  backgroundColor: "#0b1020",
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: W,
    height: H,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: world.gravity },
      debug: false
    }
  },
  scene: [Boot, Menu, Play],
};

const game = new Phaser.Game(config);
window.__ponyGame = game;
window.addEventListener("resize", () => {
  const width = window.innerWidth || W;
  const height = window.innerHeight || H;
  if (game.scale) {
    game.scale.resize(width, height);
  }
});

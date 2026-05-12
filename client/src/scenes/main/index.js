/**
 * MainScene — N-player rewrite (Phase 18-01).
 *
 * KEPT: Terrain, tanks, physics, projectiles, turn switching, canvas rendering.
 * REMOVED: HUD class, all Phaser text overlays, exit menu, game-over text,
 *          winner particles, play-again text, back button, auto-adjust.
 * ADDED: GameBridge writes (state updates + event notifications).
 *
 * N-PLAYER: tanks[] array replaces tank1/tank2. myPlayerIndex tracks local player.
 * currentPlayerIndex tracks whose turn it is. All 2-player logic preserved via
 * tanks[0]/tanks[1] for practice mode (type 4).
 *
 * React HUD reads from GameBridge via rAF polling (useGameState hook).
 * Socket events for matchEnd/roundEnd/opponentLeft are handled in React (BattleScreen).
 */

import Phaser, { Scene, Display } from 'phaser';
import { Tank } from '../../classes/Tank';
import { Terrain } from '../../classes/Terrain';
import { BlastCache } from '../../classes/BlastCache';

export class MainScene extends Scene {
  constructor() {
    super('main-scene');
    // N-player: tanks[] indexed to room.players[] order
    this.tanks = [];
    this.myPlayerIndex = -1;       // which tanks[i] is the local player; -1 until terrainGenerated
    this.currentPlayerIndex = 0;   // whose turn it is, 0-based index
    this._eliminated = {};          // { [index]: boolean } for tracking eliminated players
    this._pendingEliminations = []; // queued until after trajectory animation completes
    this._lastPositions = [];       // cache positions[] from last terrainGenerated/turnResult
    // Practice mode turn tracking (type4 only)
    this.activeTank = 0;
    this.terrain = null;
    this.HUD = null; // Kept as null — physics classes guard against this
    this.x = 0;
    this.y = 0;
    this.background = null;
    this.blastLayer = null;
    this.pointsLayer = null;
    this.cpuHandler = null;
    this.sceneData = null;
    this.turnPointer = null;
    this.gameOver = false;
    this.blastCache = new BlastCache(this);
    this._bridge = null;
    this._turnResultCooldown = 0;
    this._firePending = false;

    // Socket handler refs for cleanup (Fix 4)
    this._socketHandlers = {};

    // Spectator mode state (populated by Plan 18-02)
    this._isSpectating = false;
    this._spectatorPlacement = null;
    this._spectatorAimGfx = null;

    // Name label state (populated by Plan 18-02)
    this._nameLabels = null;
    this._youMarker = null;
    this._hasHadFirstTurn = false;
  }

  init = (data) => {
    // Phaser may pass an empty object {} when auto-starting.
    // Check for a meaningful property (gameType) to decide whether `data` is real.
    const hasRealData = data && data.gameType;
    this.sceneData = hasRealData ? data : (window.pendingSceneData || null);
    this.activeTank = 0;
    this.gameOver = false;
    this.wind = 0;
    this._bridge = window.gameBridge || null;
    this._created = false;
    // Reset N-player state on each scene init
    this.tanks = [];
    this.myPlayerIndex = -1;
    this.currentPlayerIndex = 0;
    this._eliminated = {};
    this._lastPositions = [];
    this._isSpectating = false;
    this._spectatorPlacement = null;
    this._spectatorAimGfx = null;
    this._nameLabels = null;
    this._youMarker = null;
    this._hasHadFirstTurn = false;
  };

  preload = () => {
    this.load.image('wall', 'assets/images/wall.png');
    // Load the 5 background themes — one is picked randomly in createBackground().
    // bg-default.png intentionally not preloaded; it duplicated bg-jungle's
    // palette and the index entry was removed in the 012ff34 / 5455e8e fixes.
    this.load.image('bg-jungle', 'assets/images/backgrounds/bg-jungle.png');
    this.load.image('bg-arctic', 'assets/images/backgrounds/bg-arctic.png');
    this.load.image('bg-desert', 'assets/images/backgrounds/bg-desert.png');
    this.load.image('bg-moon', 'assets/images/backgrounds/bg-moon.png');
    this.load.image('bg-volcanic', 'assets/images/backgrounds/bg-volcanic.png');
    this.load.audio('background', ['assets/sounds/background.mp3']);
    this.load.audio('click', ['assets/sounds/click.wav']);
    this.load.audio('winner', ['assets/sounds/winner.mp3']);
    this.load.audio('launch', ['assets/sounds/others/launch.mp3']);
    this.load.audio('tick', ['assets/sounds/others/tick.wav']);
    this.load.audio('expshort', ['assets/sounds/others/expshort.wav']);
    this.load.audio('expshort2', ['assets/sounds/others/expshort2.wav']);
    this.load.audio('expmedium', ['assets/sounds/others/expmedium.wav']);
    this.load.audio('expmedium2', ['assets/sounds/others/expmedium2.wav']);
    this.load.audio('explong', ['assets/sounds/others/explong.wav']);
    this.load.audio('exphuge', ['assets/sounds/others/exphuge.wav']);
    this.load.audio('bigpop', ['assets/sounds/others/bigpop.wav']);
    this.load.audio('rocks_1', ['assets/sounds/others/rocks_1.wav']);
    this.load.audio('rocks_2', ['assets/sounds/others/rocks_2.wav']);
    this.load.audio('rocks_3', ['assets/sounds/others/rocks_3.wav']);
    this.load.audio('rocks_4', ['assets/sounds/others/rocks_4.wav']);
    this.load.audio('rocks_5', ['assets/sounds/others/rocks_5.wav']);
    this.load.audio('rocks_6', ['assets/sounds/others/rocks_6.wav']);
    this.load.audio('rockslide', ['assets/sounds/others/rockslide.wav']);
    this.load.audio('napalm', ['assets/sounds/others/napalm.wav']);
    this.load.audio('hailstorm', ['assets/sounds/others/hailstorm.wav']);
    this.load.audio('aquabomb_splash', ['assets/sounds/others/aquabomb_splash.wav']);
    this.load.audio('firecracker', ['assets/sounds/others/firecracker.wav']);
    this.load.audio('clusterbombs_exp', ['assets/sounds/others/clusterbombs_exp.wav']);
    this.load.audio('homingmissile', ['assets/sounds/others/homingmissile.wav']);
    this.load.audio('rungun', ['assets/sounds/others/rungun.wav']);
    this.load.audio('rubberbullet', ['assets/sounds/others/rubberbullet.wav']);
    this.load.audio('laser1', ['assets/sounds/others/laser1.wav']);
    this.load.audio('magicbeans_grow', ['assets/sounds/others/magicbeans_grow.wav']);
    this.load.audio('rock', ['assets/sounds/others/rock.wav']);
    this.load.audio('rocket', ['assets/sounds/others/rocket.wav']);
    // NOTE: tracer, split, magicwall, zapper, skipperbounce, homing, sniper
    // audio files do not exist yet — removed to prevent decode errors.
    // Safe sound wrapper in create() silently skips missing keys at play time.
  };

  create = () => {
    if (!this.sceneData || !this.sceneData.gameType) {
      console.warn('[SolShot] MainScene.create() — no sceneData, skipping');
      return;
    }

    // Safe sound wrapper — some weapon code plays sounds that don't exist
    const originalPlay = this.sound.play.bind(this.sound);
    this.sound.play = (key, config) => {
      try {
        if (this.sound.get(key) || this.cache.audio.exists(key)) {
          return originalPlay(key, config);
        }
      } catch (_) {}
      return false;
    };

    // Cleanup on scene shutdown/destroy
    this.events.once('shutdown', () => this.shutdown());
    this.events.once('destroy', () => this.shutdown());

    // Pre-populate the biome index from sceneData BEFORE createBackground +
    // createTerrain run. Group-chat passes match.backgroundIndex through
    // sceneData.backgroundIndex, but the original flow only read it later
    // inside handleType3 (line ~1240) — by that point createTerrain had
    // already drawn terrain layers using a RANDOM theme, and the second
    // createBackground call only re-skinned the sky, not the terrain.
    // Result: e.g. desert sky over green jungle layers.
    //
    // For 1v1 (gameType=4), sceneData.backgroundIndex is undefined; the
    // terrainGenerated socket handler later sets it before redrawing
    // terrain via setPath, so this branch is harmless on that path.
    if (this.sceneData?.backgroundIndex !== undefined && this.sceneData?.backgroundIndex !== null) {
      this._backgroundIndex = this.sceneData.backgroundIndex;
    }

    this.createBackground();
    this.createBlastLayer();
    this.createPointsLayer();
    this.createTerrain();
    this.createBoundWalls();

    // STEP 4 (iOS render overhaul) — bake projectile / glow / trail textures
    // once per scene create. Subsequent shots draw sprites from these
    // textures instead of `add.circle` shapes, which iOS Canvas2D fails
    // to rasterise reliably at small radii. Cheap (~20 small textures,
    // <50KB total) and idempotent — early-returns if already baked.
    this._initProjectileTextures();

    // N-player: create tanks[] from players array (or fall back to 2 for type4/backward compat)
    const playerCount = this.sceneData.players?.length || 2;
    this.createTanks(playerCount);

    // ── Type handler ──
    if (this.sceneData.gameType === 3) {
      this.handleType3();
    } else if (this.sceneData.gameType === 4) {
      this.handleType4();
    }

    this.showTurnPointer();

    try {
      this.sound.stopAll();
      this.sound.play('background', { loop: true });
    } catch (_) {}

    this.terrain.multiplayerPoints = [];

    // Legacy turn relay handlers (recieveTurn, opponentRequestTurn) REMOVED.
    // Turns are now managed server-side via turnResult.nextTurn.

    // ── Notify React that Phaser is ready ──
    this.events.once('terrain-finished', () => {
      // Save terrain for non-host clients (fallback path)
      if (this.myPlayerIndex > 0) {
        this.terrain.save();
      }
      this._pushStateToBridge();
      if (this._bridge) {
        this._bridge._readyFired = true;
        this._bridge.notifyReady();
      }
    });

    // Fallback: if terrain-finished never fires (e.g. non-host path race), force ready
    this.time.delayedCall(3000, () => {
      if (this._bridge && !this._bridge._readyFired) {
        this._bridge._readyFired = true;
        this._pushStateToBridge();
        this._bridge.notifyReady();
      }
    });

    // ── Click-to-aim handler — DISABLED pre-hackathon ──
    // Per JJ: the click-to-set-angle gesture isn't precise enough yet
    // (point-and-click maps roughly to a 0–180° turret angle but small
    // pixel deltas swing the angle a lot, especially when clicking near
    // the tank). Players were finding it frustrating mid-match. Better
    // to revisit post-hackathon — possibly with a click-AND-drag aim
    // line, or click-to-show-trajectory-preview before commit.
    //
    // The function definition is kept intact below so the feature can
    // be brought back with a single line uncomment + handler register.
    this._clickAimHandler = (pointer) => {
      if (pointer.button !== 0) return; // left click only
      if (this._firePending) return;
      const myTank = this.myPlayerIndex >= 0 ? this.tanks[this.myPlayerIndex] : null;
      if (!myTank?.turret || !myTank.active) return;

      // Compute angle from turret pivot to click point, convert to 0–180° game scale
      const absoluteAngle = Phaser.Math.Angle.Between(
        myTank.turret.x, myTank.turret.y,
        pointer.worldX, pointer.worldY
      );
      const relativeAngle = absoluteAngle - myTank.rotation;
      // Game scale: 0 = straight up, 90 = horizontal, 180 = straight down
      // inverse of: radians = DegToRad(v) - PI/2  →  v = RadToDeg(radians + PI/2)
      const degrees = Phaser.Math.RadToDeg(relativeAngle + Math.PI / 2);
      const clamped = Math.max(0, Math.min(180, Math.round(degrees)));

      // Route through the bridge so sliders + server both update
      if (this._bridge) this._bridge.setAngle(clamped);
    };

    // DISABLED: click-to-aim registration. Re-enable post-hackathon by
    // uncommenting the line below. Cleanup at line ~2275 is also a
    // no-op when the handler isn't registered (defensive off()).
    // this.input.on('pointerdown', this._clickAimHandler);

    this._created = true;
  };

  update = (_time, _delta) => {
    if (!this._created || !this.terrain || this.tanks.length === 0) return;

    this.checkSwitchTurn();
    this._pushStateToBridge();
    this._updateNameLabels();

    // Spectator aim trajectory — dotted line from active turret when spectating
    if (this._isSpectating && this.currentPlayerIndex >= 0) {
      this._drawSpectatorAimLine();
    } else {
      this._clearSpectatorAimLine();
    }

  };

  // ── Physics / Rendering (unchanged from original) ──

  createBoundWalls = () => {
    this.rightWall = this.physics.add.image(this.renderer.width + 50, this.renderer.height, 'wall');
    this.leftWall = this.physics.add.image(-50, this.renderer.height, 'wall');
    this.rightWall.setSize(100, this.renderer.height * 4);
    this.leftWall.setSize(100, this.renderer.height * 4);
    this.leftWall.setImmovable(true).setAlpha(0);
    this.rightWall.setImmovable(true).setAlpha(0);
    this.leftWall.setOrigin(1, 0);
    this.rightWall.setOrigin(0, 0);
  };

  // Background themes with matching base fill colors and terrain layer palettes.
  //
  // Five distinct biomes — bg-default was previously a 6th entry but had an
  // identical green palette to bg-jungle (idx 0), which biased the random
  // pick toward "feels green" 2/6 of the time. Removed; server roll now
  // matches at 0..4. Old matches with backgroundIndex=5 fall back to
  // jungle via the (idx % length) modulo at the consumer.
  _bgThemes = [
    { key: 'bg-jungle',   fill: '#0a1a0a', terrainLayers: [
      {color: 'rgba(107,123,61,1)', width: 10}, {color: 'rgba(92,106,53,1)', width: 30},
      {color: 'rgba(74,86,42,1)', width: 70}, {color: 'rgba(58,69,31,1)', width: 130}, {color: 'rgba(42,51,31,1)', width: 200}
    ]},
    { key: 'bg-arctic',   fill: '#0a0f1a', terrainLayers: [
      {color: 'rgba(190,200,210,1)', width: 10}, {color: 'rgba(160,172,185,1)', width: 30},
      {color: 'rgba(130,145,160,1)', width: 70}, {color: 'rgba(100,115,132,1)', width: 130}, {color: 'rgba(72,85,100,1)', width: 200}
    ]},
    { key: 'bg-desert',   fill: '#1a140a', terrainLayers: [
      {color: 'rgba(210,180,120,1)', width: 10}, {color: 'rgba(185,155,95,1)', width: 30},
      {color: 'rgba(160,130,75,1)', width: 70}, {color: 'rgba(130,105,60,1)', width: 130}, {color: 'rgba(100,80,45,1)', width: 200}
    ]},
    { key: 'bg-moon',     fill: '#0a0a0f', terrainLayers: [
      {color: 'rgba(140,140,150,1)', width: 10}, {color: 'rgba(115,115,125,1)', width: 30},
      {color: 'rgba(90,90,100,1)', width: 70}, {color: 'rgba(65,65,75,1)', width: 130}, {color: 'rgba(45,45,55,1)', width: 200}
    ]},
    { key: 'bg-volcanic', fill: '#1a0a0a', terrainLayers: [
      {color: 'rgba(180,80,30,1)', width: 10}, {color: 'rgba(150,60,20,1)', width: 30},
      {color: 'rgba(120,45,15,1)', width: 70}, {color: 'rgba(90,30,10,1)', width: 130}, {color: 'rgba(60,20,8,1)', width: 200}
    ]},
  ];

  createBackground = () => {
    // Destroy previous background sprite before removing its texture —
    // prevents Phaser "canvasData null" crash when called a second time
    // (terrainGenerated re-calls this to sync background theme between clients)
    if (this._bgImage) {
      this._bgImage.destroy();
      this._bgImage = null;
    }

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    canvas.height = this.renderer.height;
    canvas.width = this.renderer.width;
    // Use server-chosen index if available, otherwise random
    const idx = this._backgroundIndex ?? Math.floor(Math.random() * this._bgThemes.length);
    const theme = this._bgThemes[idx % this._bgThemes.length];
    this._currentTheme = theme; // Store for terrain layer colors
    ctx.fillStyle = theme.fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Sky: draw background image, showing more of the horizon detail.
    // Previous offsetY = -25% cropped the bottom of the BG image hard,
    // killing the mountains+horizon (user reported: "fades too black
    // too quickly, strange effect"). Reduced to -10% so ~90% of the
    // image's bottom is preserved into the visible viewport.
    var bgTex = this.textures.exists(theme.key) ? this.textures.get(theme.key) : null;
    if (bgTex && bgTex.source && bgTex.source[0]) {
      var img = bgTex.source[0].image;
      var scale = canvas.width / img.width;
      var drawW = img.width * scale;
      var drawH = img.height * scale;
      // -10% offset (was -25%) — keep the horizon line visible
      var offsetY = -(drawH * 0.10);
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, offsetY, drawW, drawH);
    }
    // Gradient fade from sky into dark terrain area.
    // Previous gradient at 40-55% slammed into the bottom of the BG image
    // because the image only filled 0-55%. Pushed down to 55-72% so the
    // fade now lives BELOW the image's natural bottom edge, smoothing the
    // transition into the dark terrain band rather than chopping mountains
    // mid-silhouette. Final alpha 0.92 (was 1.0) so a faint horizon hint
    // bleeds into the terrain band instead of a hard cutoff.
    const r = parseInt(theme.fill.slice(1,3), 16);
    const g = parseInt(theme.fill.slice(3,5), 16);
    const b = parseInt(theme.fill.slice(5,7), 16);
    var fadeGrad = ctx.createLinearGradient(0, canvas.height * 0.55, 0, canvas.height * 0.72);
    fadeGrad.addColorStop(0, `rgba(${r},${g},${b},0)`);
    fadeGrad.addColorStop(0.5, `rgba(${r},${g},${b},0.55)`);
    fadeGrad.addColorStop(1, `rgba(${r},${g},${b},0.92)`);
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(0, Math.floor(canvas.height * 0.55), canvas.width, Math.ceil(canvas.height * 0.17));
    // Solid dark fill below the fade for terrain area (terrain renders
    // on top — this is just background color where heightmap reaches)
    ctx.fillStyle = theme.fill;
    ctx.fillRect(0, Math.floor(canvas.height * 0.72), canvas.width, Math.ceil(canvas.height * 0.28));
    if (this.textures.exists('background')) this.textures.remove('background');
    this.background = this.textures.addCanvas('background', canvas);
    this._bgImage = this.add.image(canvas.width / 2, canvas.height / 2, 'background').setDepth(-10);
  };

  createBlastLayer = () => {
    var canvas = document.createElement('canvas');
    canvas.height = this.renderer.height;
    canvas.width = this.renderer.width;
    if (this.textures.exists('blast-layer')) this.textures.remove('blast-layer');
    this.textures.addCanvas('blast-layer', canvas);
    this.blastLayer = this.add.image(canvas.width / 2, canvas.height / 2, 'blast-layer').setDepth(3);
  };

  createPointsLayer = () => {
    var canvas = document.createElement('canvas');
    canvas.height = this.renderer.height;
    canvas.width = this.renderer.width;
    if (this.textures.exists('points-layer')) this.textures.remove('points-layer');
    this.blastLayer = this.textures.addCanvas('points-layer', canvas);
    this.add.image(canvas.width / 2, canvas.height / 2, 'points-layer').setDepth(4);
  };

  createTerrain = () => {
    this.terrain = new Terrain(this);
  };

  // ── N-player tank creation (replaces createTank1/createTank2) ──
  createTanks = (N) => {
    this.tanks.forEach(t => { try { t.destroy(); } catch (_) {} });
    this.tanks = [];
    for (let i = 0; i < N; i++) {
      const t = new Tank(this, i + 1); // id=1..N for texture keys tank1..tankN
      t.setDepth(-2);
      this.tanks.push(t);
    }
  };

  // ── Turn switching ──
  // For type3 (multiplayer): Turns are managed by the server via turnResult.nextTurn.
  // This method now only handles:
  //   1. Detecting when the local firing animation finishes so we can apply pendingTurnResult
  //   2. Non-multiplayer (type4) local turn switching
  checkSwitchTurn = () => {
    // Safety valve: if terrain.animate is stuck for >10s (e.g. gravity sim error),
    // force-clear it so the game doesn't freeze permanently
    if (this.terrain.animate === true) {
      if (!this._animateStuckStart) {
        this._animateStuckStart = Date.now();
      } else if (Date.now() - this._animateStuckStart > 10000) {
        console.warn('[SolShot] terrain.animate stuck for 10s — force-clearing');
        this.terrain.animate = false;
        this.terrain.matrix = [];
        this.terrain.blastArray = [];
        this._animateStuckStart = null;
      }
      return;
    }
    this._animateStuckStart = null;
    // Only block on terrain-digging blasts (non-visualOnly).
    // Visual-only blasts (multiplayer) are cosmetic and shouldn't delay turn switching.
    const blockingBlasts = this.terrain.blastArray.filter(b => !b.visualOnly);
    if (blockingBlasts.length !== 0) return;
    if (this.gameOver === true) return;

    // Safety: if any alive tank is unsettled for too long (>3s), force settle all
    // This prevents the game from getting permanently stuck
    const unsettled = this.tanks.filter((t, i) => !this._eliminated[i] && !t.settled);
    if (unsettled.length > 0) {
      if (!this._settleWaitStart) {
        this._settleWaitStart = Date.now();
      } else if (Date.now() - this._settleWaitStart > 3000) {
        console.warn('[SolShot] Force-settling tanks after 3s timeout. unsettled=' + unsettled.length);
        this.tanks.forEach(t => {
          t.settled = true;
          if (t.body) {
            t.body.stop();
            t.body.setGravity(0);
          }
        });
        this._settleWaitStart = null;
      }
      return;
    }
    this._settleWaitStart = null;

    // For multiplayer: apply pending server result once ALL animations are done.
    if (this.sceneData.gameType === 3) {
      if (this.pendingTurnResult) {
        // Cooldown: after pendingTurnResult is set, wait a few frames so that
        // any in-flight blast (from playExplosionEffect or local weapon) has time
        // to push into blastArray and be detected by the top-level guards.
        if (this._turnResultCooldown > 0) {
          this._turnResultCooldown--;
          return;
        }
        // Own shot: also wait for weapon animation to finish
        const myTank = this.myPlayerIndex >= 0 ? this.tanks[this.myPlayerIndex] : null;
        const weaponDone = myTank
          ? (myTank.turret && myTank.turret.activeWeapon === null)
          : true;
        if (weaponDone) {
          this._weaponWaitLogged = false;
          this.applyTurnResult(this.pendingTurnResult);
          this.pendingTurnResult = null;
        }
      }
      return;
    }

    // Non-multiplayer (type4 practice mode) — legacy local turn switching
    // Apply server-authoritative positions + gold from pending result (knockback, etc.)
    if (this.pendingTurnResult) {
      if (this._turnResultCooldown > 0) {
        this._turnResultCooldown--;
        return;
      }
      const pr = this.pendingTurnResult;
      // Sync heightmap FIRST (before position snap uses it)
      if (pr.terrainUpdate && pr.terrainUpdate.length > 0) {
        this._serverHeightmap = pr.terrainUpdate;
        this.terrain.applyHeightmap(pr.terrainUpdate);
        // Mark all tanks unsettled so they re-snap to the new terrain surface
        if (this.tanks) {
          this.tanks.forEach(t => { if (t) t.settled = false; });
        }
      }
      // Sync HP from server
      if (pr.players && Array.isArray(pr.players)) {
        pr.players.forEach((pd, i) => {
          const tank = this.tanks[i];
          if (tank && tank.scoreHandler && pd.hp !== undefined) {
            tank.scoreHandler.hp = Math.max(0, pd.hp);
          }
        });
      }
      // Sync positions (includes knockback)
      const positions = pr.positions;
      if (positions && Array.isArray(positions)) {
        positions.forEach((pos, i) => {
          const tank = this.tanks[i];
          if (!tank) return;
          const px = pos.x ?? pos.pos?.x;
          if (px === undefined) return;
          // Only sync X (knockback). Let physicsStep settle Y.
          if (Math.abs(tank.x - px) > 1) {
            tank.setPosition(px, tank.y);
            if (tank.body) tank.body.x = px;
            tank.settled = false;
          }
        });
        this._lastPositions = positions;
      }
      // Sync gold
      const socket = window.socket;
      if (pr.goldBalance && socket && this._bridge) {
        const myGold = pr.goldBalance[socket.id];
        if (myGold !== undefined) this._bridge.updateState({ gold: myGold });
      }
      // Flush pending eliminations
      while (this._pendingEliminations?.length > 0) {
        const e = this._pendingEliminations.shift();
        this._playEliminationEffect(e.tankIndex, e.eliminatedId, e.killedById, e.reason);
      }
      this._bridge && this._pushStateToBridge();
      this.pendingTurnResult = null;
    }

    const t0 = this.tanks[0];
    const t1 = this.tanks[1];
    if (!t0 || !t1) return;

    if (t0.weapons.length === 0 && t1.weapons.length === 0) {
      if (t0.turret.activeWeapon === null && t1.turret.activeWeapon === null) {
        this.gameOver = true;
        t0.active = false;
        t1.active = false;
        this.activeTank = 0;
      }
    } else if (this.activeTank === 1 && t0.active === false && t0.turret.activeWeapon === null) {
      this.terrain.frameCount = -1;
      this.activeTank = 2;
      t1.active = true;
      this.showTurnPointer();
    } else if (this.activeTank === 2 && t1.active === false && t1.turret.activeWeapon === null) {
      this.terrain.frameCount = -1;
      this.activeTank = 1;
      t0.active = true;
      this.showTurnPointer();
    }
  };

  // ── Activate the current player's tank and deactivate all others ──
  _activateCurrentTank = () => {
    this._firePending = false; // Reset fire guard on turn change
    // Fix 2: Flush queued eliminations (covers timeout path where applyTurnResult never runs)
    while (this._pendingEliminations?.length > 0) {
      const e = this._pendingEliminations.shift();
      this._playEliminationEffect(e.tankIndex, e.eliminatedId, e.killedById, e.reason);
    }
    this.tanks.forEach((t, i) => {
      const isMyTankAndMyTurn = (i === this.myPlayerIndex && i === this.currentPlayerIndex);
      t.active = isMyTankAndMyTurn;
      if (i === this.currentPlayerIndex) t.movesRemaining = 4;
    });
    // Flash "YOUR TURN!" when it becomes the local player's turn
    if (this.currentPlayerIndex === this.myPlayerIndex && !this._isSpectating) {
      this._flashYourTurn();
      // Fire the first-shot trajectory preview as soon as the local
      // player's turn begins, so the gauge is visible without them
      // having to nudge a slider first. The render method itself is
      // gated to the first shot only — calling it on every turn is a
      // no-op after that.
      this._renderTrainingPreview();
    } else {
      // Not our turn — make sure no stale preview dots linger over the
      // opponent's shot (e.g. if the local player's turn ended via
      // timeout without firing).
      this._clearTrainingPreview();
    }
  };

  // ── Turn pointer ──

  showTurnPointer = () => {
    var tank = null;
    if (this.sceneData.gameType === 3) {
      // Multiplayer: show pointer over the current player's tank
      if (this.currentPlayerIndex >= 0 && this.currentPlayerIndex < this.tanks.length) {
        tank = this.tanks[this.currentPlayerIndex];
      }
    } else {
      // Practice mode: use activeTank (1-based) to index into tanks[]
      if (this.activeTank === 1) tank = this.tanks[0];
      else if (this.activeTank === 2) tank = this.tanks[1];
    }

    if (tank !== null) {
      this.hideTurnPointer();
      var canvas = document.createElement('canvas');
      canvas.width = 18;
      canvas.height = 20;
      var w = 18;
      var h = 20;
      var ctx = canvas.getContext('2d');

      ctx.fillStyle = tank.color;
      ctx.moveTo(w / 3, 0);
      ctx.lineTo(w * (2 / 3), 0);
      ctx.lineTo(w * (2 / 3), h * (1 / 2));
      ctx.lineTo(w, h * (1 / 2));
      ctx.lineTo(w / 2, h);
      ctx.lineTo(0, h * (1 / 2));
      ctx.lineTo(w * (1 / 3), h * (1 / 2));
      ctx.lineTo(w / 3, 0);
      ctx.closePath();
      ctx.fill();

      if (this.textures.exists('turn-pointer')) this.textures.remove('turn-pointer');
      this.textures.addCanvas('turn-pointer', canvas);
      this.turnPointer = this.add.image(tank.x, tank.y - 58, 'turn-pointer');
      this.turnPointer.setDepth(10);

      this.tweens.add({
        targets: this.turnPointer,
        y: this.turnPointer.y - 10,
        repeat: -1,
        yoyo: true,
        duration: 300,
      });

      this.turnPointer.setVisible(true);
    }
  };

  hideTurnPointer = () => {
    if (this.turnPointer !== null) {
      this.turnPointer.setVisible(false);
      this.turnPointer = null;
    }
  };

  // ── Tactile pass — impact juice (damage popup + hit-stop + extra shake) ──
  //
  // Called from the turnResult HP-update loop for every tank that took
  // damage this shot. Layers four kinds of feedback that compound to
  // make every connect *feel* satisfying:
  //
  //   1. Damage number popup that scale-pops in and floats up
  //   2. Hit-stop: brief 60ms scene freeze on tank-direct-hit (the
  //      AAA "frame freeze" that emphasises connection)
  //   3. Extra camera shake on top of the radius-based shake from Blast.js
  //   4. Damage-band-aware haptic (.light / .medium / .heavy)
  //
  // Damage bands (relative to 250 max HP):
  //   ≤10  glancing    → grey, small text, .light haptic
  //   ≤50  solid       → bone,  medium text, .medium haptic
  //   ≤100 critical    → accent, large text, .heavy haptic + 60ms hit-stop
  //   >100 devastating → red,    huge text,   .heavy haptic + 80ms hit-stop + extra shake

  _playImpactJuice = (tankIndex, damage, isLocalPlayerHit) => {
    if (!damage || damage <= 0) return;
    if (!this.sys?.isActive()) return;
    const tank = this.tanks[tankIndex];
    if (!tank) return;

    // Damage band classification
    let band, color, fontSize, hapticLevel, hitStopMs, extraShake;
    if (damage <= 10) {
      band = 'glancing';
      color = '#7a9060'; // var(--olive)
      fontSize = 18;
      hapticLevel = 'light';
      hitStopMs = 0;
      extraShake = 0;
    } else if (damage <= 50) {
      band = 'solid';
      color = '#c8b87a'; // var(--bone)
      fontSize = 24;
      hapticLevel = 'medium';
      hitStopMs = 0;
      extraShake = 0;
    } else if (damage <= 100) {
      band = 'critical';
      color = '#c8781a'; // var(--accent)
      fontSize = 32;
      hapticLevel = 'heavy';
      hitStopMs = 60;
      extraShake = 0.005;
    } else {
      band = 'devastating';
      color = '#a83a1a'; // var(--red)
      fontSize = 40;
      hapticLevel = 'heavy';
      hitStopMs = 80;
      extraShake = 0.012;
    }

    // 1. DAMAGE POPUP — Phaser text that scale-pops + floats up + fades
    this._spawnDamagePopup(tank.x, tank.y - 24, `-${damage}`, color, fontSize);

    // 2. HIT-STOP — pause Phaser physics + tweens for ~60-80ms on
    //    critical/devastating hits. Creates the "the world pauses for
    //    a beat" feel of a real connection. Skip on glancing/solid
    //    so chained shots stay snappy.
    if (hitStopMs > 0) this._hitStop(hitStopMs);

    // 3. EXTRA SHAKE — adds on top of the radius-based shake from
    //    Blast.js. Only fires on critical+ so glancing hits don't feel
    //    overweighted.
    if (extraShake > 0 && this.cameras?.main) {
      this.cameras.main.shake(120, extraShake);
    }

    // 4. HAPTIC — only the local player feels it, only if they're the
    //    one taking damage. Map damage band to TG WebApp haptic level.
    if (isLocalPlayerHit && window.haptic) {
      try { window.haptic[hapticLevel](); } catch (_) {}
    }
  };

  /**
   * Damage-number popup. Scales from 0.4 → 1.15 → 1.0 in 200ms
   * (overshoot bounce), then floats up 36px + fades over 900ms.
   * Total visible time ~1.1s. Designed to read at a glance during
   * fast shots without lingering through the next turn.
   */
  _spawnDamagePopup = (x, y, text, color, fontSize) => {
    if (!this.add) return;
    const popup = this.add.text(x, y, text, {
      fontFamily: "'Black Ops One', 'Arial Black', sans-serif",
      fontSize: `${fontSize}px`,
      color,
      stroke: '#000',
      strokeThickness: Math.max(2, fontSize / 12),
      shadow: {
        offsetX: 0,
        offsetY: 1,
        color: '#000',
        blur: 4,
        stroke: false,
        fill: true,
      },
    });
    popup.setOrigin(0.5, 0.5);
    popup.setDepth(900);
    popup.setScale(0.4);

    // Phase 1: bouncy scale-in (200ms)
    this.tweens.add({
      targets: popup,
      scale: 1.15,
      duration: 120,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Phase 2: settle to 1.0
        this.tweens.add({
          targets: popup,
          scale: 1.0,
          duration: 80,
          ease: 'Quad.easeOut',
        });
      },
    });

    // Phase 3: float up + fade (runs in parallel with scale phases)
    this.tweens.add({
      targets: popup,
      y: y - 36,
      alpha: 0,
      duration: 900,
      delay: 200,
      ease: 'Quad.easeIn',
      onComplete: () => { try { popup.destroy(); } catch (_) {} },
    });
  };

  /**
   * Brief hit-stop: pause Phaser physics + tween manager for `ms`
   * milliseconds, then resume. The "AAA freeze frame" that emphasises
   * impact connection. Tween targets that were mid-animation resume
   * cleanly.
   */
  _hitStop = (ms) => {
    if (!this.physics?.world || !this.tweens) return;
    try {
      this.physics.world.pause();
      this.tweens.pauseAll();
    } catch (_) { return; }
    setTimeout(() => {
      if (!this.sys?.isActive()) return;
      try {
        this.physics.world.resume();
        this.tweens.resumeAll();
      } catch (_) {}
    }, ms);
  };

  // ── Elimination: wreckage, kill text, spectator mode ──

  _playEliminationEffect = (tankIndex, eliminatedId, killedById, reason) => {
    if (!this.sys?.isActive()) return; // Guard: scene may be shutting down
    const tank = this.tanks[tankIndex];
    if (!tank) return;

    const ex = tank.x;
    const ey = tank.y;

    // 1. Brief particle burst explosion (reuse Big Shot blast for dramatic effect)
    this.playExplosionEffect(ex, ey, 1);
    try { this.sound.play('expmedium'); } catch (_) {}

    // 2. Draw charred wreckage hull at tank's last position
    const wreckage = this.add.graphics();
    wreckage.fillStyle(0x3a2a1a, 0.85); // charred brown body
    wreckage.fillRect(ex - 18, ey - 8, 36, 12);
    wreckage.fillStyle(0x1a0a00, 0.6); // dark turret stub
    wreckage.fillRect(ex - 10, ey - 14, 20, 6);
    // Scorch marks for battle-damage detail
    wreckage.fillStyle(0x000000, 0.3);
    wreckage.fillCircle(ex - 5, ey - 2, 3);
    wreckage.fillCircle(ex + 8, ey - 4, 2);
    wreckage.setDepth(-1); // above terrain, below blast layer

    // 3. Hide actual tank sprite and disable physics
    tank.setVisible(false);
    if (tank.body) tank.body.enable = false;
    if (tank.turret) tank.turret.setVisible(false);

    // 4. Fade name label for eliminated tank
    if (this._nameLabels && this._nameLabels[tankIndex]) {
      this._nameLabels[tankIndex].setAlpha(0.3);
      this._nameLabels[tankIndex].setStyle({ color: '#666666' });
    }

    // 5. Kill text overlay — fades after ~2.5s
    const eliminatedName = tank.name || 'Player';
    let killerName = 'timeout';
    if (killedById) {
      const positions = this._lastPositions || [];
      const killerIdx = positions.findIndex(p => p.socketId === killedById);
      killerName = (killerIdx >= 0 && this.tanks[killerIdx]) ? (this.tanks[killerIdx].name || 'Player') : 'unknown';
    }
    const msg = reason === 'timeout'
      ? `${eliminatedName} timed out`
      : killedById
        ? `${eliminatedName} eliminated by ${killerName}`
        : `${eliminatedName} was eliminated`;

    const killText = this.add.text(
      this.renderer.width / 2, this.renderer.height * 0.25,
      msg,
      {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '18px',
        color: '#ff4444',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
      }
    );
    killText.setOrigin(0.5, 0.5);
    killText.setDepth(20);
    killText.setScrollFactor(0);

    this.tweens.add({
      targets: killText,
      alpha: 0,
      y: killText.y - 20,
      duration: 1800,
      delay: 800,
      ease: 'Quad.easeIn',
      onComplete: () => { try { killText.destroy(); } catch (_) {} }
    });
  };

  _enterSpectatorMode = (placement) => {
    this._isSpectating = true;
    this._spectatorPlacement = placement;

    // Disable controls for local player
    if (this.myPlayerIndex >= 0 && this.tanks[this.myPlayerIndex]) {
      this.tanks[this.myPlayerIndex].active = false;
    }

    // Zoom out camera to show full battlefield
    const centerX = this.renderer.width / 2;
    const centerY = this.renderer.height / 2;
    this.cameras.main.pan(centerX, centerY, 600, 'Cubic.easeOut');
    this.cameras.main.zoomTo(0.85, 800, 'Cubic.easeOut');

    // Notify bridge — React shows placement banner + Leave Match button in Phase 19
    if (this._bridge) {
      this._bridge.notifyEliminated({ placement });
    }

    // Show placement text in Phaser (semi-transparent, persistent)
    const ordinal = placement === 1 ? '1st' : placement === 2 ? '2nd' : placement === 3 ? '3rd' : placement + 'th';
    const placementText = this.add.text(
      this.renderer.width / 2,
      this.renderer.height * 0.15,
      `YOU PLACED ${ordinal}`,
      {
        fontFamily: "'Black Ops One', cursive",
        fontSize: '24px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
      }
    );
    placementText.setOrigin(0.5, 0.5);
    placementText.setDepth(25);
    placementText.setAlpha(0.7);
    placementText.setScrollFactor(0);
  };

  _drawSpectatorAimLine = () => {
    // Clear previous frame's line
    if (this._spectatorAimGfx) {
      try { this._spectatorAimGfx.destroy(); } catch (_) {}
    }

    const activeTank = this.tanks[this.currentPlayerIndex];
    if (!activeTank || !activeTank.turret || this._eliminated[this.currentPlayerIndex]) return;

    const turret = activeTank.turret;
    const startX = turret.x;
    const startY = turret.y;
    const angle = turret.rotation; // absolute rotation in radians

    this._spectatorAimGfx = this.add.graphics();
    this._spectatorAimGfx.setDepth(6);

    const lineLen = 120;
    const dotSpacing = 8;
    const dotRadius = 1.5;

    this._spectatorAimGfx.fillStyle(0xffffff, 0.4);
    for (let d = 20; d < lineLen; d += dotSpacing) {
      const dx = startX + d * Math.sin(angle);
      const dy = startY - d * Math.cos(angle);
      this._spectatorAimGfx.fillCircle(dx, dy, dotRadius);
    }
  };

  _clearSpectatorAimLine = () => {
    if (this._spectatorAimGfx) {
      try { this._spectatorAimGfx.destroy(); } catch (_) {}
      this._spectatorAimGfx = null;
    }
  };

  // ── Name labels and YOU marker ──

  _createNameLabels = () => {
    // Destroy existing labels before recreating
    if (this._nameLabels) {
      this._nameLabels.forEach(l => { try { l.destroy(); } catch (_) {} });
    }
    if (this._youMarker) {
      try { this._youMarker.destroy(); } catch (_) {}
    }

    this._nameLabels = this.tanks.map((t, i) => {
      const label = this.add.text(t.x, t.y - 32, t.name || '', {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '14px',
        color: t.color || '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        resolution: 2,
      });
      label.setOrigin(0.5, 1);
      label.setDepth(15);
      return label;
    });

    // "YOU" marker removed — HUD already shows player identity at top,
    // and the turn pointer arrow indicates the active tank.
  };

  _updateNameLabels = () => {
    if (!this._nameLabels) return;
    this.tanks.forEach((t, i) => {
      const label = this._nameLabels[i];
      if (!label) return;
      if (this._eliminated[i]) {
        // Keep label at last position, faded (alpha set in _playEliminationEffect)
        return;
      }
      label.setPosition(t.x, t.y - 32);
    });
    // Update YOU marker position
    if (this._youMarker && this.myPlayerIndex >= 0) {
      const myTank = this.tanks[this.myPlayerIndex];
      if (myTank && !this._eliminated[this.myPlayerIndex]) {
        this._youMarker.setPosition(myTank.x, myTank.y - 44);
      }
    }
  };

  // ── First-shot training: full trajectory dotted preview ──
  //
  // Shows on the FIRST shot of every match for every player, regardless
  // of mode (VS Bot, 1v1, group-chat, custom). Gives a free read on
  // where the shell is going to land before they commit, so brand-new
  // players can ballpark opponent distance + see how angle / power /
  // wind interact. Disappears after they fire — it's a learning aid,
  // not a permanent crutch. JJ pre-submission ask, May 9.
  //
  // Originally gated to VS Shot Bot only with a 3-shot limit. JJ's
  // call: extend it to all modes but tighten to first shot only so it
  // stays a "first impression" gauge rather than a competitive crutch.

  _renderTrainingPreview = () => {
    this._clearTrainingPreview();

    // Shots-fired counter is incremented on every fire (handleFireFromReact).
    // Training preview shows for the very first shot only.
    if ((this._myTrainingShots ?? 0) >= 1) return;

    // Pick the local controllable tank — falls back to activeTank for the
    // local-sandbox (gameType 4) path where myPlayerIndex isn't set, so
    // the preview shows in EVERY mode (vs bot, 1v1, group-chat, custom,
    // local practice).
    const myTank = this.myPlayerIndex >= 0
      ? this.tanks[this.myPlayerIndex]
      : this.tanks[(this.activeTank || 1) - 1];
    if (!myTank?.turret || !myTank.active) return;

    // Server-mirrored physics simulation (matches _renderScopePreview).
    const angle = myTank.turret.rotation;
    const power = myTank.power || 60;
    const wind = this.wind || 0;
    const velocity = power * 8;
    const rotation = angle - Math.PI / 2;
    let vx = velocity * Math.cos(rotation);
    let vy = velocity * Math.sin(rotation);
    let x = myTank.turret.x;
    let y = myTank.turret.y;
    const gravity = 300;
    const dt = 1 / 60;

    const points = [];
    for (let step = 0; step < 600; step++) {
      vy += gravity * dt;
      vx += wind * dt;
      x += vx * dt;
      y += vy * dt;
      points.push({ x, y });
      if (y > 800 || x < 0 || x > 1956) break;
    }

    if (points.length < 4) return;

    // Sample evenly along the FULL trajectory at HIGH density so the dots
    // read as a connected line, not isolated points. 24 dots feels
    // continuous without being a solid line. Per JJ QA pass May 9:
    // smaller dots, denser, different colour than black so it doesn't
    // clash with bullets / dark backgrounds (moon, volcanic).
    //
    // Colour choice: soft cyan-white (0xb0e8e0) — high enough contrast
    // against all 5 biomes (jungle, arctic, desert, moon, volcanic),
    // doesn't clash with any tank colour (no team uses cyan-white),
    // and reads as "tech HUD overlay" rather than "real shell". Low
    // alpha keeps it subtle.
    this._trainingDots = [];
    const dotCount = 24;
    for (let i = 0; i < dotCount; i++) {
      const idx = Math.floor((points.length - 1) * (i / (dotCount - 1)));
      const p = points[idx];
      // Smaller dots all the way through. Last 2 dots slightly larger
      // so the eye lands on the predicted impact zone.
      const radius = i >= dotCount - 2 ? 2.2 : 1.4;
      const dot = this.add.circle(p.x, p.y, radius, 0xb0e8e0, 0.55);
      dot.setDepth(10);
      this._trainingDots.push(dot);
    }
  };

  _clearTrainingPreview = () => {
    if (this._trainingDots) {
      this._trainingDots.forEach(d => { try { d.destroy(); } catch (_) {} });
      this._trainingDots = [];
    }
  };

  // ── Tactical Scope: trajectory preview dots (first 1/3 of arc) ──

  _renderScopePreview = () => {
    this._clearScopePreview();

    if (!this._myConsumables?.includes('tactical_scope')) return;

    // Check if any opponent has smoke_screen (blocks scope)
    const myId = window.socket?.id;
    const opponents = this._allConsumables || {};
    const opponentHasSmoke = Object.entries(opponents).some(
      ([id, cons]) => id !== myId && cons.includes('smoke_screen')
    );
    if (opponentHasSmoke) return;

    const myTank = this.myPlayerIndex >= 0 ? this.tanks[this.myPlayerIndex] : null;
    if (!myTank?.turret || !myTank.active) return;

    const angle = myTank.turret.rotation;
    const power = myTank.power || 60;
    const wind = this.wind || 0;

    // Simulate trajectory using same physics as server
    const velocity = power * 8;
    const rotation = angle - Math.PI / 2;
    let vx = velocity * Math.cos(rotation);
    let vy = velocity * Math.sin(rotation);
    let x = myTank.turret.x;
    let y = myTank.turret.y;
    const gravity = 300;
    const dt = 1 / 60;

    const points = [];
    for (let step = 0; step < 600; step++) {
      vy += gravity * dt;
      vx += wind * dt;
      x += vx * dt;
      y += vy * dt;
      points.push({ x, y });
      if (y > 800 || x < 0 || x > 1956) break;
    }

    // First 1/3 of trajectory
    const thirdLen = Math.floor(points.length / 3);
    if (thirdLen < 3) return;

    // Place 3 dots evenly in the first third
    this._scopeDots = [];
    for (let i = 1; i <= 3; i++) {
      const idx = Math.floor((thirdLen / 4) * i);
      if (idx >= points.length) break;
      const dot = this.add.circle(points[idx].x, points[idx].y, 3, 0x22ff22, 0.5);
      dot.setDepth(10);
      this._scopeDots.push(dot);
    }
  };

  _clearScopePreview = () => {
    if (this._scopeDots) {
      this._scopeDots.forEach(d => { try { d.destroy(); } catch (_) {} });
      this._scopeDots = [];
    }
  };

  // ── YOUR TURN flash overlay ──

  _flashYourTurn = () => {
    if (this._isSpectating) return;
    // Skip the very first turn (terrain placement turn) — only flash on subsequent turns
    if (!this._hasHadFirstTurn) {
      this._hasHadFirstTurn = true;
      return;
    }

    try { this.sound.play('click', { volume: 0.3 }); } catch (_) {}

    const flash = this.add.text(
      this.renderer.width / 2,
      this.renderer.height * 0.35,
      'YOUR TURN!',
      {
        fontFamily: "'Black Ops One', cursive",
        fontSize: '28px',
        color: '#14f195',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
      }
    );
    flash.setOrigin(0.5, 0.5);
    flash.setDepth(25);
    flash.setScrollFactor(0);
    flash.setScale(0.5);
    flash.setAlpha(0);

    // Scale up + fade in, then fade out
    this.tweens.add({
      targets: flash,
      scale: 1,
      alpha: 1,
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: flash,
          alpha: 0,
          y: flash.y - 15,
          duration: 800,
          delay: 600,
          ease: 'Quad.easeIn',
          onComplete: () => { try { flash.destroy(); } catch (_) {} }
        });
      }
    });
  };


  // ── Type 3: Online multiplayer — SERVER IS GOD ──
  //
  // Server generates terrain, runs physics, manages turns.
  // Client only sends {angle, power, weaponId, seq} and renders results.

  handleType3 = () => {
    const socket = window.socket;
    if (!socket) {
      console.error('[SolShot] handleType3: No socket!');
      return;
    }

    // Build players array — N-player canonical from ShopScreen, with backward-compat fallback
    const allPlayers = this.sceneData.players || (() => {
      // Backward compat: build 2-element array from player1/player2 fields
      const p1 = this.sceneData.player1;
      const p2 = this.sceneData.player2;
      if (p1 && p2) return [p1, p2];
      return [];
    })();

    // Initialize each tank with player data (ordered to match room.players[])
    allPlayers.forEach((player, i) => {
      if (this.tanks[i]) {
        this.tanks[i].weapons = player.weapons || [];
        this.tanks[i].create(int2rgba(player.color), player.name);
        // Group-chat: restore the player's last fired angle + power so
        // turret/power bar default to where they last aimed. tank.create()
        // sets rotation from terrain slope; we override AFTER, only if the
        // server gave us a persisted value (null for never-fired players).
        if (typeof player.lastAngle === 'number' && this.tanks[i].turret) {
          try { this.tanks[i].turret.setRotation(player.lastAngle); } catch (_) {}
        }
        if (typeof player.lastPower === 'number' && this.tanks[i].setPower) {
          try { this.tanks[i].setPower(player.lastPower); } catch (_) {}
        }
      }
    });

    // Server nonce for fire validation (prevents replay attacks)
    this._turnSeq = 0;
    // Pending turn result for firing player (applied after local animation)
    this.pendingTurnResult = null;
    // Server heightmap for terrain sync
    this._serverHeightmap = null;
    // Track HP server-side
    this._serverHP = {};

    // ── STEP 1: Server-generated terrain ──
    // Both clients listen for terrainGenerated. Host triggers requestTerrain.
    this._socketHandlers.terrainGenerated = ({ path, heightmap, positions, tankPositions, seed, wind, backgroundIndex, firstTurn, seq, consumables }) => {
      // Re-draw background with server-chosen theme so both clients match.
      // Fallback random matches the server's roll range (5 themes, idx 0-4).
      this._backgroundIndex = backgroundIndex ?? Math.floor(Math.random() * this._bgThemes.length);
      this.createBackground();
      // Store server heightmap for later terrain sync
      this._serverHeightmap = heightmap;
      this._turnSeq = seq || 0;
      // Store wind for projectile physics
      this.wind = wind || 0;

      // Draw terrain from server path (same format as client path: [{x,y},...])
      this.terrain.setPath(path);

      // Resolve positions[] — canonical N-player format, with backward-compat shim
      let resolvedPositions = positions;
      if (!resolvedPositions || !Array.isArray(resolvedPositions)) {
        // Backward compat: build positions[] from tankPositions {host, player}
        if (tankPositions) {
          const hostId = this.sceneData.hostId;
          const isHost = socket.id === hostId;
          resolvedPositions = [
            { socketId: hostId, x: tankPositions.host?.x, y: tankPositions.host?.y },
            { socketId: null, x: tankPositions.player?.x, y: tankPositions.player?.y },
          ];
        } else {
          resolvedPositions = [];
        }
      }

      // Determine which tank is the local player
      this.myPlayerIndex = resolvedPositions.findIndex(p => p.socketId === socket.id);
      this._lastPositions = resolvedPositions;

      // Position all tanks — extract x/y from flat or nested format
      resolvedPositions.forEach((pos, i) => {
        const tank = this.tanks[i];
        if (!tank) return;
        const px = pos.x ?? pos.pos?.x;
        const py = pos.y ?? pos.pos?.y;
        if (px === undefined || py === undefined) return;
        tank.setPosition(px, py);
        const rotation = this.terrain.getSlope(px, py);
        if (rotation !== undefined) tank.setRotation(rotation);
        tank.enablePhysics();
      });

      // Determine first turn from server — firstTurn is a socket.id
      const firstTurnIdx = resolvedPositions.findIndex(p => p.socketId === firstTurn);
      this.currentPlayerIndex = firstTurnIdx >= 0 ? firstTurnIdx : 0;

      // Store consumable data for Tactical Scope + Overcharge
      this._allConsumables = consumables || {};
      this._myConsumables = consumables?.[socket.id] || [];

      // Overcharge: raise power cap to 115
      if (this._myConsumables.includes('overcharge')) {
        const myTank = this.myPlayerIndex >= 0 ? this.tanks[this.myPlayerIndex] : null;
        if (myTank) myTank.maxPower = 115;
      }

      this._activateCurrentTank();
      this.showTurnPointer();
      this._createNameLabels();
      this._pushStateToBridge();
      if (this._bridge) {
        this._bridge._readyFired = true;
        this._bridge.notifyReady();
      }
    };
    socket.on('terrainGenerated', this._socketHandlers.terrainGenerated);

    // Group-chat: server doesn't fire `terrainGenerated` socket events. We
    // already have terrainSnapshot + positions + wind on sceneData (read
    // from the GroupMatch doc). Bootstrap inline using the same primitives
    // the handler uses, but applyHeightmap (dense form) instead of setPath
    // (sparse path) since the GroupMatch doc stores the heightmap directly.
    if (this.sceneData.gameMode === 'group-chat') {
      this._backgroundIndex = this.sceneData.backgroundIndex || 0;
      this.createBackground();
      this._serverHeightmap = this.sceneData.terrainSnapshot;
      this._turnSeq = 0;
      this.wind = this.sceneData.wind || 0;
      if (this.sceneData.terrainSnapshot) {
        this.terrain.applyHeightmap(this.sceneData.terrainSnapshot);
      }

      const positions = this.sceneData.positions || [];
      this.myPlayerIndex = positions.findIndex(p => p.socketId === socket.id);
      this._lastPositions = positions;

      positions.forEach((pos, i) => {
        const tank = this.tanks[i];
        if (!tank) return;
        const px = pos.x ?? pos.pos?.x;
        const py = pos.y ?? pos.pos?.y;
        if (px === undefined || py === undefined) return;
        tank.setPosition(px, py);
        const rotation = this.terrain.getSlope(px, py);
        if (rotation !== undefined) tank.setRotation(rotation);
        tank.enablePhysics();
      });

      // CRITICAL: seed each tank's HP + eliminated flag from sceneData.
      // Without this, every scene mount initialises tanks at 250 HP (Score
      // constructor default) regardless of the actual match state — so a
      // player who navigates back into a mid-game battle sees 250/250 on
      // every tank and the bug looks like "HP doesn't update". The data is
      // present in sceneData.players (built by GroupBattleWrapper from
      // match.players) and just needs to be applied to the client tanks.
      // _applyServerStateImmediate later patches HP on every shot, but the
      // FIRST render needs this snapshot. Without this seed step, JJ's
      // "rounds 2/3 HP defaults to 250/250" symptom is exactly what would
      // happen — fresh mount, no shotResult yet, tanks read default.
      const sceneDataPlayers = this.sceneData.players || [];
      sceneDataPlayers.forEach((pd, i) => {
        const tank = this.tanks[i];
        if (!tank) return;
        if (tank.scoreHandler && pd.hp !== undefined && pd.hp !== null) {
          tank.scoreHandler.hp = Math.max(0, pd.hp);
        }
        // Eliminated flag — without seeding, dead tanks render alive on
        // mount until a fresh shot hits them again (which never happens
        // for already-dead players). KIA badge + greyed-out state need
        // this to be correct from frame 1.
        if (pd.eliminated || pd.hp === 0) {
          this._eliminated[i] = true;
        }
      });

      const firstTurnIdx = positions.findIndex(p => p.socketId === this.sceneData.firstTurn);
      this.currentPlayerIndex = firstTurnIdx >= 0 ? firstTurnIdx : 0;
      this._allConsumables = {};
      this._myConsumables = [];
      this._activateCurrentTank();
      this.showTurnPointer();
      this._createNameLabels();
      this._pushStateToBridge();
      if (this._bridge) {
        this._bridge._readyFired = true;
        this._bridge.notifyReady();
      }
    } else {
      // 1v1: both host and non-host request terrain from server.
      // Server generates on first request, re-sends cached data on subsequent.
      // This fixes round 2 race condition where non-host misses terrainGenerated.
      socket.emit('requestTerrain');
    }

    // ── STEP 3: Handle turnResult — full server response ──
    this._socketHandlers.turnResult = (data) => {
      // Store nonce for next fire
      this._turnSeq = data.seq;

      // Snap tanks to server-authoritative positions BEFORE animation starts.
      // Trajectory was calculated from these positions, so the projectile origin
      // must match where the tank visually sits.
      this._syncTankPositions(data.positions);

      // Animate server trajectory for ALL shots (own + opponent).
      // Server trajectory is authoritative — both players see the same projectile
      // in the same place. No local fire means no dual-projectile.
      this.animateTrajectory(data.weaponId, data.trajectory, data.impact, () => {
        this.pendingTurnResult = data;
        // Give blast 3 frames to enter blastArray before checkSwitchTurn can apply
        this._turnResultCooldown = 3;
      }, {
        scatterPoints: data.scatterPoints,
        subTrajectories: data.subTrajectories,
        spiderLegs: data.spiderLegs,
        tunnelEntry: data.tunnelEntry,
        tunnelExit: data.tunnelExit,
      });
    };

    this._socketHandlers.fireRejected = ({ reason }) => {
      // Only log unexpected rejections — "Not your turn" is normal during turn transitions
      if (reason !== 'Not your turn') console.warn('[SolShot] Fire rejected:', reason);
      this._firePending = false;
      // Re-enable controls for local player — guard against myPlayerIndex < 0
      if (this.myPlayerIndex >= 0 && this.tanks[this.myPlayerIndex]) {
        this.tanks[this.myPlayerIndex].active = true;
      }
      this._pushStateToBridge();
    };

    // ── Handle turnTimeout — server auto-advances turn when timer expires ──
    this._socketHandlers.turnTimeout = (data) => {
      const { nextTurn } = data;
      if (!nextTurn) return;
      // Resolve nextTurn socketId to player index
      let nextIdx = this._lastPositions.findIndex(p => p.socketId === nextTurn);
      if (nextIdx < 0 && data.currentPlayerIndex !== undefined) {
        nextIdx = data.currentPlayerIndex;
      }
      if (nextIdx >= 0) {
        this.currentPlayerIndex = nextIdx;
      }
      this._firePending = false;
      this._activateCurrentTank();
      this.showTurnPointer();
      this._pushStateToBridge();
    };

    socket.on('turnResult', this._socketHandlers.turnResult);
    socket.on('fireRejected', this._socketHandlers.fireRejected);
    socket.on('turnTimeout', this._socketHandlers.turnTimeout);

    // Group-chat: server emits `shotResult` which is a SUPERSET of turnResult
    // shape. Translate to turnResult-compatible payload + dispatch through the
    // existing handler so the trajectory animation, terrain dig, blast effects,
    // and damage application all run unchanged. Also synthesize playerEliminated
    // events for any tanks killed this shot — group-chat server doesn't emit
    // playerEliminated separately; the elimination data is in shotResult.
    if (this.sceneData.gameMode === 'group-chat') {
      this._socketHandlers.shotResult = (data) => {
        if (!data?.ok) {
          // Treat errors like fireRejected
          this._socketHandlers.fireRejected({ reason: data?.error || 'shot_failed' });
          return;
        }
        // Build turnResult-shaped payload from shotResult fields. The server's
        // shotData object is an explicit superset (see lifecycle.handleShot
        // return contract), so this translation is mostly a 1:1 alias map.
        // Build positions[] from the match.players array (currentX/currentY
        // post-shot, kept stable across the trajectory animation).
        const positions = (data.match?.players || []).map(p => ({
          socketId: String(p.telegramUserId),
          pos: { x: p.currentX, y: p.currentY },
          x: p.currentX,
          y: p.currentY,
          hp: p.hp,
          alive: !p.eliminated,
        }));
        const adapted = {
          playerId: data.playerId,
          weaponId: data.weaponId,
          trajectory: data.trajectory || [],
          impact: data.impact,
          damage: data.damage || {},
          terrainUpdate: data.terrainUpdate,
          scores: {}, // group-chat doesn't track scores per-shot
          hp: data.hp || {},
          nextTurn: data.nextTurn,
          seq: 0,
          goldEarned: 0,
          goldBalance: {},
          players: positions.map(p => ({ socketId: p.socketId, pos: p.pos, hp: p.hp, alive: p.alive })),
          alive: data.alive || {},
          currentPlayerIndex: data.currentPlayerIndex,
          positions,
          tankPositions: null,
          // Special-weapon visual effect data — passed through so 3 Shot
          // (subTrajectories), Crazy Ivan / Hail Storm (scatterPoints),
          // Spider (spiderLegs), and Ground Hog (tunnelEntry/Exit) all
          // render their full effect, not just the primary trajectory.
          subTrajectories: data.subTrajectories || null,
          scatterPoints: data.scatterPoints || null,
          spiderLegs: data.spiderLegs || null,
          tunnelEntry: data.tunnelEntry || null,
          tunnelExit: data.tunnelExit || null,
        };
        // STEP 3 (iOS render overhaul) — apply CRITICAL server state
        // synchronously when shotResult arrives, BEFORE animation. Run the
        // existing animation chain on top so visual juice/blast still fires
        // on impact (preserves desktop UX).
        //
        // Why: previously the entire state-application chain was
        //   shotResult → turnResult cb → animateTrajectory → onComplete
        //     → set pendingTurnResult → physicsStep tick → applyTurnResult
        // Three render-loop dependencies — all rAF-driven. iOS Safari
        // throttles rAF when the URL bar reflows or Canvas2D is busy, so
        // the chain stalls and HP never updates client-side. JJ saw HP
        // stuck at 250/250 even after a confirmed direct hit.
        //
        // The fix here only sets the DATA values eagerly (HP per tank,
        // terrain heightmap, eliminated flag, bridge push for the React
        // HUD to re-read). It does NOT run impact juice / hit-stop /
        // damage popup — those still wait for animation onComplete via
        // the existing turnResult path below, so on desktop the visual
        // timing is unchanged. On iOS where animation stalls, the state
        // is at least correct — HP bar updates, eliminated tanks grey
        // out, terrain is dug — so gameplay stays coherent. applyTurnResult
        // re-applying the same values later is idempotent (HP is set to
        // the same number, terrain to the same heightmap, etc.).
        this._applyServerStateImmediate(adapted);

        // Existing chain — animation drives juice/blast/hit-stop visuals
        // on impact, then queues applyTurnResult via physicsStep. On iOS
        // this still stalls, but the state above already covered the
        // critical data path so the player isn't stuck.
        this._socketHandlers.turnResult(adapted);

        // Fire synthetic playerEliminated for each tank killed this shot.
        // 1v1 server emits these as separate events; group-chat server bundles
        // the kill list into shotResult.eliminations. Fan-out here so the
        // existing wreckage / spectator-mode handlers run identically.
        const elims = data.eliminations || [];
        for (const elimId of elims) {
          this._socketHandlers.playerEliminated({
            eliminatedId: elimId,
            killedById: data.playerId,
            survivingPlayers: positions.filter(p => p.alive).map(p => p.socketId),
            reason: 'damage',
          });
        }
        // Match settlement notification — group-chat marks settled when
        // aliveCount <= 1 OR time cap. The Mini App refetches on next view.
        // The scene itself stays mounted; React parent decides when to unmount.
      };
      socket.on('shotResult', this._socketHandlers.shotResult);
    }

    // ── Wall decay: server reverted expired walls, redraw terrain ──
    this._socketHandlers.wallDecay = ({ terrain, positions }) => {
      if (terrain && this.terrain) {
        this._serverHeightmap = terrain;
        this.terrain.applyHeightmap(terrain);
      }
      if (positions) {
        this._syncTankPositions(positions);
      }
    };
    socket.on('wallDecay', this._socketHandlers.wallDecay);

    // ── STEP 4: Handle playerEliminated — tank wreckage, kill text, spectator mode ──
    this._socketHandlers.playerEliminated = ({ eliminatedId, killedById, survivingPlayers, reason }) => {
      const positions = this._lastPositions || [];
      const idx = positions.findIndex(p => p.socketId === eliminatedId);
      if (idx !== -1 && !this._eliminated[idx]) {
        this._eliminated[idx] = true;
        // Fix 2: Queue elimination effect — play after trajectory animation completes
        this._pendingEliminations.push({ tankIndex: idx, eliminatedId, killedById, reason });
        // Update bridge immediately so HP bar shows "OUT"
        if (this._bridge) {
          const survivorCount = survivingPlayers ? survivingPlayers.length :
            this.tanks.filter((_, i) => !this._eliminated[i]).length;
          const placement = survivorCount + 1; // eliminated = one worse than survivors
          this._bridge.setPlayerEliminated(idx, placement);
        }
      }
      // If I was eliminated — enter spectator mode
      // Use encapsulated _lastPositions lookup (not window.socket?.id)
      const mySocketId = this._lastPositions?.[this.myPlayerIndex]?.socketId;
      if (mySocketId && eliminatedId === mySocketId) {
        // In 2-player games, matchEnd fires 3s later — skip spectator mode
        // (no one to spectate, just wait for win/lose screen)
        if (this.tanks.length > 2) {
          const survivorCount = survivingPlayers ? survivingPlayers.length :
            this.tanks.filter((_, i) => !this._eliminated[i]).length;
          const placement = survivorCount + 1; // I placed one worse than survivors count
          this._enterSpectatorMode(placement);
        }
      }
    };
    socket.on('playerEliminated', this._socketHandlers.playerEliminated);

    // ── Opponent turret/power sync (smooth aiming feedback) ──
    this._socketHandlers.opponentAngleChange = ({ rotation }) => {
      if (typeof rotation !== 'number') return;
      this.tanks.forEach((tank, i) => {
        if (i !== this.myPlayerIndex && tank.turret) {
          tank.turret.aimRotation = rotation;
          if (!tank.turret.previousAngleTimer) {
            tank.turret.previousAngleTimer = this.time.addEvent({
              delay: 16, callback: tank.turret.lerpRelativeRotation, callbackScope: tank.turret, loop: true
            });
          }
        }
      });
    };
    socket.on('opponentAngleChange', this._socketHandlers.opponentAngleChange);

    this._socketHandlers.opponentPowerChange = ({ power }) => {
      if (typeof power !== 'number') return;
      this.tanks.forEach((tank, i) => {
        if (i !== this.myPlayerIndex) {
          tank.aimPower = power;
          if (!tank.previousPowerTimer) {
            tank.previousPowerTimer = this.time.addEvent({
              delay: 16, callback: tank.lerpPower, callbackScope: tank, loop: true
            });
          }
        }
      });
    };
    socket.on('opponentPowerChange', this._socketHandlers.opponentPowerChange);
  };

  // ── Snap tanks to server-authoritative positions ──
  _syncTankPositions = (positions) => {
    if (!positions || !Array.isArray(positions)) return;
    positions.forEach((pos, i) => {
      const tank = this.tanks[i];
      if (!tank) return;
      const px = pos.x ?? pos.pos?.x;
      if (px === undefined) return;
      // Only sync X (knockback). Let physicsStep settle Y naturally on the
      // terrain bitmap — avoids the -15 offset drift/snapback documented
      // in commit 1e4215f (Mar 2026). When terrain digs, applyTurnResult
      // calls terrain.applyHeightmap() and unsettles tanks, so Y catches
      // up via physicsStep on the next tick. Snapping to server's Y here
      // produces visible "tank jumps" because the server's terrain-settle
      // tick rarely matches the client's exactly. Mirrors the legacy
      // applyTurnResult inline sync (line ~506) verbatim.
      //
      // Don't reintroduce Y sync without re-reading 1e4215f's commit
      // message + this comment.
      if (Math.abs(tank.x - px) > 1) {
        tank.setPosition(px, tank.y);
        if (tank.body) tank.body.x = px;
        tank.settled = false;
      }
    });
    this._lastPositions = positions;
  };

  // ── Apply authoritative turn result from server ──
  applyTurnResult = (data) => {
    const socket = window.socket;
    if (!socket) return;

    const { terrainUpdate, nextTurn, goldBalance } = data;

    // 1. Sync terrain to server state (authoritative heightmap)
    // This handles ALL terrain deformation — both for firing and non-firing player.
    if (terrainUpdate && terrainUpdate.length > 0) {
      this._serverHeightmap = terrainUpdate;
      this.terrain.applyHeightmap(terrainUpdate);
      // Mark all tanks unsettled so they re-snap to the new terrain surface
      if (this.tanks) {
        this.tanks.forEach(t => { if (t) t.settled = false; });
      }
    }

    // 2. Update HP from server — use authoritative HP values + play
    //    impact juice (damage popup, hit-stop, haptic, extra shake) for
    //    every tank that took damage this shot. The juice methods are
    //    band-aware and no-op on zero-damage misses.
    if (data.players && Array.isArray(data.players)) {
      data.players.forEach((playerData, i) => {
        const tank = this.tanks[i];
        if (tank && tank.scoreHandler && playerData.hp !== undefined) {
          const oldHp = tank.scoreHandler.hp;
          tank.scoreHandler.hp = Math.max(0, playerData.hp);
          const dmg = oldHp - playerData.hp;
          if (dmg > 0) {
            this._playImpactJuice(i, dmg, i === this.myPlayerIndex);
          }
        }
      });
    } else if (data.hp) {
      // Backward compat: hp keyed by socketId
      for (const [targetId, serverHp] of Object.entries(data.hp)) {
        const posIdx = this._lastPositions.findIndex(p => p.socketId === targetId);
        const tank = posIdx >= 0 ? this.tanks[posIdx] : null;
        if (tank && tank.scoreHandler) {
          const oldHp = tank.scoreHandler.hp;
          tank.scoreHandler.hp = Math.max(0, serverHp);
          const dmg = oldHp - serverHp;
          if (dmg > 0) {
            this._playImpactJuice(posIdx, dmg, posIdx === this.myPlayerIndex);
          }
        }
      }
    } else if (data.damage) {
      // Fallback: calculate from damage map if server doesn't send HP
      for (const [targetId, dmg] of Object.entries(data.damage)) {
        const posIdx = this._lastPositions.findIndex(p => p.socketId === targetId);
        const tank = posIdx >= 0 ? this.tanks[posIdx] : null;
        if (tank && tank.scoreHandler) {
          const absDmg = Math.abs(dmg);
          if (absDmg > 0) {
            tank.scoreHandler.hp = Math.max(0, tank.scoreHandler.hp - absDmg);
            this._playImpactJuice(posIdx, absDmg, posIdx === this.myPlayerIndex);
          }
        }
      }
    }

    // 2b. Connect-feedback haptic for the firer — when YOU hit someone,
    //     a small success-bump on your phone confirms the hit landed.
    //     Distinct from the .heavy() the target player feels (handled
    //     above via _playImpactJuice's isLocalPlayerHit branch).
    const firedByMe = this._lastPositions?.find(
      p => p.socketId === data.playerId
    ) && this._lastPositions.findIndex(p => p.socketId === data.playerId) === this.myPlayerIndex;
    if (firedByMe && data.totalDamage && data.totalDamage > 0 && window.haptic) {
      try { window.haptic.light(); } catch (_) {}
    }

    // 3. Sync tank positions to server-authoritative values.
    // N-player: iterate positions[] array
    let resolvedPositions = data.positions;
    if (!resolvedPositions || !Array.isArray(resolvedPositions)) {
      // Backward compat: rebuild from tankPositions {host, player}
      if (data.tankPositions && this.sceneData.hostId) {
        const hostId = this.sceneData.hostId;
        resolvedPositions = this._lastPositions.map((lp, i) => {
          if (lp.socketId === hostId) return { socketId: lp.socketId, x: data.tankPositions.host?.x, y: data.tankPositions.host?.y };
          return { socketId: lp.socketId, x: data.tankPositions.player?.x, y: data.tankPositions.player?.y };
        });
      }
    }

    if (resolvedPositions && Array.isArray(resolvedPositions)) {
      resolvedPositions.forEach((pos, i) => {
        const tank = this.tanks[i];
        if (!tank) return;
        const px = pos.x ?? pos.pos?.x;
        if (px === undefined) return;

        const py = pos.y ?? pos.pos?.y;
        const dx = px !== undefined ? Math.abs(tank.x - px) : 0;
        const dy = py !== undefined ? Math.abs(tank.y - py) : 0;
        if (dx > 1 || dy > 1) {
          const finalX = px !== undefined ? px : tank.x;
          const finalY = py !== undefined ? py : tank.y;
          tank.setPosition(finalX, finalY);
          if (tank.body) { tank.body.x = finalX; tank.body.y = finalY; }
          tank.settled = false; // Re-settle at new position
        }
      });
      this._lastPositions = resolvedPositions;
    } else {
      // Fallback: no server positions — let physicsStep re-settle after terrain change
      this.tanks.forEach(tank => {
        if (tank) tank.settled = false;
      });
    }

    // Report updated local player position back to server (1v1 only —
    // group-chat doesn't track live positions; tank positions are
    // authoritative from match.players.currentX/Y on each fetch).
    if (this.myPlayerIndex >= 0 && this.tanks[this.myPlayerIndex] && this.sceneData.gameMode !== 'group-chat') {
      const myTank = this.tanks[this.myPlayerIndex];
      window.socket && window.socket.emit('positionUpdate', {
        x: myTank.x,
        y: myTank.y,
      });
    }

    // Fix 2: Flush queued eliminations now that positions are synced
    while (this._pendingEliminations?.length > 0) {
      const e = this._pendingEliminations.shift();
      this._playEliminationEffect(e.tankIndex, e.eliminatedId, e.killedById, e.reason);
    }

    // 4. Update gold
    if (goldBalance && socket) {
      const myGold = goldBalance[socket.id];
      if (myGold !== undefined && this._bridge) {
        this._bridge.updateState({ gold: myGold });
      }
    }

    // 5. Set next turn from server
    // nextTurn is a socketId — find its index in lastPositions
    let nextPlayerIdx = this._lastPositions.findIndex(p => p.socketId === nextTurn);
    if (nextPlayerIdx < 0 && data.currentPlayerIndex !== undefined) {
      nextPlayerIdx = data.currentPlayerIndex;
    }
    if (nextPlayerIdx >= 0) {
      this.currentPlayerIndex = nextPlayerIdx;
    }

    this._activateCurrentTank();
    this.showTurnPointer();
    this._pushStateToBridge();
  };

  // ── Animate trajectory from server data (for non-firing player) ──
  // Per-weapon projectile visuals for server trajectory animation
  _trajectoryVisuals = {
    0:  { color: 0x00DCFF, size: 3, trail: 0x00DCFF, trailSize: 1.5, trailLife: 200 },       // Single Shot — cyan sphere
    1:  { color: 0xB400B4, size: 5, trail: 0xB400B4, trailSize: 2, trailLife: 350 },          // Big Shot — purple orb
    2:  { color: 0xFFFF00, size: 3, trail: 0xFFFF00, trailSize: 1.5, trailLife: 200 },        // 3 Shot — yellow
    4:  { color: 0xFF0099, size: 3, trail: 0xFF0099, trailSize: 1.5, trailLife: 250 },         // Jackhammer — pink
    5:  { color: 0xFF2200, size: 4, trail: 0xFF6600, trailSize: 2, trailLife: 300, glow: 0xFF4400 }, // Heatseeker — red+fire
    7:  { color: 0xCC00FF, size: 5, trail: 0xCC66FF, trailSize: 2, trailLife: 400, glow: 0xDD88FF }, // Pile Driver — purple glow
    9:  { color: 0xDDDD00, size: 3, trail: 0xAAAA00, trailSize: 1.5, trailLife: 200 },        // Crazy Ivan — yellow-green
    10: { color: 0x00FF66, size: 3, trail: 0x00FF66, trailSize: 1.5, trailLife: 250, glow: 0x00FF44 }, // Spider — green pulsing
    11: { color: 0xFFFFFF, size: 2, trail: 0xFFFFFF, trailSize: 0.5, trailLife: 80, streak: true }, // Sniper — white streak
    12: { color: 0x66AAFF, size: 4, trail: 0x88CCFF, trailSize: 1, trailLife: 300, rect: true }, // Magic Wall — blue slab
    15: { color: 0xFF6600, size: 4, trail: 0xFF4400, trailSize: 2, trailLife: 400 },          // Napalm — orange fire
    16: { color: 0x88CCFF, size: 3, trail: 0xAADDFF, trailSize: 1, trailLife: 150 },          // Hailstorm — ice blue
    17: { color: 0x664400, size: 4, trail: 0x885522, trailSize: 1.5, trailLife: 200 },        // Ground Hog — brown
    20: { color: 0x00AAFF, size: 3, trail: 0x0088CC, trailSize: 1.5, trailLife: 250 },        // Skipper — aqua
    21: { color: 0xFF8800, size: 4, trail: 0xFFAA00, trailSize: 2, trailLife: 350, glow: 0xFFCC00 }, // Chain Reaction — orange-gold
    22: { color: 0x00FF66, size: 4, trail: 0x00CC44, trailSize: 2, trailLife: 300 },          // Pineapple — green
    24: { color: 0x6644CC, size: 4, trail: 0x8866FF, trailSize: 2, trailLife: 350, glow: 0xAA88FF }, // Homing Missile — purple
    25: { color: 0x8B6914, size: 4, trail: 0x6B4914, trailSize: 1.5, trailLife: 200 },        // Dirt Ball — brown
    26: { color: 0xFFAA00, size: 2, trail: 0xFF8800, trailSize: 0.5, trailLife: 100 },        // Tommy Gun — orange sparks
    29: { color: 0xFF0066, size: 4, trail: 0xFF3388, trailSize: 2, trailLife: 400, glow: 0xFF6699 }, // Cruiser — hot pink
  };

  // STEP 4 (iOS render overhaul) — bake projectile / glow / trail circles
  // into Phaser Textures once at scene start. Sprites drawn from these
  // textures render reliably on iOS Canvas2D regardless of size, where
  // raw `add.circle` shapes at radius 2-3 with `pixelArt: true` /
  // `antialias: false` would rasterise to nothing. Phaser docs explicitly
  // recommend this pattern when shapes are drawn repeatedly under Canvas:
  // https://docs.phaser.io/phaser/concepts/gameobjects/render-texture
  // Same colors, same sizes — just rendered through a texture path that
  // Canvas2D respects.
  _projectileTexBaked = false;
  _projectileTexKey = (weaponId, kind) => `gc_proj_${weaponId}_${kind}`;
  _initProjectileTextures = () => {
    if (this._projectileTexBaked) return;
    const padding = 2; // breathing room so anti-aliased edges don't clip
    const bakeCircle = (key, fillColor, fillAlpha, radius) => {
      if (this.textures.exists(key)) return;
      const r = Math.max(1, Math.round(radius));
      const dim = (r + padding) * 2;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(fillColor, fillAlpha);
      g.fillCircle(r + padding, r + padding, r);
      g.generateTexture(key, dim, dim);
      g.destroy();
    };
    Object.entries(this._trajectoryVisuals).forEach(([wid, vis]) => {
      bakeCircle(this._projectileTexKey(wid, 'main'),  vis.color, 1.0, vis.size);
      bakeCircle(this._projectileTexKey(wid, 'trail'), vis.trail, 0.7, Math.max(1, vis.trailSize));
      if (vis.glow) {
        bakeCircle(this._projectileTexKey(wid, 'glow'), vis.glow, 0.3, vis.size + 3);
      }
    });
    // Generic fallback for unknown weapon ids (mirrors the runtime default).
    bakeCircle(this._projectileTexKey('default', 'main'),  0xFFFFFF, 1.0, 3);
    bakeCircle(this._projectileTexKey('default', 'trail'), 0xFFFFFF, 0.7, 1);
    this._projectileTexBaked = true;
  };

  // Helper: spawn a projectile sprite (or fallback to add.circle if textures
  // somehow weren't baked). Used by animateTrajectory + _animateMultiTrajectory.
  _spawnProjectileSprite = (weaponId, x, y, vis) => {
    const key = this._projectileTexKey(weaponId, 'main');
    if (this.textures.exists(key)) {
      const s = this.add.sprite(x, y, key);
      s.setDepth(5);
      return s;
    }
    const c = this.add.circle(x, y, vis.size, vis.color);
    c.setDepth(5);
    return c;
  };
  _spawnGlowSprite = (weaponId, x, y, vis) => {
    if (!vis.glow) return null;
    const key = this._projectileTexKey(weaponId, 'glow');
    if (this.textures.exists(key)) {
      const s = this.add.sprite(x, y, key);
      s.setDepth(4);
      return s;
    }
    const c = this.add.circle(x, y, vis.size + 3, vis.glow, 0.3);
    c.setDepth(4);
    return c;
  };
  _spawnTrailSprite = (weaponId, x, y, vis) => {
    const key = this._projectileTexKey(weaponId, 'trail');
    if (this.textures.exists(key)) {
      const s = this.add.sprite(x, y, key);
      s.setDepth(4);
      return s;
    }
    const c = this.add.circle(x, y, Math.max(0.5, vis.trailSize), vis.trail, 0.7);
    c.setDepth(4);
    return c;
  };

  animateTrajectory = (weaponId, trajectory, impact, onComplete, extra = {}) => {
    if (!trajectory || trajectory.length === 0) {
      if (onComplete) onComplete();
      return;
    }

    const { scatterPoints, subTrajectories, spiderLegs, tunnelEntry, tunnelExit } = extra;
    const vis = this._trajectoryVisuals[weaponId] || { color: 0xFFFFFF, size: 3, trail: 0xFFFFFF, trailSize: 1, trailLife: 200 };

    // ── Multi-shot weapons (3 Shot): animate ALL sub-trajectories in parallel ──
    if (subTrajectories && subTrajectories.length > 1) {
      this._animateMultiTrajectory(weaponId, vis, subTrajectories, onComplete);
      return;
    }

    // STEP 4 — sprite-based projectile. Visually identical to add.circle
    // on desktop (same color, same size); reliably renders on iOS where
    // small Shape primitives were disappearing.
    const projectile = this._spawnProjectileSprite(weaponId, trajectory[0].x, trajectory[0].y, vis);

    // Glow ring for weapons that have it (Heatseeker, Pile Driver, etc.)
    const glowRing = this._spawnGlowSprite(weaponId, trajectory[0].x, trajectory[0].y, vis);

    let frameIndex = 0;
    let trailFrame = 0;
    let completed = false;
    // Dynamic speed: long shots ~2s, short shots ~1s (60fps)
    const MIN_FRAMES = 60;   // 1s floor
    const MAX_FRAMES = 120;  // 2s ceiling
    const MAX_TRAJ = 1500;   // approx longest trajectory length
    const targetFrames = Math.round(MIN_FRAMES + (MAX_FRAMES - MIN_FRAMES) * Math.min(1, trajectory.length / MAX_TRAJ));
    const speed = Math.max(1, Math.ceil(trajectory.length / targetFrames));

    const spawnTrail = (x, y) => {
      // STEP 4 — sprite-based trail particle, same color/size/jitter as before.
      const p = this._spawnTrailSprite(
        weaponId,
        x + (Math.random() - 0.5) * 2,
        y + (Math.random() - 0.5) * 2,
        vis
      );
      // Sprite-spawn helpers default alpha to 1; trail wants 0.7 starting.
      // (Texture has 0.7 baked in too, but explicit setAlpha keeps the
      // tween math identical to the previous Circle.fillAlpha=0.7 path.)
      if (p && p.setAlpha) p.setAlpha(0.7);
      this.tweens.add({
        targets: p,
        alpha: 0,
        scale: 0.3,
        duration: vis.trailLife,
        ease: 'Quad.easeOut',
        onComplete: () => { try { p.destroy(); } catch (_) {} }
      });
    };

    const moveProjectile = () => {
      if (completed) return;
      // Guard: if scene was destroyed mid-animation, bail out cleanly
      if (!this.sys || !this.sys.isActive()) {
        completed = true;
        try { projectile.destroy(); } catch (_) {}
        try { if (glowRing) glowRing.destroy(); } catch (_) {}
        if (this._trajectoryTimer) { try { this._trajectoryTimer.remove(false); } catch (_) {} }
        return;
      }

      frameIndex += speed;
      if (frameIndex >= trajectory.length) {
        completed = true;

        if (this._trajectoryTimer) {
          this._trajectoryTimer.remove(false);
        }

        try { projectile.destroy(); } catch (_) {}
        try { if (glowRing) glowRing.destroy(); } catch (_) {}

        // ── Post-impact effects ──
        if (scatterPoints && scatterPoints.length > 0 && weaponId !== 22) {
          // Scatter-style sub-explosions: Crazy Ivan (9),
          // Pile Driver (7), Jackhammer (4), Napalm (15), Hail Storm (16), Chain Reaction (21)
          // Pineapple (22) skipped — main radius-80 blast is enough; 20 fragments crash mobile
          this.playScatterExplosions(scatterPoints, weaponId);
        } else if (spiderLegs && spiderLegs.length > 0) {
          // Spider: animate legs crawling outward then exploding
          this._animateSpiderLegs(spiderLegs, impact, weaponId);
        } else if (tunnelEntry && tunnelExit) {
          // Ground Hog: animate tunnel burrowing then pop-out explosion
          this._animateTunnel(tunnelEntry, tunnelExit, weaponId, vis);
        } else if (impact && impact.x !== undefined) {
          this.playExplosionEffect(impact.x, impact.y, weaponId);
        }

        if (!tunnelEntry) {
          if (onComplete) onComplete();
        } else {
          // Tunnel animation calls onComplete after its own delay
          this.time.delayedCall(800, () => { if (onComplete) onComplete(); });
        }
        return;
      }

      const point = trajectory[Math.min(Math.floor(frameIndex), trajectory.length - 1)];
      projectile.setPosition(point.x, point.y);
      if (glowRing) glowRing.setPosition(point.x, point.y);

      // Trail particles every frame (speed already skips points, so trail stays dense)
      spawnTrail(point.x, point.y);
    };

    this._trajectoryTimer = this.time.addEvent({
      delay: 1000 / 60,
      callback: moveProjectile,
      callbackScope: this,
      repeat: Math.ceil(trajectory.length / speed) + 5,
    });
  };

  // ── Multi-trajectory animation (3 Shot, etc.) ──
  _animateMultiTrajectory = (weaponId, vis, subTrajectories, onComplete) => {
    let completedCount = 0;
    const total = subTrajectories.length;

    subTrajectories.forEach((traj, idx) => {
      if (!traj || traj.length === 0) { completedCount++; return; }

      // STEP 4 — sprite-based multi-projectile (3 Shot, etc.). Same color
      // and size as before; reliably renders on iOS Canvas2D.
      const proj = this._spawnProjectileSprite(weaponId, traj[0].x, traj[0].y, vis);

      let fi = 0;
      let tf = 0;
      let done = false;
      // Dynamic speed: long shots ~2s, short shots ~1s (60fps).
      // Matches the single-shot trajectory pacing — multi-shot weapons
      // (3 Shot etc.) used to be capped at ~3s which felt sluggish next
      // to single-shot weapons after the speed-up tune in d840a44.
      const MULTI_MIN_FRAMES = 60;   // 1s floor
      const MULTI_MAX_FRAMES = 120;  // 2s ceiling
      const MULTI_MAX_TRAJ = 1500;
      const multiTargetFrames = Math.round(
        MULTI_MIN_FRAMES + (MULTI_MAX_FRAMES - MULTI_MIN_FRAMES) * Math.min(1, traj.length / MULTI_MAX_TRAJ)
      );
      const spd = Math.max(1, Math.ceil(traj.length / multiTargetFrames));

      const timer = this.time.addEvent({
        delay: 1000 / 60,
        callback: () => {
          if (done) return;
          fi += spd;
          if (fi >= traj.length) {
            done = true;
            timer.remove(false);
            try { proj.destroy(); } catch (_) {}
            // Explosion at sub-trajectory end
            const last = traj[traj.length - 1];
            if (last) this.playExplosionEffect(last.x, last.y, weaponId);
            completedCount++;
            if (completedCount >= total && onComplete) onComplete();
            return;
          }
          const pt = traj[Math.min(Math.floor(fi), traj.length - 1)];
          proj.setPosition(pt.x, pt.y);
          // STEP 4 — sprite-based trail particle (same as single-shot path).
          const p = this._spawnTrailSprite(
            weaponId,
            pt.x + (Math.random() - 0.5) * 2,
            pt.y + (Math.random() - 0.5) * 2,
            vis
          );
          if (p && p.setAlpha) p.setAlpha(0.7);
          this.tweens.add({ targets: p, alpha: 0, scale: 0.3, duration: vis.trailLife, ease: 'Quad.easeOut', onComplete: () => { try { p.destroy(); } catch (_) {} } });
        },
        callbackScope: this,
        repeat: Math.ceil(traj.length / spd) + 5,
      });
    });
  };

  // ── Spider leg animation: crawl outward from impact then explode ──
  _animateSpiderLegs = (spiderLegs, impact, weaponId) => {
    // First play main impact explosion
    if (impact && impact.x !== undefined) {
      this.playExplosionEffect(impact.x, impact.y, weaponId);
    }

    // Stagger spider leg explosions outward
    spiderLegs.forEach((leg, i) => {
      const delay = (i + 1) * 80; // 80ms apart for crawl effect
      // Crawling dot from impact to leg position
      const dot = this.add.circle(impact.x, impact.y, 2, 0x00FF66);
      dot.setDepth(5);
      this.tweens.add({
        targets: dot,
        x: leg.x,
        y: leg.y,
        duration: delay,
        ease: 'Linear',
        onComplete: () => {
          try { dot.destroy(); } catch (_) {}
          this.playExplosionEffect(leg.x, leg.y, weaponId);
        }
      });
    });
  };

  // ── Tunnel animation: burrow underground then pop out ──
  _animateTunnel = (tunnelEntry, tunnelExit, weaponId, vis) => {
    // Play entry "dig" effect
    this.playExplosionEffect(tunnelEntry.x, tunnelEntry.y, weaponId);

    // Animate a dot burrowing underground from entry to exit
    const digDot = this.add.circle(tunnelEntry.x, tunnelEntry.y + 10, vis.size, vis.color, 0.6);
    digDot.setDepth(5);

    // Spawn dirt particles along the way
    const dist = Math.abs(tunnelExit.x - tunnelEntry.x);
    const duration = Math.max(400, Math.min(1200, dist * 2));

    this.tweens.add({
      targets: digDot,
      x: tunnelExit.x,
      y: tunnelExit.y,
      duration: duration,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        // Dirt particles erupting from surface
        if (Math.random() < 0.3) {
          const dp = this.add.circle(digDot.x + (Math.random() - 0.5) * 6, digDot.y - Math.random() * 8, 1.5, 0x885522, 0.8);
          dp.setDepth(5);
          this.tweens.add({
            targets: dp,
            y: dp.y - 10 - Math.random() * 15,
            alpha: 0,
            duration: 300,
            ease: 'Quad.easeOut',
            onComplete: () => { try { dp.destroy(); } catch (_) {} }
          });
        }
      },
      onComplete: () => {
        try { digDot.destroy(); } catch (_) {}
        // Pop-out explosion at exit
        this.playExplosionEffect(tunnelExit.x, tunnelExit.y, weaponId);
      }
    });
  };

  // ── Play explosion visual effects (for ALL shots via server trajectory) ──
  // Both players see the same explosion at the same impact point.
  // visualOnly=true: show blast ring + knockback, but don't dig terrain canvas.
  // Terrain crater is handled authoritatively by applyHeightmap() in applyTurnResult.
  playExplosionEffect = (x, y, weaponId) => {
    // Blast data per weapon — extracted from Standard.js weapon handlers
    const BLAST_DATA = {
      0:  { radius: 46, grd: [{relativePosition: 0, color: 'rgba(255,51,153,0)'}, {relativePosition: 1, color: 'rgba(230,0,115,1)'}], thickness: 15, blowPower: 200, sound: 'expmedium2' },
      1:  { radius: 90, grd: [{relativePosition: 0, color: 'rgba(255,0,0,0)'}, {relativePosition: 1, color: 'rgba(255,0,0,1)'}], thickness: 16, blowPower: 200, sound: 'expmedium' },
      2:  { radius: 46, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.5, color: 'rgba(100,100,0,1)'}, {relativePosition: 1, color: 'rgba(255,255,0,1)'}], thickness: 16, blowPower: 200, sound: 'expmedium' },
      3:  { radius: 46, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.5, color: 'rgba(100,30,0,1)'}, {relativePosition: 1, color: 'rgba(255,100,20,1)'}], thickness: 16, blowPower: 200, sound: 'expmedium' },
      4:  { radius: 36, grd: [{relativePosition: 0, color: 'rgba(255,51,153,0)'}, {relativePosition: 1, color: 'rgba(230,0,115,1)'}], thickness: 15, blowPower: 0, sound: 'expshort' },
      5:  { radius: 80, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.4, color: 'rgba(120,0,0,1)'}, {relativePosition: 1, color: 'rgba(230,0,0,1)'}], thickness: 15, blowPower: 200, sound: 'expmedium' },
      7:  { radius: 70, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.7, color: 'rgba(250,0,250,1)'}, {relativePosition: 0.8, color: 'rgba(250,200,250,1)'}, {relativePosition: 1, color: 'rgba(250,200,250,1)'}], thickness: 15, blowPower: 200, sound: 'exphuge' },
      9:  { radius: 36, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,0.4)'}, {relativePosition: 0.4, color: 'rgba(120,120,0,1)'}, {relativePosition: 1, color: 'rgba(255,255,0,1)'}], thickness: 18, blowPower: 50, sound: 'expshort' },
      10: { radius: 28, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,0.4)'}, {relativePosition: 0.4, color: 'rgba(120,120,0,1)'}, {relativePosition: 1, color: 'rgba(255,255,0,1)'}], thickness: 18, blowPower: 50, sound: 'expshort' },
      11: { radius: 40, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.4, color: 'rgba(120,80,0,1)'}, {relativePosition: 1, color: 'rgba(230,160,0,1)'}], thickness: 15, blowPower: 50, sound: 'expshort' },
      12: { radius: 0, grd: [], thickness: 0, blowPower: 0, sound: null },
      15: { radius: 60, grd: [{relativePosition: 0, color: 'rgba(255,100,0,0)'}, {relativePosition: 1, color: 'rgba(255,50,0,1)'}], thickness: 15, blowPower: 200, sound: 'napalm' },
      16: { radius: 36, grd: [{relativePosition: 0, color: 'rgba(200,230,255,0)'}, {relativePosition: 1, color: 'rgba(100,180,255,1)'}], thickness: 12, blowPower: 150, sound: 'hailstorm' },
      // New launch weapons
      17: { radius: 70, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.3, color: 'rgba(80,50,20,1)'}, {relativePosition: 1, color: 'rgba(160,100,40,1)'}], thickness: 16, blowPower: 200, sound: 'expmedium' },
      20: { radius: 52, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.3, color: 'rgba(0,100,200,1)'}, {relativePosition: 1, color: 'rgba(0,200,255,1)'}], thickness: 14, blowPower: 150, sound: 'expmedium' },
      25: { radius: 0, grd: [], thickness: 0, blowPower: 0, sound: null },
      // Prestige weapons
      21: { radius: 46, grd: [{relativePosition: 0, color: 'rgba(255,0,0,0)'}, {relativePosition: 0.3, color: 'rgba(255,100,0,1)'}, {relativePosition: 1, color: 'rgba(255,200,0,1)'}], thickness: 14, blowPower: 100, sound: 'expshort' },
      22: { radius: 80, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.3, color: 'rgba(0,150,50,1)'}, {relativePosition: 1, color: 'rgba(0,230,80,1)'}], thickness: 16, blowPower: 200, sound: 'exphuge' },
      24: { radius: 80, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(20,0,100,0.8)'}, {relativePosition: 0.3, color: 'rgba(50,20,150,1)'}, {relativePosition: 1, color: 'rgba(200,200,255,1)'}], thickness: 16, blowPower: 80, sound: 'expmedium' },
      26: { radius: 16, grd: [{relativePosition: 0, color: 'rgba(255,200,0,0)'}, {relativePosition: 1, color: 'rgba(255,100,0,1)'}], thickness: 8, blowPower: 30, sound: 'expshort' },
      29: { radius: 80, grd: [{relativePosition: 0, color: 'rgba(255,0,0,0)'}, {relativePosition: 0.5, color: 'rgba(200,0,50,1)'}, {relativePosition: 1, color: 'rgba(255,0,100,1)'}], thickness: 16, blowPower: 100, sound: 'expmedium' },
    };

    const info = BLAST_DATA[weaponId] || BLAST_DATA[0];
    if (info.radius <= 0) return;

    // Use the real Blast system — same expanding rings as the firing player
    // blowTank=true: apply knockback physics locally for visual feedback
    const hitRadius = this.tanks[0]?.hitRadius || 6;
    const blastRadius = Math.max(info.radius - hitRadius, 1);
    // Play visual-only explosion for opponent's shot
    const data = {
      thickness: info.thickness,
      gradient: info.grd,
      blowPower: info.blowPower,
      soundEffect: info.sound,
      soundConfig: {},
      visualOnly: true,  // Don't dig terrain — applyHeightmap handles crater authoritatively
    };

    this.terrain.blast(1, Math.floor(x), Math.floor(y), blastRadius, data, true, (weaponId || 0).toString() + '.opp');
  };

  // ── Staggered sub-explosions at server-provided positions ──
  // Used by: Crazy Ivan (9), Pineapple (22), Pile Driver (7), Jackhammer (4),
  //          Napalm (15), Hail Storm (16), Chain Reaction (21)
  _scatterStyles = {
    9:  { radius: 36, thickness: 18, blowPower: 50, delay: 40,
          grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,0.4)'}, {relativePosition: 0.4, color: 'rgba(120,120,0,1)'}, {relativePosition: 1, color: 'rgba(255,255,0,1)'}] },
    22: { radius: 20, thickness: 12, blowPower: 40, delay: 60,
          grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,0.4)'}, {relativePosition: 0.4, color: 'rgba(0,120,40,1)'}, {relativePosition: 1, color: 'rgba(0,255,100,1)'}] },
    7:  { radius: 46, thickness: 20, blowPower: 30, delay: 80,
          grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,0.4)'}, {relativePosition: 0.4, color: 'rgba(100,0,140,1)'}, {relativePosition: 1, color: 'rgba(200,80,255,1)'}] },
    4:  { radius: 36, thickness: 16, blowPower: 25, delay: 90,
          grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,0.4)'}, {relativePosition: 0.4, color: 'rgba(140,0,80,1)'}, {relativePosition: 1, color: 'rgba(255,0,150,1)'}] },
    15: { radius: 30, thickness: 14, blowPower: 20, delay: 120,
          grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,0.4)'}, {relativePosition: 0.4, color: 'rgba(180,60,0,1)'}, {relativePosition: 1, color: 'rgba(255,100,0,1)'}] },
    16: { radius: 36, thickness: 14, blowPower: 30, delay: 60,
          grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,0.4)'}, {relativePosition: 0.4, color: 'rgba(80,140,200,1)'}, {relativePosition: 1, color: 'rgba(140,200,255,1)'}] },
    21: { radius: 46, thickness: 18, blowPower: 40, delay: 50,
          grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,0.4)'}, {relativePosition: 0.4, color: 'rgba(180,100,0,1)'}, {relativePosition: 1, color: 'rgba(255,170,0,1)'}] },
  };

  playScatterExplosions = (scatterPoints, weaponId) => {
    const style = this._scatterStyles[weaponId] || this._scatterStyles[9];
    const hitRadius = this.tanks[0]?.hitRadius || 6;
    const blastRadius = Math.max(style.radius - hitRadius, 1);

    // Cap visual scatter to 10 points max — server calculates full damage,
    // but rendering 20 concurrent Blast objects crashes mobile browsers.
    const maxVisual = 10;
    let pts = scatterPoints;
    if (pts.length > maxVisual) {
      // Evenly sample from the full set so coverage looks complete
      const step = pts.length / maxVisual;
      pts = Array.from({ length: maxVisual }, (_, i) => scatterPoints[Math.floor(i * step)]);
    }

    pts.forEach((pt, i) => {
      this.time.delayedCall(i * style.delay, () => {
        const data = {
          thickness: style.thickness,
          gradient: style.grd,
          blowPower: style.blowPower,
          soundEffect: i === 0 ? 'expshort' : (i % 4 === 0 ? 'expshort' : null),
          soundConfig: { volume: 0.2 },
          visualOnly: true,
        };
        this.terrain.blast(1, Math.floor(pt.x), Math.floor(pt.y), blastRadius, data, true, weaponId.toString() + '.scatter' + i);
      });
    });
  };

  handleType4 = () => {
    this.terrain.create();
    const player1 = this.sceneData.player1;
    const player2 = this.sceneData.player2;

    // In practice mode, always 2 players: tanks[0] and tanks[1]
    if (this.tanks[0] && player1) {
      this.tanks[0].weapons = player1.weapons;
      this.tanks[0].create(int2rgba(player1.color), player1.name);
    }
    if (this.tanks[1] && player2) {
      this.tanks[1].weapons = player2.weapons;
      this.tanks[1].create(int2rgba(player2.color), player2.name);
    }

    // In practice mode, local player is always tanks[0]
    this.myPlayerIndex = 0;

    if (Math.random() > 0.5) {
      if (this.tanks[0]) this.tanks[0].active = true;
      this.activeTank = 1;
    } else {
      if (this.tanks[1]) this.tanks[1].active = true;
      this.activeTank = 2;
    }

    // Create name labels after tanks are positioned
    this._createNameLabels();
  };

  // ── React bridge command handlers ──
  //
  // These replace the original fire-btn.js, HUD power/angle controls, and
  // keyboard handlers. They must emit the same socket events the originals did.

  handleFireFromReact = () => {
    // Clear preview overlays on fire
    this._clearScopePreview();
    this._clearTrainingPreview();
    this._myTrainingShots = (this._myTrainingShots ?? 0) + 1;

    // Determine the active tank: in multiplayer use myPlayerIndex, in practice use activeTank
    const myTank = this.myPlayerIndex >= 0
      ? this.tanks[this.myPlayerIndex]
      : this.tanks[this.activeTank - 1];
    if (!myTank || !myTank.active) return;

    // Guard against double-fire race condition: disable BEFORE emitting
    if (this._firePending) return;

    const weaponObj = myTank.weapons[myTank.selectedWeapon];
    if (!weaponObj) return;

    if (this.sceneData.gameType === 3) {
      const socket = window.socket;
      if (socket) {
        // Disable controls BEFORE emitting to prevent double-fire
        this._firePending = true;
        myTank.active = false;
        this._pushStateToBridge();

        // SERVER IS GOD: Send only angle/power/weaponId to server.
        const angle = myTank.turret ? myTank.turret.rotation : 0;

        if (this.sceneData.gameMode === 'group-chat') {
          // Group-chat fire: server expects fireGroupShot { matchId, angle,
          // power, weaponId }. Server emits a turnResult-shaped shotResult
          // back which our shotResult adapter (registered below) translates
          // and feeds to the existing turnResult handler — same animation
          // path as 1v1.
          socket.emit('fireGroupShot', {
            matchId: this.sceneData.matchId,
            angle: angle,
            power: myTank.power,
            weaponId: weaponObj.id,
          });
        } else {
          // Fire from the TURRET TIP, not the tank body. Previously we
          // sent {myTank.x, myTank.y} which is the body center, ~15px
          // below the turret pivot — the server then started the
          // trajectory from there, so the projectile visually came out
          // of the bottom of the tank instead of the barrel. JJ QA
          // pre-submission. Within the server's 100px/50px tolerance
          // band so this is a drop-in upgrade. Group-chat doesn't
          // accept a position override yet (server pulls turret pos
          // from match.players[idx]) so this only matters here.
          const startPos = myTank.turret
            ? { x: myTank.turret.x, y: myTank.turret.y }
            : { x: myTank.x, y: myTank.y };
          socket.emit('fire', {
            angle: angle,
            power: myTank.power,
            weaponId: weaponObj.id,
            seq: this._turnSeq,
            position: startPos,
          });
        }

        // Haptic feedback: medium pulse when shot is fired (MOB-01)
        window.haptic && window.haptic.medium();

        // DON'T fire locally — wait for server turnResult / shotResult.
        // Server trajectory is authoritative; both players see the same projectile.
      }
    } else {
      // Non-multiplayer (type4 practice) — fire locally only
      myTank.shoot();
    }
  };

  handlePowerFromReact = (v) => {
    const myTank = this.myPlayerIndex >= 0
      ? this.tanks[this.myPlayerIndex]
      : this.tanks[this.activeTank - 1];
    if (!myTank || !myTank.active) return;
    myTank.setPower(v);
    // Live opponent-aim broadcasts are 1v1 only — async group-chat doesn't
    // need them (each player aims privately, only the final shot result
    // ships back).
    if (this.sceneData.gameType === 3 && this.sceneData.gameMode !== 'group-chat') {
      const socket = window.socket;
      if (socket) socket.emit('powerChange', { power: v });
    }
    this._renderScopePreview();
    this._renderTrainingPreview();
  };

  handleAngleFromReact = (v) => {
    const myTank = this.myPlayerIndex >= 0
      ? this.tanks[this.myPlayerIndex]
      : this.tanks[this.activeTank - 1];
    if (!myTank || !myTank.turret || !myTank.active) return;
    const radians = Phaser.Math.DegToRad(v) - Math.PI / 2;
    myTank.turret.setRelativeRotation(radians - myTank.rotation);
    this._renderScopePreview();
    this._renderTrainingPreview();
  };

  handleWeaponSelectFromReact = (idx) => {
    const myTank = this.myPlayerIndex >= 0
      ? this.tanks[this.myPlayerIndex]
      : this.tanks[this.activeTank - 1];
    if (!myTank || !myTank.active) return;
    myTank.selectedWeapon = idx;
  };

  handleMoveLeftFromReact = () => {
    // Group-chat v1: no movement between turns — fire only.
    if (this.sceneData.gameMode === 'group-chat') return;
    const myTank = this.myPlayerIndex >= 0
      ? this.tanks[this.myPlayerIndex]
      : this.tanks[this.activeTank - 1];
    if (!myTank || !myTank.active || myTank.movesRemaining <= 0) return;
    myTank.stepLeft();
    if (this.sceneData.gameType === 3) {
      const socket = window.socket;
      if (socket) socket.emit('stepLeft', {});
    }
  };

  handleMoveRightFromReact = () => {
    if (this.sceneData.gameMode === 'group-chat') return;
    const myTank = this.myPlayerIndex >= 0
      ? this.tanks[this.myPlayerIndex]
      : this.tanks[this.activeTank - 1];
    if (!myTank || !myTank.active || myTank.movesRemaining <= 0) return;
    myTank.stepRight();
    if (this.sceneData.gameType === 3) {
      const socket = window.socket;
      if (socket) socket.emit('stepRight', {});
    }
  };

  handleExitFromReact = () => {
    // Group-chat: leaving the screen doesn't leave the match — the match
    // continues async in the chat. React parent (GroupBattleWrapper)
    // navigates away on its own.
    if (this.sceneData.gameMode === 'group-chat') return;
    if (window.socket) {
      window.socket.emit('leaveRoom', {});
    }
  };

  // ── Bridge state push ──
  // N-player: push players[] array from tanks[]. Also push backward-compat
  // tank1/tank2 shims so BattleHUD (Phase 19) doesn't break until it's updated.

  // STEP 3 (iOS render overhaul) — sync only the DATA portions of a
  // shotResult: HP per tank, terrain heightmap, then push to the React
  // bridge so the HUD re-renders. Does NOT play juice / hit-stop / blast
  // (those stay tied to animation onComplete). Called immediately on
  // shotResult arrival in the group-chat path so iOS Safari can show
  // correct HP / terrain even when its rAF-driven animation chain stalls.
  // applyTurnResult later re-applies the same values idempotently.
  _applyServerStateImmediate = (data) => {
    if (!data) return;
    try {
      // NOTE: terrain heightmap is INTENTIONALLY NOT applied here. Doing
      // so triggered tanks to re-settle to the new crater immediately —
      // which on desktop made tanks visibly "jump" while the projectile
      // was still mid-flight. Terrain dig stays in animation onComplete
      // via applyTurnResult, paired with the visual impact.
      //
      // What DOES apply here: HP per tank + bridge push. That's the
      // critical fix for "HP shows 250/250 after a confirmed direct hit
      // on iOS" — HP value is decoupled from render-loop timing so the
      // bar updates regardless of whether the trajectory animation
      // completes. iOS where animation stalls: HP correct, terrain
      // catches up on next shot's heightmap snapshot. Cosmetic minor
      // desync at most; no gameplay impact.

      // 1. HP per tank — primary path uses data.players (N-player shape).
      if (data.players && Array.isArray(data.players)) {
        data.players.forEach((pd, i) => {
          const tank = this.tanks[i];
          if (tank && tank.scoreHandler && pd.hp !== undefined) {
            tank.scoreHandler.hp = Math.max(0, pd.hp);
          }
        });
      } else if (data.hp) {
        // Legacy: hp keyed by socketId (fallback for older payload shapes).
        for (const [targetId, serverHp] of Object.entries(data.hp)) {
          const posIdx = this._lastPositions
            ? this._lastPositions.findIndex(p => p.socketId === targetId)
            : -1;
          const tank = posIdx >= 0 ? this.tanks[posIdx] : null;
          if (tank && tank.scoreHandler) {
            tank.scoreHandler.hp = Math.max(0, serverHp);
          }
        }
      }
      // 2. Push to React HUD so the HP bar overlays re-read immediately.
      this._pushStateToBridge();
    } catch (err) {
      // Never let a state-sync error kill the scene; applyTurnResult
      // will re-apply later via the animation chain.
      console.warn('[GC] _applyServerStateImmediate failed:', err?.message);
    }
  };

  _pushStateToBridge = () => {
    if (!this._bridge) return;

    const myTank = this.myPlayerIndex >= 0
      ? this.tanks[this.myPlayerIndex]
      : (this.activeTank > 0 ? this.tanks[this.activeTank - 1] : this.tanks[0]);

    const isMyTurn = myTank && myTank.active;

    // Build N-player players[] array
    const players = this.tanks.map((t, i) => ({
      x: t.x,
      y: t.y,
      hp: t.scoreHandler ? t.scoreHandler.hp : 250,
      angle: t.turret ? Math.max(0, Math.min(180, Math.round(Phaser.Math.RadToDeg(t.turret.relativeRotation + t.rotation + Math.PI / 2)))) : 45,
      power: t.power || 60,
      name: t.name || '',
      color: t.color || '#FF0000',
      score: t.score || 0,
      alive: !this._eliminated[i],
    }));

    // Backward-compat shims — BattleHUD still reads tank1/tank2 until Phase 19
    const t0 = this.tanks[0];
    const t1 = this.tanks[1];

    this._bridge.updateState({
      // N-player canonical
      players,
      myPlayerIndex: this.myPlayerIndex,
      currentPlayerIndex: this.currentPlayerIndex,
      // Backward-compat shims
      tank1: t0 ? {
        x: t0.x,
        y: t0.y,
        hp: t0.scoreHandler ? t0.scoreHandler.hp : 250,
        angle: t0.turret ? Phaser.Math.RadToDeg(t0.turret.relativeRotation + t0.rotation + Math.PI / 2) : 45,
        power: t0.power || 60,
        name: t0.name || '',
        color: t0.color || '#FF0000',
        score: t0.score || 0,
      } : this._bridge.state.tank1,
      tank2: t1 ? {
        x: t1.x,
        y: t1.y,
        hp: t1.scoreHandler ? t1.scoreHandler.hp : 250,
        angle: t1.turret ? Phaser.Math.RadToDeg(t1.turret.relativeRotation + t1.rotation + Math.PI / 2) : 45,
        power: t1.power || 60,
        name: t1.name || '',
        color: t1.color || '#0066FF',
        score: t1.score || 0,
      } : this._bridge.state.tank2,
      activeTank: this.activeTank,
      isPlayerTurn: isMyTurn,
      wind: this.wind || 0,
      moveSteps: myTank ? myTank.movesRemaining : 0,
      currentWeaponIndex: myTank ? myTank.selectedWeapon : 0,
      weapons: myTank ? myTank.weapons : [],
      // True from the moment FIRE is pressed (covers the network roundtrip)
      // until the trajectory animation finishes. Without _firePending here,
      // the button stays bright between click and server response and the
      // press feels delayed/unresponsive.
      isFiring: this._firePending || (myTank && myTank.turret ? myTank.turret.activeWeapon !== null : false),
      gameOver: this.gameOver,
    });
  };

  // ── Cleanup (Fix 4: specific socket.off, never removeAllListeners) ──

  shutdown = () => {
    const socket = window.socket;
    if (socket && this._socketHandlers) {
      Object.entries(this._socketHandlers).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
    }
    this._socketHandlers = {};

    // Clean up trajectory animation timer (prevents post-destroy callbacks)
    if (this._trajectoryTimer) {
      try { this._trajectoryTimer.remove(false); } catch (_) {}
      this._trajectoryTimer = null;
    }

    // Clean up any pending turn result to prevent stale state on re-create
    this.pendingTurnResult = null;
    this._turnResultCooldown = 0;
    this._firePending = false;

    // Clean up click-to-aim handler
    if (this._clickAimHandler) {
      this.input.off('pointerdown', this._clickAimHandler);
      this._clickAimHandler = null;
    }

    // Clean up spectator graphics
    this._clearSpectatorAimLine();

    // Clean up name labels and YOU marker
    if (this._nameLabels) {
      this._nameLabels.forEach(l => { try { l.destroy(); } catch (_) {} });
      this._nameLabels = null;
    }
    if (this._youMarker) {
      try { this._youMarker.destroy(); } catch (_) {}
      this._youMarker = null;
    }

    try {
      this.sound.stopAll();
    } catch (_) {}

    this._bridge = null;
  };
}

const int2rgba = (colorInt) => {
  var rgba = new Display.Color.IntegerToRGB(colorInt);
  return 'rgba(' + rgba.r + ',' + rgba.g + ',' + rgba.b + ',' + rgba.a + ')';
};

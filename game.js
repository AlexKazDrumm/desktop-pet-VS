/* global Phaser */

// ---------- Global layers (z-order) ----------
const DEPTH = {
  BG: -10, GROUND: -9, PARTICLES: -5,
  PICKUP: 2, ENEMY: 3, BOSS: 6, AURA: 7, PLAYER: 8, BULLET: 9, FX: 10
};

const WORLD_MULT = 5;
const MINIMAP_SIZE = 140;
const MINIMAP_MARGIN = 12;

// ===== Saves (file via Electron or localStorage) =====
const SAVE_FILE = 'save.json';
const Save = {
  key: 'arienn_menu_demo_v1',
  data: null,
  lastCommit: 0,
  _default() {
    return {
      version: 2,
      profile: { name: '' },
      settings: { sound: true },
      meta: { runs: 0, bestTime: 0 },
      stats: { enemiesKilled: 0, boltsFired: 0, secondsPlayed: 0 },
      last: { character: 'arienn', map: 'frozen_crossroads' },
      // meta-only stats per character (does not affect new runs)
      characters: { arienn: { bestLevel: 0, seenPerks: [] } }
    };
  },
  async load() {
    try {
      if (window.filesave) {
        const raw = await window.filesave.read(SAVE_FILE);
        this.data = raw ? JSON.parse(raw) : this._default();
      } else {
        const raw = localStorage.getItem(this.key);
        this.data = raw ? JSON.parse(raw) : this._default();
      }
      // --- migrate old format (level/xp/perks) -> meta only
      try {
        const ch = this.data?.characters?.arienn;
        if (ch && ('level' in ch || 'xp' in ch || 'perks' in ch)) {
          this.data.characters.arienn = {
            bestLevel: Math.max(0, ch.level || 0),
            seenPerks: Array.isArray(ch.perks) ? ch.perks : []
          };
        }
        if (!this.data.version || this.data.version < 2) this.data.version = 2;
      } catch {}
    } catch {
      this.data = this._default();
    }
  },
  async commit(force = false) {
    const now = performance.now();
    if (!force && now - this.lastCommit < 2500) return;
    this.lastCommit = now;
    try {
      const raw = JSON.stringify(this.data);
      if (window.filesave) await window.filesave.write(SAVE_FILE, raw);
      else localStorage.setItem(this.key, raw);
    } catch (e) { console.error('Save commit failed', e); }
  }
};

// ===== Content (mini DB) =====
const CONTENT = { characters: null, maps: null, perks: null };

async function loadContent() {
  CONTENT.characters = await fetch('content/characters.json').then(r => r.json());
  CONTENT.maps = await fetch('content/maps.json').then(r => r.json());
  CONTENT.perks = await fetch('content/perks.json').then(r => r.json());
}

// ===== Simple UI overlay =====
const HUD = document.getElementById('hud');
const OVERLAY = document.getElementById('overlay');
function setHUD(list) {
  if (!HUD) return;
  if (!OVERLAY.classList.contains('hidden')) return;
  HUD.innerHTML = '';
  const row = document.createElement('div');
  list.forEach(t => { const s = document.createElement('span'); s.textContent = t; row.appendChild(s); });
  HUD.appendChild(row);
}
function showOverlay(el) { OVERLAY.classList.remove('hidden'); OVERLAY.innerHTML = ''; OVERLAY.appendChild(el); }
function hideOverlay() { OVERLAY.classList.add('hidden'); OVERLAY.innerHTML = ''; }

// ===== Scenes =====
class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }
  async create() {
    await loadContent();
    await Save.load();

    // Steam persona (if any) -> otherwise ask for a name
    let name = Save.data.profile.name || (window.steam?.user?.() || '').trim();
    if (!name) {
      const box = document.createElement('div');
      box.className = 'card';
      box.innerHTML = `
        <h3>Your name</h3>
        <input id="playerName" class="txt" maxlength="24" placeholder="Player">
        <div style="margin-top:10px"><span class="btn" id="okBtn">OK</span></div>
      `;
      showOverlay(box);
      await new Promise(res => {
        box.querySelector('#okBtn').onclick = () => {
          const v = (box.querySelector('#playerName').value || '').trim().slice(0, 24);
          Save.data.profile.name = v || 'Player';
          hideOverlay();
          res();
        };
      });
      await Save.commit(true);
    }
    this.scene.start('menu');
  }
}

class MenuScene extends Phaser.Scene {
  constructor() { super('menu'); }
  create() {
    this.cameras.main.setBackgroundColor('#0e1620');
    const box = document.createElement('div');
    box.className = 'card';
    box.innerHTML = `
      <h2>Arienn: Ice Survivor</h2>
      <div>Profile: <b>${Save.data.profile.name || 'Player'}</b> | Best time: <b>${(Save.data.meta.bestTime || 0).toFixed(1)}s</b></div>
      <div style="margin-top:12px"><span class="btn" id="startBtn">Start</span></div>
    `;
    showOverlay(box);
    box.querySelector('#startBtn').onclick = () => { hideOverlay(); this.scene.start('charselect'); };
  }
}

class CharacterSelectScene extends Phaser.Scene {
  constructor() { super('charselect'); }
  preload() {
    for (const id in CONTENT.characters) {
      const c = CONTENT.characters[id];
      this.load.atlas('char_' + id, c.atlas, c.atlasJson);
    }
  }
  create() {
    this.cameras.main.setBackgroundColor('#0e1620');

    // Cards (one active + 4 "coming soon")
    const cards = [
      {
        id: 'arienn',
        name: CONTENT.characters.arienn.name,
        desc: CONTENT.characters.arienn.desc,
        img: 'assets/characters/cards/arienn_card.png',
        locked: false
      },
      { id: 'rosa',   name: 'Rose Excentrica', desc: 'Coming soon...', img: 'assets/characters/cards/rosa_card.png',   locked: true },
      { id: 'imp',    name: 'Chyortik',                desc: 'Coming soon...', img: 'assets/characters/cards/imp_card.png',    locked: true },
      { id: 'astra',  name: 'Astra Viridia',      desc: 'Coming soon...', img: 'assets/characters/cards/astra_card.png',  locked: true },
      { id: 'lirena', name: 'Lirena Aurelia',     desc: 'Coming soon...', img: 'assets/characters/cards/lirena_card.png', locked: true }
    ];

    const box = document.createElement('div');
    box.className = 'card card--chars';
    box.innerHTML = '<h3>Character Select</h3>';

    const charsGrid = document.createElement('div');   // <-- was "grid"
    charsGrid.className = 'char-grid';

    cards.forEach(c => {
      const el = document.createElement('div');
      el.className = 'char-card' + (c.locked ? ' locked' : '');
      if (!c.locked) el.setAttribute('data-id', c.id);
      el.innerHTML = `
        <div class="char-thumb-wrap">
          <img class="char-thumb" src="${c.img}" alt="${c.name}">
        </div>
        <div class="char-name">${c.name}</div>
        <div class="char-desc">${c.desc}</div>`;
      charsGrid.appendChild(el);
    });

    box.appendChild(charsGrid);
    const back = document.createElement('div');
    back.style.marginTop = '10px';
    back.innerHTML = '<span class="btn" id="backBtn">Back</span>';
    box.appendChild(back);

    showOverlay(box);

    // === 2 rows, 2:3, auto-scale ===
    const headerH = box.querySelector('h3')?.offsetHeight || 0;
    const backH = (box.querySelector('#backBtn')?.closest('div')?.offsetHeight || 0) + 10;
    const G = 14, PAD_OVERLAY = 32, PAD_CARDBOX = 32, PAD_CARDBOX_W = PAD_CARDBOX;

    const rows = 2;
    const cols = Math.ceil(cards.length / rows);

    function layout() {
      const vw = window.innerWidth, vh = window.innerHeight;

      const boxW = Math.min(1200, vw * 0.96);
      box.style.width = boxW + 'px';

      const gridW = boxW - PAD_CARDBOX_W;
      const availH = vh - PAD_OVERLAY - PAD_CARDBOX - headerH - backH;

      const rowSlotH = Math.floor((availH - G * (rows - 1)) / rows);

      const TEXT_H = 64;                 // reserve for header + 2 lines of description
      const MIN_W  = 120;

      // Height constraint: media space = rowSlotH - TEXT_H
      const cardW_fromH = Math.floor(Math.max(80, (rowSlotH - TEXT_H)) * (2/3));
      // Width constraint (by columns)
      const cardW_fromW = Math.floor((gridW - G * (cols - 1)) / cols);

      const cardW = Math.max(MIN_W, Math.min(cardW_fromH, cardW_fromW));
      const mediaH = Math.floor(cardW * 3/2);  // 2:3
      const cardH = mediaH + TEXT_H;

      charsGrid.style.gridTemplateColumns = `repeat(${cols}, ${cardW}px)`;
      charsGrid.style.gridTemplateRows    = `repeat(${rows}, ${cardH}px)`;
    }
    layout();
    window.addEventListener('resize', layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('resize', layout));

    // Click active card to select the character
    box.addEventListener('click', (e) => {
      const t = e.target.closest('.char-card');
      if (!t || t.classList.contains('locked')) return;
      const id = t.getAttribute('data-id');
      Save.data.last.character = id;
      Save.commit();
      hideOverlay();
      this.scene.start('mapselect');
    });

    document.getElementById('backBtn').onclick = () => {
      hideOverlay(); this.scene.start('menu');
    };
  }
}

class MapSelectScene extends Phaser.Scene {
  constructor() { super('mapselect'); }
  create() {
    this.cameras.main.setBackgroundColor('#0e1620');
    const box = document.createElement('div');
    box.className = 'card';
    const grid = document.createElement('div');
    grid.className = 'grid';
    box.innerHTML = '<h3>Map Select</h3>';
    for (const id in CONTENT.maps) {
      const m = CONTENT.maps[id];
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h4>${m.name}</h4>
        <div class="small">${id}</div>
        <div style="margin-top:8px"><span class="btn pick" data-id="${id}">Play</span></div>`;
      grid.appendChild(card);
    }
    box.appendChild(grid);
    const back = document.createElement('div');
    back.style.marginTop = '10px';
    back.innerHTML = '<span class="btn" id="backBtn">Back</span>';
    box.appendChild(back);
    showOverlay(box);

    box.addEventListener('click', (e) => {
      const t = e.target.closest('.pick');
      if (!t) return;
      Save.data.last.map = t.getAttribute('data-id');
      Save.commit();
      hideOverlay(); this.scene.start('game');
    });
    box.querySelector('#backBtn').onclick = () => { hideOverlay(); this.scene.start('charselect'); };
  }
}

// Helper: gradient background by map
function drawBG(scene, top = 0x0e1722, bottom = 0x0a111a) {
  const W = scene.worldW, H = scene.worldH;
  if (scene.bgG) scene.bgG.destroy();
  const g = scene.add.graphics();
  g.fillGradientStyle(top, top, bottom, bottom, 1);
  g.fillRect(0, 0, W, H);
  g.setDepth(DEPTH.BG);
  scene.bgG = g;
  scene._bgColors = { top, bottom };
}

class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    // Select from content
    this.selChar = CONTENT.characters[Save.data.last.character] || Object.values(CONTENT.characters)[0];
    this.selMap  = CONTENT.maps[Save.data.last.map] || Object.values(CONTENT.maps)[0];

    // Preload everything needed
    this.preloadAssets().then((ok) => {
      if (!ok) { this.reportMissingAssets(); return; }
      this.setupWorld();
    });
  }

  onResize(gameSize){
    const W = gameSize.width, H = gameSize.height;
    // camera + physics
    this.cameras.main.setSize(W, H);
    this.worldW = W * WORLD_MULT;
    this.worldH = H * WORLD_MULT;
    if (this.physics?.world) this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    // background
    if (this.bgG && this._bgColors){
      this.bgG.clear();
      this.bgG.fillGradientStyle(
        Phaser.Display.Color.HexStringToColor(this.selMap.bg.top).color,
        Phaser.Display.Color.HexStringToColor(this.selMap.bg.top).color,
        Phaser.Display.Color.HexStringToColor(this.selMap.bg.bottom).color,
        Phaser.Display.Color.HexStringToColor(this.selMap.bg.bottom).color,
        1
      );
      this.bgG.fillRect(0, 0, this.worldW, this.worldH);
    }
    // tile sprite
    if (this.ground){
      this.ground.setPosition(this.worldW / 2, this.worldH / 2).setSize(this.worldW, this.worldH);
    }
    // emitter - update spawn range by width
    if (this.em?.config){
      this.em.setConfig({
        ...this.em.config,
        x: { min: 0, max: this.worldW }
      });
    }
    if (this.minimap) {
      this.minimap.x = MINIMAP_MARGIN;
      this.minimap.y = H - MINIMAP_SIZE - MINIMAP_MARGIN;
    }
  }

  showPauseMenu(){
    if (this.pausedByMenu) return;
    // Do not touch if another overlay is open (level up, etc.)
    if (!OVERLAY.classList.contains('hidden')) return;

    this.scene.pause();
    this.pausedByMenu = true;

    const box = document.createElement('div');
    box.className = 'card';
    box.innerHTML = `
      <h3>Pause</h3>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:10px">
        <span class="btn" id="btnCont">Resume</span>
        <span class="btn" id="btnMenu">Main menu</span>
      </div>
    `;
    showOverlay(box);

    const resume = () => {
      hideOverlay();
      this.pausedByMenu = false;
      this.scene.resume();
    };

    box.querySelector('#btnCont').onclick = resume;
    box.querySelector('#btnMenu').onclick = () => {
      hideOverlay();
      this.pausedByMenu = false;
      if (this.scene.isPaused()) this.scene.resume();
      this.scene.start('menu');
    };

    // Allow closing with Esc a second time
    this._escResume = (ev) => {
      if (ev.key === 'Escape' && this.pausedByMenu) resume();
    };
    document.addEventListener('keydown', this._escResume, { once: true });
  }

  async preloadAssets() {
    const toLoad = [];

    if (!this.cache.audio.exists('sfx_icebolt')) {
      this.load.audio('sfx_icebolt', 'assets/audio/icebolt_fire.mp3');
      toLoad.push('sfx_icebolt');
    }

    if (!this.textures.exists('base')) {
      this.load.atlas('base', 'assets/base/atlas_base.png', 'assets/base/atlas_base.json');
      toLoad.push('base');
    }

    const charKey = 'char_' + this.selChar.id;
    if (!this.textures.exists(charKey)) {
      this.load.atlas(charKey, this.selChar.atlas, this.selChar.atlasJson);
      toLoad.push(charKey);
    }

    // Map: tile and particles
    const mapId = this.selMap.id;
    const tileKey = `map_${mapId}_tile`;
    const partKey = `map_${mapId}_particle`;
    if (!this.textures.exists(tileKey)) {
      this.load.image(tileKey, this.selMap.tile);
      toLoad.push(tileKey);
    }
    if (!this.textures.exists(partKey)) {
      this.load.image(partKey, this.selMap.particle);
      toLoad.push(partKey);
    }

    if (toLoad.length === 0) return true;
    return new Promise((resolve) => {
      let failed = false;
      this.load.on('loaderror', () => { failed = true; });
      this.load.once('complete', () => resolve(!failed));
      this.load.start();
    });
  }

  reportMissingAssets() {
    this.cameras.main.setBackgroundColor('#1b0d10');
    const box = document.createElement('div');
    box.className = 'card';
    box.innerHTML = `
      <h3>Assets not found</h3>
      <div class="small" style="margin-top:6px">
        Check that files exist and paths are correct:
        <ul style="text-align:left;line-height:1.5">
          <li><code>assets/base/atlas_base.png</code></li>
          <li><code>assets/base/atlas_base.json</code></li>
          <li><code>${this.selChar.atlas}</code></li>
          <li><code>${this.selChar.atlasJson}</code></li>
        </ul>
      </div>
      <div style="margin-top:10px"><span class="btn" id="back">Back to menu</span></div>
    `;
    showOverlay(box);

    fitCharGrid();
    window.addEventListener('resize', fitCharGrid);

    // (optional, but nice: remove the listener on scene exit)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', fitCharGrid);
    });
  }

  // ---- helpers for frames/animations
  frameExists(frameName) { return !!this.textures.getFrame('base', frameName); }
  ensureAnims() {
    // projectile anim
    if (!this.anims.exists('proj_icebolt')) {
      this.anims.create({
        key: 'proj_icebolt',
        frames: [
          { key: 'base', frame: 'projectile_icebolt_0' },
          { key: 'base', frame: 'projectile_icebolt_1' }
        ],
        frameRate: 10,
        repeat: -1
      });
    }

    // enemies/boss
    const defs = [
      { kind: 'snowling', prefix: 'enemy_snowling_', rate: 8 },
      { kind: 'ghoul',    prefix: 'enemy_ghoul_',    rate: 8 },
      { kind: 'wendigo',  prefix: 'boss_wendigo_',   rate: 6 }
    ];
    defs.forEach(d => {
      const walkKey = 'walk_' + d.kind;
      const dieKey  = 'die_' + d.kind;
      if (!this.anims.exists(walkKey)) {
        this.anims.create({
          key: walkKey,
          frames: [0,1,2,3].map(i => ({ key: 'base', frame: d.prefix + i })),
          frameRate: d.rate, repeat: -1
        });
      }
      if (!this.anims.exists(dieKey)) {
        const deadFrame = this.frameExists(d.prefix + '4') ? d.prefix + '4' : d.prefix + '3';
        this.anims.create({
          key: dieKey, frames: [{ key: 'base', frame: deadFrame }], frameRate: 1, repeat: 0
        });
      }
    });
  }

  setupWorld() {
    this.ensureAnims();
    const W = this.scale.width, H = this.scale.height;
    this.worldW = W * WORLD_MULT;
    this.worldH = H * WORLD_MULT;
    // Gradient
    const top = Phaser.Display.Color.HexStringToColor(this.selMap.bg.top).color;
    const bottom = Phaser.Display.Color.HexStringToColor(this.selMap.bg.bottom).color;
    drawBG(this, top, bottom);

    // Tiled background
    const mapId = this.selMap.id;
    const tileKey = `map_${mapId}_tile`;
    this.ground = this.add.tileSprite(this.worldW / 2, this.worldH / 2, this.worldW, this.worldH, tileKey)
      .setDepth(DEPTH.GROUND);

    // Map particles (Phaser 3.60+)
    const partKey = `map_${mapId}_particle`;
    const P = this.selMap.particles || {
      rate: 2, lifespan: 4000,
      speedYMin: 10, speedYMax: 30,
      scaleStart: 1, scaleEnd: 0.5,
      alphaStart: 0.9, alphaEnd: 0
    };

    this.em = this.add.particles(0, 0, partKey, {
      x: { min: 0, max: this.worldW },
      y: -12,
      quantity: P.rate, frequency: 180,
      lifespan: P.lifespan,
      speedY: { min: P.speedYMin, max: P.speedYMax },
      speedX: { min: -10, max: 10 },
      scale: { start: P.scaleStart, end: P.scaleEnd },
      alpha: { start: P.alphaStart, end: P.alphaEnd },
      rotate: { min: -15, max: 15 }
    })
      .setDepth(DEPTH.PARTICLES)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Player
    const charKey = 'char_' + this.selChar.id;
    this.player = this.physics.add
      .sprite(this.worldW / 2, this.worldH / 2, charKey, this.selChar.anim.walk + '0')
      .setCollideWorldBounds(true)
      .setDepth(DEPTH.PLAYER);

    // Narrower collider
    this.player.body.setSize(28, 44).setOffset(18, 16);
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    // Character animations
    const walkKey = `${charKey}_walk`;
    const castKey = `${charKey}_cast`;
    if (!this.anims.exists(walkKey)) {
      this.anims.create({
        key: walkKey,
        frames: Array.from({ length: this.selChar.anim.frames }, (_, i) => ({ key: charKey, frame: this.selChar.anim.walk + i })),
        frameRate: 8, repeat: -1
      });
    }
    if (!this.anims.exists(castKey)) {
      this.anims.create({
        key: castKey,
        frames: Array.from({ length: this.selChar.anim.frames }, (_, i) => ({ key: charKey, frame: this.selChar.anim.cast + i })),
        frameRate: 12, repeat: -1
      });
    }
    this.animKeys = { walk: walkKey, cast: castKey };
    this.player.play(walkKey);

    // Stats - each run starts from zero
    this.stats = {
      ...this.selChar.base,
      level: 1,
      xp: 0,
      hp: this.selChar.base.hpMax,
      nova: 0,
      fireCd: 0
    };

    // Aura visualization
    this.auraG = this.add.graphics()
      .setDepth(DEPTH.AURA)
      .setBlendMode(Phaser.BlendModes.ADD);
    this._auraT = 0;

    // Nova FX (from player center to aura edge)
    this.playNova = (x, y, maxR = this.stats.auraR) => {
      const cx = x, cy = y;                // lock center at cast time
      const g = this.add.graphics()
        .setDepth(DEPTH.FX)
        .setBlendMode(Phaser.BlendModes.ADD);
      g.r = 0;

      this.tweens.add({
        targets: g,
        r: maxR,                           // grow to aura radius
        duration: 420,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          g.clear();
          // fill inner wave front so it feels like it starts from the center
          const fillR = Math.max(0, g.r - 10);
          g.fillStyle(0x9fe8ff, 0.18);
          g.fillCircle(cx, cy, fillR);

          // bright ring at the wave front
          g.lineStyle(3, 0xB7F1FF, 0.95);
          g.strokeCircle(cx, cy, g.r);
        },
        onComplete: () => g.destroy()
      });

      // === SFX: create sound instance once ===
      this.sfx = this.sfx || {};
      if (!this.sfx.icebolt && this.cache.audio.exists('sfx_icebolt')) {
        this.sfx.icebolt = this.sound.add('sfx_icebolt', { volume: 0.7 });
      }
      // Just in case: if web audio was locked until the first click,
      // unlock on first interaction
      if (this.sound.locked) {
        this.sound.once('unlocked', () => {
          if (!this.sfx.icebolt && this.cache.audio.exists('sfx_icebolt')) {
            this.sfx.icebolt = this.sound.add('sfx_icebolt', { volume: 0.7 });
          }
        });
      }
    };


    // Groups and timers
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE');
    this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.pausedByMenu = false;
    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.pickups = this.physics.add.group();
    this.perks = {};
    this.fx = [];
    this.spawnTimer = 0;
    this.bossTimer = this.selMap.spawn.bossEvery;
    this.icicleTimer = 0;
    this.timeStart = this.time.now / 1000;
    this.minimap = {
      g: this.add.graphics().setScrollFactor(0).setDepth(DEPTH.FX + 2),
      x: MINIMAP_MARGIN,
      y: H - MINIMAP_SIZE - MINIMAP_MARGIN
    };

    // Facing direction (like in VS: L/R only)
    this.facing = 1;       // 1 - right, -1 - left
    this.castTimer = 0.0;  // while > 0 - play cast animation

    // Collisions
    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => {
      if (!b.active || !e.active) return;
      this.damageEnemy(e, b.dmg);
      b.destroy();
    });
    this.scale.on('resize', this.onResize, this);
    // HUD
    setHUD([
      `Player: ${Save.data.profile.name}`,
      `HP: ${this.stats.hp}/${this.stats.hpMax}`,
      `LVL: ${this.stats.level}`,
      `XP: ${this.stats.xp}`,
      `Nova: ready`
    ]);

    // Cleanup on exit
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.em?.destroy();
      this.enemies?.clear(true, true);
      this.bullets?.clear(true, true);
      this.pickups?.clear(true, true);
      this.minimap?.g?.destroy();
    });
  }

  // ---- enemies / bullets helpers
  createEnemy(kind, x, y, hp, speed) {
    const prefix = kind === 'wendigo' ? 'boss_wendigo_' :
                   kind === 'ghoul'   ? 'enemy_ghoul_'   : 'enemy_snowling_';
    const e = this.physics.add.sprite(x, y, 'base', prefix + '0')
      .setDepth(kind === 'wendigo' ? DEPTH.BOSS : DEPTH.ENEMY);
    e.kind = kind; e.hp = hp; e.speed = speed; e.dead = false;

    // collider sizes
    if (kind === 'wendigo') e.body.setSize(64, 80).setOffset(16, 8);
    else e.body.setSize(36, 48).setOffset(14, 8);

    e.play('walk_' + kind);
    return e;
  }

  killEnemy(e) {
    if (!e || e.dead) return;
    e.dead = true;
    e.body.enable = false;
    e.play('die_' + e.kind, true);
    this.tweens.add({
      targets: e, alpha: 0,
      duration: 280, ease: 'Quad.easeOut',
      onComplete: () => e.destroy()
    });
  }

  damageEnemy(e, dmg) {
    if (!e || e.dead) return;
    e.hp -= dmg;
    if (e.hp <= 0) {
      Save.data.stats.enemiesKilled++;
      this.spawnPickup(e.x, e.y, Math.random() < 0.15 ? 'xp_big' : 'xp_small');
      this.killEnemy(e);
    }
  }

  nearestEnemy() {
    let best = null, bd = 1e9;
    this.enemies.children.iterate(e => {
      if (!e || e.dead) return;
      const d = (e.x - this.player.x) ** 2 + (e.y - this.player.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    });
    return best;
  }

  shoot(target) {
    const ang = Math.atan2(target.y - this.player.y, target.x - this.player.x);
    const sp = 420;
    const b = this.physics.add.sprite(this.player.x, this.player.y, 'base', 'projectile_icebolt_0')
      .setDepth(DEPTH.BULLET);
    b.vx = Math.cos(ang) * sp;
    b.vy = Math.sin(ang) * sp;
    b.life = 1.2;
    b.dmg = this.stats.bulletDmg;
    b.setRotation(ang);
    b.play('proj_icebolt');
    this.bullets.add(b);
    Save.data.stats.boltsFired++;

    // === Shot SFX ===
    if (this.sfx?.icebolt) {
      // avoid stacking the click, safely restart
      this.sfx.icebolt.stop();
      this.sfx.icebolt.play();
    } else {
      // fallback: create on the fly if something went wrong
      this.sound.play('sfx_icebolt', { volume: 0.7 });
    }

    // short cast animation + face the target
    this.castTimer = 0.28;
    this.facing = (target.x >= this.player.x) ? 1 : -1;
  }

  spawnEnemy() {
    const W = this.worldW, H = this.worldH;
    const view = this.cameras.main.worldView;
    const nearChance = 0.8;
    const nearPad = 40;
    const farPad = 80;
    let x = 0, y = 0;

    const clampToWorld = () => {
      x = Phaser.Math.Clamp(x, 0, W);
      y = Phaser.Math.Clamp(y, 0, H);
    };

    const spawnNearView = () => {
      const side = Math.floor(Math.random() * 4);
      const vx = view.x, vy = view.y, vw = view.width, vh = view.height;
      if (side === 0) { x = vx - nearPad; y = vy + Math.random() * vh; }
      else if (side === 1) { x = vx + vw + nearPad; y = vy + Math.random() * vh; }
      else if (side === 2) { x = vx + Math.random() * vw; y = vy - nearPad; }
      else { x = vx + Math.random() * vw; y = vy + vh + nearPad; }
      clampToWorld();
    };

    if (Math.random() < nearChance) {
      spawnNearView();
    } else {
      const vx = view.x, vy = view.y, vw = view.width, vh = view.height;
      for (let i = 0; i < 8; i++) {
        x = Math.random() * W;
        y = Math.random() * H;
        if (x < vx - farPad || x > vx + vw + farPad || y < vy - farPad || y > vy + vh + farPad) break;
      }
      clampToWorld();
    }

    const t = (this.time.now / 1000) / 60;
    const speed = Phaser.Math.Clamp(70 + t * 12, 70, 170);
    const hp = 10 + t * 8;
    const kind = Math.random() < 0.6 ? 'snowling' : 'ghoul';
    const e = this.createEnemy(kind, x, y, hp, speed);
    if (this.selMap.enemyTint) {
      e.setTint(Phaser.Display.Color.HexStringToColor(this.selMap.enemyTint).color);
    }
    this.enemies.add(e);
  }

  spawnBoss() {
    const W = this.worldW;
    const e = this.createEnemy('wendigo', Math.random() * W, -60, 600 + (this.time.now / 1000) * 8, 85);
    this.enemies.add(e);
  }

  spawnPickup(x, y, type) {
    const p = this.physics.add.sprite(x, y, 'base', type === 'xp_big' ? 'xp_big' : 'xp_small')
      .setDepth(DEPTH.PICKUP);
    p.type = type; this.pickups.add(p);
  }

  levelUp() {
    const pool = CONTENT.perks.slice();
    const choices = [];
    while (choices.length < 3 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      choices.push(pool.splice(i, 1)[0]);
    }

    this.scene.pause();
    const el = document.createElement('div');
    el.className = 'card levelup';
    el.innerHTML = '<h3>Level up - choose a perk</h3>';
    const grid = document.createElement('div'); grid.className = 'levelup-grid';
    choices.forEach((c, i) => {
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = `<h4>${c.name}</h4><div class="small">${c.desc}</div>
        <div style="margin-top:8px"><span class="btn choose" data-i="${i}">Choose</span></div>`;
      grid.appendChild(card);
    });
    el.appendChild(grid);
    showOverlay(el);

    const pick = (idx) => {
      const p = choices[idx];
      const s = this.stats;
      switch (p.id) {
        case 'bolt_dmg': s.bulletDmg = Math.round(s.bulletDmg * 1.25); break;
        case 'fire_rate': s.fireRate = Math.max(0.18, s.fireRate * 0.88); break;
        case 'aura_r': s.auraR += 30; break;
        case 'aura_slow': s.auraSlow = Math.min(0.9, s.auraSlow + 0.1); break;
        case 'nova_cd': s.novaCD = Math.max(2.5, s.novaCD * 0.8); break;
        case 'hp_up': s.hpMax += 20; s.hp = Math.min(s.hpMax, (s.hp || s.hpMax) + 10); break;
        case 'icicle_barrage': this.perks.icicle_barrage = true; this.icicleTimer = 0; break;
        case 'ice_barrier': this.perks.ice_barrier = true; break;
      }
      // Save: meta only (does not affect future runs)
      const st = Save.data.characters[this.selChar.id]
        || (Save.data.characters[this.selChar.id] = { bestLevel: 0, seenPerks: [] });
      st.bestLevel = Math.max(st.bestLevel || 0, this.stats.level);
      if (!st.seenPerks.includes(p.id)) st.seenPerks.push(p.id);
      Save.commit();
      hideOverlay();
      this.scene.resume();
    };

    el.addEventListener('click', e => { const t = e.target.closest('.choose'); if (!t) return; pick(+t.getAttribute('data-i')); });
    const keyh = (e) => {
      if (OVERLAY.classList.contains('hidden')) { document.removeEventListener('keydown', keyh); return; }
      if (['1', '2', '3'].includes(e.key)) { pick(+e.key - 1); document.removeEventListener('keydown', keyh); }
    };
    document.addEventListener('keydown', keyh);
  }

  update(time, delta) {
    if (!this.player) return;
    const dt = delta / 1000, p = this.player, s = this.stats;
    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      if (this.pausedByMenu) {
        // If the pause menu is open, close it (in case the overlay has focus)
        document.getElementById('btnCont')?.click();
      } else {
        this.showPauseMenu();
      }
    }
    // Movement
    let dx = (this.input.keyboard.addKey('D').isDown ? 1 : 0) + (this.input.keyboard.addKey('A').isDown ? -1 : 0);
    let dy = (this.input.keyboard.addKey('S').isDown ? 1 : 0) + (this.input.keyboard.addKey('W').isDown ? -1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    p.x = Phaser.Math.Clamp(p.x + (dx / len) * s.speed * dt, 0, this.worldW);
    p.y = Phaser.Math.Clamp(p.y + (dy / len) * s.speed * dt, 0, this.worldH);

    // Update facing: if there is input, use it; otherwise face the target
    const target = this.nearestEnemy();
    if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
    else if (target) this.facing = (target.x >= p.x) ? 1 : -1;
    p.flipX = (this.facing < 0); // L/R only

    // Auto-fire
    s.fireCd = (s.fireCd || 0) - dt;
    if (target && s.fireCd <= 0) { s.fireCd = s.fireRate; this.shoot(target); }

    // Nova
    if (this.input.keyboard.addKey('SPACE').isDown) {
      if ((s.nova || 0) <= 0) {
        s.nova = s.novaCD;
        this.playNova(p.x, p.y, s.auraR);// visual
        this.enemies.children.iterate(e => {
          if (!e || e.dead) return;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < 140) {
            this.damageEnemy(e, 30);
            const ux = (e.x - p.x) / (d || 1), uy = (e.y - p.y) / (d || 1);
            if (!e.dead) { e.x += ux * 28; e.y += uy * 28; }
          }
        });
      }
    }
    if ((s.nova || 0) > 0) s.nova -= dt;

    // Perks: icicles
    if (this.perks.icicle_barrage) {
      this.icicleTimer -= dt;
      if (this.icicleTimer <= 0) {
        this.icicleTimer = 4;
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2, sp = 340;
          const b = this.physics.add.sprite(p.x, p.y, 'base', 'projectile_icebolt_0')
            .setDepth(DEPTH.BULLET);
          b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.life = 1; b.dmg = Math.round(s.bulletDmg * 0.75);
          b.setRotation(a).play('proj_icebolt');
          this.bullets.add(b);
        }
      }
    }

    // Bullets
    this.bullets.children.iterate(b => {
      if (!b) return;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.life <= 0) b.destroy();
    });

    // Enemies
    this.enemies.children.iterate(e => {
      if (!e || e.dead) return;

      const vx = p.x - e.x, vy = p.y - e.y, d = Math.hypot(vx, vy) || 1;
      let sp = e.speed;
      if (Math.hypot(e.x - p.x, e.y - p.y) < s.auraR) sp *= s.auraSlow;
      e.x += (vx / d) * sp * dt; e.y += (vy / d) * sp * dt;

      // face the player (L/R only)
      e.flipX = (p.x < e.x);

      const rr = 30;
      if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 <= rr * rr) {
        let dmg = 16 * dt; if (this.perks.ice_barrier) dmg *= 0.7;
        s.hp -= dmg;
        const ux = (p.x - e.x) / (d || 1), uy = (p.y - e.y) / (d || 1);
        e.x -= ux * 60 * dt; e.y -= uy * 60 * dt;
      }
    });

    // Loot
    this.pickups.children.iterate(pp => {
      if (!pp) return;
      const d = Math.hypot(p.x - pp.x, p.y - pp.y) || 1;
      if (d < 180) { const ux = (p.x - pp.x) / d, uy = (p.y - pp.y) / d; pp.x += ux * 160 * dt; pp.y += uy * 160 * dt; }
      if (d < 24) { s.xp += (pp.type === 'xp_big' ? 8 : 3); pp.destroy(); }
    });

    // Spawns
    this.spawnTimer -= dt;
    const every = Phaser.Math.Clamp(this.selMap.spawn.baseEvery - (this.time.now / 1000) * this.selMap.spawn.growth, 0.23, this.selMap.spawn.baseEvery);
    if (this.spawnTimer <= 0) { this.spawnTimer = every; this.spawnEnemy(); }
    this.bossTimer -= dt; if (this.bossTimer <= 0) { this.bossTimer = this.selMap.spawn.bossEvery; this.spawnBoss(); }

    // Levels
    while (s.xp >= s.level * 50) { s.level++; this.levelUp(); }

    // Death / end
    if ((s.hp || 0) <= 0) {
      const lived = (this.time.now / 1000) - this.timeStart;
      Save.data.meta.bestTime = Math.max(Save.data.meta.bestTime || 0, lived);
      Save.data.meta.runs = (Save.data.meta.runs || 0) + 1;
      Save.commit(true);
      this.scene.start('menu');
      return;
    }

    // Animation switch (cast -> walk)
    if (this.castTimer > 0) {
      this.castTimer -= dt;
      if (p.anims.currentAnim?.key !== this.animKeys.cast) p.play(this.animKeys.cast, true);
    } else if (p.anims.currentAnim?.key !== this.animKeys.walk) {
      p.play(this.animKeys.walk, true);
    }

    // Aura visualization (each frame)
    this._auraT += dt;
    const pulse = 0.05 + 0.05 * ((Math.sin(this._auraT * 3) + 1) / 2);
    this.auraG.clear();
    this.auraG.fillStyle(0x7fdcff, pulse);
    this.auraG.fillCircle(p.x, p.y, s.auraR);
    this.auraG.lineStyle(2, 0xa8e8ff, 0.55);
    this.auraG.strokeCircle(p.x, p.y, s.auraR);

    // HUD + autosave
    Save.data.stats.secondsPlayed += dt; Save.commit();
    setHUD([
      `Player: ${Save.data.profile.name}`,
      `HP: ${Math.max(0, (s.hp || 0) | 0)}/${s.hpMax}`,
      `LVL: ${s.level}`,
      `XP: ${s.xp}`,
      `Nova: ${s.nova > 0 ? s.nova.toFixed(1) + 's' : 'ready'}`
    ]);
    this.drawMinimap();
  }

  drawMinimap() {
    if (!this.minimap || !this.player) return;
    const g = this.minimap.g;
    const x0 = this.minimap.x;
    const y0 = this.minimap.y;
    const size = MINIMAP_SIZE;
    const sx = size / this.worldW;
    const sy = size / this.worldH;
    const view = this.cameras.main.worldView;

    g.clear();
    g.fillStyle(0x08131c, 0.7);
    g.fillRect(x0, y0, size, size);
    g.lineStyle(1, 0x5bb7e5, 0.85);
    g.strokeRect(x0, y0, size, size);

    g.lineStyle(1, 0xffffff, 0.25);
    g.strokeRect(
      x0 + view.x * sx,
      y0 + view.y * sy,
      view.width * sx,
      view.height * sy
    );

    g.fillStyle(0xff6b6b, 0.9);
    this.enemies.children.iterate(e => {
      if (!e || e.dead) return;
      g.fillCircle(x0 + e.x * sx, y0 + e.y * sy, 2);
    });

    g.fillStyle(0xffd166, 0.9);
    this.pickups.children.iterate(p => {
      if (!p) return;
      g.fillCircle(x0 + p.x * sx, y0 + p.y * sy, 2);
    });

    g.fillStyle(0x57f287, 1);
    g.fillCircle(x0 + this.player.x * sx, y0 + this.player.y * sy, 2.5);
  }
}

// Phaser init
new Phaser.Game({
  type: Phaser.AUTO,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, MenuScene, CharacterSelectScene, MapSelectScene, GameScene],
  physics: { default: 'arcade', arcade: { debug: false } }
});


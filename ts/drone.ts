/* =========================================================
   ДРОН-РАЗВЕДЧИК — 3D аркадный полёт на Three.js.
   ---------------------------------------------------------
   Идея: игрок появляется в лесополосе на краю открытого поля,
   взлетает на дроне (модель + заряд батареи выбираются заранее)
   и свободно летает. По полю ходят солдаты, ездят машины,
   грузовики с пулемётом и стоят/патрулируют танки — они не
   декорация: заметив дрон, они стреляют по нему издалека.
   У самого дрона оружия нет — задача чисто в том, чтобы
   продержаться подольше и пролететь подальше, уворачиваясь
   от обстрела и не врезаясь в деревья/технику/землю.

   Three.js подключается как глобальный UMD-скрипт (r128, тот же
   способ, что используется для WebGL-виджетов на сайте) прямо
   в index.html, ПЕРЕД этим файлом — поэтому здесь достаточно
   объявить его для компилятора через declare, без npm-пакета
   @types/three (в проекте вообще нет сборщика, см. package.json).
========================================================= */

declare const THREE: any;
declare const SoundManager: any;

/* =========================================================
   НАСТРОЙКИ МОДЕЛЕЙ ДРОНА И ЗАРЯДА БАТАРЕИ
========================================================= */
interface DroneModelConfig {
  name: string;
  color: number;
  maxHp: number;      // прочность корпуса (попадания солдат/техники)
  speed: number;       // макс. скорость вперёд/назад, ед/с
  climb: number;        // скорость набора/потери высоты, ед/с
  turn: number;          // скорость разворота, рад/с
  accel: number;          // ускорение к целевой скорости
  size: number;            // масштаб модели и радиус коллизии
}
interface DroneChargeConfig {
  name: string;
  seconds: number;   // сколько секунд активного полёта хватает заряда
  weight: number;      // множитель к манёвренности (больше заряд — тяжелее)
}

const DRONE_MODELS: { [key: string]: DroneModelConfig } = {
  scout:    { name: 'Скаут',  color: 0x6FB7E8, maxHp: 55,  speed: 27, climb: 15, turn: 2.7, accel: 30, size: 0.85 },
  balanced: { name: 'Баланс', color: 0xF2B705, maxHp: 100, speed: 21, climb: 11, turn: 2.0, accel: 22, size: 1.0 },
  heavy:    { name: 'Танк',   color: 0x5E7A4D, maxHp: 165, speed: 15, climb: 8,  turn: 1.35, accel: 15, size: 1.25 },
};
const DRONE_CHARGES: { [key: string]: DroneChargeConfig } = {
  s: { name: 'Малый',   seconds: 40,  weight: 1.15 },
  m: { name: 'Средний', seconds: 75,  weight: 1.0 },
  l: { name: 'Большой', seconds: 120, weight: 0.85 },
};

/* =========================================================
   МЕЛКИЕ УТИЛИТЫ
========================================================= */
function droneShow(el: Element | null): void { if (el) el.classList.remove('hidden'); }
function droneHide(el: Element | null): void { if (el) el.classList.add('hidden'); }
function droneApproach(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
function droneRandRange(a: number, b: number): number { return a + Math.random() * (b - a); }
function droneClamp(v: number, a: number, b: number): number { return Math.max(a, Math.min(b, v)); }

type EnemyKind = 'soldier' | 'tank' | 'truck';

interface DroneBullet {
  mesh: any;
  vel: any;
  life: number;
  damage: number;
  radius: number;
}
interface DroneEnemy {
  kind: EnemyKind;
  group: any;
  turret: any | null;       // часть, которая доворачивается на дрон (башня/пулемёт)
  basePos: { x: number; z: number };
  amp: number;                // размах патрулирования
  axis: 'x' | 'z';
  phase: number;
  speedFactor: number;
  fireRange: number;
  fireCooldown: number;
  fireCooldownRange: [number, number];
  bulletSpeed: number;
  bulletDamage: number;
  bulletColor: number;
  spread: number;
  collideRadius: number;
}
interface DroneObstacle { x: number; z: number; radius: number; height: number; }

/* =========================================================
   ОСНОВНОЙ ОБЪЕКТ ИГРЫ
========================================================= */
const DroneGame = {
  // ---- выбор перед вылетом ----
  selectedModel: 'balanced',
  selectedCharge: 'm',

  // ---- three.js ----
  renderer: null as any,
  scene: null as any,
  camera: null as any,
  droneGroup: null as any,
  rotors: [] as any[],

  // ---- состояние полёта ----
  running: false,
  paused: false,
  dead: false,
  hasTakenOff: false,
  hintHidden: false,

  hp: 100,
  maxHp: 100,
  battery: 100,          // в процентах
  batteryDrainPerSec: 1,  // %/с при обычном режиме, задаётся из выбранного заряда
  velForward: 0,
  velVertical: 0,
  yaw: 0,
  pos: null as any,       // THREE.Vector3
  prevPos: null as any,

  timeAlive: 0,
  distance: 0,

  camChasePos: null as any,
  camLookPos: null as any,

  obstacles: [] as DroneObstacle[],   // деревья + техника-помеха (только коллизия)
  enemies: [] as DroneEnemy[],
  bullets: [] as DroneBullet[],
  fx: [] as any[],                     // временные частицы взрыва/попаданий

  keys: {} as { [k: string]: boolean },
  joyLeft: { active: false, x: 0, y: 0, id: -1 },
  joyRight: { active: false, x: 0, y: 0, id: -1 },

  _rafId: 0,
  _lastTime: 0,

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ UI (вызывается один раз из script.js)
  ========================================================= */
  init(): void {
    this.bindSetupUI();
    this.bindGameUI();
    this.bindKeyboard();
    this.bindJoysticks();
    window.addEventListener('resize', () => this.fitCanvas());
    window.addEventListener('orientationchange', () => setTimeout(() => this.fitCanvas(), 200));
  },

  bindSetupUI(): void {
    const pickBtn = document.getElementById('pickDroneBtn');
    if (pickBtn) {
      pickBtn.addEventListener('click', () => {
        droneHide(document.getElementById('gameSelectScreen'));
        droneShow(document.getElementById('droneScreen'));
        droneShow(document.getElementById('droneSetupPanel'));
        droneHide(document.getElementById('droneGameWrap'));
      });
    }
    const backBtn = document.getElementById('droneBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        droneHide(document.getElementById('droneScreen'));
        droneShow(document.getElementById('gameSelectScreen'));
      });
    }

    document.querySelectorAll<HTMLElement>('#droneModelGrid .drone-pick').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#droneModelGrid .drone-pick').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedModel = btn.dataset.model || 'balanced';
      });
    });
    document.querySelectorAll<HTMLElement>('#droneChargeGrid .drone-pick').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#droneChargeGrid .drone-pick').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedCharge = btn.dataset.charge || 'm';
      });
    });

    const takeoffBtn = document.getElementById('droneTakeoffToSceneBtn');
    if (takeoffBtn) takeoffBtn.addEventListener('click', () => this.startFlight());
  },

  bindGameUI(): void {
    const exitBtn = document.getElementById('droneExitBtn');
    if (exitBtn) exitBtn.addEventListener('click', () => this.exitToSetup());
    const pauseBtn = document.getElementById('dronePauseBtn');
    if (pauseBtn) pauseBtn.addEventListener('click', () => this.setPaused(true));
    const resumeBtn = document.getElementById('droneResumeBtn');
    if (resumeBtn) resumeBtn.addEventListener('click', () => this.setPaused(false));
    const pauseExitBtn = document.getElementById('dronePauseExitBtn');
    if (pauseExitBtn) pauseExitBtn.addEventListener('click', () => this.exitToSetup());
    const restartBtn = document.getElementById('droneRestartBtn');
    if (restartBtn) restartBtn.addEventListener('click', () => this.startFlight());
    const goMenuBtn = document.getElementById('droneGoMenuBtn');
    if (goMenuBtn) goMenuBtn.addEventListener('click', () => this.exitToSetup());
  },

  setPaused(p: boolean): void {
    if (!this.running || this.dead) return;
    this.paused = p;
    if (p) droneShow(document.getElementById('dronePauseOverlay'));
    else droneHide(document.getElementById('dronePauseOverlay'));
  },

  exitToSetup(): void {
    this.stopLoop();
    this.destroyScene();
    droneHide(document.getElementById('droneGameWrap'));
    droneShow(document.getElementById('droneSetupPanel'));
    droneHide(document.getElementById('dronePauseOverlay'));
    droneHide(document.getElementById('droneGameOverOverlay'));
  },

  /* =========================================================
     КЛАВИАТУРА
  ========================================================= */
  bindKeyboard(): void {
    document.addEventListener('keydown', e => {
      const wrap = document.getElementById('droneGameWrap');
      if (!wrap || wrap.classList.contains('hidden')) return;
      if (e.code === 'Escape') { this.setPaused(!this.paused); return; }
      if (e.code === 'Space') e.preventDefault();
      this.keys[e.code] = true;
    });
    document.addEventListener('keyup', e => { this.keys[e.code] = false; });
  },

  /* =========================================================
     ВИРТУАЛЬНЫЕ СТИКИ (телефон)
  ========================================================= */
  bindJoysticks(): void {
    this.setupOneJoystick('droneJoyLeft', 'droneJoyLeftStick', this.joyLeft);
    this.setupOneJoystick('droneJoyRight', 'droneJoyRightStick', this.joyRight);
  },
  setupOneJoystick(baseId: string, stickId: string, state: { active: boolean; x: number; y: number; id: number }): void {
    const base = document.getElementById(baseId);
    const stick = document.getElementById(stickId);
    if (!base || !stick) return;
    const R = 40; // максимальное смещение стика в px

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      state.active = true; state.id = t.identifier; state.x = 0; state.y = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!state.active) return;
      let touch: Touch | null = null;
      for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === state.id) touch = e.changedTouches[i]; }
      if (!touch) return;
      e.preventDefault();
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      let dx = touch.clientX - cx, dy = touch.clientY - cy;
      const len = Math.hypot(dx, dy);
      const max = rect.width / 2;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      state.x = droneClamp(dx / max, -1, 1);
      state.y = droneClamp(dy / max, -1, 1);
      (stick as HTMLElement).style.transform = `translate(${dx / max * R}px, ${dy / max * R}px)`;
    };
    const onEnd = (e: TouchEvent) => {
      let ended = false;
      for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === state.id) ended = true; }
      if (!ended) return;
      state.active = false; state.x = 0; state.y = 0;
      (stick as HTMLElement).style.transform = 'translate(0,0)';
    };
    base.addEventListener('touchstart', onStart, { passive: false });
    base.addEventListener('touchmove', onMove, { passive: false });
    base.addEventListener('touchend', onEnd, { passive: false });
    base.addEventListener('touchcancel', onEnd, { passive: false });
  },

  /* =========================================================
     ПОСТРОЕНИЕ СЦЕНЫ
  ========================================================= */
  startFlight(): void {
    droneHide(document.getElementById('droneSetupPanel'));
    droneShow(document.getElementById('droneGameWrap'));
    droneHide(document.getElementById('droneGameOverOverlay'));
    droneHide(document.getElementById('dronePauseOverlay'));
    const hint = document.getElementById('droneHint');
    if (hint) hint.classList.remove('hidden-hint');

    this.destroyScene();
    this.buildScene();
    this.resetFlightState();
    this.fitCanvas();
    this.running = true;
    this.paused = false;
    this.dead = false;
    this._lastTime = performance.now();
    this._rafId = requestAnimationFrame(t => this.loop(t));
  },

  resetFlightState(): void {
    const model = DRONE_MODELS[this.selectedModel];
    const charge = DRONE_CHARGES[this.selectedCharge];
    this.maxHp = model.maxHp;
    this.hp = model.maxHp;
    this.battery = 100;
    this.batteryDrainPerSec = 100 / charge.seconds;
    this.velForward = 0;
    this.velVertical = 0;
    this.timeAlive = 0;
    this.distance = 0;
    this.hasTakenOff = false;
    this.hintHidden = false;
  },

  buildScene(): void {
    const model = DRONE_MODELS[this.selectedModel];
    const charge = DRONE_CHARGES[this.selectedCharge];

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fd6ec);
    scene.fog = new THREE.Fog(0x9fd6ec, 90, 420);
    this.scene = scene;

    const canvas = document.getElementById('droneCanvas') as HTMLCanvasElement;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer = renderer;

    const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 600);
    this.camera = camera;

    // свет
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a5a2a, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(60, 120, 40);
    scene.add(sun);

    // земля с лёгкой процедурной текстурой (пятна травы)
    const groundTex = this.makeGroundTexture();
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    this.obstacles = [];
    this.enemies = [];
    this.bullets = [];
    this.fx = [];

    // дороги
    const roadXs = [-70, 30, 110];
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x555a5e });
    roadXs.forEach((rx: number) => {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 420), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(rx, 0.02, -170);
      scene.add(road);
    });

    // лесополоса вокруг точки старта (z от 5 до 55), плюс редкие деревья дальше в поле
    for (let i = 0; i < 160; i++) {
      const x = droneRandRange(-230, 230);
      const nearRoad = roadXs.some((rx: number) => Math.abs(x - rx) < 7);
      if (nearRoad) continue;
      const z = droneRandRange(4, 58);
      this.addTree(x, z);
    }
    for (let i = 0; i < 35; i++) {
      const x = droneRandRange(-230, 230);
      const nearRoad = roadXs.some((rx: number) => Math.abs(x - rx) < 7);
      if (nearRoad) continue;
      const z = droneRandRange(-420, -20);
      if (Math.random() < 0.55) this.addTree(x, z);
    }

    // солдаты
    for (let i = 0; i < 10; i++) {
      const x = droneRandRange(-190, 190);
      const z = droneRandRange(-400, -15);
      this.addSoldier(x, z);
    }
    // танки
    for (let i = 0; i < 3; i++) {
      const x = droneRandRange(-160, 160);
      const z = droneRandRange(-380, -60);
      this.addTank(x, z);
    }
    // техничка с пулемётом — курсирует по дорогам
    for (let i = 0; i < 3; i++) {
      const rx = roadXs[i % roadXs.length];
      this.addTruck(rx, -200 + i * 40, true);
    }
    // обычные машины — просто помеха
    for (let i = 0; i < 5; i++) {
      const rx = roadXs[i % roadXs.length];
      this.addTruck(rx, -100 - i * 55, false);
    }

    // дрон
    this.droneGroup = this.buildDroneMesh(model.color, model.size);
    this.pos = new THREE.Vector3(0, 0.55, 26);
    this.prevPos = this.pos.clone();
    this.yaw = Math.PI; // смотрим в поле (в сторону -Z)
    this.droneGroup.position.copy(this.pos);
    this.droneGroup.rotation.y = this.yaw;
    scene.add(this.droneGroup);

    this.camChasePos = this.pos.clone();
    this.camLookPos = this.pos.clone();

    void charge; // используется через batteryDrainPerSec, но оставим для читаемости
  },

  makeGroundTexture(): any {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = '#6fa84f';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      const shade = Math.random() < 0.5 ? 'rgba(90,150,60,0.35)' : 'rgba(60,110,45,0.3)';
      ctx.fillStyle = shade;
      const x = Math.random() * 256, y = Math.random() * 256, r = 4 + Math.random() * 10;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(120, 120);
    return tex;
  },

  addTree(x: number, z: number): void {
    const group = new THREE.Group();
    const h = droneRandRange(3.2, 5.5);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, h * 0.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2c })
    );
    trunk.position.y = h * 0.2;
    group.add(trunk);
    const leafColor = Math.random() < 0.5 ? 0x2f7a3a : 0x3d8a45;
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.6 - i * 0.35, 1.9, 7),
        new THREE.MeshLambertMaterial({ color: leafColor })
      );
      cone.position.y = h * 0.42 + i * 1.05;
      group.add(cone);
    }
    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(group);
    this.obstacles.push({ x, z, radius: 1.1, height: h + 2 });
  },

  buildDroneMesh(color: number, scale: number): any {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.6), bodyMat);
    group.add(body);
    const armMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const rotorMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    this.rotors = [];
    const offsets = [[0.55, 0.55], [-0.55, 0.55], [0.55, -0.55], [-0.55, -0.55]];
    offsets.forEach((o: number[]) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 0.1), armMat);
      arm.position.set(o[0] * 0.5, 0, o[1] * 0.5);
      arm.rotation.y = Math.atan2(o[1], o[0]);
      group.add(arm);
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 10), rotorMat);
      rotor.position.set(o[0], 0.05, o[1]);
      group.add(rotor);
      this.rotors.push(rotor);
    });
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
    light.position.set(0, 0.05, -0.32);
    group.add(light);
    group.scale.setScalar(scale);
    return group;
  },

  /* ---- враги ---- */
  addSoldier(x: number, z: number): void {
    const group = new THREE.Group();
    const uniform = new THREE.MeshLambertMaterial({ color: 0x4c5a35 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.1, 8), uniform);
    body.position.y = 0.75;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshLambertMaterial({ color: 0xd8a878 }));
    head.position.y = 1.45;
    group.add(head);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.9), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    gun.position.set(0.22, 0.9, 0.2);
    group.add(gun);
    group.position.set(x, 0, z);
    this.scene.add(group);

    this.enemies.push({
      kind: 'soldier', group, turret: group,
      basePos: { x, z }, amp: droneRandRange(4, 9), axis: Math.random() < 0.5 ? 'x' : 'z',
      phase: Math.random() * Math.PI * 2, speedFactor: droneRandRange(0.25, 0.45),
      fireRange: 80, fireCooldown: droneRandRange(1, 3),
      fireCooldownRange: [1.4, 2.8], bulletSpeed: 42, bulletDamage: 7,
      bulletColor: 0xfff07a, spread: 0.05, collideRadius: 0.9,
    });
  },

  addTank(x: number, z: number): void {
    const group = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 3.6), new THREE.MeshLambertMaterial({ color: 0x4a5a3a }));
    hull.position.y = 0.55;
    group.add(hull);
    const turretGroup = new THREE.Group();
    turretGroup.position.set(0, 1.05, 0);
    const turretBody = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.6, 8), new THREE.MeshLambertMaterial({ color: 0x3d4a30 }));
    turretGroup.add(turretBody);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.2, 8), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.1, -1.3);
    turretGroup.add(barrel);
    group.add(turretGroup);
    group.position.set(x, 0, z);
    this.scene.add(group);

    this.obstacles.push({ x, z, radius: 2.4, height: 2.2 });
    this.enemies.push({
      kind: 'tank', group, turret: turretGroup,
      basePos: { x, z }, amp: droneRandRange(3, 6), axis: Math.random() < 0.5 ? 'x' : 'z',
      phase: Math.random() * Math.PI * 2, speedFactor: 0.08,
      fireRange: 150, fireCooldown: droneRandRange(2, 4),
      fireCooldownRange: [3.5, 5.2], bulletSpeed: 58, bulletDamage: 28,
      bulletColor: 0xff8a3d, spread: 0.02, collideRadius: 2.2,
    });
  },

  addTruck(x: number, z: number, armed: boolean): void {
    const group = new THREE.Group();
    const bodyColor = armed ? 0x8a7a4a : [0xb03a3a, 0x3a5fb0, 0xc9c9c9, 0x3a8a4a][Math.floor(Math.random() * 4)];
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 3.4), new THREE.MeshLambertMaterial({ color: bodyColor }));
    hull.position.y = 0.65;
    group.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.1), new THREE.MeshLambertMaterial({ color: 0xdedede }));
    cabin.position.set(0, 1.25, 1.1);
    group.add(cabin);
    let turret: any = null;
    if (armed) {
      turret = new THREE.Group();
      turret.position.set(0, 1.25, -0.6);
      const mg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 6), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
      mg.rotation.x = Math.PI / 2;
      mg.position.z = -0.6;
      turret.add(mg);
      const gunner = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), new THREE.MeshLambertMaterial({ color: 0x4c5a35 }));
      turret.add(gunner);
      group.add(turret);
    }
    group.position.set(x, 0, z);
    group.rotation.y = Math.PI / 2;
    this.scene.add(group);

    this.obstacles.push({ x, z, radius: 1.8, height: 1.8 });
    if (armed) {
      this.enemies.push({
        kind: 'truck', group, turret,
        basePos: { x, z }, amp: 130, axis: 'z',
        phase: 0, speedFactor: 0.5,
        fireRange: 95, fireCooldown: droneRandRange(1.5, 3),
        fireCooldownRange: [0.9, 1.7], bulletSpeed: 48, bulletDamage: 11,
        bulletColor: 0xffe08a, spread: 0.06, collideRadius: 1.6,
      });
    } else {
      this.enemies.push({
        kind: 'truck', group, turret: null,
        basePos: { x, z }, amp: 130, axis: 'z',
        phase: 0, speedFactor: 0.35,
        fireRange: 0, fireCooldown: 999, fireCooldownRange: [999, 999],
        bulletSpeed: 0, bulletDamage: 0, bulletColor: 0, spread: 0, collideRadius: 1.6,
      });
    }
  },

  /* =========================================================
     ИГРОВОЙ ЦИКЛ
  ========================================================= */
  loop(now: number): void {
    if (!this.running) return;
    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;
    dt = Math.min(dt, 0.05);

    if (!this.paused) this.update(dt);
    this.render();
    this._rafId = requestAnimationFrame(t => this.loop(t));
  },

  stopLoop(): void {
    this.running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  },

  readInput(): { yaw: number; forward: number; vertical: number } {
    let yaw = 0, forward = 0, vertical = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) yaw += 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) yaw -= 1;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) forward += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) forward -= 1;
    if (this.keys['Space']) vertical += 1;
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyC']) vertical -= 1;

    if (this.joyLeft.active) {
      yaw += droneClamp(-this.joyLeft.x, -1, 1);
      forward += droneClamp(-this.joyLeft.y, -1, 1);
    }
    if (this.joyRight.active) {
      vertical += droneClamp(-this.joyRight.y, -1, 1);
    }
    return { yaw: droneClamp(yaw, -1, 1), forward: droneClamp(forward, -1, 1), vertical: droneClamp(vertical, -1, 1) };
  },

  update(dt: number): void {
    if (this.dead) { this.updateFx(dt); return; }

    const model = DRONE_MODELS[this.selectedModel];
    const input = this.readInput();

    // манёвр
    this.yaw += input.yaw * model.turn * dt;
    const targetSpeed = input.forward * model.speed * (this.battery > 0 ? 1 : 0.2);
    this.velForward = droneApproach(this.velForward, targetSpeed, model.accel * dt);

    let vInput = input.vertical;
    if (this.battery <= 0) vInput = -1; // движок заглох — падаем
    const targetV = vInput * model.climb;
    this.velVertical = droneApproach(this.velVertical, targetV, model.climb * 2.6 * dt);

    this.prevPos.copy(this.pos);
    const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.pos.addScaledVector(dir, this.velForward * dt);
    this.pos.y += this.velVertical * dt;

    if (this.pos.y > 2.2 && !this.hasTakenOff) {
      this.hasTakenOff = true;
      const hint = document.getElementById('droneHint');
      if (hint) hint.classList.add('hidden-hint');
    }
    if (this.pos.y < 0.5) this.pos.y = 0.5;

    this.droneGroup.position.copy(this.pos);
    this.droneGroup.rotation.y = this.yaw;
    this.droneGroup.rotation.z = -input.yaw * 0.25;
    this.droneGroup.rotation.x = -input.forward * 0.18;

    const spin = (this.battery > 0 ? 1 : 0.3) * dt * 45;
    this.rotors.forEach((r: any) => { r.rotation.y += spin; });

    // батарея и статистика
    if (this.battery > 0) {
      const drainMul = input.vertical > 0 ? 1.4 : (input.vertical < 0 ? 0.7 : 1);
      this.battery = Math.max(0, this.battery - this.batteryDrainPerSec * drainMul * dt);
    }
    if (this.hasTakenOff) {
      this.timeAlive += dt;
      this.distance += this.pos.distanceTo(this.prevPos);
    }

    // столкновение с землёй после взлёта
    if (this.hasTakenOff && this.pos.y <= 0.5 && this.velVertical <= 0) {
      this.explode(this.battery <= 0 ? 'Кончился заряд батареи — дрон рухнул' : 'Дрон врезался в землю');
      return;
    }
    // выход за пределы игрового поля
    if (Math.abs(this.pos.x) > 260 || this.pos.z > 90 || this.pos.z < -470) {
      this.explode('Дрон улетел за пределы зоны полёта');
      return;
    }

    this.checkObstacleCollisions(model.size * 0.7);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateCamera(dt);
    this.updateFx(dt);
    this.updateHud();

    if (this.hp <= 0) { this.explode('Дрон сбит вражеским огнём'); return; }
  },

  checkObstacleCollisions(droneRadius: number): void {
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
      const distSq = dx * dx + dz * dz;
      const rr = (o.radius + droneRadius);
      if (distSq < rr * rr && this.pos.y < o.height) {
        this.explode('Дрон врезался в препятствие');
        return;
      }
    }
  },

  updateEnemies(dt: number): void {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      e.phase += dt * e.speedFactor;
      const off = Math.sin(e.phase) * e.amp;
      if (e.axis === 'x') e.group.position.x = e.basePos.x + off;
      else e.group.position.z = e.basePos.z + off;

      if (e.turret && e.fireRange > 0) {
        const dx = this.pos.x - e.turret.getWorldPosition(new THREE.Vector3()).x;
        const dz = this.pos.z - e.turret.getWorldPosition(new THREE.Vector3()).z;
        const targetAngle = Math.atan2(dx, dz);
        // плавный доворот башни/пулемёта на цель
        let cur = e.turret.rotation.y;
        let diff = targetAngle - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        e.turret.rotation.y = cur + droneClamp(diff, -dt * 3, dt * 3);
      }

      if (e.fireRange <= 0) continue;
      const dist = Math.hypot(this.pos.x - e.group.position.x, this.pos.z - e.group.position.z);
      e.fireCooldown -= dt;
      if (dist < e.fireRange && e.fireCooldown <= 0 && this.pos.y > 0.6) {
        this.fireBullet(e);
        e.fireCooldown = droneRandRange(e.fireCooldownRange[0], e.fireCooldownRange[1]);
      }
    }
  },

  fireBullet(e: DroneEnemy): void {
    const origin = e.group.position.clone();
    origin.y += e.kind === 'soldier' ? 1.2 : (e.kind === 'tank' ? 1.5 : 1.3);
    const target = this.pos.clone();
    target.x += droneRandRange(-e.spread, e.spread) * 10;
    target.y += droneRandRange(-e.spread, e.spread) * 10;
    target.z += droneRandRange(-e.spread, e.spread) * 10;
    const dir = target.sub(origin).normalize();
    const geo = new THREE.SphereGeometry(e.kind === 'tank' ? 0.22 : 0.1, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: e.bulletColor });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.bullets.push({ mesh, vel: dir.multiplyScalar(e.bulletSpeed), life: 6, damage: e.bulletDamage, radius: e.kind === 'tank' ? 1.1 : 0.55 });
    if (typeof SoundManager !== 'undefined' && SoundManager.playBad) SoundManager.playBad();
  },

  updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.mesh.position.addScaledVector(b.vel, dt);
      b.life -= dt;
      const dist = b.mesh.position.distanceTo(this.pos);
      let hit = false;
      if (dist < b.radius) {
        this.hp -= b.damage;
        hit = true;
        this.spawnHitFx(b.mesh.position);
      }
      if (hit || b.life <= 0 || b.mesh.position.y < 0) {
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
  },

  updateCamera(dt: number): void {
    const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-6.5);
    const desired = this.pos.clone().add(back).add(new THREE.Vector3(0, 2.8, 0));
    const lerp = 1 - Math.pow(0.001, dt);
    this.camChasePos.lerp(desired, lerp);
    this.camLookPos.lerp(this.pos, lerp);
    this.camera.position.copy(this.camChasePos);
    this.camera.lookAt(this.camLookPos.x, this.camLookPos.y + 0.4, this.camLookPos.z);
  },

  updateHud(): void {
    const hpFill = document.getElementById('droneHpFill');
    if (hpFill) (hpFill as HTMLElement).style.width = Math.max(0, this.hp / this.maxHp * 100) + '%';
    const battFill = document.getElementById('droneBattFill');
    if (battFill) (battFill as HTMLElement).style.width = Math.max(0, this.battery) + '%';
    const timeEl = document.getElementById('droneTimeValue');
    if (timeEl) timeEl.textContent = String(Math.floor(this.timeAlive));
    const distEl = document.getElementById('droneDistValue');
    if (distEl) distEl.textContent = String(Math.floor(this.distance));
    const altEl = document.getElementById('droneAltValue');
    if (altEl) altEl.textContent = String(Math.max(0, Math.floor(this.pos.y)));
  },

  /* ---- частицы: попадание и взрыв ---- */
  spawnHitFx(pos: any): void {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffd35c }));
      m.position.copy(pos);
      const vel = new THREE.Vector3(droneRandRange(-3, 3), droneRandRange(0, 3), droneRandRange(-3, 3));
      this.scene.add(m);
      this.fx.push({ mesh: m, vel, life: 0.35, spin: false });
    }
  },
  spawnExplosionFx(pos: any): void {
    for (let i = 0; i < 26; i++) {
      const color = Math.random() < 0.5 ? 0xff8a3d : 0x555555;
      const m = new THREE.Mesh(new THREE.SphereGeometry(droneRandRange(0.08, 0.22), 5, 5), new THREE.MeshBasicMaterial({ color }));
      m.position.copy(pos);
      const vel = new THREE.Vector3(droneRandRange(-6, 6), droneRandRange(1, 8), droneRandRange(-6, 6));
      this.scene.add(m);
      this.fx.push({ mesh: m, vel, life: droneRandRange(0.6, 1.1), spin: true });
    }
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.9 }));
    flash.position.copy(pos);
    this.scene.add(flash);
    this.fx.push({ mesh: flash, vel: new THREE.Vector3(0, 0, 0), life: 0.4, spin: false, growTo: 5 });
  },
  updateFx(dt: number): void {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const p = this.fx[i];
      p.life -= dt;
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.growTo) {
        const k = 1 - Math.max(0, p.life) / 0.4;
        const s = 1 + k * p.growTo;
        p.mesh.scale.setScalar(s);
        p.mesh.material.opacity = Math.max(0, p.life / 0.4) * 0.9;
      }
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.fx.splice(i, 1);
      }
    }
  },

  explode(reason: string): void {
    if (this.dead) return;
    this.dead = true;
    this.spawnExplosionFx(this.pos.clone());
    if (typeof SoundManager !== 'undefined' && SoundManager.playBomb) SoundManager.playBomb();
    this.droneGroup.visible = false;

    setTimeout(() => {
      this.running = false;
      const reasonEl = document.getElementById('droneDeathReason');
      if (reasonEl) reasonEl.textContent = reason;
      const timeEl = document.getElementById('droneFinalTime');
      if (timeEl) timeEl.textContent = String(Math.floor(this.timeAlive));
      const distEl = document.getElementById('droneFinalDist');
      if (distEl) distEl.textContent = String(Math.floor(this.distance));

      let best = 0;
      try { best = parseFloat(localStorage.getItem('drone_best_distance') || '0') || 0; } catch (e) { best = 0; }
      const newRecordEl = document.getElementById('droneNewRecordText');
      if (this.distance > best) {
        try { localStorage.setItem('drone_best_distance', String(Math.floor(this.distance))); } catch (e) { /* ignore */ }
        if (newRecordEl) droneShow(newRecordEl);
      } else if (newRecordEl) droneHide(newRecordEl);

      droneShow(document.getElementById('droneGameOverOverlay'));
    }, 900);
  },

  /* =========================================================
     РЕНДЕР / РАЗМЕР
  ========================================================= */
  render(): void {
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  },

  fitCanvas(): void {
    const wrap = document.getElementById('droneGameWrap');
    const canvas = document.getElementById('droneCanvas') as HTMLCanvasElement | null;
    if (!wrap || !canvas || wrap.classList.contains('hidden') || !this.renderer) return;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const wrapTop = wrap.getBoundingClientRect().top;
    const mainEl = document.querySelector('main');
    const mainPadBottom = mainEl ? (parseFloat(getComputedStyle(mainEl).paddingBottom) || 0) : 0;
    const wrapMarginBottom = parseFloat(getComputedStyle(wrap as HTMLElement).marginBottom) || 0;
    const available = Math.max(0, vh - wrapTop - mainPadBottom - wrapMarginBottom - 8);
    const height = Math.max(320, available);
    const rect = wrap.getBoundingClientRect();
    (wrap as HTMLElement).style.height = height + 'px';
    this.renderer.setSize(rect.width, height, true);
    if (this.camera) { this.camera.aspect = rect.width / height; this.camera.updateProjectionMatrix(); }
  },

  /* =========================================================
     ОЧИСТКА СЦЕНЫ (при выходе/рестарте — освобождаем WebGL-контекст)
  ========================================================= */
  destroyScene(): void {
    if (this.scene) {
      this.scene.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    if (this.renderer) this.renderer.dispose();
    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.droneGroup = null;
    this.obstacles = [];
    this.enemies = [];
    this.bullets = [];
    this.fx = [];
  },
};

// делаем DroneGame доступным как window.DroneGame — иначе `if(window.DroneGame)`
// в script.js всегда ложно (top-level const не создаёт window-свойство).
(window as any).DroneGame = DroneGame;

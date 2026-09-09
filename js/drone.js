"use strict";
/* =========================================================
   ДРОН-РАЗВЕДЧИК — 3D аркадный полёт на Three.js.
   ---------------------------------------------------------
   Идея: игрок появляется в лесополосе на краю открытого поля,
   взлетает на дроне (модель + заряд батареи выбираются заранее)
   и свободно летает. По полю ходят солдаты, ездят машины,
   грузовики с пулемётом и стоят/патрулируют танки — они не
   декорация: заметив дрон, они стреляют по нему издалека.
   Дрон может нести учебную игровую бомбу: её можно сбросить с воздуха,
   чтобы поразить наземные цели и получить очки. Есть и отдельный
   режим «Камикадзе» — одноразовый дрон, который при активации
   совершает короткий рывок и взрывается. Всё это работает только
   внутри игровой симуляции и не связано с реальным управлением дроном.

   Three.js подключается как глобальный UMD-скрипт (r128, тот же
   способ, что используется для WebGL-виджетов на сайте) прямо
   в index.html, ПЕРЕД этим файлом — поэтому здесь достаточно
   объявить его для компилятора через declare, без npm-пакета
   @types/three (в проекте вообще нет сборщика, см. package.json).
========================================================= */
const DRONE_MODELS = {
    scout: { name: 'Скаут', color: 0x6FB7E8, maxHp: 55, speed: 27, climb: 15, turn: 2.7, accel: 30, size: 0.85 },
    balanced: { name: 'Баланс', color: 0xF2B705, maxHp: 100, speed: 21, climb: 11, turn: 2.0, accel: 22, size: 1.0 },
    heavy: { name: 'Танк', color: 0x5E7A4D, maxHp: 165, speed: 15, climb: 8, turn: 1.35, accel: 15, size: 1.25 },
};
const DRONE_CHARGES = {
    s: { name: 'Малый', seconds: 40, weight: 1.15 },
    m: { name: 'Средний', seconds: 75, weight: 1.0 },
    l: { name: 'Большой', seconds: 120, weight: 0.85 },
};
const DRONE_LOADOUTS = {
    bomb: { name: 'Бомба', bombs: 5, radius: 10, damage: 55, score: 100 },
    kamikaze: { name: 'Камикадзе', bombs: 1, radius: 13, damage: 90, score: 180, oneShot: true },
};
/* =========================================================
   3D-МОДЕЛИ ДРОНОВ И БОЕПРИПАСОВ (GLB, папка /models)
   ---------------------------------------------------------
   Для боевого модуля «Бомба» дрон визуально заменяется на
   модель из папки «drones with a grenade», а сбрасываемый
   заряд — на модель гранаты оттуда же. Для «Камикадзе»
   игрок выбирает одну из 4 моделей из папки «kamikaze drones».
========================================================= */
const DRONE_GLB_BOMB_LOADOUT = {
    drone: 'models/drones with a grenade/fpv_drone.glb',
    bomb: 'models/drones with a grenade/grenade_f1.glb',
};
const KAMIKAZE_DRONE_MODELS = {
    combat: { name: 'Комбат', file: 'models/kamikaze drones/combat__fpv_drone.glb' },
    fpv: { name: 'FPV дрон', file: 'models/kamikaze drones/fpv_drone.glb' },
    fpv3d: { name: 'FPV 3D-модель', file: 'models/kamikaze drones/fpv_drone_3d_model.glb' },
    realistic: { name: 'Реалистичный', file: 'models/kamikaze drones/realistic_fpv_kamikaze_drone.glb' },
};
/* =========================================================
   МЕЛКИЕ УТИЛИТЫ
========================================================= */
function droneShow(el) { if (el)
    el.classList.remove('hidden'); }
function droneHide(el) { if (el)
    el.classList.add('hidden'); }
function droneApproach(current, target, maxDelta) {
    if (Math.abs(target - current) <= maxDelta)
        return target;
    return current + Math.sign(target - current) * maxDelta;
}
function droneRandRange(a, b) { return a + Math.random() * (b - a); }
function droneClamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
/* =========================================================
   ОСНОВНОЙ ОБЪЕКТ ИГРЫ
========================================================= */
const DroneGame = {
    // ---- выбор перед вылетом ----
    selectedModel: 'balanced',
    selectedCharge: 'm',
    selectedLoadout: 'bomb',
    selectedKamikazeModel: 'combat',
    _gltfCache: {},
    // ---- three.js ----
    renderer: null,
    scene: null,
    camera: null,
    droneGroup: null,
    rotors: [],
    // ---- состояние полёта ----
    running: false,
    paused: false,
    dead: false,
    hasTakenOff: false,
    hintHidden: false,
    hp: 100,
    maxHp: 100,
    battery: 100, // в процентах
    batteryDrainPerSec: 1, // %/с при обычном режиме, задаётся из выбранного заряда
    velForward: 0,
    velVertical: 0,
    yaw: 0,
    pos: null, // THREE.Vector3
    prevPos: null,
    timeAlive: 0,
    distance: 0,
    camChasePos: null,
    camLookPos: null,
    obstacles: [], // деревья + техника-помеха (только коллизия)
    enemies: [],
    bullets: [],
    bombs: [],
    fx: [], // временные частицы
    score: 0,
    bombsLeft: 5,
    kamikazeArmed: false,
    keys: {},
    joyLeft: { active: false, x: 0, y: 0, id: -1 },
    joyRight: { active: false, x: 0, y: 0, id: -1 },
    _rafId: 0,
    _lastTime: 0,
    /* =========================================================
       ИНИЦИАЛИЗАЦИЯ UI (вызывается один раз из script.js)
    ========================================================= */
    init() {
        this.bindSetupUI();
        this.bindGameUI();
        this.bindKeyboard();
        this.bindJoysticks();
        window.addEventListener('resize', () => this.fitCanvas());
        window.addEventListener('orientationchange', () => setTimeout(() => this.fitCanvas(), 200));
    },
    bindSetupUI() {
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
        document.querySelectorAll('#droneModelGrid .drone-pick').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#droneModelGrid .drone-pick').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedModel = btn.dataset.model || 'balanced';
            });
        });
        document.querySelectorAll('#droneChargeGrid .drone-pick').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#droneChargeGrid .drone-pick').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedCharge = btn.dataset.charge || 'm';
            });
        });
        document.querySelectorAll('#droneLoadoutGrid .drone-pick').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#droneLoadoutGrid .drone-pick').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedLoadout = btn.dataset.loadout || 'bomb';
                this.updateKamikazeModelVisibility();
            });
        });
        document.querySelectorAll('#droneKamikazeModelGrid .drone-pick').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#droneKamikazeModelGrid .drone-pick').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedKamikazeModel = btn.dataset.kamikazeModel || 'combat';
            });
        });
        this.updateKamikazeModelVisibility();
        const takeoffBtn = document.getElementById('droneTakeoffToSceneBtn');
        if (takeoffBtn)
            takeoffBtn.addEventListener('click', () => this.startFlight());
    },
    bindGameUI() {
        const exitBtn = document.getElementById('droneExitBtn');
        if (exitBtn)
            exitBtn.addEventListener('click', () => this.exitToSetup());
        const pauseBtn = document.getElementById('dronePauseBtn');
        if (pauseBtn)
            pauseBtn.addEventListener('click', () => this.setPaused(true));
        const bombBtn = document.getElementById('droneBombBtn');
        if (bombBtn)
            bombBtn.addEventListener('click', () => this.usePayload());
        const resumeBtn = document.getElementById('droneResumeBtn');
        if (resumeBtn)
            resumeBtn.addEventListener('click', () => this.setPaused(false));
        const pauseExitBtn = document.getElementById('dronePauseExitBtn');
        if (pauseExitBtn)
            pauseExitBtn.addEventListener('click', () => this.exitToSetup());
        const restartBtn = document.getElementById('droneRestartBtn');
        if (restartBtn)
            restartBtn.addEventListener('click', () => this.startFlight());
        const goMenuBtn = document.getElementById('droneGoMenuBtn');
        if (goMenuBtn)
            goMenuBtn.addEventListener('click', () => this.exitToSetup());
    },
    updateKamikazeModelVisibility() {
        const wrap = document.getElementById('droneKamikazeModelWrap');
        if (!wrap)
            return;
        if (this.selectedLoadout === 'kamikaze')
            droneShow(wrap);
        else
            droneHide(wrap);
    },
    /* =========================================================
       ЗАГРУЗКА GLB-МОДЕЛЕЙ (дроны и боеприпасы из папки /models)
    ========================================================= */
    loadGLTFModel(path) {
        if (!this._gltfCache)
            this._gltfCache = {};
        if (this._gltfCache[path])
            return this._gltfCache[path];
        if (typeof THREE.GLTFLoader === 'undefined') {
            return Promise.reject(new Error('GLTFLoader недоступен'));
        }
        const loader = new THREE.GLTFLoader();
        const promise = new Promise((resolve, reject) => {
            loader.load(encodeURI(path), (gltf) => resolve(gltf.scene), undefined, reject);
        });
        this._gltfCache[path] = promise;
        return promise;
    },
    // Подгоняет размер и центр загруженной GLB-сцены под игровые габариты
    // и разворачивает её носом по -Z (как у процедурной модели-заглушки).
    fitGlbVisual(scene, targetSize) {
        const visual = scene.clone(true);
        visual.rotation.y = Math.PI;
        visual.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(visual);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const fitScale = targetSize / maxDim;
        visual.scale.setScalar(fitScale);
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(fitScale);
        visual.position.sub(center);
        return visual;
    },
    getSelectedDroneGlbPath() {
        if (this.selectedLoadout === 'kamikaze') {
            const km = KAMIKAZE_DRONE_MODELS[this.selectedKamikazeModel] || KAMIKAZE_DRONE_MODELS.combat;
            return km.file;
        }
        return DRONE_GLB_BOMB_LOADOUT.drone;
    },
    // Асинхронно подменяет процедурного дрона-заглушку загруженной GLB-моделью.
    loadDroneVisual(targetGroup, scale) {
        const path = this.getSelectedDroneGlbPath();
        this.loadGLTFModel(path).then((scene) => {
            // сцена могла смениться (рестарт/выход), пока модель качалась
            if (!this.scene || this.droneGroup !== targetGroup)
                return;
            const visual = this.fitGlbVisual(scene, scale * 1.1);
            targetGroup.children.slice().forEach((c) => targetGroup.remove(c));
            targetGroup.add(visual);
            this.rotors = [];
        }).catch(() => {
            // не удалось загрузить модель — остаётся процедурная заглушка
        });
    },
    // Асинхронно подменяет плейсхолдер-сферу бомбы моделью гранаты.
    attachGrenadeVisual(bombGroup, placeholder) {
        this.loadGLTFModel(DRONE_GLB_BOMB_LOADOUT.bomb).then((scene) => {
            if (!bombGroup.parent)
                return; // бомба уже взорвалась/удалена со сцены
            const visual = this.fitGlbVisual(scene, 0.42);
            if (placeholder && placeholder.parent)
                bombGroup.remove(placeholder);
            bombGroup.add(visual);
        }).catch(() => {
            // не удалось загрузить модель — остаётся плейсхолдер-сфера
        });
    },
    setPaused(p) {
        if (!this.running || this.dead)
            return;
        this.paused = p;
        if (p)
            droneShow(document.getElementById('dronePauseOverlay'));
        else
            droneHide(document.getElementById('dronePauseOverlay'));
    },
    exitToSetup() {
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
    bindKeyboard() {
        document.addEventListener('keydown', e => {
            const wrap = document.getElementById('droneGameWrap');
            if (!wrap || wrap.classList.contains('hidden'))
                return;
            if (e.code === 'Escape') {
                this.setPaused(!this.paused);
                return;
            }
            if (e.code === 'Space')
                e.preventDefault();
            if (e.code === 'KeyB') {
                e.preventDefault();
                this.usePayload();
                return;
            }
            this.keys[e.code] = true;
        });
        document.addEventListener('keyup', e => { this.keys[e.code] = false; });
    },
    /* =========================================================
       ВИРТУАЛЬНЫЕ СТИКИ (телефон)
    ========================================================= */
    bindJoysticks() {
        this.setupOneJoystick('droneJoyLeft', 'droneJoyLeftStick', this.joyLeft);
        this.setupOneJoystick('droneJoyRight', 'droneJoyRightStick', this.joyRight);
    },
    setupOneJoystick(baseId, stickId, state) {
        const base = document.getElementById(baseId);
        const stick = document.getElementById(stickId);
        if (!base || !stick)
            return;
        const R = 40; // максимальное смещение стика в px
        const onStart = (e) => {
            e.preventDefault();
            const t = e.changedTouches[0];
            state.active = true;
            state.id = t.identifier;
            state.x = 0;
            state.y = 0;
        };
        const onMove = (e) => {
            if (!state.active)
                return;
            let touch = null;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === state.id)
                    touch = e.changedTouches[i];
            }
            if (!touch)
                return;
            e.preventDefault();
            const rect = base.getBoundingClientRect();
            const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
            let dx = touch.clientX - cx, dy = touch.clientY - cy;
            const len = Math.hypot(dx, dy);
            const max = rect.width / 2;
            if (len > max) {
                dx = dx / len * max;
                dy = dy / len * max;
            }
            state.x = droneClamp(dx / max, -1, 1);
            state.y = droneClamp(dy / max, -1, 1);
            stick.style.transform = `translate(${dx / max * R}px, ${dy / max * R}px)`;
        };
        const onEnd = (e) => {
            let ended = false;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === state.id)
                    ended = true;
            }
            if (!ended)
                return;
            state.active = false;
            state.x = 0;
            state.y = 0;
            stick.style.transform = 'translate(0,0)';
        };
        base.addEventListener('touchstart', onStart, { passive: false });
        base.addEventListener('touchmove', onMove, { passive: false });
        base.addEventListener('touchend', onEnd, { passive: false });
        base.addEventListener('touchcancel', onEnd, { passive: false });
    },
    /* =========================================================
       ПОСТРОЕНИЕ СЦЕНЫ
    ========================================================= */
    startFlight() {
        droneHide(document.getElementById('droneSetupPanel'));
        droneShow(document.getElementById('droneGameWrap'));
        droneHide(document.getElementById('droneGameOverOverlay'));
        droneHide(document.getElementById('dronePauseOverlay'));
        const hint = document.getElementById('droneHint');
        if (hint)
            hint.classList.remove('hidden-hint');
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
    resetFlightState() {
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
        this.score = 0;
        this.bombsLeft = DRONE_LOADOUTS[this.selectedLoadout].bombs;
        this.kamikazeArmed = false;
        this.hasTakenOff = false;
        const payloadBtn = document.getElementById('droneBombBtn');
        if (payloadBtn) {
            payloadBtn.disabled = false;
            payloadBtn.textContent = this.selectedLoadout === 'kamikaze'
                ? '💥 Активировать камикадзе [B]'
                : '💣 Сбросить бомбу [B]';
        }
        this.hintHidden = false;
    },
    buildScene() {
        const model = DRONE_MODELS[this.selectedModel];
        const charge = DRONE_CHARGES[this.selectedCharge];
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x9fd6ec);
        scene.fog = new THREE.Fog(0x9fd6ec, 90, 420);
        this.scene = scene;
        const canvas = document.getElementById('droneCanvas');
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
        this.bombs = [];
        this.fx = [];
        // дороги
        const roadXs = [-70, 30, 110];
        const roadMat = new THREE.MeshLambertMaterial({ color: 0x555a5e });
        roadXs.forEach((rx) => {
            const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 420), roadMat);
            road.rotation.x = -Math.PI / 2;
            road.position.set(rx, 0.02, -170);
            scene.add(road);
        });
        // лесополоса вокруг точки старта (z от 5 до 55), плюс редкие деревья дальше в поле
        for (let i = 0; i < 160; i++) {
            const x = droneRandRange(-230, 230);
            const nearRoad = roadXs.some((rx) => Math.abs(x - rx) < 7);
            if (nearRoad)
                continue;
            const z = droneRandRange(4, 58);
            this.addTree(x, z);
        }
        for (let i = 0; i < 35; i++) {
            const x = droneRandRange(-230, 230);
            const nearRoad = roadXs.some((rx) => Math.abs(x - rx) < 7);
            if (nearRoad)
                continue;
            const z = droneRandRange(-420, -20);
            if (Math.random() < 0.55)
                this.addTree(x, z);
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
        // дрон: сначала процедурная заглушка (мгновенно доступна), затем
        // асинхронно подменяется настоящей GLB-моделью из папки /models.
        this.droneGroup = this.buildDroneMesh(model.color, model.size);
        this.pos = new THREE.Vector3(0, 0.55, 26);
        this.prevPos = this.pos.clone();
        this.yaw = Math.PI; // смотрим в поле (в сторону -Z)
        this.droneGroup.position.copy(this.pos);
        this.droneGroup.rotation.y = this.yaw;
        scene.add(this.droneGroup);
        this.loadDroneVisual(this.droneGroup, model.size);
        this.camChasePos = this.pos.clone();
        this.camLookPos = this.pos.clone();
        void charge; // используется через batteryDrainPerSec, но оставим для читаемости
    },
    makeGroundTexture() {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 256;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#6fa84f';
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 260; i++) {
            const shade = Math.random() < 0.5 ? 'rgba(90,150,60,0.35)' : 'rgba(60,110,45,0.3)';
            ctx.fillStyle = shade;
            const x = Math.random() * 256, y = Math.random() * 256, r = 4 + Math.random() * 10;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(120, 120);
        return tex;
    },
    addTree(x, z) {
        const group = new THREE.Group();
        const h = droneRandRange(3.2, 5.5);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, h * 0.4, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2c }));
        trunk.position.y = h * 0.2;
        group.add(trunk);
        const leafColor = Math.random() < 0.5 ? 0x2f7a3a : 0x3d8a45;
        for (let i = 0; i < 3; i++) {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6 - i * 0.35, 1.9, 7), new THREE.MeshLambertMaterial({ color: leafColor }));
            cone.position.y = h * 0.42 + i * 1.05;
            group.add(cone);
        }
        group.position.set(x, 0, z);
        group.rotation.y = Math.random() * Math.PI * 2;
        this.scene.add(group);
        this.obstacles.push({ x, z, radius: 1.1, height: h + 2 });
    },
    buildDroneMesh(color, scale) {
        const group = new THREE.Group();
        const bodyMat = new THREE.MeshLambertMaterial({ color });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.6), bodyMat);
        group.add(body);
        const armMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const rotorMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
        this.rotors = [];
        const offsets = [[0.55, 0.55], [-0.55, 0.55], [0.55, -0.55], [-0.55, -0.55]];
        offsets.forEach((o) => {
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
    addSoldier(x, z) {
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
            hp: 25, score: 100, destroyed: false,
        });
    },
    addTank(x, z) {
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
        const tankObstacle = { x, z, radius: 2.4, height: 2.2, destroyed: false };
        this.obstacles.push(tankObstacle);
        this.enemies.push({
            kind: 'tank', group, turret: turretGroup,
            basePos: { x, z }, amp: droneRandRange(3, 6), axis: Math.random() < 0.5 ? 'x' : 'z',
            phase: Math.random() * Math.PI * 2, speedFactor: 0.08,
            fireRange: 150, fireCooldown: droneRandRange(2, 4),
            fireCooldownRange: [3.5, 5.2], bulletSpeed: 58, bulletDamage: 28,
            bulletColor: 0xff8a3d, spread: 0.02, collideRadius: 2.2,
            hp: 90, score: 300, destroyed: false, obstacle: tankObstacle,
        });
    },
    addTruck(x, z, armed) {
        const group = new THREE.Group();
        const bodyColor = armed ? 0x8a7a4a : [0xb03a3a, 0x3a5fb0, 0xc9c9c9, 0x3a8a4a][Math.floor(Math.random() * 4)];
        const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 3.4), new THREE.MeshLambertMaterial({ color: bodyColor }));
        hull.position.y = 0.65;
        group.add(hull);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.1), new THREE.MeshLambertMaterial({ color: 0xdedede }));
        cabin.position.set(0, 1.25, 1.1);
        group.add(cabin);
        let turret = null;
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
        const truckObstacle = { x, z, radius: 1.8, height: 1.8, destroyed: false };
        this.obstacles.push(truckObstacle);
        if (armed) {
            this.enemies.push({
                kind: 'truck', group, turret,
                basePos: { x, z }, amp: 130, axis: 'z',
                phase: 0, speedFactor: 0.5,
                fireRange: 95, fireCooldown: droneRandRange(1.5, 3),
                fireCooldownRange: [0.9, 1.7], bulletSpeed: 48, bulletDamage: 11,
                bulletColor: 0xffe08a, spread: 0.06, collideRadius: 1.6,
            });
        }
        else {
            this.enemies.push({
                kind: 'truck', group, turret: null,
                basePos: { x, z }, amp: 130, axis: 'z',
                phase: 0, speedFactor: 0.35,
                fireRange: 0, fireCooldown: 999, fireCooldownRange: [999, 999],
                bulletSpeed: 0, bulletDamage: 0, bulletColor: 0, spread: 0, collideRadius: 1.6,
                hp: 45, score: 0, destroyed: false, obstacle: truckObstacle,
            });
        }
    },
    /* =========================================================
       ИГРОВОЙ ЦИКЛ
    ========================================================= */
    loop(now) {
        if (!this.running)
            return;
        let dt = (now - this._lastTime) / 1000;
        this._lastTime = now;
        dt = Math.min(dt, 0.05);
        if (!this.paused)
            this.update(dt);
        this.render();
        this._rafId = requestAnimationFrame(t => this.loop(t));
    },
    stopLoop() {
        this.running = false;
        if (this._rafId)
            cancelAnimationFrame(this._rafId);
    },
    readInput() {
        let yaw = 0, forward = 0, vertical = 0;
        if (this.keys['KeyA'] || this.keys['ArrowLeft'])
            yaw += 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight'])
            yaw -= 1;
        if (this.keys['KeyW'] || this.keys['ArrowUp'])
            forward += 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown'])
            forward -= 1;
        if (this.keys['Space'])
            vertical += 1;
        if (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyC'])
            vertical -= 1;
        if (this.joyLeft.active) {
            yaw += droneClamp(-this.joyLeft.x, -1, 1);
            forward += droneClamp(-this.joyLeft.y, -1, 1);
        }
        if (this.joyRight.active) {
            vertical += droneClamp(-this.joyRight.y, -1, 1);
        }
        return { yaw: droneClamp(yaw, -1, 1), forward: droneClamp(forward, -1, 1), vertical: droneClamp(vertical, -1, 1) };
    },
    update(dt) {
        if (this.dead) {
            this.updateFx(dt);
            return;
        }
        const model = DRONE_MODELS[this.selectedModel];
        const input = this.readInput();
        // манёвр
        this.yaw += input.yaw * model.turn * dt;
        const targetSpeed = input.forward * model.speed * (this.battery > 0 ? 1 : 0.2);
        this.velForward = droneApproach(this.velForward, targetSpeed, model.accel * dt);
        let vInput = input.vertical;
        if (this.battery <= 0)
            vInput = -1; // движок заглох — падаем
        const targetV = vInput * model.climb;
        this.velVertical = droneApproach(this.velVertical, targetV, model.climb * 2.6 * dt);
        this.prevPos.copy(this.pos);
        const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.pos.addScaledVector(dir, this.velForward * dt);
        this.pos.y += this.velVertical * dt;
        if (this.pos.y > 2.2 && !this.hasTakenOff) {
            this.hasTakenOff = true;
            const hint = document.getElementById('droneHint');
            if (hint)
                hint.classList.add('hidden-hint');
        }
        if (this.pos.y < 0.5)
            this.pos.y = 0.5;
        this.droneGroup.position.copy(this.pos);
        this.droneGroup.rotation.y = this.yaw;
        this.droneGroup.rotation.z = -input.yaw * 0.25;
        this.droneGroup.rotation.x = -input.forward * 0.18;
        const spin = (this.battery > 0 ? 1 : 0.3) * dt * 45;
        this.rotors.forEach((r) => { r.rotation.y += spin; });
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
        this.updateBombs(dt);
        this.updateCamera(dt);
        this.updateFx(dt);
        this.updateHud();
        if (this.hp <= 0) {
            this.explode('Дрон сбит вражеским огнём');
            return;
        }
    },
    checkObstacleCollisions(droneRadius) {
        for (let i = 0; i < this.obstacles.length; i++) {
            const o = this.obstacles[i];
            if (o.destroyed)
                continue;
            const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
            const distSq = dx * dx + dz * dz;
            const rr = (o.radius + droneRadius);
            if (distSq < rr * rr && this.pos.y < o.height) {
                this.explode('Дрон врезался в препятствие');
                return;
            }
        }
    },
    updateEnemies(dt) {
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (e.destroyed)
                continue;
            e.phase += dt * e.speedFactor;
            const off = Math.sin(e.phase) * e.amp;
            if (e.axis === 'x')
                e.group.position.x = e.basePos.x + off;
            else
                e.group.position.z = e.basePos.z + off;
            if (e.turret && e.fireRange > 0) {
                const dx = this.pos.x - e.turret.getWorldPosition(new THREE.Vector3()).x;
                const dz = this.pos.z - e.turret.getWorldPosition(new THREE.Vector3()).z;
                const targetAngle = Math.atan2(dx, dz);
                // плавный доворот башни/пулемёта на цель
                let cur = e.turret.rotation.y;
                let diff = targetAngle - cur;
                while (diff > Math.PI)
                    diff -= Math.PI * 2;
                while (diff < -Math.PI)
                    diff += Math.PI * 2;
                e.turret.rotation.y = cur + droneClamp(diff, -dt * 3, dt * 3);
            }
            if (e.fireRange <= 0)
                continue;
            const dist = Math.hypot(this.pos.x - e.group.position.x, this.pos.z - e.group.position.z);
            e.fireCooldown -= dt;
            if (dist < e.fireRange && e.fireCooldown <= 0 && this.pos.y > 0.6) {
                this.fireBullet(e);
                e.fireCooldown = droneRandRange(e.fireCooldownRange[0], e.fireCooldownRange[1]);
            }
        }
    },
    fireBullet(e) {
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
        if (typeof SoundManager !== 'undefined' && SoundManager.playBad)
            SoundManager.playBad();
    },
    updateBullets(dt) {
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
    /* ---- игровая бомба / камикадзе ---- */
    usePayload() {
        if (!this.running || this.paused || this.dead || !this.pos)
            return;
        if (this.bombsLeft <= 0)
            return;

        const loadout = DRONE_LOADOUTS[this.selectedLoadout];
        this.bombsLeft--;

        if (loadout.oneShot) {
            this.kamikazeArmed = true;
            // Короткий управляемый рывок вперёд и вниз перед детонацией.
            this.velForward = Math.max(this.velForward, 18);
            this.velVertical = -Math.max(7, DRONE_MODELS[this.selectedModel].climb * 0.8);
            const button = document.getElementById('droneBombBtn');
            if (button) {
                button.textContent = '💥 Камикадзе активирован';
                button.disabled = true;
            }
            setTimeout(() => {
                if (!this.dead && this.running && this.kamikazeArmed)
                    this.payloadExplosion(this.pos.clone(), loadout, true);
            }, 1100);
            return;
        }

        // Обычная бомба отделяется от дрона и падает под действием гравитации.
        // Визуально это модель гранаты (grenade_f1.glb), которая подгружается
        // асинхронно поверх плейсхолдер-сферы, чтобы бомба была видна сразу.
        const mesh = new THREE.Group();
        const placeholder = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0x222222 }));
        mesh.add(placeholder);
        mesh.position.copy(this.pos);
        mesh.position.y -= 0.35;
        this.scene.add(mesh);
        this.bombs.push({
            mesh,
            vel: new THREE.Vector3(0, -2, 0),
            life: 5,
            loadout,
        });
        this.attachGrenadeVisual(mesh, placeholder);
    },
    updateBombs(dt) {
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            const b = this.bombs[i];
            b.vel.y -= 18 * dt;
            b.mesh.position.addScaledVector(b.vel, dt);
            b.life -= dt;

            if (b.mesh.position.y <= 0.25 || b.life <= 0) {
                const pos = b.mesh.position.clone();
                this.scene.remove(b.mesh);
                this.bombs.splice(i, 1);
                this.payloadExplosion(pos, b.loadout, false);
            }
        }
    },
    payloadExplosion(pos, loadout, selfDestruct) {
        if (!this.scene)
            return;

        this.spawnExplosionFx(pos);
        const radius = loadout.radius;
        let destroyed = 0;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (e.destroyed || !e.group)
                continue;

            const target = e.group.position;
            const dist = Math.hypot(pos.x - target.x, pos.z - target.z);
            if (dist <= radius) {
                e.hp = (e.hp || 1) - loadout.damage;
                this.spawnHitFx(target.clone().setY(Math.max(0.6, target.y + 0.8)));

                if (e.hp <= 0) {
                    e.destroyed = true;
                    if (e.obstacle)
                        e.obstacle.destroyed = true;
                    destroyed++;
                    const points = e.score || 100;
                    this.score += points;
                    this.scene.remove(e.group);
                    if (typeof SoundManager !== 'undefined' && SoundManager.playGood)
                        SoundManager.playGood();
                }
            }
        }

        if (destroyed > 0) {
            this.score += destroyed * loadout.score;
        }

        if (selfDestruct) {
            this.kamikazeArmed = false;
            this.explode(destroyed > 0
                ? `Камикадзе: уничтожено целей — ${destroyed}`
                : 'Камикадзе: заряд сработал');
        }
        this.updateHud();
    },
    updateCamera(dt) {
        const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-6.5);
        const desired = this.pos.clone().add(back).add(new THREE.Vector3(0, 2.8, 0));
        const lerp = 1 - Math.pow(0.001, dt);
        this.camChasePos.lerp(desired, lerp);
        this.camLookPos.lerp(this.pos, lerp);
        this.camera.position.copy(this.camChasePos);
        this.camera.lookAt(this.camLookPos.x, this.camLookPos.y + 0.4, this.camLookPos.z);
    },
    updateHud() {
        const hpFill = document.getElementById('droneHpFill');
        if (hpFill)
            hpFill.style.width = Math.max(0, this.hp / this.maxHp * 100) + '%';
        const battFill = document.getElementById('droneBattFill');
        if (battFill)
            battFill.style.width = Math.max(0, this.battery) + '%';
        const timeEl = document.getElementById('droneTimeValue');
        if (timeEl)
            timeEl.textContent = String(Math.floor(this.timeAlive));
        const distEl = document.getElementById('droneDistValue');
        if (distEl)
            distEl.textContent = String(Math.floor(this.distance));
        const altEl = document.getElementById('droneAltValue');
        if (altEl)
            altEl.textContent = String(Math.max(0, Math.floor(this.pos.y)));
        const scoreEl = document.getElementById('droneScoreValue');
        if (scoreEl)
            scoreEl.textContent = String(this.score);
        const bombsEl = document.getElementById('droneBombValue');
        if (bombsEl)
            bombsEl.textContent = String(this.bombsLeft);
        const payloadBtn = document.getElementById('droneBombBtn');
        if (payloadBtn && !this.kamikazeArmed) {
            payloadBtn.disabled = this.bombsLeft <= 0;
            if (this.selectedLoadout === 'bomb' && this.bombsLeft <= 0)
                payloadBtn.textContent = '💣 Заряды закончились';
        }
    },
    /* ---- частицы: попадание и взрыв ---- */
    spawnHitFx(pos) {
        for (let i = 0; i < 6; i++) {
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffd35c }));
            m.position.copy(pos);
            const vel = new THREE.Vector3(droneRandRange(-3, 3), droneRandRange(0, 3), droneRandRange(-3, 3));
            this.scene.add(m);
            this.fx.push({ mesh: m, vel, life: 0.35, spin: false });
        }
    },
    spawnExplosionFx(pos) {
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
    updateFx(dt) {
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
    explode(reason) {
        if (this.dead)
            return;
        this.dead = true;
        this.spawnExplosionFx(this.pos.clone());
        if (typeof SoundManager !== 'undefined' && SoundManager.playBomb)
            SoundManager.playBomb();
        this.droneGroup.visible = false;
        setTimeout(() => {
            this.running = false;
            const reasonEl = document.getElementById('droneDeathReason');
            if (reasonEl)
                reasonEl.textContent = reason;
            const timeEl = document.getElementById('droneFinalTime');
            if (timeEl)
                timeEl.textContent = String(Math.floor(this.timeAlive));
            const distEl = document.getElementById('droneFinalDist');
            if (distEl)
                distEl.textContent = String(Math.floor(this.distance));
            const scoreEl = document.getElementById('droneFinalScore');
            if (scoreEl)
                scoreEl.textContent = String(this.score);
            let best = 0;
            try {
                best = parseFloat(localStorage.getItem('drone_best_distance') || '0') || 0;
            }
            catch (e) {
                best = 0;
            }
            let bestScore = 0;
            try {
                bestScore = parseFloat(localStorage.getItem('drone_best_score') || '0') || 0;
            }
            catch (e) {
                bestScore = 0;
            }
            const newScoreRecord = this.score > bestScore;
            if (newScoreRecord) {
                try { localStorage.setItem('drone_best_score', String(Math.floor(this.score))); }
                catch (e) { /* ignore */ }
            }
            const newRecordEl = document.getElementById('droneNewRecordText');
            if (this.distance > best) {
                try {
                    localStorage.setItem('drone_best_distance', String(Math.floor(this.distance)));
                }
                catch (e) { /* ignore */ }
                if (newRecordEl)
                    droneShow(newRecordEl);
            }
            else if (newRecordEl)
                droneHide(newRecordEl);
            if (newScoreRecord && newRecordEl) {
                newRecordEl.textContent = '🎉 Новый рекорд по очкам!';
                droneShow(newRecordEl);
            }
            droneShow(document.getElementById('droneGameOverOverlay'));
        }, 900);
    },
    /* =========================================================
       РЕНДЕР / РАЗМЕР
    ========================================================= */
    render() {
        if (this.renderer && this.scene && this.camera)
            this.renderer.render(this.scene, this.camera);
    },
    fitCanvas() {
        const wrap = document.getElementById('droneGameWrap');
        const canvas = document.getElementById('droneCanvas');
        if (!wrap || !canvas || wrap.classList.contains('hidden') || !this.renderer)
            return;
        const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        const wrapTop = wrap.getBoundingClientRect().top;
        const mainEl = document.querySelector('main');
        const mainPadBottom = mainEl ? (parseFloat(getComputedStyle(mainEl).paddingBottom) || 0) : 0;
        const wrapMarginBottom = parseFloat(getComputedStyle(wrap).marginBottom) || 0;
        const available = Math.max(0, vh - wrapTop - mainPadBottom - wrapMarginBottom - 8);
        const height = Math.max(320, available);
        const rect = wrap.getBoundingClientRect();
        wrap.style.height = height + 'px';
        this.renderer.setSize(rect.width, height, true);
        if (this.camera) {
            this.camera.aspect = rect.width / height;
            this.camera.updateProjectionMatrix();
        }
    },
    /* =========================================================
       ОЧИСТКА СЦЕНЫ (при выходе/рестарте — освобождаем WebGL-контекст)
    ========================================================= */
    destroyScene() {
        if (this.scene) {
            this.scene.traverse((obj) => {
                if (obj.geometry)
                    obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material))
                        obj.material.forEach((m) => m.dispose());
                    else
                        obj.material.dispose();
                }
            });
        }
        if (this.renderer)
            this.renderer.dispose();
        this.scene = null;
        this.renderer = null;
        this.camera = null;
        this.droneGroup = null;
        this.obstacles = [];
        this.enemies = [];
        this.bullets = [];
        this.bombs = [];
        this.fx = [];
    },
};
// делаем DroneGame доступным как window.DroneGame — иначе `if(window.DroneGame)`
// в script.js всегда ложно (top-level const не создаёт window-свойство).
window.DroneGame = DroneGame;

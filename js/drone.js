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
};
/* =========================================================
   3D-МОДЕЛИ МЕСТНОСТИ И НАЗЕМНЫХ/ВОЗДУШНЫХ ЦЕЛЕЙ (GLB, /models)
   ---------------------------------------------------------
   Карта (кластеры леса), солдат, танки, вертолёты и вся техника —
   реальные GLB-модели из соответствующих папок. Используется КАЖДАЯ
   модель из каждой папки минимум один раз (см. buildScene ниже).
========================================================= */
const MAP_GLB_FOREST = 'models/maps/low_poly_forest.glb';
const SOLDIER_GLB = 'models/Soldier/ukrainian_azov_brigade_fighter.glb';
const TANK_GLB_MODELS = [
    'models/tanks/t-72amt.glb',
    'models/tanks/t-84_oplot.glb',
    'models/tanks/ukrainian_t-64bv_donbass_war.glb',
];
const HELI_GLB_MODELS = [
    'models/vertolet/ukrainian_mil_mi-24p.glb',
    'models/vertolet/w-3wa_sokol.glb',
];
// Каждая модель машины — своя манера поведения: часть вооружена и
// стреляет, часть безоружна; часть стоит на месте, часть патрулирует
// случайными точками, часть при приближении дрона удирает.
const MACHINE_GLB_CONFIGS = [
    { file: 'models/machine/bmp-1u_shkval.glb', armed: true, moveMode: 'patrol', hp: 70, bulletDamage: 16, fireRange: 100, radius: 1.9, scale: 4.6 },
    { file: 'models/machine/ukrainian_bm-27_uragan.glb', armed: true, moveMode: 'stationary', hp: 65, bulletDamage: 22, fireRange: 140, radius: 2.3, scale: 5.4 },
    { file: 'models/machine/ukrainian_amz_dzik.glb', armed: true, moveMode: 'flee', hp: 40, bulletDamage: 10, fireRange: 75, radius: 1.6, scale: 3.8, fleeSpeed: 12 },
    { file: 'models/machine/ukrainian_modified_humvee.glb', armed: true, moveMode: 'flee', hp: 35, bulletDamage: 9, fireRange: 70, radius: 1.5, scale: 3.6, fleeSpeed: 13 },
    { file: 'models/machine/ukrainian_m998_humvee_pickup.glb', armed: false, moveMode: 'flee', hp: 30, radius: 1.5, scale: 3.6, fleeSpeed: 13 },
    { file: 'models/machine/ukrainian_kraz-6322.glb', armed: false, moveMode: 'stationary', hp: 50, radius: 1.9, scale: 4.4 },
    { file: 'models/machine/ukrainian_uaz-452.glb', armed: false, moveMode: 'patrol', hp: 30, radius: 1.5, scale: 3.4 },
    { file: 'models/machine/ukrainian_uaz-469.glb', armed: false, moveMode: 'flee', hp: 28, radius: 1.4, scale: 3.2, fleeSpeed: 14 },
];
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
   РЕКОРДЫ ПО КАЖДОМУ ПУНКТУ ВЫБОРА (модель / модуль / заряд) —
   общая таблица на всех игроков (очки, метры, время), хранится
   через общий слой DB (см. db.js): одна коллекция на каждое
   значение пункта выбора, запись = {id: playerId, name, score,
   distance, time}. Админ может смотреть/редактировать/удалять
   любую запись в любой из таблиц (см. js/admin.js).
========================================================= */
function droneLBCollection(axis, key) {
    return 'droneLB_' + axis + '_' + key;
}
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
    squads: [], // группы солдат, бродящих вместе (см. addSoldierSquad)
    bullets: [],
    bombs: [],
    fx: [], // временные частицы
    score: 0,
    bombsLeft: 5,
    maxBombs: 5,
    kamikazeHits: 0, // сколько раз подорвался об цель за этот вылет (режим камикадзе)
    kamikazeTimeLeft: 60, // обратный отсчёт в режиме камикадзе, секунд
    refueling: false,
    _bombRefillTimer: 0,
    respawning: false, // камикадзе: дрон подорвался, идёт пара секунд ожидания перед возрождением на базе
    // ---- прогресс игрока: уровни/достижения/лидерборды (через db.js) ----
    playerId: null,
    _ready: false,
    levels: [],
    achievements: [],
    data: { bestScore: 0, totalScore: 0, bestDistance: 0, totalDistance: 0, bestTime: 0, gamesPlayed: 0, kamikazeHits: 0, unlocked: {} },
    leaderboards: { model: {}, loadout: {}, charge: {} },
    _recGroup: 'model',
    _recKey: 'scout',
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
        this.bindRecordsModal();
        this.bindAchievementsModal();
        window.addEventListener('resize', () => this.fitCanvas());
        window.addEventListener('orientationchange', () => setTimeout(() => this.fitCanvas(), 200));
        // закрытие вкладки/уход со страницы посреди вылета — тоже сохраняем
        // рекорды на текущий момент, а не только при явном выходе кнопкой
        window.addEventListener('pagehide', () => this.saveProgressOnExit());
        window.addEventListener('beforeunload', () => this.saveProgressOnExit());
        this.initProgress();
    },
    bindSetupUI() {
        const pickBtn = document.getElementById('pickDroneBtn');
        if (pickBtn) {
            pickBtn.addEventListener('click', () => {
                droneHide(document.getElementById('gameSelectScreen'));
                droneShow(document.getElementById('droneScreen'));
                droneShow(document.getElementById('droneSetupPanel'));
                droneHide(document.getElementById('droneGameWrap'));
                this.updateRecordDisplays();
            });
        }
        const backBtn = document.getElementById('droneBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                droneHide(document.getElementById('droneScreen'));
                droneShow(document.getElementById('gameSelectScreen'));
            });
        }
        // Три пункта выбора («Модель дрона», «Боевой модуль», «Заряд батареи»)
        // сделаны разворачивающимися меню: клик по заголовку открывает/закрывает
        // список вариантов, выбор варианта сворачивает меню обратно.
        this.bindAccordion('droneModelAccordion', 'droneModelAccordionHeader');
        this.bindAccordion('droneLoadoutAccordion', 'droneLoadoutAccordionHeader');
        this.bindAccordion('droneChargeAccordion', 'droneChargeAccordionHeader');
        this.bindAccordion('droneKamikazeModelAccordion', 'droneKamikazeModelAccordionHeader');
        this.bindPickGroup('droneModelGrid', 'model', 'selectedModel', 'droneModelAccordion', 'droneModelCurrent', 'balanced');
        this.bindPickGroup('droneLoadoutGrid', 'loadout', 'selectedLoadout', 'droneLoadoutAccordion', 'droneLoadoutCurrent', 'bomb');
        this.bindPickGroup('droneChargeGrid', 'charge', 'selectedCharge', 'droneChargeAccordion', 'droneChargeCurrent', 'm');
        this.bindPickGroup('droneKamikazeModelGrid', 'kamikazeModel', 'selectedKamikazeModel', 'droneKamikazeModelAccordion', 'droneKamikazeModelCurrent', 'combat');
        // Выбор модели дрона-камикадзе показываем только пока выбран
        // боевой модуль «Камикадзе».
        const loadoutGrid = document.getElementById('droneLoadoutGrid');
        if (loadoutGrid) {
            loadoutGrid.querySelectorAll('.drone-pick').forEach(btn => {
                btn.addEventListener('click', () => this.updateKamikazeModelVisibility());
            });
        }
        this.updateKamikazeModelVisibility();
        const takeoffBtn = document.getElementById('droneTakeoffToSceneBtn');
        if (takeoffBtn)
            takeoffBtn.addEventListener('click', () => this.startFlight());
        this.updateRecordDisplays();
    },
    bindAccordion(accordionId, headerId) {
        const accordion = document.getElementById(accordionId);
        const header = document.getElementById(headerId);
        if (!accordion || !header)
            return;
        header.addEventListener('click', () => {
            accordion.classList.toggle('open');
        });
    },
    bindPickGroup(gridId, dataKey, stateProp, accordionId, currentId, fallback) {
        const grid = document.getElementById(gridId);
        if (!grid)
            return;
        grid.querySelectorAll('.drone-pick').forEach(btn => {
            btn.addEventListener('click', () => {
                grid.querySelectorAll('.drone-pick').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this[stateProp] = btn.dataset[dataKey] || fallback;
                const nameEl = btn.querySelector('.game-pick-name');
                const curEl = document.getElementById(currentId);
                if (curEl && nameEl)
                    curEl.textContent = nameEl.textContent;
                // Вкладка выбора нарочно НЕ сворачивается после выбора —
                // так видно все варианты и их рекорды сразу.
            });
        });
    },
    /* ---- рекорды по каждому варианту модели/модуля/заряда (личный лучший
       результат текущего игрока — полная таблица открывается в модалке) ---- */
    updateRecordDisplays() {
        const apply = (gridId, axis, dataKey) => {
            const grid = document.getElementById(gridId);
            if (!grid)
                return;
            grid.querySelectorAll('.drone-pick').forEach(btn => {
                const key = btn.dataset[dataKey];
                const el = btn.querySelector('.game-pick-record');
                if (!el)
                    return;
                const list = (this.leaderboards[axis] && this.leaderboards[axis][key]) || [];
                const mine = this.playerId ? list.find(r => r.id === this.playerId) : null;
                el.textContent = mine
                    ? `Рекорд: ${Math.floor(mine.score || 0)} очк · ${Math.floor(mine.distance || 0)} м · ${Math.floor(mine.time || 0)} с`
                    : 'Рекорд: —';
            });
        };
        apply('droneModelGrid', 'model', 'model');
        apply('droneLoadoutGrid', 'loadout', 'loadout');
        apply('droneChargeGrid', 'charge', 'charge');
    },
    /* =========================================================
       ПРОГРЕСС ИГРОКА: уровни, достижения, лидерборды по каждому
       пункту выбора. Хранится через общий слой DB (см. db.js) —
       редактируется/удаляется из админ-панели (js/admin.js).
    ========================================================= */
    initProgress() {
        this.playerId = (typeof getPlayerId === 'function') ? getPlayerId() : null;
        if (!window.DB || !window.DEFAULTS || !this.playerId) {
            console.warn('DroneGame: DB/DEFAULTS недоступны — уровни, достижения и общие рекорды дрона отключены.');
            return;
        }
        DB.seedIfEmpty('droneLevels', DEFAULTS.droneLevels || []);
        DB.seedIfEmpty('droneAchievements', DEFAULTS.droneAchievements || []);
        DB.watchCollection('droneLevels', list => {
            this.levels = list.slice().sort((a, b) => (a.min || 0) - (b.min || 0));
            this.renderProgressUI();
        });
        DB.watchCollection('droneAchievements', list => {
            this.achievements = list.slice().sort((a, b) => (a.target || 0) - (b.target || 0));
            this.renderAchievementsModal();
            this.checkAchievements();
        });
        DB.watchItem('dronePlayers', this.playerId, doc => {
            this.data = Object.assign({ bestScore: 0, totalScore: 0, bestDistance: 0, totalDistance: 0, bestTime: 0, gamesPlayed: 0, kamikazeHits: 0, unlocked: {} }, doc || {});
            this._ready = true;
            this.renderProgressUI();
            this.renderAchievementsModal();
            this.checkAchievements();
        });
        const axes = {
            model: Object.keys(DRONE_MODELS),
            loadout: Object.keys(DRONE_LOADOUTS),
            charge: Object.keys(DRONE_CHARGES),
        };
        Object.keys(axes).forEach(axis => {
            axes[axis].forEach(key => {
                DB.watchCollection(droneLBCollection(axis, key), list => {
                    this.leaderboards[axis][key] = list.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
                    this.updateRecordDisplays();
                    this.renderRecordsModalIfOpen();
                });
            });
        });
        (window.nicknameReady || Promise.resolve()).then(() => {
            DB.getItemOnce('dronePlayers', this.playerId).then(doc => {
                if (!doc) {
                    DB.setItem('dronePlayers', this.playerId, {
                        name: getNickname(), bestScore: 0, totalScore: 0, bestDistance: 0, totalDistance: 0, bestTime: 0, gamesPlayed: 0, kamikazeHits: 0, unlocked: {}
                    });
                }
                else if (doc.name !== getNickname()) {
                    DB.setItem('dronePlayers', this.playerId, { name: getNickname() });
                }
            });
        });
    },
    getLevelForScore(v) {
        if (!this.levels.length)
            return null;
        let level = this.levels[0];
        this.levels.forEach(l => { if (v >= l.min)
            level = l; });
        return level;
    },
    getNextLevel(v) {
        for (const l of this.levels) {
            if (v < l.min)
                return l;
        }
        return null;
    },
    renderProgressUI() {
        const badge = document.getElementById('droneLevelBadge');
        if (!badge)
            return;
        const total = this.data.totalScore || 0;
        const level = this.getLevelForScore(total);
        if (!level) {
            droneHide(badge);
            return;
        }
        const next = this.getNextLevel(total);
        badge.textContent = next
            ? `${level.emoji || ''} ${level.name || ''} · ${Math.floor(total)}/${next.min} очков до след. уровня`
            : `${level.emoji || ''} ${level.name || ''} · максимальный уровень`;
        droneShow(badge);
    },
    checkAchievements() {
        if (!this.achievements.length || !this._ready)
            return;
        const unlocked = this.data.unlocked || {};
        const metric = (type) => {
            if (type === 'bestScore')
                return this.data.bestScore || 0;
            if (type === 'totalScore')
                return this.data.totalScore || 0;
            if (type === 'bestDistance')
                return this.data.bestDistance || 0;
            if (type === 'totalDistance')
                return this.data.totalDistance || 0;
            if (type === 'bestTime')
                return this.data.bestTime || 0;
            if (type === 'games')
                return this.data.gamesPlayed || 0;
            if (type === 'kamikazeHits')
                return this.data.kamikazeHits || 0;
            return 0;
        };
        const newly = this.achievements.filter(a => !unlocked[a.id] && metric(a.type) >= (a.target || 0));
        if (newly.length) {
            DB.markUnlocked('dronePlayers', this.playerId, newly.map(a => a.id));
            if (typeof showAchievementToast === 'function')
                newly.forEach(a => showAchievementToast(a, 'drone'));
        }
    },
    /* ---- лидерборды: обновление личного рекорда по каждому выбранному
       пункту (модель / боевой модуль / заряд) — очки, метры, время берутся
       по максимуму независимо друг от друга ---- */
    submitOptionRecords() {
        if (!window.DB || !this.playerId)
            return;
        const name = (typeof getNickname === 'function') ? getNickname() : 'Игрок';
        const score = Math.floor(this.score);
        const distance = Math.floor(this.distance);
        const time = Math.floor(this.timeAlive);
        const bump = (axis, key) => {
            const col = droneLBCollection(axis, key);
            DB.getItemOnce(col, this.playerId).then(cur => {
                const prev = cur || { score: 0, distance: 0, time: 0 };
                DB.setItem(col, this.playerId, {
                    name,
                    score: Math.max(prev.score || 0, score),
                    distance: Math.max(prev.distance || 0, distance),
                    time: Math.max(prev.time || 0, time),
                });
            }).catch(() => { });
        };
        bump('model', this.selectedModel);
        bump('loadout', this.selectedLoadout);
        bump('charge', this.selectedCharge);
    },
    /* ---- модалка «Таблица рекордов»: группы (Модель/Модуль/Заряд), внутри
       которых отдельная вкладка на каждый вариант — своя таблица игрок/очки/
       метры/время. Сама модалка (открытие/рендер) — своя, а вот оформление
       и закрытие (крестик с data-close, клик по фону) — общие для всего
       сайта, как у остальных игр (см. document.querySelectorAll('.modal')
       и '[data-close]' в script.js). ---- */
    bindRecordsModal() {
        const openBtn = document.getElementById('droneRecordsBtn');
        const modal = document.getElementById('droneRecordsModal');
        if (openBtn && modal)
            openBtn.addEventListener('click', () => { droneShow(modal); this.renderRecordsModal(); });
    },
    _recordsGroups() {
        return [
            { id: 'model', label: 'Модель дрона', items: [['scout', '🪶 Скаут'], ['balanced', '🚁 Баланс'], ['heavy', '🛡️ Танк']] },
            { id: 'loadout', label: 'Боевой модуль', items: [['bomb', '💣 Бомба'], ['kamikaze', '💥 Камикадзе']] },
            { id: 'charge', label: 'Заряд батареи', items: [['s', '🔋 Малый'], ['m', '🔋 Средний'], ['l', '🔋 Большой']] },
        ];
    },
    renderRecordsModalIfOpen() {
        const modal = document.getElementById('droneRecordsModal');
        if (modal && !modal.classList.contains('hidden'))
            this.renderRecordsModal();
    },
    renderRecordsModal() {
        const groups = this._recordsGroups();
        const groupTabsEl = document.getElementById('droneRecGroupTabs');
        const itemTabsEl = document.getElementById('droneRecItemTabs');
        const tableWrap = document.getElementById('droneRecordsTableWrap');
        if (!groupTabsEl || !itemTabsEl || !tableWrap)
            return;
        if (!groups.find(g => g.id === this._recGroup))
            this._recGroup = 'model';
        // класс records-tab — общий стиль вкладок сайта (как у Змейки и др.)
        groupTabsEl.innerHTML = groups.map(g => `<button type="button" class="records-tab drone-rec-group-tab ${g.id === this._recGroup ? 'active' : ''}" data-group="${g.id}">${g.label}</button>`).join('');
        groupTabsEl.querySelectorAll('.drone-rec-group-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                this._recGroup = btn.dataset.group;
                const grp = groups.find(g => g.id === this._recGroup);
                this._recKey = grp.items[0][0];
                this.renderRecordsModal();
            });
        });
        const curGroup = groups.find(g => g.id === this._recGroup);
        if (!curGroup.items.find(([k]) => k === this._recKey))
            this._recKey = curGroup.items[0][0];
        itemTabsEl.innerHTML = curGroup.items.map(([key, label]) => `<button type="button" class="records-tab drone-rec-item-tab ${key === this._recKey ? 'active' : ''}" data-key="${key}">${label}</button>`).join('');
        itemTabsEl.querySelectorAll('.drone-rec-item-tab').forEach(btn => {
            btn.addEventListener('click', () => { this._recKey = btn.dataset.key; this.renderRecordsModal(); });
        });
        const list = (this.leaderboards[this._recGroup] && this.leaderboards[this._recGroup][this._recKey]) || [];
        if (!list.length) {
            tableWrap.innerHTML = '<p class="news-empty">Пока нет рекордов — стань первым!</p>';
            return;
        }
        const rows = list.slice(0, 30).map((r, i) => `
            <tr class="${r.id === this.playerId ? 'me' : ''}">
                <td>${i + 1}</td>
                <td>${escapeHtml(r.name || 'Игрок')}</td>
                <td>${Math.floor(r.score || 0)}</td>
                <td>${Math.floor(r.distance || 0)}</td>
                <td>${Math.floor(r.time || 0)}</td>
            </tr>`).join('');
        tableWrap.innerHTML = `
            <table class="drone-rec-table">
                <thead><tr><th>#</th><th>Игрок</th><th>Очки</th><th>Метры (м)</th><th>Время (с)</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    },
    /* ---- модалка «Достижения» (тот же общий стиль/закрытие, что у остальных
       игр — см. комментарий у bindRecordsModal) ---- */
    bindAchievementsModal() {
        const openBtn = document.getElementById('droneAchievementsBtn');
        const modal = document.getElementById('droneAchievementsModal');
        if (openBtn && modal)
            openBtn.addEventListener('click', () => { droneShow(modal); this.renderAchievementsModal(); });
    },
    renderAchievementsModal() {
        const modal = document.getElementById('droneAchievementsModal');
        const grid = document.getElementById('droneAchievementsGrid');
        if (!grid || !modal || modal.classList.contains('hidden'))
            return;
        const unlocked = this.data.unlocked || {};
        grid.innerHTML = this.achievements.map(a => {
            const done = !!unlocked[a.id];
            return `<div class="ach-card ${done ? 'unlocked' : 'locked'}">
                <div class="ach-emoji">${done ? (a.emoji || '🏆') : '🔒'}</div>
                <div class="ach-title">${escapeHtml(a.title || '')}</div>
                <div class="ach-desc">${escapeHtml(a.desc || '')}</div>
            </div>`;
        }).join('') || '<p class="news-empty">Пока нет достижений.</p>';
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
        // Игрок выходит из игры сам (кнопка «Выход»), не разбившись и не
        // закончив вылет — рекорды по очкам/метрам/времени всё равно должны
        // сохраниться на текущий момент вылета, иначе прогресс потеряется.
        this.saveProgressOnExit();
        this.stopLoop();
        this.destroyScene();
        droneHide(document.getElementById('droneGameWrap'));
        droneShow(document.getElementById('droneSetupPanel'));
        droneHide(document.getElementById('dronePauseOverlay'));
        droneHide(document.getElementById('droneGameOverOverlay'));
    },
    /* ---- сохраняет рекорды/статистику по тому, что уже успел налетать
       игрок, если вылет прерывается не крушением, а обычным выходом
       (кнопка «Выход», переход в меню, закрытие вкладки) ---- */
    saveProgressOnExit() {
        // сохраняем, если игрок успел хоть что-то налетать/заработать —
        // не обязательно именно набрать высоту «официального взлёта»
        const hasProgress = this.hasTakenOff || this.score > 0 || this.distance > 0 || this.timeAlive > 0;
        if (this.dead || !hasProgress)
            return; // ещё ничего не успел, либо итог уже посчитан в finalizeRun()
        this.dead = true; // не даём finalizeRun/крушению сработать повторно на этом вылете
        this.submitOptionRecords();
        if (window.DB && this.playerId) {
            const patch = { totalScore: this.score, totalDistance: this.distance, gamesPlayed: 1 };
            if (this.selectedLoadout === 'kamikaze' && this.kamikazeHits > 0)
                patch.kamikazeHits = this.kamikazeHits;
            DB.incrementItem('dronePlayers', this.playerId, patch);
            if (this.score > (this.data.bestScore || 0))
                DB.setItem('dronePlayers', this.playerId, { bestScore: this.score });
            if (this.distance > (this.data.bestDistance || 0))
                DB.setItem('dronePlayers', this.playerId, { bestDistance: this.distance });
            if (this.timeAlive > (this.data.bestTime || 0))
                DB.setItem('dronePlayers', this.playerId, { bestTime: this.timeAlive });
        }
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
        const loadout = DRONE_LOADOUTS[this.selectedLoadout];
        this.maxHp = model.maxHp;
        this.hp = model.maxHp;
        this.battery = 100;
        this.batteryDrainPerSec = 100 / charge.seconds;
        this.velForward = 0;
        this.velVertical = 0;
        this.timeAlive = 0;
        this.distance = 0;
        this.score = 0;
        this.maxBombs = loadout.bombs;
        this.bombsLeft = loadout.bombs;
        this.hasTakenOff = false;
        this.atBase = false;
        this.refueling = false;
        this._bombRefillTimer = 0;
        this.kamikazeHits = 0;
        this.respawning = false;
        // Камикадзе теперь режим на время: 60 секунд, в течение которых
        // подрывы об цели не завершают вылет, а просто перезапускают
        // дрон на базе — см. kamikazeDetonate()/finishKamikazeRun().
        this.kamikazeTimeLeft = 60;
        const payloadBtn = document.getElementById('droneBombBtn');
        if (payloadBtn) {
            if (loadout.oneShot) {
                // Камикадзе не активируется кнопкой — заряд срабатывает
                // сам при столкновении, поэтому кнопка сброса тут не нужна.
                droneHide(payloadBtn);
            }
            else {
                droneShow(payloadBtn);
                payloadBtn.disabled = false;
                payloadBtn.textContent = '💣 Сбросить бомбу [B]';
            }
        }
        this.hideBaseHint();
        this.hintHidden = false;
    },
    updateKamikazeModelVisibility() {
        const wrap = document.getElementById('droneKamikazeModelAccordion');
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
            console.error('[drone] THREE.GLTFLoader не найден — проверь, что js/GLTFLoader.js подключён в index.html после three.min.js.');
            return Promise.reject(new Error('GLTFLoader недоступен'));
        }
        const loader = new THREE.GLTFLoader();
        const promise = new Promise((resolve, reject) => {
            loader.load(encodeURI(path), (gltf) => resolve(gltf.scene), undefined, (err) => {
                console.error('[drone] Не удалось загрузить 3D-модель:', path, err);
                reject(err);
            });
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
        }).catch((err) => {
            // не удалось загрузить модель — остаётся процедурная заглушка
            console.error('[drone] Визуал дрона не загружен, использую заглушку:', err);
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
        }).catch((err) => {
            // не удалось загрузить модель — остаётся плейсхолдер-сфера
            console.error('[drone] Модель гранаты не загружена, использую заглушку:', err);
        });
    },
    // Универсальная асинхронная подмена плейсхолдера реальной GLB-моделью
    // для любой наземной/воздушной цели (солдат, танк, машина, вертолёт,
    // кластер леса). Удаляет из targetGroup только явно переданные
    // плейсхолдер-объекты (opts.removeObjects), не трогая служебные
    // дочерние объекты вроде точки наведения турели (e.turret).
    attachGlbVisual(targetGroup, path, scale, opts) {
        opts = opts || {};
        this.loadGLTFModel(path).then((scene) => {
            // сцена/объект могли исчезнуть (рестарт, выход, уничтожение цели),
            // пока модель качалась
            if (!this.scene || !targetGroup.parent)
                return;
            const visual = this.fitGlbVisual(scene, scale);
            if (opts.rotationY)
                visual.rotation.y += opts.rotationY;
            if (opts.removeObjects) {
                opts.removeObjects.forEach((obj) => {
                    if (obj && obj.parent === targetGroup)
                        targetGroup.remove(obj);
                });
            }
            targetGroup.add(visual);
        }).catch((err) => {
            // не удалось загрузить модель — остаётся процедурная заглушка
            console.error('[drone] Визуал цели не загружен, использую заглушку:', path, err);
        });
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
        this.squads = [];
        this.bullets = [];
        this.bombs = [];
        this.fx = [];
        // база возрождения — дрон стартует прямо на ней; вернувшись сюда
        // и приземлившись, игрок пополняет боезапас бомб (см. update()).
        this.basePos = { x: 0, z: 26 };
        this.baseRadius = 7;
        this.atBase = false;
        this.addBase();
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
            if (Math.hypot(x - this.basePos.x, z - this.basePos.z) < this.baseRadius + 3)
                continue;
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
        // декоративные кластеры карты (models/maps/low_poly_forest.glb) —
        // крупные скопления леса по краям поля, тоже препятствие
        for (let i = 0; i < 9; i++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const x = side * droneRandRange(150, 232);
            const z = droneRandRange(-430, 40);
            this.addForestCluster(x, z);
        }
        // танки — используем все 3 модели из models/tanks, часть стоит на
        // месте, часть медленно патрулирует случайные точки поля
        const tankSpawns = [
            { file: TANK_GLB_MODELS[0], mode: 'stationary' },
            { file: TANK_GLB_MODELS[1], mode: 'patrol' },
            { file: TANK_GLB_MODELS[2], mode: 'patrol' },
            { file: TANK_GLB_MODELS[0], mode: 'stationary' },
        ];
        tankSpawns.forEach((cfg) => {
            const x = droneRandRange(-160, 160);
            const z = droneRandRange(-380, -60);
            this.addTankEntity(x, z, cfg.file, cfg.mode);
        });
        // машины — используем ВСЕ модели из models/machine, каждой своя
        // манера поведения (см. MACHINE_GLB_CONFIGS): часть стоит, часть
        // патрулирует случайную траекторию, часть удирает от дрона
        MACHINE_GLB_CONFIGS.forEach((cfg, i) => {
            const rx = roadXs[i % roadXs.length];
            const onRoad = Math.random() < 0.5;
            const x = onRoad ? droneClamp(rx + droneRandRange(-4, 4), -230, 230) : droneRandRange(-210, 210);
            const z = droneRandRange(-410, -30);
            this.addMachineEntity(cfg, x, z);
        });
        // солдаты: несколько групп по 2-4 человека, патрулирующих поле
        // случайным маршрутом (не по прямой)
        const squadCount = 3;
        for (let s = 0; s < squadCount; s++) {
            const cx = droneRandRange(-180, 180);
            const cz = droneRandRange(-380, -40);
            const count = 2 + Math.floor(Math.random() * 3); // 2-4 человека
            this.addSoldierSquad(cx, cz, count);
        }
        // солдаты-часовые: стоят на месте рядом со стоящими танками/машинами
        this.enemies
            .filter((e) => (e.kind === 'tank' || e.kind === 'machine') && e.moveMode === 'stationary')
            .forEach((e) => {
            if (Math.random() < 0.75) {
                const ang = Math.random() * Math.PI * 2;
                const gx = e.basePos.x + Math.cos(ang) * (e.obstacle.radius + 1.6);
                const gz = e.basePos.z + Math.sin(ang) * (e.obstacle.radius + 1.6);
                this.addSoldierEntity(gx, gz, { moveMode: 'stationary' });
            }
        });
        // вертолёты — используем обе модели из models/vertolet, летают
        // случайной 3D-траекторией (высота/курс) и стреляют по дрону
        const heliSpawns = [HELI_GLB_MODELS[0], HELI_GLB_MODELS[1], HELI_GLB_MODELS[0]];
        heliSpawns.forEach((file) => {
            const x = droneRandRange(-170, 170);
            const z = droneRandRange(-360, -50);
            this.addHelicopterEntity(file, x, z);
        });
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
    /* ---- база возрождения: посадочная площадка с пополнением бомб ---- */
    addBase() {
        const group = new THREE.Group();
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(this.baseRadius, this.baseRadius, 0.06, 24), new THREE.MeshLambertMaterial({ color: 0x5a5f63 }));
        pad.position.y = 0.03;
        group.add(pad);
        const ring = new THREE.Mesh(new THREE.RingGeometry(this.baseRadius * 0.55, this.baseRadius * 0.68, 24), new THREE.MeshBasicMaterial({ color: 0xffcf4d, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.07;
        group.add(ring);
        // буква H по центру площадки — ориентир для посадки
        const hMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const barL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 2.6), hMat);
        barL.position.set(-0.9, 0.08, 0);
        group.add(barL);
        const barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 2.6), hMat);
        barR.position.set(0.9, 0.08, 0);
        group.add(barR);
        const barM = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.02, 0.5), hMat);
        barM.position.set(0, 0.08, 0);
        group.add(barM);
        // палатка со складом боеприпасов + антенна для антуража
        const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.8, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a45 }));
        tent.position.set(this.baseRadius + 1.6, 0.9, 0.5);
        group.add(tent);
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
        antenna.position.set(this.baseRadius + 1.6, 2.4, -0.6);
        group.add(antenna);
        group.position.set(this.basePos.x, 0, this.basePos.z);
        this.scene.add(group);
        this.baseGroup = group;
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
    /* ---- декоративный кластер леса из карты (models/maps) ---- */
    addForestCluster(x, z) {
        const group = new THREE.Group();
        const placeholder = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 7), new THREE.MeshLambertMaterial({ color: 0x2f7a3a }));
        placeholder.position.y = 3;
        group.add(placeholder);
        group.position.set(x, 0, z);
        group.rotation.y = Math.random() * Math.PI * 2;
        this.scene.add(group);
        this.attachGlbVisual(group, MAP_GLB_FOREST, droneRandRange(20, 30), { removeObjects: [placeholder] });
        // крупный кластер — широкий радиус коллизии, как у купы деревьев
        this.obstacles.push({ x, z, radius: 9, height: 14 });
    },
    /* ---- враги ---- */
    // Один солдат (модель ukrainian_azov_brigade_fighter.glb). opts.moveMode:
    // 'stationary' — стоит на месте (часовой у техники, может доворачиваться
    // и стрелять); 'squad' — идёт в составе группы (opts.squad/opts.offset).
    addSoldierEntity(x, z, opts) {
        opts = opts || {};
        const group = new THREE.Group();
        const uniform = new THREE.MeshLambertMaterial({ color: 0x4c5a35 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.1, 8), uniform);
        body.position.y = 0.75;
        group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshLambertMaterial({ color: 0xd8a878 }));
        head.position.y = 1.45;
        group.add(head);
        group.position.set(x, 0, z);
        this.scene.add(group);
        this.attachGlbVisual(group, SOLDIER_GLB, 2.0, { removeObjects: [body, head] });
        // солдат тоже считается препятствием для столкновения — врезаться в
        // него можно и это подрывает камикадзе / крушит обычный дрон
        const soldierObstacle = { x, z, radius: 0.9, height: 2.3, destroyed: false };
        this.obstacles.push(soldierObstacle);
        const moveMode = opts.moveMode || 'stationary';
        // турель-заглушка (доворот всего тела к цели) — только у неподвижных
        // часовых; у идущих в группе солдат тело смотрит по ходу движения
        const turret = moveMode === 'stationary' ? group : null;
        this.enemies.push({
            kind: 'soldier', group, turret,
            basePos: { x, z }, moveMode,
            squad: opts.squad || null, offset: opts.offset || null, walkSpeed: opts.walkSpeed || 2,
            fireRange: 80, fireCooldown: droneRandRange(1, 3),
            fireCooldownRange: [1.4, 2.8], bulletSpeed: 42, bulletDamage: 7,
            bulletColor: 0xfff07a, spread: 0.05, collideRadius: 0.9,
            hp: 25, score: 100, destroyed: false, obstacle: soldierObstacle,
        });
    },
    // Группа солдат (2-4 человека), которая вместе бродит по случайным
    // точкам вокруг центра (cx,cz) — общий "виртуальный лидер" squad.pos,
    // каждый солдат идёт к нему со своим небольшим смещением.
    addSoldierSquad(cx, cz, count) {
        const squad = {
            center: { x: cx, z: cz }, pos: { x: cx, z: cz },
            radius: droneRandRange(25, 50), speed: droneRandRange(1.6, 2.6), target: null,
        };
        this.squads.push(squad);
        for (let i = 0; i < count; i++) {
            const offset = { x: droneRandRange(-2.5, 2.5), z: droneRandRange(-2.5, 2.5) };
            const x = cx + offset.x, z = cz + offset.z;
            this.addSoldierEntity(x, z, { moveMode: 'squad', squad, offset, walkSpeed: squad.speed * droneRandRange(0.85, 1.15) });
        }
    },
    // Танк (одна из моделей models/tanks). moveMode: 'stationary' — стоит на
    // месте, 'patrol' — медленно ездит по случайным точкам вокруг спавна.
    addTankEntity(x, z, glbFile, moveMode) {
        const group = new THREE.Group();
        const hullPlaceholder = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 3.6), new THREE.MeshLambertMaterial({ color: 0x4a5a3a }));
        hullPlaceholder.position.y = 0.55;
        group.add(hullPlaceholder);
        // невидимая точка наведения башни — используется только для расчёта
        // угла доворота на цель, отдельно от курса движения корпуса
        const turretGroup = new THREE.Object3D();
        turretGroup.position.set(0, 1.05, 0);
        group.add(turretGroup);
        group.position.set(x, 0, z);
        this.scene.add(group);
        this.attachGlbVisual(group, glbFile, 5.4, { removeObjects: [hullPlaceholder] });
        const tankObstacle = { x, z, radius: 2.4, height: 2.4, destroyed: false };
        this.obstacles.push(tankObstacle);
        this.enemies.push({
            kind: 'tank', group, turret: turretGroup,
            basePos: { x, z }, wanderCenter: { x, z }, wanderRadius: droneRandRange(18, 30),
            moveMode, patrolSpeed: droneRandRange(2.2, 3.4), canFlee: false, _target: null,
            fireRange: 150, fireCooldown: droneRandRange(2, 4),
            fireCooldownRange: [3.5, 5.2], bulletSpeed: 58, bulletDamage: 28,
            bulletColor: 0xff8a3d, spread: 0.02, collideRadius: 2.2,
            hp: 90, score: 300, destroyed: false, obstacle: tankObstacle,
        });
    },
    // Машина (одна из моделей models/machine, см. MACHINE_GLB_CONFIGS).
    // moveMode: 'stationary' — стоит; 'patrol' — едет случайной траекторией
    // между точками; 'flee' — обычно патрулирует, но завидев дрон вблизи
    // удирает в противоположную сторону.
    addMachineEntity(cfg, x, z) {
        const group = new THREE.Group();
        const placeholder = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 3.2), new THREE.MeshLambertMaterial({ color: 0x777a63 }));
        placeholder.position.y = 0.6;
        group.add(placeholder);
        // невидимая точка наведения (аналог турели) — только у вооружённых машин
        let turretRef = null;
        if (cfg.armed) {
            turretRef = new THREE.Object3D();
            turretRef.position.set(0, 1.2, 0);
            group.add(turretRef);
        }
        group.position.set(x, 0, z);
        this.scene.add(group);
        this.attachGlbVisual(group, cfg.file, cfg.scale || 4.2, { removeObjects: [placeholder] });
        const obstacle = { x, z, radius: cfg.radius || 1.8, height: cfg.height || 2.0, destroyed: false };
        this.obstacles.push(obstacle);
        this.enemies.push({
            kind: 'machine', group, turret: turretRef,
            basePos: { x, z }, wanderCenter: { x, z }, wanderRadius: cfg.wanderRadius || droneRandRange(24, 50),
            moveMode: cfg.moveMode, patrolSpeed: cfg.patrolSpeed || droneRandRange(3.5, 6.5),
            fleeSpeed: cfg.fleeSpeed || droneRandRange(10, 14), canFlee: cfg.moveMode === 'flee',
            fleeRange: cfg.fleeRange || 55, _target: null,
            fireRange: cfg.armed ? (cfg.fireRange || 90) : 0,
            fireCooldown: droneRandRange(1, 3), fireCooldownRange: cfg.armed ? (cfg.fireCooldownRange || [1.2, 2.4]) : [999, 999],
            bulletSpeed: 48, bulletDamage: cfg.bulletDamage || 10, bulletColor: 0xffe08a, spread: 0.06,
            collideRadius: cfg.radius || 1.8,
            hp: cfg.hp || 45, score: cfg.armed ? 220 : 0, destroyed: false, obstacle,
        });
    },
    // Вертолёт (models/vertolet) — летает случайной 3D-траекторией (курс +
    // высота), может подниматься/опускаться, кренится/клюёт носом на
    // виражах для правдоподобия, стреляет по дрону. Коллизия с дроном
    // проверяется отдельно, в 3D (см. updateEnemies), в this.obstacles не
    // добавляется — это не наземное препятствие с фиксированной высотой.
    addHelicopterEntity(file, x, z) {
        const group = new THREE.Group();
        const placeholder = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 3.4), new THREE.MeshLambertMaterial({ color: 0x545f47 }));
        group.add(placeholder);
        const altitude = droneRandRange(18, 38);
        group.position.set(x, altitude, z);
        this.scene.add(group);
        this.attachGlbVisual(group, file, 6.5, { removeObjects: [placeholder] });
        this.enemies.push({
            kind: 'heli', group, turret: null,
            basePos: { x, z }, wanderCenter: { x, z }, wanderRadiusXZ: droneRandRange(70, 120),
            altRange: [16, 42], target: null, moveMode: 'heli', speed: droneRandRange(11, 17),
            fireRange: 125, fireCooldown: droneRandRange(2, 4), fireCooldownRange: [2.2, 3.8],
            bulletSpeed: 55, bulletDamage: 14, bulletColor: 0xff5533, spread: 0.05,
            collideRadius: 3.0, hp: 75, score: 280, destroyed: false, _bank: 0, _pitch: 0,
        });
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
        // камикадзе: дрон только что взорвался — пара секунд ожидания перед
        // возрождением на базе. Управление отключено, но мир вокруг (враги,
        // взрыв, камера) продолжает жить, чтобы момент не выглядел «зависшим».
        if (this.respawning) {
            this.updateEnemies(dt);
            this.updateBullets(dt);
            this.updateBombs(dt);
            this.updateFx(dt);
            this.updateCamera(dt);
            this.updateHud();
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
        // база возрождения: если дрон над ней/на ней — можно приземлиться
        // и пополнить бомбы + батарею
        const baseDx = this.pos.x - this.basePos.x;
        const baseDz = this.pos.z - this.basePos.z;
        this.atBase = (baseDx * baseDx + baseDz * baseDz) < (this.baseRadius * this.baseRadius);
        // Приземление НИГДЕ не взрывает дрон — крушение теперь бывает только
        // от столкновения с деревом/техникой (см. checkObstacleCollisions),
        // от вражеского огня или от вылета за пределы поля.
        if (this.hasTakenOff && this.pos.y <= 0.5 && this.velVertical <= 0) {
            this.pos.y = 0.5;
            this.velVertical = 0;
            this.velForward *= 0.85;
        }
        // пополнение бомб и батареи на базе — с анимацией (плавно, не мгновенно)
        if (this.atBase && this.pos.y <= 1.6) {
            const needsBattery = this.battery < 100;
            const needsBombs = this.bombsLeft < this.maxBombs;
            if (needsBattery || needsBombs) {
                this.refueling = true;
                if (needsBattery) {
                    this.battery = Math.min(100, this.battery + 55 * dt);
                }
                if (needsBombs) {
                    this._bombRefillTimer += dt;
                    if (this._bombRefillTimer >= 0.5) {
                        this._bombRefillTimer = 0;
                        this.bombsLeft = Math.min(this.maxBombs, this.bombsLeft + 1);
                    }
                }
                this.showBaseHint(needsBombs ? '📦 Пополняем бомбы…' : '🔋 Заправляем батарею…');
            }
            else {
                this.refueling = false;
                this._bombRefillTimer = 0;
                this.showBaseHint('🏠 Вы на базе — всё готово к вылету!');
            }
        }
        else {
            this.refueling = false;
            this._bombRefillTimer = 0;
            this.hideBaseHint();
        }
        // в режиме камикадзе вылет ограничен минутой — очки и метры за это время
        if (this.selectedLoadout === 'kamikaze') {
            this.kamikazeTimeLeft = Math.max(0, this.kamikazeTimeLeft - dt);
            if (this.kamikazeTimeLeft <= 0) {
                this.finishKamikazeRun();
                return;
            }
        }
        // выход за пределы игрового поля
        if (Math.abs(this.pos.x) > 260 || this.pos.z > 90 || this.pos.z < -470) {
            this.handleCrash('Дрон улетел за пределы зоны полёта');
            return;
        }
        this._droneRadius = model.size * 0.7;
        this.checkObstacleCollisions(this._droneRadius);
        this.updateEnemies(dt);
        this.updateBullets(dt);
        this.updateBombs(dt);
        this.updateCamera(dt);
        this.updateFx(dt);
        this.updateHud();
        if (this.dead)
            return;
        if (this.hp <= 0) {
            this.handleCrash('Дрон сбит вражеским огнём');
            return;
        }
    },
    /* ---- решает, что делать при столкновении/попадании: в режиме
       камикадзе это подрыв с респауном (вылет продолжается на время),
       во всех остальных случаях — обычное окончание вылета ---- */
    handleCrash(reason) {
        if (this.selectedLoadout === 'kamikaze') {
            this.kamikazeDetonate(reason);
        }
        else {
            this.explode(reason);
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
                this.handleCrash('Дрон врезался в препятствие');
                return;
            }
        }
    },
    /* ---- движение групп солдат: общая "виртуальная точка сбора" squad.pos
       бродит по случайным точкам вокруг squad.center, каждый солдат группы
       идёт к ней со своим личным смещением (см. addSoldierSquad) ---- */
    updateSquads(dt) {
        this.squads.forEach((squad) => {
            if (!squad.target || Math.hypot(squad.target.x - squad.pos.x, squad.target.z - squad.pos.z) < 2.5) {
                squad.target = {
                    x: droneClamp(squad.center.x + droneRandRange(-squad.radius, squad.radius), -230, 230),
                    z: droneClamp(squad.center.z + droneRandRange(-squad.radius, squad.radius), -440, -10),
                };
            }
            const dx = squad.target.x - squad.pos.x, dz = squad.target.z - squad.pos.z;
            const dist = Math.hypot(dx, dz) || 1;
            const step = Math.min(dist, squad.speed * dt);
            squad.pos.x += dx / dist * step;
            squad.pos.z += dz / dist * step;
        });
    },
    // Доворачивает group.rotation.y к направлению (dx,dz) с ограниченной
    // угловой скоростью — общая функция для правдоподобного разворота
    // техники/солдат/вертолёта по ходу движения.
    _turnTowards(group, dx, dz, dt, rate) {
        const heading = Math.atan2(dx, dz);
        let diff = heading - group.rotation.y;
        while (diff > Math.PI)
            diff -= Math.PI * 2;
        while (diff < -Math.PI)
            diff += Math.PI * 2;
        group.rotation.y += droneClamp(diff, -dt * rate, dt * rate);
    },
    // Идущий в группе солдат — тянется к (squad.pos + личное смещение).
    updateSquadMember(e, dt) {
        const squad = e.squad;
        if (!squad)
            return;
        const tx = squad.pos.x + e.offset.x, tz = squad.pos.z + e.offset.z;
        const dx = tx - e.group.position.x, dz = tz - e.group.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.05) {
            const step = Math.min(dist, e.walkSpeed * dt);
            e.group.position.x += dx / dist * step;
            e.group.position.z += dz / dist * step;
            this._turnTowards(e.group, dx, dz, dt, 3);
        }
        if (e.obstacle) {
            e.obstacle.x = e.group.position.x;
            e.obstacle.z = e.group.position.z;
        }
    },
    // Наземный "бродящий" юнит (танк/машина в режиме patrol или flee):
    // едет случайной ломаной траекторией между точками вокруг wanderCenter;
    // если canFlee и дрон подобрался ближе fleeRange — вместо этого едет
    // в противоположную от дрона сторону.
    updateGroundMover(e, dt) {
        const px = e.group.position.x, pz = e.group.position.z;
        const toPlayerX = this.pos.x - px, toPlayerZ = this.pos.z - pz;
        const distToPlayer = Math.hypot(toPlayerX, toPlayerZ);
        let tx, tz, speed;
        if (e.canFlee && distToPlayer < e.fleeRange) {
            const away = Math.atan2(-toPlayerX, -toPlayerZ);
            tx = droneClamp(px + Math.sin(away) * 45, -235, 235);
            tz = droneClamp(pz + Math.cos(away) * 45, -445, 65);
            speed = e.fleeSpeed;
            e._target = null; // после погони — новая точка патруля с текущего места
        }
        else {
            if (!e._target || Math.hypot(e._target.x - px, e._target.z - pz) < 3) {
                e._target = {
                    x: droneClamp(e.wanderCenter.x + droneRandRange(-e.wanderRadius, e.wanderRadius), -235, 235),
                    z: droneClamp(e.wanderCenter.z + droneRandRange(-e.wanderRadius, e.wanderRadius), -445, 65),
                };
            }
            tx = e._target.x;
            tz = e._target.z;
            speed = e.patrolSpeed;
        }
        const dx = tx - px, dz = tz - pz;
        const dist = Math.hypot(dx, dz) || 1;
        const step = Math.min(dist, speed * dt);
        e.group.position.x = px + dx / dist * step;
        e.group.position.z = pz + dz / dist * step;
        if (step > 0.001)
            this._turnTowards(e.group, dx, dz, dt, 2.2);
        if (e.obstacle) {
            e.obstacle.x = e.group.position.x;
            e.obstacle.z = e.group.position.z;
        }
    },
    // Вертолёт: случайно выбирает следующую точку (x,z,высота) в пределах
    // wanderRadiusXZ/altRange от точки спавна, плавно летит к ней, кренится
    // на разворотах и слегка "клюёт носом" в движении — для правдоподобия.
    updateHeli(e, dt) {
        const px = e.group.position.x, pz = e.group.position.z;
        if (!e.target || Math.hypot(e.target.x - px, e.target.z - pz) < 5) {
            e.target = {
                x: droneClamp(e.wanderCenter.x + droneRandRange(-e.wanderRadiusXZ, e.wanderRadiusXZ), -240, 240),
                z: droneClamp(e.wanderCenter.z + droneRandRange(-e.wanderRadiusXZ, e.wanderRadiusXZ), -450, 60),
                y: droneRandRange(e.altRange[0], e.altRange[1]),
            };
        }
        const dx = e.target.x - px, dz = e.target.z - pz;
        const distXZ = Math.hypot(dx, dz) || 1;
        const step = Math.min(distXZ, e.speed * dt);
        e.group.position.x = px + dx / distXZ * step;
        e.group.position.z = pz + dz / distXZ * step;
        e.group.position.y = droneApproach(e.group.position.y, e.target.y, 3.5 * dt);
        if (step > 0.001) {
            this._turnTowards(e.group, dx, dz, dt, 1.3);
            let diff = Math.atan2(dx, dz) - e.group.rotation.y;
            while (diff > Math.PI)
                diff -= Math.PI * 2;
            while (diff < -Math.PI)
                diff += Math.PI * 2;
            e._bank = droneApproach(e._bank || 0, droneClamp(-diff * 1.6, -0.5, 0.5), dt * 2.2);
            e._pitch = droneApproach(e._pitch || 0, -0.12, dt * 2);
        }
        else {
            e._bank = droneApproach(e._bank || 0, 0, dt * 1.5);
            e._pitch = droneApproach(e._pitch || 0, 0, dt * 1.5);
        }
        e.group.rotation.z = e._bank;
        e.group.rotation.x = e._pitch;
    },
    updateEnemies(dt) {
        this.updateSquads(dt);
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (e.destroyed)
                continue;
            if (e.moveMode === 'squad')
                this.updateSquadMember(e, dt);
            else if (e.moveMode === 'heli')
                this.updateHeli(e, dt);
            else if (e.moveMode === 'stationary') {
                // стоит на месте — ни корпус, ни точка патруля не двигаются
            }
            else
                this.updateGroundMover(e, dt); // 'patrol' / 'flee'
            if (e.turret && e.fireRange > 0) {
                const dx = this.pos.x - e.turret.getWorldPosition(new THREE.Vector3()).x;
                const dz = this.pos.z - e.turret.getWorldPosition(new THREE.Vector3()).z;
                const targetAngle = Math.atan2(dx, dz);
                // плавный доворот башни/пулемёта на цель (независимо от
                // разворота корпуса — это отдельный дочерний объект)
                let cur = e.turret.rotation.y;
                let diff = targetAngle - cur;
                while (diff > Math.PI)
                    diff -= Math.PI * 2;
                while (diff < -Math.PI)
                    diff += Math.PI * 2;
                e.turret.rotation.y = cur + droneClamp(diff, -dt * 3, dt * 3);
            }
            // вертолёт — столкновение проверяем в 3D (высота у него не
            // фиксирована, как у наземных this.obstacles)
            if (e.kind === 'heli') {
                const ddx = this.pos.x - e.group.position.x;
                const ddy = this.pos.y - e.group.position.y;
                const ddz = this.pos.z - e.group.position.z;
                const rr = e.collideRadius + (this._droneRadius || 0.6);
                if (ddx * ddx + ddy * ddy + ddz * ddz < rr * rr) {
                    this.handleCrash('Дрон столкнулся с вертолётом');
                    return;
                }
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
        origin.y += e.kind === 'soldier' ? 1.2 : (e.kind === 'tank' ? 1.5 : (e.kind === 'heli' ? 0.3 : 1.3));
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
    /* ---- игровая бомба ---- */
    usePayload() {
        if (!this.running || this.paused || this.dead || !this.pos)
            return;
        const loadout = DRONE_LOADOUTS[this.selectedLoadout];
        // Камикадзе не активируется кнопкой/клавишей — заряд срабатывает
        // сам в explode(), как только дрон с чем-нибудь столкнётся.
        if (loadout.oneShot)
            return;
        if (this.bombsLeft <= 0)
            return;
        this.bombsLeft--;
        // Бомба отделяется от дрона и падает под действием гравитации.
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
        this.updateHud();
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
                this.payloadExplosion(pos, b.loadout);
            }
        }
    },
    /* ---- урон по целям в радиусе взрыва (используется бомбой и камикадзе) ---- */
    applyPayloadDamage(pos, loadout) {
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
        return destroyed;
    },
    payloadExplosion(pos, loadout) {
        if (!this.scene)
            return;
        this.spawnExplosionFx(pos);
        this.applyPayloadDamage(pos, loadout);
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
    showBaseHint(text) {
        const el = document.getElementById('droneBaseHint');
        if (!el)
            return;
        if (el.textContent !== text)
            el.textContent = text;
        droneShow(el);
    },
    hideBaseHint() {
        droneHide(document.getElementById('droneBaseHint'));
    },
    updateHud() {
        const hpFill = document.getElementById('droneHpFill');
        if (hpFill)
            hpFill.style.width = Math.max(0, this.hp / this.maxHp * 100) + '%';
        const battFill = document.getElementById('droneBattFill');
        if (battFill)
            battFill.style.width = Math.max(0, this.battery) + '%';
        const timeEl = document.getElementById('droneTimeValue');
        if (timeEl) {
            timeEl.textContent = this.selectedLoadout === 'kamikaze'
                ? String(Math.ceil(this.kamikazeTimeLeft))
                : String(Math.floor(this.timeAlive));
        }
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
        if (payloadBtn && this.selectedLoadout !== 'kamikaze') {
            payloadBtn.disabled = this.bombsLeft <= 0;
            payloadBtn.textContent = this.bombsLeft <= 0
                ? '🏠 Бомбы кончились — на базу!'
                : '💣 Сбросить бомбу [B]';
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
        setTimeout(() => this.finalizeRun(reason), 900);
    },
    /* ---- камикадзе: столкновение не убивает — дрон подрывается (урон по
       площади + очки) и мгновенно возрождается на базе; 60-секундный
       таймер (см. update()) продолжает тикать без остановки ---- */
    kamikazeDetonate(reason) {
        if (this.dead || this.respawning || !this.pos)
            return;
        const loadout = DRONE_LOADOUTS.kamikaze;
        const destroyed = this.applyPayloadDamage(this.pos.clone(), loadout);
        this.spawnExplosionFx(this.pos.clone());
        if (typeof SoundManager !== 'undefined' && SoundManager.playBomb)
            SoundManager.playBomb();
        this.kamikazeHits += 1;
        this.showBaseHint(destroyed > 0 ? `💥 Подрыв! Уничтожено целей: ${destroyed}` : '💥 Подрыв!');
        // Дрон взорвался: прячем модель и на пару секунд замираем на месте
        // взрыва (управление отключено, checkObstacleCollisions не вызывается),
        // а затем — возрождение на базе с полным здоровьем и батареей.
        this.respawning = true;
        this.velForward = 0;
        this.velVertical = 0;
        if (this.droneGroup)
            this.droneGroup.visible = false;
        const sceneAtDetonation = this.scene;
        setTimeout(() => {
            // за время ожидания игрок мог выйти/перезапустить вылет — тогда
            // сцена уже другая (или её нет), возрождать нечего
            if (this.scene !== sceneAtDetonation || !this.pos)
                return;
            this.respawning = false;
            this.pos.set(this.basePos.x, 0.55, this.basePos.z);
            this.prevPos.copy(this.pos);
            this.yaw = Math.PI;
            this.velForward = 0;
            this.velVertical = 0;
            this.hp = this.maxHp;
            this.battery = 100;
            if (this.droneGroup) {
                this.droneGroup.position.copy(this.pos);
                this.droneGroup.rotation.y = this.yaw;
                this.droneGroup.visible = true;
            }
            this.showBaseHint('🚁 Дрон возрождён на базе');
            this.updateHud();
        }, 2000);
        this.updateHud();
    },
    /* ---- конец 60-секундного вылета в режиме камикадзе (не крушение —
       просто вышло время) ---- */
    finishKamikazeRun() {
        if (this.dead)
            return;
        this.dead = true;
        this.running = false;
        if (typeof SoundManager !== 'undefined' && SoundManager.playGood)
            SoundManager.playGood();
        if (this.droneGroup)
            this.droneGroup.visible = false;
        this.finalizeRun(`⏱ Время вышло! Подрывов о цели: ${this.kamikazeHits}`);
    },
    /* ---- общий итог вылета: показывает экран результатов, обновляет
       личный локальный рекорд, копит статистику игрока (уровни/
       достижения) и обновляет глобальные таблицы рекордов по каждому
       выбранному пункту (модель / модуль / заряд) ---- */
    finalizeRun(reason) {
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
        // таблицы рекордов по каждому пункту выбора (модель / модуль / заряд)
        this.submitOptionRecords();
        // накопленная статистика игрока — уровни и достижения дрона
        if (window.DB && this.playerId) {
            const patch = { totalScore: this.score, totalDistance: this.distance, gamesPlayed: 1 };
            if (this.selectedLoadout === 'kamikaze' && this.kamikazeHits > 0)
                patch.kamikazeHits = this.kamikazeHits;
            DB.incrementItem('dronePlayers', this.playerId, patch);
            if (this.score > (this.data.bestScore || 0))
                DB.setItem('dronePlayers', this.playerId, { bestScore: this.score });
            if (this.distance > (this.data.bestDistance || 0))
                DB.setItem('dronePlayers', this.playerId, { bestDistance: this.distance });
            if (this.timeAlive > (this.data.bestTime || 0))
                DB.setItem('dronePlayers', this.playerId, { bestTime: this.timeAlive });
        }
        droneShow(document.getElementById('droneGameOverOverlay'));
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
        this.squads = [];
        this.bullets = [];
        this.bombs = [];
        this.fx = [];
    },
};
// делаем DroneGame доступным как window.DroneGame — иначе `if(window.DroneGame)`
// в script.js всегда ложно (top-level const не создаёт window-свойство).
window.DroneGame = DroneGame;

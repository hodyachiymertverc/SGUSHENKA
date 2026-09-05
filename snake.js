/* =========================================================
   ЗМЕЙКА (.io-стиль) — как в slither.io/worm-io:
     - непрерывное движение, змейка растёт, поедая частицы;
     - управление на ПК — мышкой (направление) + ЛКМ (ускорение),
       на телефоне — пальцем по полю + отдельная кнопка ускорения;
     - 3 уровня сложности против ботов (лёгкий/средний/сложный) —
       отличаются числом ботов, их скоростью и агрессией;
     - онлайн-режим: комната создаётся автоматически (или по коду),
       к ней могут присоединиться другие игроки; в комнате также
       есть боты. Синхронизация — через общий облачный слой (DB),
       без выделенного игрового сервера, поэтому это лёгкая
       (не полностью авторитетная) синхронизация: каждый клиент
       двигает свою змейку сам и периодически публикует её позицию;
     - таблица очков сверху справа, очки — по центру сверху,
       никнеймы — над змейками, змейки разноцветные;
     - маленькие частицы — картинка img/sgushenka.png, крупных
       частиц немного и растят змейку сильнее. Если позже добавятся
       другие картинки частиц — впиши их пути в SNAKE_PARTICLE_SRCS
       ниже, игра сама начнёт использовать их вперемешку.

   Система уровней/достижений змейки, рекорды и никнеймы
   редактируются в админ-панели (вкладка «Змейка») — она уже
   работает через общий генерический редактор коллекций (см.
   admin.js), поэтому отдельного кода здесь для этого не нужно.
========================================================= */
function escapeHtmlS(str){ const d = document.createElement('div'); d.textContent = str == null ? '' : str; return d.innerHTML; }
function snakeShow(el){ if(el) el.classList.remove('hidden'); }
function snakeHide(el){ if(el) el.classList.add('hidden'); }

/* ---------------- картинки частиц-еды ----------------
   Сейчас только сгущёнка. Чтобы добавить ещё картинки частиц —
   просто впиши сюда их пути (до 5 штук), ничего больше менять
   не нужно: игра случайно выбирает картинку для каждой частицы. */
const SNAKE_PARTICLE_SRCS = ['img/sgushenka.png'];
const snakeParticleImgs = [];
SNAKE_PARTICLE_SRCS.forEach(src=>{
  const img = new Image();
  img.onload = ()=> snakeParticleImgs.push(img);
  img.onerror = ()=> {};
  img.src = src;
});

/* ---------------- игровые константы ---------------- */
const SNAKE_WORLD = 6000;                 // сторона квадратного мира (карта увеличена)
const SNAKE_BASE_SPEED = 150;             // мировых единиц/сек
const SNAKE_BOOST_SPEED = 270;
const SNAKE_TURN_RATE = 3.4;              // рад/сек — как быстро игрок поворачивает
const SNAKE_BASE_LEN = 90;
const SNAKE_MIN_LEN = 60;
const SNAKE_GROW_PER_POINT = 15;
const SNAKE_SEG_SPACING = 9;
const SNAKE_BOOST_DRAIN_INTERVAL = 160;   // мс
const SNAKE_BOOST_DRAIN_LEN = 6;
// количество еды масштабировано вместе с картой (площадь выросла
// примерно в 5.3 раза относительно прежнего мира 2600×2600),
// чтобы плотность еды на карте осталась примерно такой же
const SNAKE_SMALL_FOOD_COUNT = 1160;
const SNAKE_BIG_FOOD_COUNT = 64;
const SNAKE_SMALL_FOOD_VALUE = 1;
const SNAKE_BIG_FOOD_VALUE = 8;
const SNAKE_ONLINE_MAX_PLAYERS = 6;

const SNAKE_BOT_PRESETS = {
  easy:   { count: 5,  speed: 0.95, turnRate: 2.2, aggression: 0.05, sight: 240 },
  medium: { count: 9,  speed: 1.10, turnRate: 2.8, aggression: 0.30, sight: 320 },
  hard:   { count: 13, speed: 1.25, turnRate: 3.3, aggression: 0.65, sight: 420 },
  online: { count: 6,  speed: 1.05, turnRate: 2.6, aggression: 0.25, sight: 300 }
};

const SNAKE_BOT_NAMES = [
  'SpindleWorm','GloopPop','FlowSnake','ShiverFlow','CreepGlow','Wormulus',
  'SlimeByte','Slithra','GlowMite','Slinkster','JellyByte','Ophelia','Gwen',
  'Glowline','Elise','Hector','JellyTwine','NoodleFang','ZestWorm','Squiggly'
];

/* ---------------- мелкие геометрические помощники ---------------- */
function snakeDist(x1,y1,x2,y2){ const dx=x2-x1, dy=y2-y1; return Math.sqrt(dx*dx+dy*dy); }
function snakeClamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function snakeNormAngle(a){ a = (a + Math.PI) % (Math.PI*2); if(a < 0) a += Math.PI*2; return a - Math.PI; }

const Snake = {
  playerId: null,
  data: { totalCaught: 0, gamesPlayed: 0, bestEasy: 0, bestMedium: 0, bestHard: 0, bestOnline: 0, unlocked: {} },
  levels: [],
  achievements: [],
  _ready: false,
  _recordsSubscribed: false,
  _loopBound: null,

  mode: null,          // 'bots' | 'online'
  difficulty: 'easy',  // 'easy' | 'medium' | 'hard' | 'online'
  running: false,
  paused: false,

  desiredAngle: 0,
  inputBoost: false,

  roomId: null,
  peers: {},
  _unsubOnlinePlayers: null,

  init(){
    this.playerId = getPlayerId();
    this.bindUI();

    if(!window.DB || !window.DEFAULTS){
      console.warn('Snake: DB или DEFAULTS недоступны — змейка отключена.');
      return;
    }

    DB.seedIfEmpty('snakeLevels', DEFAULTS.snakeLevels);
    DB.seedIfEmpty('snakeAchievements', DEFAULTS.snakeAchievements);

    DB.watchCollection('snakeLevels', list=>{
      this.levels = list.slice().sort((a,b)=> (a.min||0) - (b.min||0));
      this.renderMenuUI();
      this.renderProfileUI();
    });
    DB.watchCollection('snakeAchievements', list=>{
      this.achievements = list.slice().sort((a,b)=> (a.target||0) - (b.target||0));
      this.renderProfileUI();
      this.checkAchievements();
    });
    DB.watchItem('snakePlayers', this.playerId, doc=>{
      this.data = Object.assign(
        { totalCaught: 0, gamesPlayed: 0, bestEasy: 0, bestMedium: 0, bestHard: 0, bestOnline: 0, unlocked: {} },
        doc || {}
      );
      this._ready = true;
      this.renderMenuUI();
      this.renderProfileUI();
      this.checkAchievements();
    });

    DB.getItemOnce('snakePlayers', this.playerId).then(doc=>{
      if(!doc){
        DB.setItem('snakePlayers', this.playerId, {
          name: getNickname(), totalCaught: 0, gamesPlayed: 0, bestEasy: 0, bestMedium: 0, bestHard: 0, bestOnline: 0, unlocked: {}
        });
      } else if(doc.name !== getNickname()){
        DB.setItem('snakePlayers', this.playerId, { name: getNickname() });
      }
    });

    // если вкладку/приложение закрыли прямо во время поиска комнаты или
    // онлайн-партии — обязательно убираем свою запись из комнаты, иначе
    // она "призраком" останется висеть в базе (та же проблема, что чинили
    // в крестиках-ноликах, — комната задваивается для других игроков)
    window.addEventListener('pagehide', ()=> this.leaveOnlineRoom());
    window.addEventListener('beforeunload', ()=> this.leaveOnlineRoom());
  },

  /* ---------------- уровни ---------------- */
  getLevelForCaught(v){
    if(!this.levels.length) return null;
    let level = this.levels[0];
    this.levels.forEach(l=>{ if(v >= l.min) level = l; });
    return level;
  },
  getNextLevel(v){
    for(const l of this.levels){ if(v < l.min) return l; }
    return null;
  },

  /* ---------------- достижения ---------------- */
  checkAchievements(){
    if(!this.achievements.length || !this._ready) return;
    const unlocked = this.data.unlocked || {};
    const metric = (type)=>{
      if(type === 'caught') return this.data.totalCaught || 0;
      if(type === 'games') return this.data.gamesPlayed || 0;
      if(type === 'bestEasy') return this.data.bestEasy || 0;
      if(type === 'bestMedium') return this.data.bestMedium || 0;
      if(type === 'bestHard') return this.data.bestHard || 0;
      if(type === 'bestOnline') return this.data.bestOnline || 0;
      return 0;
    };
    const newly = this.achievements.filter(a=> !unlocked[a.id] && metric(a.type) >= (a.target || 0));
    if(newly.length){
      DB.markUnlocked('snakePlayers', this.playerId, newly.map(a=> a.id));
      newly.forEach(a=> showAchievementToast(a, 'snake'));
    }
  },

  /* ---------------- рекорды ---------------- */
  collectionFor(diff){
    return {
      easy: 'snakeRecordsEasy', medium: 'snakeRecordsMedium',
      hard: 'snakeRecordsHard', online: 'snakeRecordsOnline'
    }[diff] || 'snakeRecordsEasy';
  },
  submitScore(diff, score){
    if(!window.DB) return;
    DB.addRecordIn(this.collectionFor(diff), this.playerId, getNickname(), score);
  },
  recordGameEnd(diff, score, caughtThisGame){
    if(!window.DB || !this._ready) return;
    DB.incrementItem('snakePlayers', this.playerId, { totalCaught: caughtThisGame, gamesPlayed: 1 });
    const bestKey = { easy: 'bestEasy', medium: 'bestMedium', hard: 'bestHard', online: 'bestOnline' }[diff] || 'bestEasy';
    if(score > (this.data[bestKey] || 0)){
      const patch = {}; patch[bestKey] = score;
      DB.setItem('snakePlayers', this.playerId, patch);
    }
    this.submitScore(diff, score);
  },

  /* ---------------- UI: пилюля уровня в меню ---------------- */
  renderMenuUI(){
    const caught = this.data.totalCaught || 0;
    const level = this.getLevelForCaught(caught);
    const next = this.getNextLevel(caught);
    const emojiEl = document.getElementById('snakeLevelEmoji');
    if(emojiEl) emojiEl.textContent = level ? level.emoji : '🥄';
    const nameEl = document.getElementById('snakeLevelName');
    if(nameEl) nameEl.textContent = level ? level.name : 'Новичок-змейка';
    const nextEl = document.getElementById('snakeLevelNext');
    if(nextEl){
      nextEl.textContent = next
        ? `До «${next.name}»: ещё ${Math.max(0, next.min - caught)} банок`
        : 'Максимальный уровень!';
    }
  },

  /* ---------------- UI: профиль/достижения ---------------- */
  renderProfileUI(){
    const caught = this.data.totalCaught || 0;
    const level = this.getLevelForCaught(caught);
    const next = this.getNextLevel(caught);

    const emojiEl = document.getElementById('snakeProfileEmoji');
    if(emojiEl) emojiEl.textContent = level ? level.emoji : '🥄';
    const nameEl = document.getElementById('snakeProfileLevelName');
    if(nameEl) nameEl.textContent = level ? level.name : 'Новичок-змейка';
    const caughtEl = document.getElementById('snakeProfileCaught');
    if(caughtEl) caughtEl.textContent = caught;

    const barFill = document.getElementById('snakeProfileBarFill');
    if(barFill && level){
      let pct = 100;
      if(next){
        const span = Math.max(1, next.min - level.min);
        pct = Math.min(100, Math.max(0, ((caught - level.min) / span) * 100));
      }
      barFill.style.width = pct + '%';
    }
    const nextText = document.getElementById('snakeProfileNextLevel');
    if(nextText){
      nextText.textContent = next
        ? `До уровня «${next.name}»: ещё ${Math.max(0, next.min - caught)} банок.`
        : 'Достигнут максимальный уровень!';
    }

    const grid = document.getElementById('snakeAchievementsGrid');
    if(grid){
      const unlocked = this.data.unlocked || {};
      grid.innerHTML = this.achievements.map(a=>{
        const done = !!unlocked[a.id];
        return `<div class="ach-card ${done ? 'unlocked' : 'locked'}">
          <div class="ach-emoji">${done ? a.emoji : '🔒'}</div>
          <div class="ach-title">${escapeHtmlS(a.title)}</div>
          <div class="ach-desc">${escapeHtmlS(a.desc || '')}</div>
        </div>`;
      }).join('') || '<p class="news-empty">Достижений пока нет.</p>';
    }
  },

  /* ---------------- UI: рекорды (4 вкладки) ---------------- */
  openRecords(){
    snakeShow(document.getElementById('snakeRecordsModal'));
    if(!this._recordsSubscribed && window.DB){
      this._recordsSubscribed = true;
      DB.watchRecordsIn('snakeRecordsEasy', list=> this.renderRecordsList('snakeRecordsListEasy', list));
      DB.watchRecordsIn('snakeRecordsMedium', list=> this.renderRecordsList('snakeRecordsListMedium', list));
      DB.watchRecordsIn('snakeRecordsHard', list=> this.renderRecordsList('snakeRecordsListHard', list));
      DB.watchRecordsIn('snakeRecordsOnline', list=> this.renderRecordsList('snakeRecordsListOnline', list));
    }
  },
  renderRecordsList(elId, list){
    const el = document.getElementById(elId);
    if(!el) return;
    if(!list.length){
      el.innerHTML = '<p class="news-empty">Пока нет рекордов. Стань первым!</p>';
      return;
    }
    const myId = this.playerId;
    el.innerHTML = list.slice(0, 20).map(r=>{
      const cls = r.playerId === myId ? ' class="my-record"' : '';
      return `<li${cls}>${r.score} очков <span>— ${escapeHtmlS(r.name)}, ${r.date}</span></li>`;
    }).join('');
  },

  /* =========================================================
     ЦВЕТА / ИМЕНА
  ========================================================= */
  colorFor(seed){
    let h = 0; const str = String(seed || 'x');
    for(let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360},72%,56%)`;
  },
  genRoomCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = ''; for(let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  },

  /* =========================================================
     СОЗДАНИЕ ЗМЕЕК (игрок / боты)
  ========================================================= */
  makeSnake(id, name, isPlayer, isBot, diffKey){
    const half = SNAKE_WORLD / 2 * 0.7;
    const x = (Math.random() * 2 - 1) * half, y = (Math.random() * 2 - 1) * half;
    const angle = Math.random() * Math.PI * 2;
    const preset = SNAKE_BOT_PRESETS[diffKey] || SNAKE_BOT_PRESETS.medium;
    return {
      id, name, isPlayer: !!isPlayer, isBot: !!isBot, diffKey,
      x, y, angle, targetAngle: angle,
      len: SNAKE_BASE_LEN, score: 0, alive: true,
      trail: [{ x, y }],
      color: this.colorFor(id || name),
      boosting: false, respawnIn: 0,
      turnRate: isBot ? preset.turnRate : SNAKE_TURN_RATE,
      speedMult: isBot ? preset.speed : 1
    };
  },
  makeBot(diffKey){
    const name = SNAKE_BOT_NAMES[Math.floor(Math.random() * SNAKE_BOT_NAMES.length)] + (1 + Math.floor(Math.random() * 99));
    return this.makeSnake('bot_' + Math.random().toString(36).slice(2, 9), name, false, true, diffKey);
  },
  collisionRadius(s){
    return snakeClamp(9 + (s.len || SNAKE_BASE_LEN) * 0.006, 9, 26);
  },

  /* =========================================================
     СТАРТ ИГРЫ — ПРОТИВ БОТОВ
  ========================================================= */
  startGame(diffKey){
    this.mode = 'bots';
    this.difficulty = diffKey;
    snakeHide(document.getElementById('snakeMenuScreen'));
    snakeShow(document.getElementById('snakeGameScreen'));
    snakeHide(document.getElementById('snakeGameOverOverlay'));
    snakeHide(document.getElementById('snakePauseOverlay'));

    const diffPill = document.getElementById('snakeDiffPill');
    const label = { easy: '🥄 Лёгкий', medium: '🐍 Средний', hard: '💣 Сложный' }[diffKey] || '🥄 Лёгкий';
    if(diffPill) diffPill.textContent = label;

    this.fitCanvas();
    this.resetWorld(diffKey);
    this.beginLoop();
  },

  resetWorld(diffKey){
    this.score = 0;
    this.foodEatenUnits = 0;
    const scoreEl = document.getElementById('snakeScoreValue');
    if(scoreEl) scoreEl.textContent = '0';

    this.player = this.makeSnake(this.playerId, getNickname(), true, false, null);
    this.desiredAngle = this.player.angle;
    this.inputBoost = false;
    this.camZoom = 1;
    this.food = [];

    const preset = SNAKE_BOT_PRESETS[diffKey] || SNAKE_BOT_PRESETS.medium;
    this.bots = [];
    for(let i = 0; i < preset.count; i++) this.bots.push(this.makeBot(diffKey));
    this.peers = {};
  },

  beginLoop(){
    this.running = true;
    this.paused = false;
    this._lastTime = performance.now();
    this._lbAcc = 0;
    if(!this._loopBound) this._loopBound = this.loop.bind(this);
    requestAnimationFrame(this._loopBound);
  },

  /* =========================================================
     ОНЛАЙН — ПОДБОР/СОЗДАНИЕ КОМНАТЫ
  ========================================================= */
  openOnlineModal(){
    snakeShow(document.getElementById('snakeOnlineModal'));
    const codeEl = document.getElementById('snakeOnlineRoomCode');
    if(codeEl) codeEl.textContent = '—';
    const countEl = document.getElementById('snakeOnlineRoomCount');
    if(countEl) countEl.textContent = '1';
    const statusEl = document.getElementById('snakeOnlineStatusText');
    const spinner = document.getElementById('snakeOnlineSpinner');
    if(!window.DB){
      if(statusEl) statusEl.textContent = 'Онлайн работает только с настроенным облаком (см. документацию администратора) — пока можно поиграть только против ботов.';
      if(spinner) snakeHide(spinner);
      return;
    }
    if(statusEl) statusEl.textContent = 'Ищем свободную комнату…';
    if(spinner) snakeShow(spinner);
    this.matchmake();
  },
  matchmake(){
    if(!window.DB) return;
    DB.listOnce('snakeRooms').then(rooms=>{
      const now = Date.now();
      const open = (rooms || []).filter(r=> r.status === 'open' && (r.playersCount || 0) < SNAKE_ONLINE_MAX_PLAYERS && now - (r.createdTs || 0) < 10 * 60 * 1000);
      if(open.length){
        this.registerInRoom(open[Math.floor(Math.random() * open.length)].id);
      } else {
        const code = this.genRoomCode();
        DB.addItemWithId('snakeRooms', code, { status: 'open', createdTs: Date.now(), playersCount: 0 });
        this.registerInRoom(code);
      }
    }).catch(()=>{
      const statusEl = document.getElementById('snakeOnlineStatusText');
      if(statusEl) statusEl.textContent = 'Не удалось подключиться к онлайну. Попробуй ещё раз.';
    });
  },
  joinRoomByCode(){
    const input = document.getElementById('snakeOnlineJoinInput');
    const code = (input && input.value || '').trim().toUpperCase();
    if(!code || !window.DB) return;
    this.leaveOnlineRoom(true); // выходим из авто-подобранной комнаты, если уже в ней
    DB.getItemOnce('snakeRooms', code).then(doc=>{
      if(!doc) DB.addItemWithId('snakeRooms', code, { status: 'open', createdTs: Date.now(), playersCount: 0 });
      this.registerInRoom(code);
    });
  },
  registerInRoom(code){
    this.roomId = code;
    const codeEl = document.getElementById('snakeOnlineRoomCode');
    if(codeEl) codeEl.textContent = code;
    const statusEl = document.getElementById('snakeOnlineStatusText');
    if(statusEl) statusEl.textContent = 'Комната готова — можно начинать! Поделись кодом, чтобы позвать друга.';
    const spinner = document.getElementById('snakeOnlineSpinner');
    if(spinner) snakeHide(spinner);

    if(!window.DB) return;
    DB.addItemWithId('snakeOnlinePlayers', this.playerId, {
      roomId: code, name: getNickname(), x: 0, y: 0, angle: 0, len: SNAKE_BASE_LEN,
      score: 0, color: this.colorFor(this.playerId), alive: false, ts: Date.now()
    });
    if(this._unsubOnlinePlayers) this._unsubOnlinePlayers();
    this._unsubOnlinePlayers = DB.watchCollection('snakeOnlinePlayers', list=> this.handleOnlinePlayersUpdate(list));
  },
  handleOnlinePlayersUpdate(list){
    if(!this.roomId) return;
    const now = Date.now();
    let countInRoom = 0;
    const activeIds = new Set();
    (list || []).forEach(doc=>{
      // "протухшая" запись — игрок закрыл вкладку и не успел (или не смог)
      // корректно выйти из комнаты. Чистим сами, чтобы комната не висела
      // в списке открытых "призраком" бесконечно.
      if(now - (doc.ts || 0) > 12000){
        if(window.DB) DB.deleteItem('snakeOnlinePlayers', doc.id);
        return;
      }
      if(doc.roomId !== this.roomId) return;
      countInRoom++;
      if(doc.id === this.playerId) return;
      activeIds.add(doc.id);
      let peer = this.peers[doc.id];
      if(!peer){ peer = this.peers[doc.id] = { id: doc.id, trail: [] }; }
      Object.assign(peer, {
        name: doc.name, x: doc.x, y: doc.y, angle: doc.angle || 0,
        len: doc.len || SNAKE_BASE_LEN, score: doc.score || 0,
        color: doc.color || this.colorFor(doc.id), alive: !!doc.alive
      });
      peer.trail.unshift({ x: doc.x, y: doc.y });
      if(peer.trail.length > 60) peer.trail.length = 60;
    });
    Object.keys(this.peers).forEach(id=>{ if(!activeIds.has(id)) delete this.peers[id]; });
    const countEl = document.getElementById('snakeOnlineRoomCount');
    if(countEl) countEl.textContent = Math.max(1, countInRoom);
  },
  cancelOnlineSearch(){
    this.leaveOnlineRoom();
    snakeHide(document.getElementById('snakeOnlineModal'));
  },
  // покидаем комнату: убираем свою запись игрока и, если в комнате
  // больше никого нет, удаляем и саму комнату — именно это защищает от
  // "задвоенных призрачных комнат", которые оставались висеть в списке
  // после выхода игрока (та же проблема была в онлайне крестиков-ноликов).
  leaveOnlineRoom(keepModalOpen){
    if(this._unsubOnlinePlayers){ this._unsubOnlinePlayers(); this._unsubOnlinePlayers = null; }
    const code = this.roomId;
    const myId = this.playerId;
    if(window.DB && myId){
      try{ DB.deleteItem('snakeOnlinePlayers', myId); }catch(e){ /* страница уже закрывается */ }
      if(code){
        DB.listOnce('snakeOnlinePlayers').then(list=>{
          const now = Date.now();
          const stillThere = (list || []).some(p=> p.roomId === code && p.id !== myId && now - (p.ts || 0) < 12000);
          if(!stillThere) DB.deleteItem('snakeRooms', code);
        }).catch(()=>{});
      }
    }
    this.peers = {};
    this.roomId = null;
    if(!keepModalOpen){ /* оставляем модалку как есть — управляет вызывающий код */ }
  },

  startOnlineGame(){
    if(!this.roomId){ return; }
    this.mode = 'online';
    this.difficulty = 'online';
    snakeHide(document.getElementById('snakeOnlineModal'));
    snakeHide(document.getElementById('snakeMenuScreen'));
    snakeShow(document.getElementById('snakeGameScreen'));
    snakeHide(document.getElementById('snakeGameOverOverlay'));
    snakeHide(document.getElementById('snakePauseOverlay'));

    const diffPill = document.getElementById('snakeDiffPill');
    if(diffPill) diffPill.textContent = '🌐 Онлайн · ' + this.roomId;

    this.fitCanvas();

    this.score = 0;
    this.foodEatenUnits = 0;
    const scoreEl = document.getElementById('snakeScoreValue');
    if(scoreEl) scoreEl.textContent = '0';

    this.player = this.makeSnake(this.playerId, getNickname(), true, false, null);
    this.desiredAngle = this.player.angle;
    this.inputBoost = false;
    this.camZoom = 1;
    this.food = [];

    const preset = SNAKE_BOT_PRESETS.online;
    this.bots = [];
    for(let i = 0; i < preset.count; i++) this.bots.push(this.makeBot('online'));

    this._onlineSyncAcc = 0;
    this.beginLoop();
  },
  updateOnlineSync(dt){
    this._onlineSyncAcc = (this._onlineSyncAcc || 0) + dt;
    if(this._onlineSyncAcc < 0.15) return;
    this._onlineSyncAcc = 0;
    if(!window.DB || !this.roomId) return;
    DB.setItem('snakeOnlinePlayers', this.playerId, {
      x: this.player.x, y: this.player.y, angle: this.player.angle,
      len: this.player.len, score: this.score, alive: this.player.alive, ts: Date.now()
    });
  },

  /* =========================================================
     ИГРОВОЙ ДВИЖОК
  ========================================================= */
  fitCanvas(){
    const screen = document.getElementById('snakeGameScreen');
    const canvas = document.getElementById('snakeCanvas');
    const wrap = document.getElementById('snakeGameWrap');
    if(!screen || !canvas || !wrap || screen.classList.contains('hidden')) return;
    const topbar = document.querySelector('.topbar');
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const used = (topbar ? topbar.offsetHeight : 0) + 24;
    const height = Math.max(320, vh - used);
    wrap.style.height = height + 'px';
    canvas.style.height = height + 'px';
    this.resizeCanvasBuffer();
  },
  resizeCanvasBuffer(){
    const canvas = document.getElementById('snakeCanvas');
    if(!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  },

  loop(now){
    if(!this.running) return;
    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;
    dt = Math.min(dt, 0.05);
    if(!this.paused){
      this.update(dt);
      this.render();
      this._lbAcc = (this._lbAcc || 0) + dt;
      if(this._lbAcc > 0.3){ this._lbAcc = 0; this.renderLeaderboard(); }
    }
    if(this.running) requestAnimationFrame(this._loopBound);
  },

  update(dt){
    this.player.targetAngle = this.desiredAngle;
    this.player.boosting = this.inputBoost;

    this.updateBotAI(dt);
    this.stepSnake(this.player, dt);
    this.bots.forEach(b=> this.stepSnake(b, dt));
    this.updateBotRespawns(dt);

    this.updateFood();
    this.checkCollisions();
    this.updateCamera();

    if(this.mode === 'online') this.updateOnlineSync(dt);
  },

  stepSnake(s, dt){
    if(!s.alive) return;
    let diff = snakeNormAngle(s.targetAngle - s.angle);
    const maxTurn = (s.turnRate || SNAKE_TURN_RATE) * dt;
    if(Math.abs(diff) > maxTurn) diff = Math.sign(diff) * maxTurn;
    s.angle += diff;

    const boosting = !!s.boosting && s.len > SNAKE_MIN_LEN + 10;
    const speed = (boosting ? SNAKE_BOOST_SPEED : SNAKE_BASE_SPEED) * (s.speedMult || 1);
    s.x += Math.cos(s.angle) * speed * dt;
    s.y += Math.sin(s.angle) * speed * dt;

    const last = s.trail[0];
    if(!last || snakeDist(last.x, last.y, s.x, s.y) >= SNAKE_SEG_SPACING * 0.55){
      s.trail.unshift({ x: s.x, y: s.y });
    }
    const maxSpan = s.len + 60;
    let acc = 0, cut = s.trail.length;
    for(let i = 1; i < s.trail.length; i++){
      acc += snakeDist(s.trail[i - 1].x, s.trail[i - 1].y, s.trail[i].x, s.trail[i].y);
      if(acc > maxSpan){ cut = i + 1; break; }
    }
    if(cut < s.trail.length) s.trail.length = cut;

    if(boosting){
      s._boostAcc = (s._boostAcc || 0) + dt * 1000;
      if(s._boostAcc >= SNAKE_BOOST_DRAIN_INTERVAL){
        s._boostAcc = 0;
        s.len = Math.max(SNAKE_MIN_LEN, s.len - SNAKE_BOOST_DRAIN_LEN);
      }
    }

    const half = SNAKE_WORLD / 2;
    if(s.x < -half || s.x > half || s.y < -half || s.y > half){
      this.killSnake(s, 'wall');
    }
  },

  /* ---------------- боты: простое ИИ ---------------- */
  updateBotAI(dt){
    const half = SNAKE_WORLD / 2;
    const margin = 220;
    this.bots.forEach(b=>{
      if(!b.alive) return;
      if(Math.abs(b.x) > half - margin || Math.abs(b.y) > half - margin){
        b.targetAngle = Math.atan2(-b.y, -b.x);
        return;
      }
      b._retarget = (b._retarget || 0) - dt;
      if(b._retarget > 0) return;
      b._retarget = 0.5 + Math.random() * 0.7;

      const preset = SNAKE_BOT_PRESETS[b.diffKey] || SNAKE_BOT_PRESETS.medium;
      const threat = this.findNearest(b, preset.sight, other=> other.len > b.len * 1.15);
      if(threat){ b.targetAngle = Math.atan2(b.y - threat.y, b.x - threat.x); return; }

      if(Math.random() < preset.aggression){
        const prey = this.findNearest(b, preset.sight, other=> other.len < b.len * 0.85);
        if(prey){ b.targetAngle = Math.atan2(prey.y - b.y, prey.x - b.x); return; }
      }

      let nearestFood = null, nearestD = preset.sight;
      this.food.forEach(f=>{
        const d = snakeDist(b.x, b.y, f.x, f.y);
        if(d < nearestD){ nearestD = d; nearestFood = f; }
      });
      if(nearestFood){ b.targetAngle = Math.atan2(nearestFood.y - b.y, nearestFood.x - b.x); }
      else { b.targetAngle = b.angle + (Math.random() - 0.5) * 1.6; }
    });
  },
  // ищет ближайшую другую (живую) змейку в радиусе sight, для которой
  // predicate(other) верен — используется и для "угрозы", и для "добычи"
  findNearest(self, sight, predicate){
    let best = null, bestD = sight;
    const candidates = [this.player].concat(this.bots);
    candidates.forEach(other=>{
      if(other === self || !other.alive) return;
      if(!predicate(other)) return;
      const d = snakeDist(self.x, self.y, other.x, other.y);
      if(d < bestD){ bestD = d; best = other; }
    });
    return best;
  },
  updateBotRespawns(dt){
    const diffKey = this.mode === 'online' ? 'online' : this.difficulty;
    this.bots.forEach(b=>{
      if(b.alive) return;
      b.respawnIn -= dt;
      if(b.respawnIn <= 0){
        Object.assign(b, this.makeSnake(b.id, b.name, false, true, diffKey));
      }
    });
  },

  /* ---------------- еда ---------------- */
  randomFoodPoint(){
    const half = SNAKE_WORLD / 2 - 40;
    return { x: (Math.random() * 2 - 1) * half, y: (Math.random() * 2 - 1) * half };
  },
  randomFood(big){
    const pt = this.randomFoodPoint();
    return { x: pt.x, y: pt.y, big: !!big, imgIdx: Math.floor(Math.random() * 6) };
  },
  spawnFoodBurst(s){
    const count = snakeClamp(Math.floor((s.len || SNAKE_BASE_LEN) / 22), 3, 40);
    const pts = s.trail.length ? s.trail : [{ x: s.x, y: s.y }];
    for(let i = 0; i < count; i++){
      const p = pts[Math.floor(Math.random() * pts.length)];
      const big = Math.random() < 0.12;
      this.food.push({ x: p.x + (Math.random() - 0.5) * 30, y: p.y + (Math.random() - 0.5) * 30, big, imgIdx: Math.floor(Math.random() * 6) });
    }
  },
  updateFood(){
    while(this.food.filter(f=> !f.big).length < SNAKE_SMALL_FOOD_COUNT) this.food.push(this.randomFood(false));
    while(this.food.filter(f=> f.big).length < SNAKE_BIG_FOOD_COUNT) this.food.push(this.randomFood(true));
    this.trySnakeEat(this.player);
    this.bots.forEach(b=>{ if(b.alive) this.trySnakeEat(b); });
  },
  trySnakeEat(s){
    if(!s.alive) return;
    const reach = this.collisionRadius(s) * 0.6 + 10;
    for(let i = this.food.length - 1; i >= 0; i--){
      const f = this.food[i];
      const r = f.big ? 20 : 9;
      if(snakeDist(s.x, s.y, f.x, f.y) < r + reach){
        const val = f.big ? SNAKE_BIG_FOOD_VALUE : SNAKE_SMALL_FOOD_VALUE;
        s.len += val * SNAKE_GROW_PER_POINT;
        s.score = (s.score || 0) + val;
        if(s.isPlayer){
          this.score = (this.score || 0) + val;
          this.foodEatenUnits = (this.foodEatenUnits || 0) + val;
          const scoreEl = document.getElementById('snakeScoreValue');
          if(scoreEl) scoreEl.textContent = this.score;
        }
        this.food.splice(i, 1);
      }
    }
  },

  /* ---------------- столкновения ---------------- */
  killSnake(s, reason){
    if(!s.alive) return;
    s.alive = false;
    s.deathReason = reason;
    this.spawnFoodBurst(s);
    if(s.isPlayer) this.endGame(reason);
    else if(s.isBot) s.respawnIn = 2 + Math.random() * 3;
  },
  checkCollisions(){
    const p = this.player;
    if(!p.alive) return;
    const skipHead = 12;

    // столкновение игрока с самим собой больше не убивает —
    // по просьбе игрока змейка теперь свободно проходит сквозь
    // собственное тело, погибнуть можно только о границу мира,
    // ботов или другого игрока в онлайне.

    // с ботами (в обе стороны — кто врезался, тот и погиб)
    for(const b of this.bots){
      if(!b.alive) continue;
      const rb = this.collisionRadius(b);
      for(let i = 0; i < Math.min(b.trail.length, 260); i++){
        if(snakeDist(p.x, p.y, b.trail[i].x, b.trail[i].y) < rb){ this.killSnake(p, 'enemy'); return; }
      }
      const rp = this.collisionRadius(p);
      for(let i = skipHead; i < Math.min(p.trail.length, 260); i++){
        if(snakeDist(b.x, b.y, p.trail[i].x, p.trail[i].y) < rp){ this.killSnake(b, 'enemy'); break; }
      }
    }
    // боты между собой (упрощённо — только голова о чужое тело)
    for(let i = 0; i < this.bots.length; i++){
      const a = this.bots[i];
      if(!a.alive) continue;
      for(let j = 0; j < this.bots.length; j++){
        if(i === j) continue;
        const bb = this.bots[j];
        if(!bb.alive) continue;
        const rb = this.collisionRadius(bb);
        let hit = false;
        for(let k = 0; k < Math.min(bb.trail.length, 150); k += 3){
          if(snakeDist(a.x, a.y, bb.trail[k].x, bb.trail[k].y) < rb){ hit = true; break; }
        }
        if(hit){ this.killSnake(a, 'enemy'); break; }
      }
    }
    // с онлайн-соперниками (приближённо: только игрок может погибнуть —
    // без выделенного сервера нельзя надёжно "убить" чужого клиента)
    if(this.mode === 'online'){
      for(const id in this.peers){
        const peer = this.peers[id];
        if(!peer.alive) continue;
        const rp = this.collisionRadius(peer);
        const pts = peer.trail && peer.trail.length ? peer.trail : [{ x: peer.x, y: peer.y }];
        for(const pt of pts){
          if(snakeDist(p.x, p.y, pt.x, pt.y) < rp){ this.killSnake(p, 'enemy'); return; }
        }
      }
    }
  },

  updateCamera(){
    const target = snakeClamp(1.02 - (this.player.len - SNAKE_BASE_LEN) / 4500, 0.55, 1.02);
    this.camZoom = this.camZoom == null ? target : this.camZoom + (target - this.camZoom) * 0.05;
  },

  endGame(reason){
    this.running = false;
    const diff = this.difficulty;
    const score = this.score;
    const bestKey = { easy: 'bestEasy', medium: 'bestMedium', hard: 'bestHard', online: 'bestOnline' }[diff] || 'bestEasy';
    const prevBest = this.data[bestKey] || 0;
    const isNewRecord = score > prevBest && score > 0;

    this.recordGameEnd(diff, score, this.foodEatenUnits || 0);

    const finalScoreEl = document.getElementById('snakeFinalScore');
    if(finalScoreEl) finalScoreEl.textContent = score;
    const titleMap = {
      wall: '🧱 Врезался в границу мира!',
      self: '🐍 Змейка укусила себя!',
      enemy: '💥 Тебя съели!'
    };
    const titleEl = document.getElementById('snakeGameOverTitle');
    if(titleEl) titleEl.textContent = titleMap[reason] || '💥 Игра окончена!';
    const recEl = document.getElementById('snakeNewRecordText');
    if(recEl) recEl.classList.toggle('hidden', !isNewRecord);
    snakeShow(document.getElementById('snakeGameOverOverlay'));

    if(this.mode === 'online') this.leaveOnlineRoom();
  },

  /* =========================================================
     РЕНДЕР
  ========================================================= */
  render(){
    const canvas = document.getElementById('snakeCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#12141f';
    ctx.fillRect(0, 0, w, h);

    const p = this.player;
    const zoom = this.camZoom || 1;
    const camX = p.x, camY = p.y;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    this.drawBackgroundPattern(ctx, camX, camY, w, h, zoom);

    const half = SNAKE_WORLD / 2;
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(255,111,145,0.65)';
    ctx.strokeRect(-half, -half, SNAKE_WORLD, SNAKE_WORLD);

    this.food.forEach(f=> this.drawFood(ctx, f));

    this.bots.forEach(b=>{ if(b.alive) this.drawSnakeBody(ctx, b); });
    if(this.mode === 'online'){
      Object.values(this.peers).forEach(peer=>{ if(peer.alive) this.drawSnakeBody(ctx, peer); });
    }
    if(p.alive) this.drawSnakeBody(ctx, p);

    ctx.restore();

    this.drawNicknames(ctx, camX, camY, w, h, zoom);
  },

  drawBackgroundPattern(ctx, camX, camY, w, h, zoom){
    const cell = 70;
    const left = camX - (w / 2) / zoom, right = camX + (w / 2) / zoom;
    const top = camY - (h / 2) / zoom, bottom = camY + (h / 2) / zoom;
    const startX = Math.floor(left / cell) * cell, startY = Math.floor(top / cell) * cell;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1 / zoom;
    for(let x = startX; x < right; x += cell){ ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
    for(let y = startY; y < bottom; y += cell){ ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); }
  },

  drawFood(ctx, f){
    const r = f.big ? 20 : 9;
    const img = snakeParticleImgs.length ? snakeParticleImgs[(f.imgIdx || 0) % snakeParticleImgs.length] : null;
    if(f.big){
      ctx.beginPath(); ctx.arc(f.x, f.y, r + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,159,69,0.25)'; ctx.fill();
    }
    if(img){
      ctx.drawImage(img, f.x - r, f.y - r, r * 2, r * 2);
    } else {
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fillStyle = f.big ? '#FF9F45' : '#FFD34D';
      ctx.fill();
    }
  },

  drawSnakeBody(ctx, s){
    const pts = [{ x: s.x, y: s.y }].concat(s.trail || []);
    const r = this.collisionRadius(s);
    if(pts.length < 2) pts.push({ x: s.x - Math.cos(s.angle) * 4, y: s.y - Math.sin(s.angle) * 4 });

    const path = new Path2D();
    path.moveTo(pts[0].x, pts[0].y);
    for(let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);

    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = r * 2 + 3;
    ctx.stroke(path);

    ctx.strokeStyle = s.color || '#F2B705';
    ctx.lineWidth = r * 2;
    ctx.stroke(path);

    // глаза на голове, смотрят по направлению движения
    const hx = s.x, hy = s.y;
    [-1, 1].forEach(side=>{
      const ang = s.angle + side * 0.6;
      const ex = hx + Math.cos(ang) * r * 0.55, ey = hy + Math.sin(ang) * r * 0.55;
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.28, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      const px = hx + Math.cos(ang) * r * 0.68, py = hy + Math.sin(ang) * r * 0.68;
      ctx.beginPath(); ctx.arc(px, py, r * 0.13, 0, Math.PI * 2); ctx.fillStyle = '#222'; ctx.fill();
    });
  },

  drawNicknames(ctx, camX, camY, w, h, zoom){
    const list = [];
    if(this.player.alive) list.push(this.player);
    this.bots.forEach(b=>{ if(b.alive) list.push(b); });
    if(this.mode === 'online') Object.values(this.peers).forEach(peer=>{ if(peer.alive) list.push(peer); });

    ctx.font = '700 13px Nunito, sans-serif';
    ctx.textAlign = 'center';
    list.forEach(s=>{
      const sx = (s.x - camX) * zoom + w / 2;
      const sy = (s.y - camY) * zoom + h / 2 - this.collisionRadius(s) * zoom - 10;
      if(sx < -60 || sx > w + 60 || sy < -30 || sy > h + 30) return;
      const label = (s.isPlayer ? getNickname() + ' (Вы)' : s.name) || 'Игрок';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(label, sx, sy);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, sx, sy);
    });
  },

  /* ---------------- таблица лидеров (DOM, справа сверху) ---------------- */
  renderLeaderboard(){
    if(!this.player) return;
    const entries = [{ id: 'me', name: getNickname() + ' (Вы)', score: this.score || 0, isMe: true }];
    this.bots.forEach(b=> entries.push({ id: b.id, name: b.name, score: b.score || 0 }));
    if(this.mode === 'online'){
      Object.values(this.peers).forEach(peer=> entries.push({ id: peer.id, name: peer.name || 'Игрок', score: peer.score || 0 }));
    }
    entries.sort((a, b)=> b.score - a.score);

    const listEl = document.getElementById('snakeLeaderboardList');
    if(listEl){
      const top = entries.slice(0, 8);
      listEl.innerHTML = top.map((e, i)=> `<li class="${e.isMe ? 'is-me' : ''}"><span class="lb-rank">${i + 1}</span><span class="lb-name">${escapeHtmlS(e.name)}</span><span class="lb-score">${e.score}</span></li>`).join('');
    }
    const meEl = document.getElementById('snakeLeaderboardMe');
    if(meEl){
      const myIdx = entries.findIndex(e=> e.isMe);
      if(myIdx > 7){
        meEl.textContent = `${myIdx + 1}. ${getNickname()} — ${entries[myIdx].score}`;
        snakeShow(meEl);
      } else {
        snakeHide(meEl);
      }
    }
  },

  /* ---------------- привязка UI ---------------- */
  goToMenu(){
    this.running = false; this.paused = false;
    if(this.mode === 'online') this.leaveOnlineRoom();
    this.mode = null;
    snakeHide(document.getElementById('snakePauseOverlay'));
    snakeHide(document.getElementById('snakeGameOverOverlay'));
    snakeHide(document.getElementById('snakeGameScreen'));
    snakeShow(document.getElementById('snakeMenuScreen'));
  },

  bindUI(){
    const pickBtn = document.getElementById('pickSnakeBtn');
    if(pickBtn){
      pickBtn.addEventListener('click', ()=>{
        snakeHide(document.getElementById('gameSelectScreen'));
        snakeShow(document.getElementById('snakeMenuScreen'));
        this.renderMenuUI();
      });
    }
    const backBtn = document.getElementById('snakeBackToSelectBtn');
    if(backBtn){
      backBtn.addEventListener('click', ()=>{
        snakeHide(document.getElementById('snakeMenuScreen'));
        snakeShow(document.getElementById('gameSelectScreen'));
      });
    }

    const easyBtn = document.getElementById('snakeEasyBtn');
    if(easyBtn) easyBtn.addEventListener('click', ()=> this.startGame('easy'));
    const mediumBtn = document.getElementById('snakeMediumBtn');
    if(mediumBtn) mediumBtn.addEventListener('click', ()=> this.startGame('medium'));
    const hardBtn = document.getElementById('snakeHardBtn');
    if(hardBtn) hardBtn.addEventListener('click', ()=> this.startGame('hard'));

    const onlineBtn = document.getElementById('snakeOnlineBtn');
    if(onlineBtn) onlineBtn.addEventListener('click', ()=> this.openOnlineModal());
    const onlineCancel1 = document.getElementById('snakeOnlineCancelBtn');
    if(onlineCancel1) onlineCancel1.addEventListener('click', ()=> this.cancelOnlineSearch());
    const onlineCancel2 = document.getElementById('snakeOnlineCancelBtn2');
    if(onlineCancel2) onlineCancel2.addEventListener('click', ()=> this.cancelOnlineSearch());
    const onlineJoinBtn = document.getElementById('snakeOnlineJoinBtn');
    if(onlineJoinBtn) onlineJoinBtn.addEventListener('click', ()=> this.joinRoomByCode());
    const onlineStartBtn = document.getElementById('snakeOnlineStartBtn');
    if(onlineStartBtn) onlineStartBtn.addEventListener('click', ()=> this.startOnlineGame());

    const restartBtn = document.getElementById('snakeRestartBtn');
    if(restartBtn){
      restartBtn.addEventListener('click', ()=>{
        if(this.mode === 'online'){ this.goToMenu(); return; }
        this.startGame(this.difficulty);
      });
    }

    const goMenuBtn = document.getElementById('snakeGoMenuBtn');
    if(goMenuBtn) goMenuBtn.addEventListener('click', ()=> this.goToMenu());
    const exitBtn = document.getElementById('snakeExitBtn');
    if(exitBtn) exitBtn.addEventListener('click', ()=> this.goToMenu());
    const pauseExitBtn = document.getElementById('snakePauseExitBtn');
    if(pauseExitBtn) pauseExitBtn.addEventListener('click', ()=> this.goToMenu());

    const pauseBtn = document.getElementById('snakePauseBtn');
    if(pauseBtn){
      pauseBtn.addEventListener('click', ()=>{
        if(!this.running) return;
        this.paused = true;
        snakeShow(document.getElementById('snakePauseOverlay'));
      });
    }
    const resumeBtn = document.getElementById('snakeResumeBtn');
    if(resumeBtn){
      resumeBtn.addEventListener('click', ()=>{
        this.paused = false;
        this._lastTime = performance.now();
        snakeHide(document.getElementById('snakePauseOverlay'));
      });
    }

    const recordsBtn = document.getElementById('snakeRecordsBtn');
    if(recordsBtn) recordsBtn.addEventListener('click', ()=> this.openRecords());
    const profileBtn = document.getElementById('snakeProfileBtn');
    if(profileBtn){
      profileBtn.addEventListener('click', ()=>{
        this.renderProfileUI();
        snakeShow(document.getElementById('snakeProfileModal'));
      });
    }

    // вкладки рекордов (лёгкий/средний/сложный/онлайн)
    const tabMap = { easy: 'Easy', medium: 'Medium', hard: 'Hard', online: 'Online' };
    document.querySelectorAll('[data-snaketab]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        document.querySelectorAll('[data-snaketab]').forEach(b=> b.classList.remove('active'));
        btn.classList.add('active');
        Object.values(tabMap).forEach(key=> snakeHide(document.getElementById('snakeRecordsList' + key)));
        snakeShow(document.getElementById('snakeRecordsList' + (tabMap[btn.dataset.snaketab] || 'Easy')));
      });
    });

    /* ---------------- управление ---------------- */
    const canvas = document.getElementById('snakeCanvas');
    if(canvas){
      const setAngleFromClient = (clientX, clientY)=>{
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const dx = clientX - cx, dy = clientY - cy;
        if(Math.abs(dx) > 4 || Math.abs(dy) > 4) this.desiredAngle = Math.atan2(dy, dx);
      };

      // ПК — мышка задаёт направление, ЛКМ — ускорение
      canvas.addEventListener('mousemove', e=> setAngleFromClient(e.clientX, e.clientY));
      canvas.addEventListener('mousedown', e=>{ if(e.button === 0) this.inputBoost = true; });
      window.addEventListener('mouseup', ()=>{ this.inputBoost = false; });

      // телефон — веди пальцем по полю, направление куда указывает палец
      canvas.addEventListener('touchstart', e=>{
        if(e.touches[0]) setAngleFromClient(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      canvas.addEventListener('touchmove', e=>{
        e.preventDefault();
        if(e.touches[0]) setAngleFromClient(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: false });
    }

    // отдельная кнопка ускорения слева снизу — для телефона
    const boostBtn = document.getElementById('snakeBoostBtn');
    if(boostBtn){
      const on = (e)=>{ if(e) e.preventDefault(); this.inputBoost = true; boostBtn.classList.add('pressed'); };
      const off = (e)=>{ if(e) e.preventDefault(); this.inputBoost = false; boostBtn.classList.remove('pressed'); };
      boostBtn.addEventListener('touchstart', on, { passive: false });
      boostBtn.addEventListener('touchend', off, { passive: false });
      boostBtn.addEventListener('touchcancel', off, { passive: false });
      boostBtn.addEventListener('mousedown', on);
      boostBtn.addEventListener('mouseup', off);
      boostBtn.addEventListener('mouseleave', off);
    }

    // клавиатура — необязательный резерв для ПК: стрелки/A-D довороты, пробел — ускорение
    document.addEventListener('keydown', e=>{
      if(!isScreenVisible('snakeGameScreen')) return;
      if(e.key === ' ' || e.key === 'Spacebar'){ this.inputBoost = true; e.preventDefault(); return; }
      const left = ['ArrowLeft', 'a', 'A', 'ф', 'Ф'];
      const right = ['ArrowRight', 'd', 'D', 'в', 'В'];
      if(left.includes(e.key)){ this.desiredAngle -= 0.22; e.preventDefault(); }
      if(right.includes(e.key)){ this.desiredAngle += 0.22; e.preventDefault(); }
    });
    document.addEventListener('keyup', e=>{
      if(e.key === ' ' || e.key === 'Spacebar') this.inputBoost = false;
    });

    window.addEventListener('resize', ()=> this.fitCanvas());
    window.addEventListener('orientationchange', ()=> setTimeout(()=> this.fitCanvas(), 200));
    if(window.visualViewport) window.visualViewport.addEventListener('resize', ()=> this.fitCanvas());
  }
};

// делаем Snake доступным как window.Snake — иначе `if(window.Snake)`
// в script.js всегда ложно (top-level const не создаёт window-свойство).
window.Snake = Snake;

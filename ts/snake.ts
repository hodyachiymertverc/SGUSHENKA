/* =========================================================
   ЗМЕЙКА (.io-стиль) — как в slither.io/worm-io. TypeScript-версия:
   логика игры не менялась (та же механика, что и раньше), но весь
   код теперь типизирован — общие структуры данных (змейка, еда,
   скины, уровни, достижения, комнаты) описаны интерфейсами, у всех
   функций и методов указаны типы параметров/результата. Это помогает
   компилятору находить опечатки и несовпадения форм данных ещё до
   того, как игра попадёт в браузер (см. tsconfig.json — sourceMap
   собирается, чтобы ошибки в консоли браузера указывали на строку
   в этом файле, а не в скомпилированном js/snake.js).

     - непрерывное движение, змейка растёт, поедая частицы;
     - управление на ПК — мышкой (направление) + ЛКМ (ускорение),
       на телефоне — пальцем по полю (направление считается от
       центра поля точно так же, как и для мыши — см. bindUI) +
       отдельная кнопка ускорения;
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

/* =========================================================
   ВНЕШНИЕ ГЛОБАЛЫ — реализованы в других (обычных JS) файлах
   сайта (db.js, player.js, profile.js, script.js), которые
   подключаются раньше этого скрипта простыми <script>-тегами
   (без модулей). Здесь только объявляем их форму для компилятора.
========================================================= */
interface DBLayer {
  seedIfEmpty(collection: string, data: unknown): void;
  watchCollection(collection: string, cb: (list: any[]) => void): () => void;
  watchItem(collection: string, id: string, cb: (doc: any) => void): void;
  getItemOnce(collection: string, id: string): Promise<any>;
  setItem(collection: string, id: string, patch: any): void;
  incrementItem(collection: string, id: string, patch: any): void;
  markUnlocked(collection: string, id: string, ids: string[]): void;
  addRecordIn(collection: string, id: string, name: string, score: number): void;
  watchRecordsIn(collection: string, cb: (list: any[]) => void): void;
  addItemWithId(collection: string, id: string, data: any): void;
  deleteItem(collection: string, id: string): void;
  listOnce(collection: string): Promise<any[]>;
  measurePing(id: string): Promise<number | null>;
}
declare const DB: DBLayer;
declare const DEFAULTS: any;
declare function getPlayerId(): string;
declare function getNickname(): string;
declare function showAchievementToast(achievement: any, game: string): void;
declare function isScreenVisible(id: string): boolean;
// hasCloudDB() / hasCloudDefaults() используются только как флаг
// "облако настроено" (в bool-проверках) — сами вызовы идут через
// `DB`/`DEFAULTS` выше. Отдельного расширения интерфейса Window под
// них не заводим, чтобы не конфликтовать со встроенными объявлениями
// lib.dom.d.ts — просто читаем их через приведение типа.
function hasCloudDB(): boolean { return !!(window as unknown as { DB?: unknown }).DB; }
function hasCloudDefaults(): boolean { return !!(window as unknown as { DEFAULTS?: unknown }).DEFAULTS; }

function escapeHtmlS(str: string | null | undefined): string {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}
function snakeShow(el: Element | null): void { if(el) el.classList.remove('hidden'); }
function snakeHide(el: Element | null): void { if(el) el.classList.add('hidden'); }
function snakeShowEl(el: Element | null, show: boolean): void { if(el) el.classList.toggle('hidden', !show); }

/* ---------------- картинки частиц-еды ----------------
   Сейчас только сгущёнка. Чтобы добавить ещё картинки частиц —
   просто впиши сюда их пути (до 5 штук), ничего больше менять
   не нужно: игра случайно выбирает картинку для каждой частицы. */
const SNAKE_PARTICLE_SRCS: string[] = ['img/sgushenka.png'];
const snakeParticleImgs: HTMLImageElement[] = [];
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
const SNAKE_ONLINE_SYNC_INTERVAL = 0.15;  // сек между публикациями своей позиции в сеть
const SNAKE_ONLINE_INTERP_TIME = 0.22;    // чуть больше интервала публикации — запас на сетевые задержки/джиттер

type SnakeDifficulty = 'easy' | 'medium' | 'hard' | 'online';
type SnakeMode = 'bots' | 'online' | null;

interface BotPreset { count: number; speed: number; turnRate: number; aggression: number; sight: number; }
const SNAKE_BOT_PRESETS: Record<SnakeDifficulty, BotPreset> = {
  easy:   { count: 10, speed: 0.95, turnRate: 2.2, aggression: 0.05, sight: 240 },
  medium: { count: 16, speed: 1.10, turnRate: 2.8, aggression: 0.30, sight: 320 },
  hard:   { count: 22, speed: 1.25, turnRate: 3.3, aggression: 0.65, sight: 420 },
  online: { count: 10, speed: 1.05, turnRate: 2.6, aggression: 0.25, sight: 300 }
};

const SNAKE_BOT_NAMES: string[] = [
  'SpindleWorm','GloopPop','FlowSnake','ShiverFlow','CreepGlow','Wormulus',
  'SlimeByte','Slithra','GlowMite','Slinkster','JellyByte','Ophelia','Gwen',
  'Glowline','Elise','Hector','JellyTwine','NoodleFang','ZestWorm','Squiggly'
];

/* ---------------- мелкие геометрические помощники ---------------- */
function snakeDist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
function snakeClamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }
function snakeNormAngle(a: number): number { a = (a + Math.PI) % (Math.PI * 2); if(a < 0) a += Math.PI * 2; return a - Math.PI; }
function snakeHashSeed(seed: unknown): number {
  let h = 0; const str = String(seed || 'x');
  for(let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/* =========================================================
   ФОРМЫ ДАННЫХ
========================================================= */
interface Vec2 { x: number; y: number; }

type SkinSelection =
  | { type: 'random'; colors: string[] }
  | { type: 'custom'; colors: string[] }
  | { type: 'color'; id?: string; colors: string[] }
  | { type: 'image'; id?: string; headImg: string; bodyImg: string };

interface SnakeEntity {
  id: string;
  name: string;
  isPlayer: boolean;
  isBot: boolean;
  diffKey: SnakeDifficulty | null;
  x: number;
  y: number;
  angle: number;
  targetAngle: number;
  len: number;
  visLen?: number;
  score: number;
  alive: boolean;
  trail: Vec2[];
  maxSpanEver: number;
  color: string;
  boosting: boolean;
  respawnIn: number;
  turnRate: number;
  speedMult: number;
  skin?: SkinSelection;
  deathReason?: string;
  // состояние простого ИИ бота между кадрами
  _avoidCheck?: number;
  _avoiding?: number;
  _retarget?: number;
  _boostAcc?: number;
  // интерполяция позиции для онлайн-соперников (peers)
  _fromX?: number; _fromY?: number; _fromAngle?: number;
  _toX?: number; _toY?: number; _toAngle?: number;
  _lerpT?: number;
}

interface FoodItem { x: number; y: number; big: boolean; imgIdx: number; }
interface DangerInfo { escapeAngle: number; }

interface LevelDef { min: number; name: string; emoji: string; }
interface AchievementDef { id: string; type: string; target: number; title: string; desc?: string; emoji: string; }
interface SkinDef { id: string; name?: string; colors?: string[]; achievementId?: string; order?: number; }
interface ImageSkinDef { id: string; name?: string; headImg?: string; bodyImg?: string; achievementId?: string; order?: number; }

interface PlayerData {
  totalCaught: number;
  gamesPlayed: number;
  bestEasy: number;
  bestMedium: number;
  bestHard: number;
  bestOnline: number;
  unlocked: Record<string, boolean>;
  selectedSkin?: { type: string; id?: string };
  customSkinColors?: string[];
}

interface RoomListItem { id: string; status: string; createdTs: number; playersCount: number; }
interface LeaderboardEntry { id: string; name: string; score: number; isMe?: boolean; }

/* =========================================================
   ОБЪЕКТ ИГРЫ
========================================================= */
// маленький типовой помощник: говорит компилятору, что `this` внутри
// каждого метода объекта — это ТОЧНО ТАКОЙ ЖЕ объект целиком (включая
// все остальные методы и поля), а не какой-то отдельно выводимый тип.
// Без этого при таком количестве методов в одном литерале TypeScript
// иногда не может самостоятельно "закольцевать" вывод типа `this` и
// откатывается к unknown — ThisType устраняет эту неоднозначность.
function defineSnakeGame<T>(game: T & ThisType<T>): T { return game; }

const Snake = defineSnakeGame({
  playerId: null as string | null,
  data: {
    totalCaught: 0, gamesPlayed: 0, bestEasy: 0, bestMedium: 0, bestHard: 0, bestOnline: 0, unlocked: {}
  } as PlayerData,
  levels: [] as LevelDef[],
  achievements: [] as AchievementDef[],
  skins: [] as SkinDef[],
  imageSkins: [] as ImageSkinDef[],
  _ready: false,
  _recordsSubscribed: false,
  _loopBound: null as ((now: number)=>void) | null,

  mode: null as SnakeMode,               // 'bots' | 'online' | null
  difficulty: 'easy' as SnakeDifficulty,
  running: false,
  paused: false,

  desiredAngle: 0,
  inputBoost: false,

  player: null as SnakeEntity | null,
  bots: [] as SnakeEntity[],
  food: [] as FoodItem[],
  score: 0,
  foodEatenUnits: 0,
  camZoom: 1 as number | null,

  roomId: null as string | null,
  peers: {} as Record<string, SnakeEntity>,
  _unsubOnlinePlayers: null as (() => void) | null,
  _unsubRoomsList: null as (() => void) | null,
  _pingInterval: null as ReturnType<typeof setInterval> | null,

  _lastTime: 0,
  _lbAcc: 0,
  _onlineSyncAcc: 0,
  _skinImageCache: {} as Record<string, HTMLImageElement>,
  _skinCircleCache: {} as Record<string, HTMLCanvasElement>,

  init(): void {
    this.playerId = getPlayerId();
    this.bindUI();

    if(!hasCloudDB() || !hasCloudDefaults()){
      console.warn('Snake: DB или DEFAULTS недоступны — змейка отключена.');
      return;
    }

    DB.seedIfEmpty('snakeLevels', DEFAULTS.snakeLevels);
    DB.seedIfEmpty('snakeAchievements', DEFAULTS.snakeAchievements);
    DB.seedIfEmpty('snakeSkins', DEFAULTS.snakeSkins);
    DB.seedIfEmpty('snakeImageSkins', DEFAULTS.snakeImageSkins || []);

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
    DB.watchCollection('snakeSkins', list=>{
      this.skins = list.slice().sort((a,b)=> (a.order||0) - (b.order||0));
      this.renderSkinModal();
    });
    DB.watchCollection('snakeImageSkins', list=>{
      this.imageSkins = list.slice().sort((a,b)=> (a.order||0) - (b.order||0));
      this.renderSkinModal();
    });
    DB.watchItem('snakePlayers', this.playerId, doc=>{
      this.data = Object.assign(
        { totalCaught: 0, gamesPlayed: 0, bestEasy: 0, bestMedium: 0, bestHard: 0, bestOnline: 0, unlocked: {}, selectedSkin: { type: 'random' }, customSkinColors: [] },
        doc || {}
      );
      this._ready = true;
      this.renderMenuUI();
      this.renderProfileUI();
      this.renderSkinModal();
      this.checkAchievements();
    });

    DB.getItemOnce('snakePlayers', this.playerId).then(doc=>{
      if(!doc){
        DB.setItem('snakePlayers', this.playerId as string, {
          name: getNickname(), totalCaught: 0, gamesPlayed: 0, bestEasy: 0, bestMedium: 0, bestHard: 0, bestOnline: 0, unlocked: {}
        });
      } else if(doc.name !== getNickname()){
        DB.setItem('snakePlayers', this.playerId as string, { name: getNickname() });
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
  getLevelForCaught(v: number): LevelDef | null {
    if(!this.levels.length) return null;
    let level = this.levels[0];
    this.levels.forEach(l=>{ if(v >= l.min) level = l; });
    return level;
  },
  getNextLevel(v: number): LevelDef | null {
    for(const l of this.levels){ if(v < l.min) return l; }
    return null;
  },

  /* ---------------- достижения ---------------- */
  checkAchievements(): void {
    if(!this.achievements.length || !this._ready) return;
    const unlocked = this.data.unlocked || {};
    const metric = (type: string): number => {
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
      DB.markUnlocked('snakePlayers', this.playerId as string, newly.map(a=> a.id));
      newly.forEach(a=> showAchievementToast(a, 'snake'));
    }
  },

  /* ---------------- скины змейки ---------------- */
  // скин с привязкой к достижению открыт, если это достижение уже
  // разблокировано у игрока; скин без привязки (achievementId пуст) —
  // открыт всем сразу
  isSkinUnlocked(skin: SkinDef | ImageSkinDef | null | undefined): boolean {
    if(!skin || !skin.achievementId) return true;
    return !!(this.data.unlocked && this.data.unlocked[skin.achievementId]);
  },
  // "свой" скин (кастомные цвета) открывается только когда ВСЕ обычные
  // цветные скины уже разблокированы — как и попросили: он как бы венчает
  // коллекцию, а не открывается наравне с остальными
  allColorSkinsUnlocked(): boolean {
    const list = this.skins || [];
    if(!list.length) return false;
    return list.every(sk=> this.isSkinUnlocked(sk));
  },
  openSkinModal(): void {
    snakeShow(document.getElementById('snakeSkinModal'));
    this.renderSkinModal();
  },
  renderSkinModal(): void {
    if(!this._ready) return;
    this.renderSkinColorGrid();
    this.renderSkinImageGrid();
  },
  renderSkinColorGrid(): void {
    const grid = document.getElementById('snakeSkinColorGrid');
    if(!grid) return;
    const sel = this.data.selectedSkin || { type: 'random' };
    grid.innerHTML = '';

    // 1) случайный — всегда доступен
    const randomCard = document.createElement('div');
    randomCard.className = 'skin-card' + (sel.type === 'random' ? ' selected' : '');
    randomCard.innerHTML = `
      <div class="skin-swatch"><span style="background:linear-gradient(90deg,#FFD84D,#3D6BFF,#FF4D4D)"></span></div>
      <div class="skin-name">🎲 Случайный</div>`;
    randomCard.addEventListener('click', ()=> this.selectSkin({ type: 'random' }));
    grid.appendChild(randomCard);

    // 2) свой (кастомный) — открывается, только когда собраны все остальные скины
    const customUnlocked = this.allColorSkinsUnlocked();
    const customCard = document.createElement('div');
    customCard.className = 'skin-card' + (sel.type === 'custom' ? ' selected' : '') + (customUnlocked ? '' : ' locked');
    customCard.innerHTML = `
      <div class="skin-swatch"><span style="background:repeating-linear-gradient(45deg,#ccc,#ccc 6px,#eee 6px,#eee 12px)"></span></div>
      <div class="skin-name">🎨 Свой</div>
      ${customUnlocked ? '' : '<div class="skin-lock-note">Открой все скины ниже</div>'}`;
    customCard.addEventListener('click', ()=>{
      if(!customUnlocked) return;
      this.selectSkin({ type: 'custom' });
      this.openCustomEditor();
    });
    grid.appendChild(customCard);

    // 3) обычные скины за достижения
    (this.skins || []).forEach(skin=>{
      const unlocked = this.isSkinUnlocked(skin);
      const card = document.createElement('div');
      card.className = 'skin-card' + (sel.type === 'color' && sel.id === skin.id ? ' selected' : '') + (unlocked ? '' : ' locked');
      const swatch = (skin.colors || []).map(c=> `<span style="background:${c}"></span>`).join('');
      const ach = (this.achievements || []).find(a=> a.id === skin.achievementId);
      card.innerHTML = `
        <div class="skin-swatch">${swatch}</div>
        <div class="skin-name">${skin.name || 'Скин'}</div>
        ${unlocked ? '' : `<div class="skin-lock-note">🔒 ${ach ? ach.title : 'достижение'}</div>`}`;
      card.addEventListener('click', ()=>{
        if(!unlocked) return;
        this.selectSkin({ type: 'color', id: skin.id });
      });
      grid.appendChild(card);
    });

    const editor = document.getElementById('snakeCustomSkinEditor');
    if(editor) snakeShowEl(editor, sel.type === 'custom' && customUnlocked);
    if(sel.type === 'custom' && customUnlocked) this.fillCustomColorInputs();
  },
  renderSkinImageGrid(): void {
    const grid = document.getElementById('snakeSkinImageGrid');
    const emptyEl = document.getElementById('snakeSkinImageEmpty');
    if(!grid) return;
    const list = this.imageSkins || [];
    snakeShowEl(emptyEl, list.length === 0);
    grid.innerHTML = '';
    const sel = this.data.selectedSkin || { type: 'random' };
    list.forEach(skin=>{
      const unlocked = this.isSkinUnlocked(skin);
      const card = document.createElement('div');
      card.className = 'skin-card' + (sel.type === 'image' && sel.id === skin.id ? ' selected' : '') + (unlocked ? '' : ' locked');
      const ach = (this.achievements || []).find(a=> a.id === skin.achievementId);
      card.innerHTML = `
        <div class="skin-thumb">${skin.headImg ? `<img src="${skin.headImg}" alt="">` : '🐍'}</div>
        <div class="skin-name">${skin.name || 'Скин'}</div>
        ${unlocked ? '' : `<div class="skin-lock-note">🔒 ${ach ? ach.title : 'достижение'}</div>`}`;
      card.addEventListener('click', ()=>{
        if(!unlocked) return;
        this.selectSkin({ type: 'image', id: skin.id });
      });
      grid.appendChild(card);
    });
  },
  selectSkin(sel: { type: string; id?: string }): void {
    this.data.selectedSkin = sel;
    if(hasCloudDB()) DB.setItem('snakePlayers', this.playerId as string, { selectedSkin: sel });
    this.renderSkinModal();
  },
  addCustomColorInput(): void {
    const wrap = document.getElementById('snakeCustomColorInputs');
    if(!wrap) return;
    if(wrap.children.length >= 3) return; // максимум 3 цвета в кастомном скине
    const input = document.createElement('input');
    input.type = 'color';
    input.value = '#3DDC5A';
    wrap.appendChild(input);
  },
  fillCustomColorInputs(): void {
    const wrap = document.getElementById('snakeCustomColorInputs');
    if(!wrap) return;
    const colors = (this.data.customSkinColors && this.data.customSkinColors.length) ? this.data.customSkinColors : ['#3DDC5A'];
    wrap.innerHTML = '';
    colors.slice(0, 3).forEach(c=>{
      const input = document.createElement('input');
      input.type = 'color';
      input.value = c;
      wrap.appendChild(input);
    });
  },
  openCustomEditor(): void {
    const editor = document.getElementById('snakeCustomSkinEditor');
    snakeShowEl(editor, true);
    this.fillCustomColorInputs();
  },
  saveCustomSkin(): void {
    const wrap = document.getElementById('snakeCustomColorInputs');
    if(!wrap) return;
    const colors = Array.from(wrap.querySelectorAll<HTMLInputElement>('input[type="color"]')).map(i=> i.value).slice(0, 3);
    if(!colors.length) return;
    this.data.customSkinColors = colors;
    this.data.selectedSkin = { type: 'custom' };
    if(hasCloudDB()) DB.setItem('snakePlayers', this.playerId as string, { customSkinColors: colors, selectedSkin: { type: 'custom' } });
    this.renderSkinModal();
  },
  // итоговый скин, который будет применён к змейке игрока при старте игры
  resolvePlayerSkin(): SkinSelection {
    const sel = this.data.selectedSkin || { type: 'random' };
    if(sel.type === 'custom' && this.allColorSkinsUnlocked()){
      const colors = (this.data.customSkinColors && this.data.customSkinColors.length) ? this.data.customSkinColors : this.paletteFor(this.playerId);
      return { type: 'custom', colors };
    }
    if(sel.type === 'color'){
      const skin = (this.skins || []).find(sk=> sk.id === sel.id);
      if(skin && this.isSkinUnlocked(skin)) return { type: 'color', colors: skin.colors || [] };
    }
    if(sel.type === 'image'){
      const skin = (this.imageSkins || []).find(sk=> sk.id === sel.id);
      if(skin && this.isSkinUnlocked(skin) && skin.headImg && skin.bodyImg){
        return { type: 'image', headImg: skin.headImg, bodyImg: skin.bodyImg, id: skin.id };
      }
    }
    // рандом (или сохранённый скин недоступен/удалён/снят администратором) —
    // как и раньше, стабильный случайный набор цветов по id игрока
    return { type: 'random', colors: this.paletteFor(this.playerId) };
  },

  collectionFor(diff: SnakeDifficulty): string {
    const map: Record<SnakeDifficulty, string> = {
      easy: 'snakeRecordsEasy', medium: 'snakeRecordsMedium',
      hard: 'snakeRecordsHard', online: 'snakeRecordsOnline'
    };
    return map[diff] || 'snakeRecordsEasy';
  },
  submitScore(diff: SnakeDifficulty, score: number): void {
    if(!hasCloudDB()) return;
    DB.addRecordIn(this.collectionFor(diff), this.playerId as string, getNickname(), score);
  },
  recordGameEnd(diff: SnakeDifficulty, score: number, caughtThisGame: number): void {
    if(!hasCloudDB() || !this._ready) return;
    DB.incrementItem('snakePlayers', this.playerId as string, { totalCaught: caughtThisGame, gamesPlayed: 1 });
    const bestKeyMap: Record<SnakeDifficulty, keyof PlayerData> = {
      easy: 'bestEasy', medium: 'bestMedium', hard: 'bestHard', online: 'bestOnline'
    };
    const bestKey = bestKeyMap[diff] || 'bestEasy';
    if(score > ((this.data[bestKey] as number) || 0)){
      const patch: Record<string, number> = {}; patch[bestKey] = score;
      DB.setItem('snakePlayers', this.playerId as string, patch);
    }
    this.submitScore(diff, score);
  },

  /* ---------------- UI: пилюля уровня в меню ---------------- */
  renderMenuUI(): void {
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
  renderProfileUI(): void {
    const caught = this.data.totalCaught || 0;
    const level = this.getLevelForCaught(caught);
    const next = this.getNextLevel(caught);

    const emojiEl = document.getElementById('snakeProfileEmoji');
    if(emojiEl) emojiEl.textContent = level ? level.emoji : '🥄';
    const nameEl = document.getElementById('snakeProfileLevelName');
    if(nameEl) nameEl.textContent = level ? level.name : 'Новичок-змейка';
    const caughtEl = document.getElementById('snakeProfileCaught');
    if(caughtEl) caughtEl.textContent = String(caught);

    const barFill = document.getElementById('snakeProfileBarFill');
    if(barFill && level){
      let pct = 100;
      if(next){
        const span = Math.max(1, next.min - level.min);
        pct = Math.min(100, Math.max(0, ((caught - level.min) / span) * 100));
      }
      (barFill as HTMLElement).style.width = pct + '%';
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
  openRecords(): void {
    snakeShow(document.getElementById('snakeRecordsModal'));
    if(!this._recordsSubscribed && hasCloudDB()){
      this._recordsSubscribed = true;
      DB.watchRecordsIn('snakeRecordsEasy', list=> this.renderRecordsList('snakeRecordsListEasy', list));
      DB.watchRecordsIn('snakeRecordsMedium', list=> this.renderRecordsList('snakeRecordsListMedium', list));
      DB.watchRecordsIn('snakeRecordsHard', list=> this.renderRecordsList('snakeRecordsListHard', list));
      DB.watchRecordsIn('snakeRecordsOnline', list=> this.renderRecordsList('snakeRecordsListOnline', list));
    }
  },
  renderRecordsList(elId: string, list: any[]): void {
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
  colorFor(seed: unknown): string {
    const h = snakeHashSeed(seed);
    return `hsl(${h % 360},72%,56%)`;
  },
  // раньше здесь была палитра из 3 БЛИЗКИХ оттенков одного тона,
  // которые рисовались плавным градиентом вдоль тела — из-за этого все
  // змейки выглядели как варианты одного и того же "переливающегося"
  // цвета. Теперь генерируются 2-3 ЗАМЕТНО РАЗНЫХ цвета (иногда с
  // добавлением белой/тёмной полосы для контраста) — они рисуются
  // сплошными чередующимися полосами (см. drawSnakeBody), а не
  // градиентом, поэтому один бот может быть жёлто-синим, другой —
  // красно-сине-белым, третий — зелёно-красным и т.д. Палитра по-прежнему
  // стабильна для одного и того же "сида" (id/имя), чтобы змейку было
  // легко узнать между кадрами и после респауна.
  paletteFor(seed: unknown): string[] {
    const h = snakeHashSeed(seed);
    const h1 = h % 360;
    const h2 = (h1 + 90 + (h % 97)) % 360; // далеко от h1 по кругу — не соседний оттенок
    const includeNeutral = (h % 7) < 2;    // иногда добавляем белую/тёмную полосу для контраста
    const useThird = (h % 5) !== 0;        // большинство скинов — из 3 цветов, часть — из 2
    const colors = [`hsl(${h1},75%,55%)`, `hsl(${h2},75%,55%)`];
    if(includeNeutral){
      colors.push((h % 14) < 7 ? '#F4F4F4' : '#242424');
    } else if(useThird){
      const h3 = (h1 + 200 + (h % 61)) % 360;
      colors.push(`hsl(${h3},70%,50%)`);
    }
    return colors;
  },
  // фактические цвета скина конкретной змейки: если у неё выбран
  // конкретный скин (s.skin.colors — задаётся при выборе в меню, см.
  // применение скинов ниже), используем его; иначе — как и раньше,
  // стабильный набор по "сиду" (id/имя)
  skinColorsFor(s: SnakeEntity): string[] {
    if(s && s.skin && 'colors' in s.skin && Array.isArray(s.skin.colors) && s.skin.colors.length) return s.skin.colors;
    return this.paletteFor((s && (s.id || s.name)) || s);
  },
  genRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = ''; for(let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  },

  /* =========================================================
     СОЗДАНИЕ ЗМЕЕК (игрок / боты)
  ========================================================= */
  makeSnake(id: string, name: string, isPlayer: boolean, isBot: boolean, diffKey: SnakeDifficulty | null): SnakeEntity {
    const half = SNAKE_WORLD / 2 * 0.7;
    const x = (Math.random() * 2 - 1) * half, y = (Math.random() * 2 - 1) * half;
    const angle = Math.random() * Math.PI * 2;
    const preset = (diffKey && SNAKE_BOT_PRESETS[diffKey]) || SNAKE_BOT_PRESETS.medium;
    return {
      id, name, isPlayer: !!isPlayer, isBot: !!isBot, diffKey,
      x, y, angle, targetAngle: angle,
      len: SNAKE_BASE_LEN, visLen: SNAKE_BASE_LEN, score: 0, alive: true,
      trail: [{ x, y }],
      maxSpanEver: SNAKE_BASE_LEN + 60,
      color: this.colorFor(id || name),
      boosting: false, respawnIn: 0,
      turnRate: isBot ? preset.turnRate : SNAKE_TURN_RATE,
      speedMult: isBot ? preset.speed : 1
    };
  },
  makeBot(diffKey: SnakeDifficulty): SnakeEntity {
    const name = SNAKE_BOT_NAMES[Math.floor(Math.random() * SNAKE_BOT_NAMES.length)] + (1 + Math.floor(Math.random() * 99));
    return this.makeSnake('bot_' + Math.random().toString(36).slice(2, 9), name, false, true, diffKey);
  },
  collisionRadius(s: SnakeEntity): number {
    return snakeClamp(9 + (s.len || SNAKE_BASE_LEN) * 0.006, 9, 26);
  },
  // радиус ТОЛЬКО для отрисовки — по сглаженной визуальной длине
  // (s.visLen), чтобы утолщение змейки при росте тоже не скакало
  // мгновенно, а плавно поспевало за сглаженным хвостом
  collisionRadiusForRender(s: SnakeEntity): number {
    return snakeClamp(9 + (s.visLen !== undefined ? s.visLen : (s.len || SNAKE_BASE_LEN)) * 0.006, 9, 26);
  },
  // возвращает только ту часть следа, которая соответствует текущей
  // (актуальной) длине змейки — в отличие от s.trail, который теперь
  // хранит НЕМНОГО больше истории про запас (см. комментарий в
  // stepSnake про maxSpanEver), чтобы отрастание после ускорения было
  // мгновенным. Используется и при отрисовке, и при проверке столкновений,
  // чтобы видимая длина и "физическая" (по которой бьют столкновения)
  // всегда совпадали.
  visibleSpanTrail(s: SnakeEntity): Vec2[] {
    const trail = s.trail;
    if(!trail || trail.length < 2) return trail || [];
    const want = (s.len || SNAKE_BASE_LEN) + 60;
    let acc = 0;
    for(let i = 1; i < trail.length; i++){
      acc += snakeDist(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y);
      if(acc > want) return trail.slice(0, i + 1);
    }
    return trail;
  },
  // то же самое, но по СГЛАЖЕННОЙ визуальной длине (s.visLen) — только
  // для отрисовки тела змейки, чтобы рост после еды не выглядел резким
  // скачком (см. stepSnake). Столкновения и всё остальное продолжают
  // использовать обычный visibleSpanTrail() по настоящей длине.
  visibleSpanTrailForRender(s: SnakeEntity): Vec2[] {
    const trail = s.trail;
    if(!trail || trail.length < 2) return trail || [];
    const want = (s.visLen !== undefined ? s.visLen : (s.len || SNAKE_BASE_LEN)) + 60;
    let acc = 0;
    for(let i = 1; i < trail.length; i++){
      acc += snakeDist(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y);
      if(acc > want) return trail.slice(0, i + 1);
    }
    return trail;
  },
  // проверка "точка (голова) задела чьё-то тело (след)" — раньше в
  // разных местах след проверялся только по первым 150–260 точкам
  // "для скорости", из-за чего у длинных змей дальний хвост вообще не
  // участвовал в столкновениях, и голова игрока могла беспрепятственно
  // "проходить сквозь" эту невидимо-неуязвимую часть чужого хвоста.
  // Теперь проверяется ВЕСЬ след целиком, но с шагом (stride), который
  // растёт вместе с длиной — так покрытие всегда полное, а количество
  // проверок за кадр остаётся ограниченным (не более ~200 на тело).
  bodyHit(px: number, py: number, trail: Vec2[] | undefined, radius: number): boolean {
    if(!trail || !trail.length) return false;
    const stride = Math.max(1, Math.floor(trail.length / 200));
    for(let i = 0; i < trail.length; i += stride){
      if(snakeDist(px, py, trail[i].x, trail[i].y) < radius) return true;
    }
    return false;
  },

  /* =========================================================
     СТАРТ ИГРЫ — ПРОТИВ БОТОВ
  ========================================================= */
  startGame(diffKey: SnakeDifficulty): void {
    this.mode = 'bots';
    this.difficulty = diffKey;
    snakeHide(document.getElementById('snakeMenuScreen'));
    snakeShow(document.getElementById('snakeGameScreen'));
    snakeHide(document.getElementById('snakeGameOverOverlay'));
    snakeHide(document.getElementById('snakePauseOverlay'));

    const diffPill = document.getElementById('snakeDiffPill');
    const labelMap: Record<SnakeDifficulty, string> = { easy: '🥄 Лёгкий', medium: '🐍 Средний', hard: '💣 Сложный', online: '🌐 Онлайн' };
    if(diffPill) diffPill.textContent = labelMap[diffKey] || '🥄 Лёгкий';

    this.fitCanvas();
    this.resetWorld(diffKey);
    this.beginLoop();
  },

  resetWorld(diffKey: SnakeDifficulty): void {
    this.score = 0;
    this.foodEatenUnits = 0;
    const scoreEl = document.getElementById('snakeScoreValue');
    if(scoreEl) scoreEl.textContent = '0';

    this.player = this.makeSnake(this.playerId as string, getNickname(), true, false, null);
    this.player.skin = this.resolvePlayerSkin();
    this.desiredAngle = this.player.angle;
    this.inputBoost = false;
    this.camZoom = 1;
    this.food = [];

    const preset = SNAKE_BOT_PRESETS[diffKey] || SNAKE_BOT_PRESETS.medium;
    this.bots = [];
    for(let i = 0; i < preset.count; i++) this.bots.push(this.makeBot(diffKey));
    this.peers = {};
  },

  beginLoop(): void {
    this.running = true;
    this.paused = false;
    this._lastTime = performance.now();
    this._lbAcc = 0;
    if(!this._loopBound) this._loopBound = (now: number)=> this.loop(now);
    requestAnimationFrame(this._loopBound);
  },

  /* =========================================================
     ОНЛАЙН — ПОДБОР/СОЗДАНИЕ КОМНАТЫ
  ========================================================= */
  openOnlineModal(): void {
    snakeShow(document.getElementById('snakeOnlineModal'));
    const codeEl = document.getElementById('snakeOnlineRoomCode');
    if(codeEl) codeEl.textContent = '—';
    const countEl = document.getElementById('snakeOnlineRoomCount');
    if(countEl) countEl.textContent = '1';
    const statusEl = document.getElementById('snakeOnlineStatusText');
    const spinner = document.getElementById('snakeOnlineSpinner');
    const joinErr = document.getElementById('snakeOnlineJoinError');
    if(joinErr) snakeHide(joinErr);
    if(!hasCloudDB()){
      if(statusEl) statusEl.textContent = 'Онлайн работает только с настроенным облаком (см. документацию администратора) — пока можно поиграть только против ботов.';
      if(spinner) snakeHide(spinner);
      return;
    }
    if(statusEl) statusEl.textContent = 'Ищем свободную комнату…';
    if(spinner) snakeShow(spinner);
    this.watchOpenRooms();
    this.matchmake();
  },
  // список открытых комнат — обновляется, пока открыта модалка поиска,
  // чтобы было видно, кто прямо сейчас ищет игру (можно зайти к
  // конкретному игроку, а не только в случайно подобранную комнату)
  watchOpenRooms(): void {
    if(this._unsubRoomsList || !hasCloudDB()) return;
    this._unsubRoomsList = DB.watchCollection('snakeRooms', list=> this.renderOpenRoomsList(list));
  },
  stopWatchingOpenRooms(): void {
    if(this._unsubRoomsList){ this._unsubRoomsList(); this._unsubRoomsList = null; }
  },
  renderOpenRoomsList(list: RoomListItem[]): void {
    const el = document.getElementById('snakeOnlineRoomsList');
    if(!el) return;
    const now = Date.now();
    const rooms = (list || [])
      .filter(r=> r.status === 'open' && (r.playersCount || 0) < SNAKE_ONLINE_MAX_PLAYERS && now - (r.createdTs || 0) < 10 * 60 * 1000)
      .sort((a,b)=> (b.createdTs||0) - (a.createdTs||0));
    if(!rooms.length){
      el.innerHTML = '<p class="news-empty">Пока никто не ищет — можешь стать первым!</p>';
      return;
    }
    el.innerHTML = rooms.map(r=>{
      const mine = r.id === this.roomId ? ' (ты здесь)' : '';
      return `<li style="display:flex; align-items:center; justify-content:space-between; gap:8px; list-style:none; padding:6px 0;">
        <span>🔑 <b>${escapeHtmlS(r.id)}</b>${mine} <span style="color:#8a6a45;">· игроков: ${r.playersCount || 0}</span></span>
        <button class="btn btn-secondary btn-small" data-join-room="${escapeHtmlS(r.id)}" ${r.id === this.roomId ? 'disabled' : ''}>Войти</button>
      </li>`;
    }).join('');
    el.querySelectorAll<HTMLButtonElement>('[data-join-room]').forEach(btn=>{
      btn.addEventListener('click', ()=> this.joinSpecificRoom(btn.dataset.joinRoom || ''));
    });
  },
  joinSpecificRoom(code: string): void {
    if(!code || code === this.roomId) return;
    this.leaveOnlineRoom(true);
    this.registerInRoom(code);
  },
  // пытаемся придумать код комнаты, которого ещё точно нет в базе —
  // раньше код генерировался случайно и сразу записывался БЕЗ проверки,
  // из-за чего при неудачном совпадении (или при плохо посеянном ГПСЧ на
  // некоторых устройствах) два разных человека могли получить одну и ту
  // же комнату. Теперь перед созданием всегда проверяем, что код свободен.
  async genUniqueRoomCode(): Promise<string> {
    for(let attempt = 0; attempt < 8; attempt++){
      const code = this.genRoomCode();
      try{
        const existing = await DB.getItemOnce('snakeRooms', code);
        if(!existing) return code;
      }catch(e){
        return code; // не смогли проверить — лучше создать, чем зависнуть
      }
    }
    // крайне маловероятный случай — 8 подряд совпадений; добавляем
    // временную метку, чтобы гарантированно получить уникальный код
    return this.genRoomCode() + (Date.now() % 1000);
  },
  matchmake(): void {
    if(!hasCloudDB()) return;
    DB.listOnce('snakeRooms').then(async (rooms: RoomListItem[])=>{
      const now = Date.now();
      const open = (rooms || []).filter(r=> r.status === 'open' && (r.playersCount || 0) < SNAKE_ONLINE_MAX_PLAYERS && now - (r.createdTs || 0) < 10 * 60 * 1000);
      if(open.length){
        this.registerInRoom(open[Math.floor(Math.random() * open.length)].id);
      } else {
        const code = await this.genUniqueRoomCode();
        DB.addItemWithId('snakeRooms', code, { status: 'open', createdTs: Date.now(), playersCount: 0 });
        this.registerInRoom(code);
      }
    }).catch(()=>{
      const statusEl = document.getElementById('snakeOnlineStatusText');
      if(statusEl) statusEl.textContent = 'Не удалось подключиться к онлайну. Попробуй ещё раз.';
    });
  },
  joinRoomByCode(): void {
    const input = document.getElementById('snakeOnlineJoinInput') as HTMLInputElement | null;
    const errEl = document.getElementById('snakeOnlineJoinError');
    const code = ((input && input.value) || '').trim().toUpperCase();
    if(errEl) snakeHide(errEl);
    if(!code || !hasCloudDB()) return;
    DB.getItemOnce('snakeRooms', code).then(doc=>{
      // раньше, если комнаты с таким кодом не было, она молча создавалась
      // заново — из-за этого опечатка в коде никогда не показывала
      // ошибку, а просто отправляла игрока в новую пустую комнату.
      // Теперь ищем ИМЕННО существующую комнату; если не нашли — прямо
      // говорим об этом, ничего не создавая.
      if(!doc){
        if(errEl){ errEl.textContent = `Комната «${code}» не найдена — проверь код.`; snakeShow(errEl); }
        return;
      }
      this.leaveOnlineRoom(true); // выходим из авто-подобранной комнаты, если уже в ней
      this.registerInRoom(code);
    }).catch(()=>{
      if(errEl){ errEl.textContent = 'Не удалось проверить код. Попробуй ещё раз.'; snakeShow(errEl); }
    });
  },
  registerInRoom(code: string): void {
    this.roomId = code;
    const codeEl = document.getElementById('snakeOnlineRoomCode');
    if(codeEl) codeEl.textContent = code;
    const statusEl = document.getElementById('snakeOnlineStatusText');
    if(statusEl) statusEl.textContent = 'Комната готова — можно начинать! Поделись кодом, чтобы позвать друга.';
    const spinner = document.getElementById('snakeOnlineSpinner');
    if(spinner) snakeHide(spinner);

    if(!hasCloudDB()) return;
    DB.addItemWithId('snakeOnlinePlayers', this.playerId as string, {
      roomId: code, name: getNickname(), x: 0, y: 0, angle: 0, len: SNAKE_BASE_LEN,
      score: 0, color: this.colorFor(this.playerId), alive: false, ts: Date.now()
    });
    if(this._unsubOnlinePlayers) this._unsubOnlinePlayers();
    this._unsubOnlinePlayers = DB.watchCollection('snakeOnlinePlayers', list=> this.handleOnlinePlayersUpdate(list));
  },
  handleOnlinePlayersUpdate(list: any[]): void {
    if(!this.roomId) return;
    const now = Date.now();
    let countInRoom = 0;
    const activeIds = new Set<string>();
    (list || []).forEach(doc=>{
      // "протухшая" запись — игрок закрыл вкладку и не успел (или не смог)
      // корректно выйти из комнаты. Чистим сами, чтобы комната не висела
      // в списке открытых "призраком" бесконечно.
      if(now - (doc.ts || 0) > 12000){
        if(hasCloudDB()) DB.deleteItem('snakeOnlinePlayers', doc.id);
        return;
      }
      if(doc.roomId !== this.roomId) return;
      countInRoom++;
      if(doc.id === this.playerId) return;
      activeIds.add(doc.id);
      let peer = this.peers[doc.id];
      const isNew = !peer;
      if(!peer){ peer = this.peers[doc.id] = { trail: [] } as unknown as SnakeEntity; peer.id = doc.id; }
      const prevX = isNew ? doc.x : peer.x, prevY = isNew ? doc.y : peer.y;
      const prevAngle = isNew ? (doc.angle || 0) : peer.angle;
      Object.assign(peer, {
        name: doc.name, len: doc.len || SNAKE_BASE_LEN, score: doc.score || 0,
        color: doc.color || this.colorFor(doc.id), alive: !!doc.alive
      });
      // не дёргаем позицию сразу на новое значение — вместо этого плавно
      // подъезжаем к ней в updatePeersMotion() на каждом кадре. Раньше
      // x/y/angle менялись только раз в ~150–300мс (когда приходило
      // обновление по сети), и змейка соперника буквально "телепортировалась"
      // между точками — отсюда и сильные рывки в онлайне.
      peer._fromX = isNew ? doc.x : prevX;
      peer._fromY = isNew ? doc.y : prevY;
      peer._fromAngle = isNew ? (doc.angle || 0) : prevAngle;
      peer._toX = doc.x;
      peer._toY = doc.y;
      peer._toAngle = doc.angle || 0;
      peer._lerpT = 0;
      if(isNew){
        peer.x = doc.x; peer.y = doc.y; peer.angle = doc.angle || 0;
        peer.trail = [{ x: doc.x, y: doc.y }];
        peer.maxSpanEver = (doc.len || SNAKE_BASE_LEN) + 60;
      }
    });
    Object.keys(this.peers).forEach(id=>{ if(!activeIds.has(id)) delete this.peers[id]; });
    const countEl = document.getElementById('snakeOnlineRoomCount');
    if(countEl) countEl.textContent = String(Math.max(1, countInRoom));
  },
  // плавно "довозим" каждого онлайн-соперника от последней известной
  // позиции к самой свежей полученной по сети, и на каждом кадре (а не
  // только раз на сетевое обновление) добавляем точку в его след — это
  // и убирает рывки, и чинит "зависающий" хвост.
  updatePeersMotion(dt: number): void {
    if(this.mode !== 'online') return;
    Object.values(this.peers).forEach(peer=>{
      if(peer._toX == null) return;
      peer._lerpT = Math.min(1, (peer._lerpT || 0) + dt / SNAKE_ONLINE_INTERP_TIME);
      const t = peer._lerpT;
      peer.x = (peer._fromX as number) + ((peer._toX as number) - (peer._fromX as number)) * t;
      peer.y = (peer._fromY as number) + ((peer._toY as number) - (peer._fromY as number)) * t;
      let dAngle = snakeNormAngle((peer._toAngle as number) - (peer._fromAngle as number));
      peer.angle = (peer._fromAngle as number) + dAngle * t;

      const last = peer.trail[0];
      if(!last || snakeDist(last.x, last.y, peer.x, peer.y) >= SNAKE_SEG_SPACING * 0.55){
        peer.trail.unshift({ x: peer.x, y: peer.y });
      }
      const wantSpan = (peer.len || SNAKE_BASE_LEN) + 60;
      peer.maxSpanEver = Math.max(peer.maxSpanEver || wantSpan, wantSpan);
      const storageCap = peer.maxSpanEver + 200;
      let acc = 0, cut = peer.trail.length;
      for(let i = 1; i < peer.trail.length; i++){
        acc += snakeDist(peer.trail[i - 1].x, peer.trail[i - 1].y, peer.trail[i].x, peer.trail[i].y);
        if(acc > storageCap){ cut = i + 1; break; }
      }
      if(cut < peer.trail.length) peer.trail.length = cut;
    });
  },
  cancelOnlineSearch(): void {
    this.leaveOnlineRoom();
    this.stopWatchingOpenRooms();
    snakeHide(document.getElementById('snakeOnlineModal'));
  },
  // покидаем комнату: убираем свою запись игрока и, если в комнате
  // больше никого нет, удаляем и саму комнату — именно это защищает от
  // "задвоенных призрачных комнат", которые оставались висеть в списке
  // после выхода игрока (та же проблема была в онлайне крестиков-ноликов).
  leaveOnlineRoom(keepModalOpen?: boolean): void {
    if(this._unsubOnlinePlayers){ this._unsubOnlinePlayers(); this._unsubOnlinePlayers = null; }
    const code = this.roomId;
    const myId = this.playerId;
    if(hasCloudDB() && myId){
      try{ DB.deleteItem('snakeOnlinePlayers', myId); }catch(e){ /* страница уже закрывается */ }
      if(code){
        DB.listOnce('snakeOnlinePlayers').then(list=>{
          const now = Date.now();
          const stillThere = (list || []).some(p=> p.roomId === code && p.id !== myId && now - (p.ts || 0) < 12000);
          if(!stillThere) DB.deleteItem('snakeRooms', code as string);
        }).catch(()=>{});
      }
    }
    this.peers = {};
    this.roomId = null;
    if(!keepModalOpen){ /* оставляем модалку как есть — управляет вызывающий код */ }
  },

  startOnlineGame(): void {
    if(!this.roomId){ return; }
    this.mode = 'online';
    this.difficulty = 'online';
    this.stopWatchingOpenRooms();
    snakeHide(document.getElementById('snakeOnlineModal'));
    snakeHide(document.getElementById('snakeMenuScreen'));
    snakeShow(document.getElementById('snakeGameScreen'));
    snakeHide(document.getElementById('snakeGameOverOverlay'));
    snakeHide(document.getElementById('snakePauseOverlay'));

    const diffPill = document.getElementById('snakeDiffPill');
    if(diffPill) diffPill.textContent = '🌐 Онлайн · ' + this.roomId;
    snakeShowEl(document.getElementById('snakePingPill'), true);
    this.startPingTimer();

    this.fitCanvas();

    this.score = 0;
    this.foodEatenUnits = 0;
    const scoreEl = document.getElementById('snakeScoreValue');
    if(scoreEl) scoreEl.textContent = '0';

    this.player = this.makeSnake(this.playerId as string, getNickname(), true, false, null);
    this.player.skin = this.resolvePlayerSkin();
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
  updateOnlineSync(dt: number): void {
    this._onlineSyncAcc = (this._onlineSyncAcc || 0) + dt;
    if(this._onlineSyncAcc < SNAKE_ONLINE_SYNC_INTERVAL) return;
    this._onlineSyncAcc = 0;
    if(!hasCloudDB() || !this.roomId || !this.player) return;
    DB.setItem('snakeOnlinePlayers', this.playerId as string, {
      x: this.player.x, y: this.player.y, angle: this.player.angle,
      len: this.player.len, score: this.score, alive: this.player.alive, ts: Date.now()
    });
  },

  /* =========================================================
     ИГРОВОЙ ДВИЖОК
  ========================================================= */
  fitCanvas(): void {
    const screen = document.getElementById('snakeGameScreen');
    const canvas = document.getElementById('snakeCanvas') as HTMLCanvasElement | null;
    const wrap = document.getElementById('snakeGameWrap');
    if(!screen || !canvas || !wrap || screen.classList.contains('hidden')) return;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    // как и в остальных играх — считаем реальную позицию обёртки и
    // реальные отступы (padding-bottom у <main> и margin-bottom самой
    // .snake-wrap), а не грубый запас в пикселях, иначе низ поля может
    // уезжать за пределы видимой области на телефоне.
    const wrapTop = wrap.getBoundingClientRect().top;
    const mainEl = document.querySelector('main');
    const mainPadBottom = mainEl ? (parseFloat(getComputedStyle(mainEl).paddingBottom) || 0) : 0;
    const wrapMarginBottom = parseFloat(getComputedStyle(wrap as HTMLElement).marginBottom) || 0;
    const bottomSafety = 8;
    const available = Math.max(0, vh - wrapTop - mainPadBottom - wrapMarginBottom - bottomSafety);
    const height = Math.max(320, available);
    (wrap as HTMLElement).style.height = height + 'px';
    canvas.style.height = height + 'px';
    this.resizeCanvasBuffer();
  },
  resizeCanvasBuffer(): void {
    const canvas = document.getElementById('snakeCanvas') as HTMLCanvasElement | null;
    if(!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  },

  loop(now: number): void {
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
    if(this.running && this._loopBound) requestAnimationFrame(this._loopBound);
  },

  update(dt: number): void {
    if(!this.player) return;
    this.player.targetAngle = this.desiredAngle;
    this.player.boosting = this.inputBoost;

    this.updateBotAI(dt);
    this.stepSnake(this.player, dt);
    this.bots.forEach(b=> this.stepSnake(b, dt));
    this.updateBotRespawns(dt);

    this.updateFood();
    this.checkCollisions();
    this.updateCamera();

    if(this.mode === 'online'){
      this.updatePeersMotion(dt);
      this.updateOnlineSync(dt);
    }
  },

  stepSnake(s: SnakeEntity, dt: number): void {
    if(!s.alive) return;
    // визуальная длина (s.visLen) плавно "догоняет" настоящую длину
    // (s.len) вместо мгновенного скачка — раньше при поедании крупной
    // еды хвост в тот же кадр резко "выстреливал" на всю прибавку сразу
    // (особенно заметно на большой еде: +120 к длине за один кадр). Само
    // столкновение по-прежнему считается по настоящей s.len (см. ниже
    // checkCollisions/visibleSpanTrail) — плавность только визуальная,
    // на честность игры не влияет.
    if(s.visLen === undefined) s.visLen = s.len;
    const lenDiff = s.len - s.visLen;
    if(Math.abs(lenDiff) > 0.05) s.visLen += lenDiff * Math.min(1, dt * 6);
    else s.visLen = s.len;

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
    // Раньше хранилище следа обрезалось строго под ТЕКУЩУЮ длину
    // (s.len+60), и эта история терялась безвозвратно. Из-за этого
    // после ускорения (которое временно уменьшает len) змейка не могла
    // сразу отрастить видимую длину обратно при поедании еды — новых
    // точек следа ещё не накопилось, и хвост визуально "подвисал"/
    // отставал, пока змейка не проедет заново нужное расстояние.
    // Теперь храним историю по МАКСИМАЛЬНОЙ когда-либо достигнутой
    // длине (maxSpanEver) — так временное уменьшение len при ускорении
    // не выбрасывает нужные точки, и отрастание происходит мгновенно.
    // Видимая (отображаемая и участвующая в столкновениях) часть следа
    // при этом отдельно ограничивается текущей длиной — см. visibleSpanTrail().
    const wantSpan = s.len + 60;
    s.maxSpanEver = Math.max(s.maxSpanEver || wantSpan, wantSpan);
    const storageCap = s.maxSpanEver + 200;
    let acc = 0, cut = s.trail.length;
    for(let i = 1; i < s.trail.length; i++){
      acc += snakeDist(s.trail[i - 1].x, s.trail[i - 1].y, s.trail[i].x, s.trail[i].y);
      if(acc > storageCap){ cut = i + 1; break; }
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
  updateBotAI(dt: number): void {
    if(!this.player) return;
    const half = SNAKE_WORLD / 2;
    const margin = 220;
    // общий список "тел", о которые бот может разбиться, — считаем один
    // раз на весь вызов (а не заново для каждого бота), чтобы не тратить
    // время на повторный сбор одних и тех же змей 10-20 раз за кадр
    const allSnakes = ([this.player] as SnakeEntity[]).concat(this.bots).filter(s=> s.alive);
    const peerSnakes = this.mode === 'online' ? Object.values(this.peers || {}).filter(p=> p.alive) : [];
    const obstacles = allSnakes.concat(peerSnakes);

    this.bots.forEach(b=>{
      if(!b.alive) return;
      if(Math.abs(b.x) > half - margin || Math.abs(b.y) > half - margin){
        b.targetAngle = Math.atan2(-b.y, -b.x);
        b.boosting = false;
        b._avoiding = 0;
        return;
      }

      const preset = (b.diffKey && SNAKE_BOT_PRESETS[b.diffKey]) || SNAKE_BOT_PRESETS.medium;

      // --- срочное уклонение от чужого ТЕЛА впереди по курсу ---
      // раньше боты вообще не замечали чужие тела (только "голову"
      // другой змейки — см. findNearest ниже), из-за чего они то и дело
      // слепо въезжали в длинный хвост соседа или игрока. Эта проверка
      // идёт чаще, чем обычное "перепланирование" курса, и имеет над
      // ним приоритет на короткое время, пока бот уходит с опасного пути.
      b._avoidCheck = (b._avoidCheck || 0) - dt;
      if(b._avoidCheck <= 0){
        b._avoidCheck = 0.12;
        const danger = this.botLookaheadDanger(b, obstacles);
        if(danger){
          b.targetAngle = danger.escapeAngle;
          b._avoiding = 0.45;
        }
      }
      if((b._avoiding || 0) > 0){
        b._avoiding -= dt;
        return; // пока уклоняемся от столкновения — не даём остальному ИИ перебить курс
      }

      b._retarget = (b._retarget || 0) - dt;
      if(b._retarget > 0) return;
      // более сложные (агрессивные) боты передумывают чаще — реагируют
      // на изменение обстановки быстрее, а не только раз в 0.5-1.2с,
      // как было раньше для всех уровней сложности одинаково
      const baseInterval = snakeClamp(0.85 - preset.aggression * 0.55, 0.28, 0.85);
      b._retarget = baseInterval * (0.7 + Math.random() * 0.6);

      const threat = this.findNearest(b, preset.sight, other=> other.len > b.len * 1.15);
      if(threat){
        b.targetAngle = Math.atan2(b.y - threat.y, b.x - threat.x);
        // от серьёзной угрозы боты теперь могут убегать на ускорении
        // (если могут себе это позволить по длине) — раньше буст ботам
        // вообще не был доступен, и от погони было слишком легко уйти
        const closeBy = snakeDist(b.x, b.y, threat.x, threat.y) < preset.sight * 0.5;
        b.boosting = closeBy && b.len > SNAKE_MIN_LEN + 220;
        return;
      }

      if(Math.random() < preset.aggression){
        const prey = this.findNearest(b, preset.sight, other=> other.len < b.len * 0.85);
        if(prey){
          b.targetAngle = Math.atan2(prey.y - b.y, prey.x - b.x);
          // короткий рывок на добивание добычи вблизи — тоже раньше
          // был недоступен ботам, из-за чего погоня почти никогда не
          // приводила к успеху
          const d = snakeDist(b.x, b.y, prey.x, prey.y);
          b.boosting = d < 160 && b.len > SNAKE_MIN_LEN + 150 && Math.random() < 0.5;
          return;
        }
      }
      b.boosting = false;

      let nearestFood: FoodItem | null = null, nearestD = preset.sight;
      this.food.forEach(f=>{
        const d = snakeDist(b.x, b.y, f.x, f.y);
        if(d < nearestD){ nearestD = d; nearestFood = f; }
      });
      if(nearestFood){ b.targetAngle = Math.atan2((nearestFood as FoodItem).y - b.y, (nearestFood as FoodItem).x - b.x); }
      else { b.targetAngle = b.angle + (Math.random() - 0.5) * 1.6; }
    });
  },
  // дешёвая проверка "не влетит ли бот в чужое тело, если продолжит
  // ехать текущим курсом" — пробует несколько точек впереди по курсу на
  // разном расстоянии; если там опасно, перебирает запасные углы (от
  // ближайших к текущему курсу до полного разворота) и возвращает первый
  // свободный. Специально не претендует на идеальную точность (использует
  // тот же принцип "шаг по следу", что и bodyHit) — этого достаточно,
  // чтобы бот перестал казаться слепым, но не нагружает игру лишним.
  botLookaheadDanger(b: SnakeEntity, allObstacles: SnakeEntity[]): DangerInfo | null {
    const speed = SNAKE_BASE_SPEED * (b.speedMult || 1);
    const probeDists = [speed * 0.35, speed * 0.7, speed * 1.15];
    const dangerR = this.collisionRadius(b) + 14;
    const lookRange = probeDists[probeDists.length - 1] + 260;

    // грубый отсев: тела змей, которые заведомо слишком далеко, чтобы
    // хоть один их сегмент попал в радиус проверки, вообще не смотрим
    const relevant = allObstacles.filter(other=> other !== b && snakeDist(b.x, b.y, other.x, other.y) < lookRange + (other.len || 0) * 0.5);
    if(!relevant.length) return null;

    const trails = relevant.map(other=> this.visibleSpanTrail(other));

    const hitsObstacle = (angle: number): boolean=>{
      for(const dist of probeDists){
        const px = b.x + Math.cos(angle) * dist;
        const py = b.y + Math.sin(angle) * dist;
        for(const trail of trails){
          if(!trail || !trail.length) continue;
          const stride = Math.max(1, Math.floor(trail.length / 40));
          for(let i = 0; i < trail.length; i += stride){
            if(snakeDist(px, py, trail[i].x, trail[i].y) < dangerR) return true;
          }
        }
      }
      return false;
    };

    if(!hitsObstacle(b.angle)) return null; // курс впереди свободен

    const offsets = [0.5, -0.5, 0.9, -0.9, 1.4, -1.4, 2.2, -2.2, Math.PI];
    for(const off of offsets){
      const angle = b.angle + off;
      if(!hitsObstacle(angle)) return { escapeAngle: angle };
    }
    return { escapeAngle: b.angle + Math.PI }; // со всех сторон тела — хотя бы развернуться
  },
  // ищет ближайшую другую (живую) змейку в радиусе sight, для которой
  // predicate(other) верен — используется и для "угрозы", и для "добычи".
  // В онлайне теперь учитываются и реальные соперники (peers), а не
  // только боты и сам игрок — раньше боты полностью игнорировали живых
  // онлайн-игроков при выборе цели/угрозы.
  findNearest(self: SnakeEntity, sight: number, predicate: (other: SnakeEntity)=>boolean): SnakeEntity | null {
    let best: SnakeEntity | null = null, bestD = sight;
    const candidates: SnakeEntity[] = ([] as SnakeEntity[]).concat(this.player ? [this.player] : []).concat(this.bots);
    if(this.mode === 'online') Array.prototype.push.apply(candidates, Object.values(this.peers || {}));
    candidates.forEach(other=>{
      if(other === self || !other.alive) return;
      if(!predicate(other)) return;
      const d = snakeDist(self.x, self.y, other.x, other.y);
      if(d < bestD){ bestD = d; best = other; }
    });
    return best;
  },
  updateBotRespawns(dt: number): void {
    const diffKey: SnakeDifficulty = this.mode === 'online' ? 'online' : this.difficulty;
    this.bots.forEach(b=>{
      if(b.alive) return;
      b.respawnIn -= dt;
      if(b.respawnIn <= 0){
        Object.assign(b, this.makeSnake(b.id, b.name, false, true, diffKey));
      }
    });
  },

  /* ---------------- еда ---------------- */
  randomFoodPoint(): Vec2 {
    const half = SNAKE_WORLD / 2 - 40;
    return { x: (Math.random() * 2 - 1) * half, y: (Math.random() * 2 - 1) * half };
  },
  randomFood(big: boolean): FoodItem {
    const pt = this.randomFoodPoint();
    return { x: pt.x, y: pt.y, big: !!big, imgIdx: Math.floor(Math.random() * 6) };
  },
  spawnFoodBurst(s: SnakeEntity): void {
    // раньше выпадало не больше 40 частиц независимо от размера — для
    // по-настоящему большой змейки это выглядело как "почти ничего не
    // выпало". Теперь порог значительно выше и сильнее зависит от длины.
    const count = snakeClamp(Math.floor((s.len || SNAKE_BASE_LEN) / 14), 4, 220);
    const visible = this.visibleSpanTrail(s);
    const pts = visible.length ? visible : [{ x: s.x, y: s.y }];
    for(let i = 0; i < count; i++){
      const p = pts[Math.floor(Math.random() * pts.length)];
      const big = Math.random() < 0.12;
      this.food.push({ x: p.x + (Math.random() - 0.5) * 30, y: p.y + (Math.random() - 0.5) * 30, big, imgIdx: Math.floor(Math.random() * 6) });
    }
  },
  updateFood(): void {
    while(this.food.filter(f=> !f.big).length < SNAKE_SMALL_FOOD_COUNT) this.food.push(this.randomFood(false));
    while(this.food.filter(f=> f.big).length < SNAKE_BIG_FOOD_COUNT) this.food.push(this.randomFood(true));
    if(this.player) this.trySnakeEat(this.player);
    this.bots.forEach(b=>{ if(b.alive) this.trySnakeEat(b); });
  },
  trySnakeEat(s: SnakeEntity): void {
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
          if(scoreEl) scoreEl.textContent = String(this.score);
        }
        this.food.splice(i, 1);
      }
    }
  },

  /* ---------------- столкновения ---------------- */
  killSnake(s: SnakeEntity, reason: string): void {
    if(!s.alive) return;
    s.alive = false;
    s.deathReason = reason;
    this.spawnFoodBurst(s);
    if(s.isPlayer) this.endGame(reason);
    else if(s.isBot) s.respawnIn = 2 + Math.random() * 3;
  },
  checkCollisions(): void {
    const p = this.player;
    if(!p || !p.alive) return;
    const skipHead = 12;

    // столкновение игрока с самим собой больше не убивает —
    // по просьбе игрока змейка теперь свободно проходит сквозь
    // собственное тело, погибнуть можно только о границу мира,
    // ботов или другого игрока в онлайне.

    // видимый след (в точности соответствующий текущей длине) считаем
    // один раз за кадр на тело — используется и ниже в двойном цикле
    // "боты между собой", чтобы не пересчитывать его многократно
    const playerTrail = this.visibleSpanTrail(p);
    const playerTrailForBots = playerTrail.slice(skipHead);
    const botTrails = new Map<SnakeEntity, Vec2[]>();
    this.bots.forEach(b=>{ if(b.alive) botTrails.set(b, this.visibleSpanTrail(b)); });

    // с ботами (в обе стороны — кто врезался, тот и погиб). Проверяем
    // ВЕСЬ след целиком (см. bodyHit) — раньше проверялись только первые
    // 260 точек следа, и у достаточно длинного бота дальний хвост
    // становился "неосязаемым": игрок мог столкнуться с ним и пройти
    // насквозь, будто бота там не было.
    for(const b of this.bots){
      if(!b.alive) continue;
      const rb = this.collisionRadius(b);
      if(this.bodyHit(p.x, p.y, botTrails.get(b), rb)){ this.killSnake(p, 'enemy'); return; }
      const rp = this.collisionRadius(p);
      if(this.bodyHit(b.x, b.y, playerTrailForBots, rp)){ this.killSnake(b, 'enemy'); }
    }
    // боты между собой (упрощённо — только голова о чужое тело)
    for(let i = 0; i < this.bots.length; i++){
      const a = this.bots[i];
      if(!a.alive) continue;
      for(let j = 0; j < this.bots.length; j++){
        if(i === j) continue;
        const bb = this.bots[j];
        if(!bb.alive) continue;
        if(this.bodyHit(a.x, a.y, botTrails.get(bb), this.collisionRadius(bb))){ this.killSnake(a, 'enemy'); break; }
      }
    }
    // с онлайн-соперниками (приближённо: только игрок может погибнуть —
    // без выделенного сервера нельзя надёжно "убить" чужого клиента)
    if(this.mode === 'online'){
      for(const id in this.peers){
        const peer = this.peers[id];
        if(!peer.alive) continue;
        const rp = this.collisionRadius(peer);
        const pts = this.visibleSpanTrail(peer);
        const trail = pts.length ? pts : [{ x: peer.x, y: peer.y }];
        if(this.bodyHit(p.x, p.y, trail, rp)){ this.killSnake(p, 'enemy'); return; }
      }
    }
  },

  updateCamera(): void {
    if(!this.player) return;
    const target = snakeClamp(1.02 - (this.player.len - SNAKE_BASE_LEN) / 4500, 0.55, 1.02);
    this.camZoom = this.camZoom == null ? target : this.camZoom + (target - this.camZoom) * 0.05;
  },

  endGame(reason: string): void {
    this.running = false;
    const diff = this.difficulty;
    const score = this.score;
    const bestKeyMap: Record<SnakeDifficulty, keyof PlayerData> = {
      easy: 'bestEasy', medium: 'bestMedium', hard: 'bestHard', online: 'bestOnline'
    };
    const bestKey = bestKeyMap[diff] || 'bestEasy';
    const prevBest = (this.data[bestKey] as number) || 0;
    const isNewRecord = score > prevBest && score > 0;

    this.recordGameEnd(diff, score, this.foodEatenUnits || 0);

    const finalScoreEl = document.getElementById('snakeFinalScore');
    if(finalScoreEl) finalScoreEl.textContent = String(score);
    const titleMap: Record<string, string> = {
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
  render(): void {
    const canvas = document.getElementById('snakeCanvas') as HTMLCanvasElement | null;
    if(!canvas || !this.player) return;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
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

  drawBackgroundPattern(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number, zoom: number): void {
    const cell = 70;
    const left = camX - (w / 2) / zoom, right = camX + (w / 2) / zoom;
    const top = camY - (h / 2) / zoom, bottom = camY + (h / 2) / zoom;
    const startX = Math.floor(left / cell) * cell, startY = Math.floor(top / cell) * cell;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1 / zoom;
    for(let x = startX; x < right; x += cell){ ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
    for(let y = startY; y < bottom; y += cell){ ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); }
  },

  drawFood(ctx: CanvasRenderingContext2D, f: FoodItem): void {
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

  drawSnakeBody(ctx: CanvasRenderingContext2D, s: SnakeEntity): void {
    const visible = this.visibleSpanTrailForRender(s);
    const pts: Vec2[] = [{ x: s.x, y: s.y }].concat(visible || []);
    const r = this.collisionRadiusForRender(s);
    if(pts.length < 2) pts.push({ x: s.x - Math.cos(s.angle) * 4, y: s.y - Math.sin(s.angle) * 4 });

    // картиночный скин (голова+тело из img, см. п.6/7 запроса) — если
    // обе картинки заданы, рисуем ими; иначе (например, при загрузке
    // самих картинок из base64) используем обычную полосатую отрисовку
    if(s.skin && s.skin.type === 'image' && s.skin.headImg && s.skin.bodyImg){
      this.drawSnakeBodyImage(ctx, s, pts, r);
      return;
    }
    this.drawSnakeBandBody(ctx, s, pts, r);
  },
  // кэш уже загруженных картинок скинов — чтобы не пересоздавать Image()
  // на каждый кадр (это разрушило бы всю плавность отрисовки)
  getSkinImage(src: string | null | undefined): HTMLImageElement | null {
    if(!src) return null;
    if(!this._skinImageCache) this._skinImageCache = {};
    let img = this._skinImageCache[src];
    if(!img){
      img = new Image();
      img.src = src;
      this._skinImageCache[src] = img;
    }
    return img;
  },
  // тело "картиночного" скина строится из круглых (не овальных!)
  // повторяющихся отпечатков одной и той же картинки, каждый из
  // которых накладывается на предыдущий ровно наполовину диаметра —
  // как попросили: "круг должен накладываться на другой круг наполовину".
  //
  // Раньше кусочек рисовался КВАДРАТНОЙ картинкой, повёрнутой по углу
  // движения (ctx.rotate). Если загруженное изображение само по себе не
  // было симметричным квадратом (а таким обычно и является обычное
  // загруженное фото/картинка), при движении змейки строго вправо
  // (угол 0) оно рисовалось как есть — и любое изображение, задуманное
  // "смотрящим вверх", в этот момент выглядело "повёрнутым набок". Плюс
  // сама картинка decode/масштабировалась заново на каждый кадр — при
  // крупных исходных файлах это и давало "дёрганость".
  //
  // Исправление: обрезаем картинку по кругу и кэшируем этот уже готовый
  // маленький круглый спрайт ОДИН РАЗ на офскрин-канвасе — дальше просто
  // штампуем его без поворота и без пересчёта на каждый кадр. Круг
  // выглядит одинаково с любой стороны, поэтому "бока" больше не будет
  // в принципе, а форма всегда остаётся именно кругом, а не овалом.
  getSkinCircleSprite(src: string | null | undefined, diameter: number): HTMLCanvasElement | null {
    if(!src || !diameter) return null;
    const img = this.getSkinImage(src);
    if(!img || !img.complete || !img.naturalWidth) return null;
    if(!this._skinCircleCache) this._skinCircleCache = {};
    // округляем диаметр до шага в 2px, чтобы не плодить спрайт заново
    // на каждое крохотное изменение радиуса змейки при росте
    const size = Math.max(4, Math.round(diameter / 2) * 2);
    const key = src + '|' + size;
    let sprite = this._skinCircleCache[key];
    if(sprite) return sprite;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.max(4, Math.round(size * dpr));
    const off = document.createElement('canvas');
    off.width = px; off.height = px;
    const octx = off.getContext('2d') as CanvasRenderingContext2D;
    octx.save();
    octx.beginPath();
    octx.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
    octx.clip();
    // "cover"-обрезка по центру, чтобы прямоугольная картинка не
    // сплющивалась в круге, а заполняла его без искажений пропорций
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const side = Math.min(iw, ih);
    const sx = (iw - side) / 2, sy = (ih - side) / 2;
    octx.drawImage(img, sx, sy, side, side, 0, 0, px, px);
    octx.restore();

    sprite = off;
    this._skinCircleCache[key] = sprite;
    return sprite;
  },
  drawSnakeBodyImage(ctx: CanvasRenderingContext2D, s: SnakeEntity, pts: Vec2[], r: number): void {
    const skin = s.skin as Extract<SkinSelection, { type: 'image' }>;
    const diameter = r * 2;
    const bodySprite = this.getSkinCircleSprite(skin.bodyImg, diameter);

    if(bodySprite){
      // шаг между центрами кружков = радиусу => ровно половина диаметра
      // нахлёста между соседними кружками, как и просили
      const spacing = Math.max(4, r);
      let acc = spacing; // рисуем и самый первый кусочек, а не только после накопления шага
      for(let i = 1; i < pts.length; i++){
        const a = pts[i - 1], b = pts[i];
        acc += snakeDist(a.x, a.y, b.x, b.y);
        while(acc >= spacing){
          acc -= spacing;
          // круг рисуется БЕЗ поворота — он одинаков с любой стороны,
          // поэтому направление движения тут больше не имеет значения
          ctx.drawImage(bodySprite, b.x - diameter / 2, b.y - diameter / 2, diameter, diameter);
        }
      }
    } else {
      // картинка тела ещё не загрузилась (или спрайт ещё не готов) —
      // не даём змейке "исчезнуть", рисуем обычной полосой до готовности
      this.drawSnakeBandBody(ctx, s, pts, r);
      return;
    }

    const headDiameter = diameter * 1.3;
    const headSprite = this.getSkinCircleSprite(skin.headImg, headDiameter);
    if(headSprite){
      // у головы направление может быть осмысленным (глаза/мордочка),
      // поэтому её по-прежнему разворачиваем по направлению движения —
      // жалоба про "бок" касалась именно повторяющихся кусочков тела
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.drawImage(headSprite, -headDiameter / 2, -headDiameter / 2, headDiameter, headDiameter);
      ctx.restore();
    } else {
      this.drawSnakeEyes(ctx, s, r);
    }
  },
  drawSnakeEyes(ctx: CanvasRenderingContext2D, s: SnakeEntity, r: number): void {
    const hx = s.x, hy = s.y;
    [-1, 1].forEach(side=>{
      const ang = s.angle + side * 0.6;
      const ex = hx + Math.cos(ang) * r * 0.55, ey = hy + Math.sin(ang) * r * 0.55;
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.28, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      const px = hx + Math.cos(ang) * r * 0.68, py = hy + Math.sin(ang) * r * 0.68;
      ctx.beginPath(); ctx.arc(px, py, r * 0.13, 0, Math.PI * 2); ctx.fillStyle = '#222'; ctx.fill();
    });
  },
  drawSnakeBandBody(ctx: CanvasRenderingContext2D, s: SnakeEntity, pts: Vec2[], r: number): void {
    const outline = new Path2D();
    outline.moveTo(pts[0].x, pts[0].y);
    for(let i = 1; i < pts.length; i++) outline.lineTo(pts[i].x, pts[i].y);

    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = r * 2 + 3;
    ctx.stroke(outline);

    // тело: чередующиеся ОДНОТОННЫЕ полосы из цветов скина змейки — не
    // плавный градиент, как было раньше, а именно отдельные сплошные
    // куски цвета друг за другом (как классический "полосатый" окрас),
    // поэтому даже на глаз видно, что у змейки несколько разных цветов,
    // а не один цвет с переливом
    const palette = this.skinColorsFor(s);
    const bandLen = 30; // длина одной полосы вдоль тела, в игровых единицах
    ctx.lineWidth = r * 2;
    let acc = 0, bandIdx = 0;
    let path = new Path2D();
    path.moveTo(pts[0].x, pts[0].y);
    for(let i = 1; i < pts.length; i++){
      const a = pts[i - 1], b = pts[i];
      acc += snakeDist(a.x, a.y, b.x, b.y);
      path.lineTo(b.x, b.y);
      if(acc >= bandLen){
        ctx.strokeStyle = palette[bandIdx % palette.length];
        ctx.stroke(path);
        bandIdx++;
        acc = 0;
        path = new Path2D();
        path.moveTo(b.x, b.y); // следующая полоса продолжается с той же точки — без разрывов
      }
    }
    ctx.strokeStyle = palette[bandIdx % palette.length];
    ctx.stroke(path); // дорисовываем "хвостик" последней неполной полосы

    this.drawSnakeEyes(ctx, s, r);
  },

  drawNicknames(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number, zoom: number): void {
    if(!this.player) return;
    const list: SnakeEntity[] = [];
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
  renderLeaderboard(): void {
    if(!this.player) return;
    const entries: LeaderboardEntry[] = [{ id: 'me', name: getNickname() + ' (Вы)', score: this.score || 0, isMe: true }];
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
  goToMenu(): void {
    this.running = false; this.paused = false;
    if(this.mode === 'online') this.leaveOnlineRoom();
    this.mode = null;
    this.stopPingTimer();
    snakeHide(document.getElementById('snakePingPill'));
    snakeHide(document.getElementById('snakePauseOverlay'));
    snakeHide(document.getElementById('snakeGameOverOverlay'));
    snakeHide(document.getElementById('snakeGameScreen'));
    snakeShow(document.getElementById('snakeMenuScreen'));
  },
  // пинг до базы, пока идёт онлайн-игра — обновляется раз в 4 секунды,
  // чтобы не нагружать базу лишними запросами, но давать достаточно
  // свежую картину задержки соединения
  startPingTimer(): void {
    this.stopPingTimer();
    const tick = ()=>{
      if(!hasCloudDB() || this.mode !== 'online') return;
      DB.measurePing(this.playerId as string).then(ms=>{
        const el = document.getElementById('snakePingValue');
        if(el) el.textContent = (ms === null) ? '—' : ms + ' мс';
      });
    };
    tick();
    this._pingInterval = setInterval(tick, 4000);
  },
  stopPingTimer(): void {
    if(this._pingInterval){ clearInterval(this._pingInterval); this._pingInterval = null; }
  },

  bindUI(): void {
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

    const skinBtn = document.getElementById('snakeSkinBtn');
    if(skinBtn) skinBtn.addEventListener('click', ()=> this.openSkinModal());
    const skinCloseBtn = document.getElementById('snakeSkinCloseBtn');
    if(skinCloseBtn) skinCloseBtn.addEventListener('click', ()=> snakeHide(document.getElementById('snakeSkinModal')));
    document.querySelectorAll<HTMLElement>('.skin-tab').forEach(tab=>{
      tab.addEventListener('click', ()=>{
        document.querySelectorAll('.skin-tab').forEach(t=> t.classList.remove('active'));
        tab.classList.add('active');
        const isColors = tab.dataset.tab === 'colors';
        snakeShowEl(document.getElementById('snakeSkinPaneColors'), isColors);
        snakeShowEl(document.getElementById('snakeSkinPaneImages'), !isColors);
      });
    });
    const customAddBtn = document.getElementById('snakeCustomColorAddBtn');
    if(customAddBtn) customAddBtn.addEventListener('click', ()=> this.addCustomColorInput());
    const customSaveBtn = document.getElementById('snakeCustomColorSaveBtn');
    if(customSaveBtn) customSaveBtn.addEventListener('click', ()=> this.saveCustomSkin());

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
    const tabMap: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', online: 'Online' };
    document.querySelectorAll<HTMLElement>('[data-snaketab]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        document.querySelectorAll('[data-snaketab]').forEach(b=> b.classList.remove('active'));
        btn.classList.add('active');
        Object.values(tabMap).forEach(key=> snakeHide(document.getElementById('snakeRecordsList' + key)));
        snakeShow(document.getElementById('snakeRecordsList' + (tabMap[btn.dataset.snaketab || ''] || 'Easy')));
      });
    });

    /* ---------------- управление ---------------- */
    const canvas = document.getElementById('snakeCanvas') as HTMLCanvasElement | null;
    if(canvas){
      const setAngleFromClient = (clientX: number, clientY: number): void=>{
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const dx = clientX - cx, dy = clientY - cy;
        if(Math.abs(dx) > 4 || Math.abs(dy) > 4) this.desiredAngle = Math.atan2(dy, dx);
      };

      // ПК — мышка задаёт направление от центра экрана, ЛКМ — ускорение
      canvas.addEventListener('mousemove', e=> setAngleFromClient(e.clientX, e.clientY));
      canvas.addEventListener('mousedown', e=>{ if(e.button === 0) this.inputBoost = true; });
      window.addEventListener('mouseup', ()=>{ this.inputBoost = false; });

      // телефон — тот же принцип, что и на ПК: направление считается от
      // ЦЕНТРА игрового поля до пальца, каждое touchmove-событие сразу
      // пересчитывает угол через тот же setAngleFromClient(), что и мышь.
      // Раньше здесь был отдельный "джойстик" (мёртвая зона + сдвиг
      // центра при движении пальца) — он вносил задержку и рывки по
      // сравнению с мышью на ПК. Прямая привязка к позиции пальца
      // относительно центра поля даёт точно такую же мгновенную и
      // плавную реакцию, как ведение мышкой.
      //
      // Слушатели висят на всей обёртке поля (.game-wrap), а не только
      // на canvas — при неточном совпадении размеров canvas и обёртки
      // (округления при подгонке под экран) в паре пикселей по краям
      // касание могло "провалиться" мимо игрового поля. Реальные кнопки
      // (пауза/выход/ускорение) при этом по-прежнему работают как
      // обычно — касания по ним не задают направление.
      const wrap: HTMLElement = document.getElementById('snakeGameWrap') || canvas;
      let touchActive = false;

      const isButtonTarget = (e: TouchEvent): boolean=> !!(e.target && (e.target as HTMLElement).closest && (e.target as HTMLElement).closest('button'));

      wrap.addEventListener('touchstart', e=>{
        const t = e.touches[0];
        if(!t || isButtonTarget(e)) return;
        touchActive = true;
        setAngleFromClient(t.clientX, t.clientY);
      }, { passive: true });

      wrap.addEventListener('touchmove', e=>{
        const t = e.touches[0];
        if(!touchActive || !t) return;
        e.preventDefault();
        setAngleFromClient(t.clientX, t.clientY);
      }, { passive: false });

      const endTouch = ()=>{ touchActive = false; };
      wrap.addEventListener('touchend', endTouch);
      wrap.addEventListener('touchcancel', endTouch);
    }

    // отдельная кнопка ускорения слева снизу — для телефона
    const boostBtn = document.getElementById('snakeBoostBtn');
    if(boostBtn){
      const on = (e?: Event)=>{ if(e) e.preventDefault(); this.inputBoost = true; boostBtn.classList.add('pressed'); };
      const off = (e?: Event)=>{ if(e) e.preventDefault(); this.inputBoost = false; boostBtn.classList.remove('pressed'); };
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
});

// делаем Snake доступным как window.Snake — иначе `if(window.Snake)`
// в script.js всегда ложно (top-level const не создаёт window-свойство).
(window as any).Snake = Snake;

/* =========================================================
   ОБЩИЙ ИГРОК — общие для всех скриптов сайта вещи:
   локальные настройки устройства и уникальный ID игрока.
========================================================= */
const LocalPrefs = {
  get(key, fallback){
    try{ const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch(e){ return fallback; }
  },
  set(key, value){ try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){} }
};

const KEYS = {
  nickname: 'gd_nickname',
  nicknameLocked: 'gd_nickname_locked',
  nicknameAdminTs: 'gd_nickname_admin_ts',
  playerId: 'gd_player_id',
  sfx: 'gd_sfx_on',
  music: 'gd_music_on',
  lastSeenNews: 'gd_last_seen_news_ts',
  votes: 'gd_news_votes',
  doodleControlMode: 'gd_doodle_control_mode'
};

/* уникальный ID этого устройства/игрока — общий для игры, кликера,
   уровней и достижений, чтобы весь прогресс был у одного профиля */
function getPlayerId(){
  let id = LocalPrefs.get(KEYS.playerId, null);
  if(!id){
    id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    LocalPrefs.set(KEYS.playerId, id);
  }
  return id;
}

/* случайные никнеймы для новых игроков — чтобы не было кучи
   одинаковых "Игрок" у всех, кто не задал свой ник вручную */
const NICK_ADJECTIVES = [
  'Сладкий','Липкий','Варёный','Карамельный','Медовый','Молочный',
  'Пушистый','Хитрый','Голодный','Резвый','Бодрый','Ленивый',
  'Загадочный','Отважный','Шустрый','Весёлый','Сонный','Крутой'
];
const NICK_NOUNS = [
  'Мишка','Енот','Кот','Хомяк','Барсук','Ёжик','Бобёр','Лис',
  'Заяц','Крот','Тигр','Панда','Волк','Сурок','Опоссум','Гусь'
];
function generateRandomNickname(){
  const adj = NICK_ADJECTIVES[Math.floor(Math.random() * NICK_ADJECTIVES.length)];
  const noun = NICK_NOUNS[Math.floor(Math.random() * NICK_NOUNS.length)];
  const num = 1 + Math.floor(Math.random() * 999);
  return `${adj} ${noun}${num}`;
}

/* если ник ещё не задан — один раз генерируем случайный и запоминаем его
   (сам по себе он НЕ считается "выбранным вручную" — см. KEYS.nicknameLocked
   в script.js: игрок всё ещё может один раз задать свой в главном меню) */
function getNickname(){
  let nick = LocalPrefs.get(KEYS.nickname, null);
  if(!nick){
    nick = generateRandomNickname();
    LocalPrefs.set(KEYS.nickname, nick);
  }
  return nick;
}

/* ник на сайте хранится ЛОКАЛЬНО у игрока (единого аккаунта с паролем
   нет), поэтому когда админ меняет ник игроку через админ-панель
   (см. renamePlayerEverywhere в admin.js), это должно как-то дойти до
   самого игрока. Админка ставит метку profiles/<id>.nameSetByAdmin —
   а мы здесь постоянно "слушаем" этот профиль через живое соединение с
   базой и, как только видим более свежую метку, чем последняя уже
   применённая нами, переносим новый ник в localStorage и блокируем его
   (как будто игрок сам его задал и подтвердил) — благодаря живому
   соединению это происходит, пока игрок ещё на сайте, почти мгновенно;
   если его не было на сайте в момент правки — применится при заходе.

   ВАЖНО про гонку с играми: каждая игра (Змейка, Кликер, Doodle,
   крестики-нолики и т.п.) при загрузке страницы сама сверяет ник,
   сохранённый в СВОЕЙ коллекции (snakePlayers/clickerPlayers/…), с
   getNickname() — и если они не совпадают, перезаписывает игровую
   запись локальным ником (это нужно, чтобы ник, который игрок правит
   САМ на сайте, долетал до игр). Раньше это делалось независимо и
   сразу при загрузке — если админ переименовал игрока, ПОКА тот был
   офлайн, то при следующем заходе получалась гонка двух независимых
   чтений из базы: если проверка внутри игры успевала сработать РАНЬШЕ,
   чем здесь успевал примениться новый ник от админа, getNickname() ещё
   возвращал СТАРЫЙ локальный ник — и игра, "чиня" несовпадение,
   затирала им уже обновлённую админом запись в своей же коллекции.
   Из-за этого переименование через админку иногда не долетало до
   какой-то конкретной игры (какая именно — зависело от того, чьё
   сетевое чтение оказывалось быстрее).

   Чтобы исключить эту гонку, здесь публикуется window.nicknameReady —
   промис, который резолвится ПОСЛЕ первой проверки профиля игрока (и
   применения ника от админа, если он есть). Каждая игра теперь ждёт
   этот промис перед своей проверкой "ник в базе == getNickname()", так
   что к моменту сравнения свежий ник от админа уже гарантированно
   применён локально. */
let _resolveNicknameReady;
window.nicknameReady = new Promise(resolve => { _resolveNicknameReady = resolve; });

function applyAdminNicknameOverride(doc){
  if(!doc || !doc.nameSetByAdmin || !doc.name) return;
  const appliedTs = LocalPrefs.get(KEYS.nicknameAdminTs, 0);
  if(doc.nameSetByAdmin > appliedTs){
    LocalPrefs.set(KEYS.nickname, doc.name);
    // обычная правка ника из админки блокирует повторное редактирование
    // (как и при самостоятельной правке игроком) — а вот полное удаление
    // игрока (сброс на случайный ник, см. deletePlayerEverywhere в
    // admin.js) нарочно оставляет ник РАЗБЛОКИРОВАННЫМ, чтобы игрок сразу
    // мог задать себе новый ник сам
    LocalPrefs.set(KEYS.nicknameLocked, !doc.nicknameReset);
    LocalPrefs.set(KEYS.nicknameAdminTs, doc.nameSetByAdmin);
    if(typeof window.onNicknameChangedByAdmin === 'function') window.onNicknameChangedByAdmin(doc.name);
  }
}
function watchAdminNicknameOverride(){
  if(!window.DB){ _resolveNicknameReady(); return; }
  const id = getPlayerId();
  let first = true;
  DB.watchItem('profiles', id, doc=>{
    applyAdminNicknameOverride(doc);
    // резолвим промис только один раз — на самом первом ответе базы,
    // дальше это уже "живой" слушатель на случай правки ника, пока
    // игрок на сайте (см. комментарий выше)
    if(first){ first = false; _resolveNicknameReady(); }
  });
  // подстраховка: если по какой-то причине база вообще не ответит
  // (ошибка/нет прав), не даём играм зависнуть в ожидании этого промиса
  // навсегда — через 3с считаем, что применять было нечего
  setTimeout(()=>{ if(first){ first = false; _resolveNicknameReady(); } }, 3000);
}
if(document.readyState !== 'loading') watchAdminNicknameOverride();
else document.addEventListener('DOMContentLoaded', watchAdminNicknameOverride);

/* =========================================================
   СМЕНА НИКА САМИМ ИГРОКОМ (главное меню) — переносим ник ВЕЗДЕ.
   Раньше при сохранении своего ника здесь (см. saveNicknameBtn в
   script.js) правились только 'profiles' и 'clickerPlayers' — из-за
   этого старый ник навсегда "застревал" во всех таблицах рекордов
   (Лови сгущёнку, Змейка classic/io, Doodle, крестики-нолики) и в
   игровых коллекциях этих игр: addRecord()/addRecordIn() в db.js
   НАРОЧНО не трогают имя уже существующей записи рекорда (это
   сделано, чтобы правка ника из АДМИНКИ не затиралась следующей же
   игрой) — а значит и обратное само не происходит: смена ника самим
   игроком в эти записи никак не долетала. renamePlayerEverywhere в
   admin.js уже решает эту же задачу для админки — здесь то же самое,
   но без метки nameSetByAdmin (это правка самого игрока, а не админа)
   и только в те игровые коллекции, где запись уже реально есть
   (чтобы не плодить "пустые" записи в играх, в которые игрок ни разу
   не играл). */
const GAME_PLAYER_COLLECTIONS = [
  'clickerPlayers', 'snakePlayers', 'snakeClassicPlayers', 'doodlePlayers', 'tttPlayers', 'dronePlayers',
  'droneLB_model_scout', 'droneLB_model_balanced', 'droneLB_model_heavy',
  'droneLB_loadout_bomb', 'droneLB_loadout_kamikaze',
  'droneLB_charge_s', 'droneLB_charge_m', 'droneLB_charge_l'
];
const GAME_RECORD_COLLECTIONS = [
  'clickerRecords', 'doodleRecords',
  'snakeClassicRecordsEasy', 'snakeClassicRecordsHard',
  'snakeRecordsEasy', 'snakeRecordsMedium', 'snakeRecordsHard', 'snakeRecordsOnline',
  'tttRecords'
];
function syncNicknameEverywhere(newName){
  if(!window.DB) return;
  const id = getPlayerId();
  DB.setItem('profiles', id, { name: newName });
  GAME_PLAYER_COLLECTIONS.forEach(col=>{
    // патчим имя, только если запись у игрока в этой игре уже есть —
    // иначе создали бы "призрачного" игрока в игре, в которую он
    // никогда не заходил
    DB.getItemOnce(col, id).then(doc=>{ if(doc) DB.setItem(col, id, { name: newName }); });
  });
  DB.renameInRecordsByPlayerId(id, newName); // таблица рекордов "Лови сгущёнку"
  GAME_RECORD_COLLECTIONS.forEach(col=> DB.renameInRecordsInByPlayerId(col, id, newName));
}
window.syncNicknameEverywhere = syncNicknameEverywhere;

/* виден ли сейчас указанный экран (используется, чтобы всплывающие
   окна с достижениями/событиями показывались только в "своей" игре) */
function isScreenVisible(id){
  const el = document.getElementById(id);
  return !!el && !el.classList.contains('hidden');
}

/* способ управления в Doodle-прыжках: наклон телефона (акселерометр)
   или тап по левой/правой половине экрана. Хранится локально на
   устройстве — это настройка ввода, а не игровая статистика. */
function getDoodleControlMode(){
  return LocalPrefs.get(KEYS.doodleControlMode, 'tilt') === 'buttons' ? 'buttons' : 'tilt';
}
function setDoodleControlMode(mode){
  LocalPrefs.set(KEYS.doodleControlMode, mode === 'buttons' ? 'buttons' : 'tilt');
}

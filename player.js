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
  playerId: 'gd_player_id',
  sfx: 'gd_sfx_on',
  music: 'gd_music_on',
  lastSeenNews: 'gd_last_seen_news_ts',
  votes: 'gd_news_votes'
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

/* виден ли сейчас указанный экран (используется, чтобы всплывающие
   окна с достижениями/событиями показывались только в "своей" игре) */
function isScreenVisible(id){
  const el = document.getElementById(id);
  return !!el && !el.classList.contains('hidden');
}

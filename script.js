/* =========================================================
   НАСТРОЙКА ЗВУКОВ
========================================================= */
const SOUND_CONFIG = {
  goodCount: 3,
  badCount: 3,
  goodPath: 'sound/good/good',
  badPath: 'sound/bad/bad',
  bombFile: 'sound/bomb.mp3',
  musicFile: 'sound/music.mp3',
  ext: '.mp3'
};

/* =========================================================
   НАСТРОЙКА КАРТИНОК ДЛЯ ПАДАЮЩИХ ПРЕДМЕТОВ
   ---------------------------------------------------------
   Положи свою картинку сгущёнки в img/sgushenka.png —
   она подхватится автоматически. Если файла нет (или он
   не загрузился), предмет просто рисуется эмодзи, как раньше,
   сайт не ломается. То же самое для bad/bomb — необязательно.
========================================================= */
const IMAGE_CONFIG = {
  good: 'img/sgushenka.png',
  bad:  'img/bad.png',
  bomb: 'img/bomb.png'
};
const dropImages = {};
(function preloadDropImages(){
  Object.keys(IMAGE_CONFIG).forEach(type=>{
    const src = IMAGE_CONFIG[type];
    if(!src) return;
    const img = new Image();
    img.onload = ()=> { dropImages[type] = img; };
    img.onerror = ()=> { /* картинки нет — используем эмодзи */ };
    img.src = src;
  });
})();

/* =========================================================
   ЗВУК
========================================================= */
const SoundManager = {
  sfxOn: LocalPrefs.get(KEYS.sfx, true),
  musicOn: LocalPrefs.get(KEYS.music, true),
  music: document.getElementById('bgMusic'),

  init(){
    this.music.src = SOUND_CONFIG.musicFile;
    this.music.volume = 0.5;
    if(this.musicOn) this.tryPlayMusic();
  },
  tryPlayMusic(){ this.music.play().catch(()=>{}); },
  playRandom(basePath, count){
    if(!this.sfxOn || count <= 0) return;
    const n = 1 + Math.floor(Math.random() * count);
    const a = new Audio(`${basePath}${n}${SOUND_CONFIG.ext}`);
    a.volume = 0.9;
    a.play().catch(()=>{});
  },
  playGood(){ this.playRandom(SOUND_CONFIG.goodPath, SOUND_CONFIG.goodCount); },
  playBad(){ this.playRandom(SOUND_CONFIG.badPath, SOUND_CONFIG.badCount); },
  playBomb(){
    if(!this.sfxOn) return;
    const a = new Audio(SOUND_CONFIG.bombFile);
    a.volume = 1;
    a.play().catch(()=>{});
  },
  setSfx(on){ this.sfxOn = on; LocalPrefs.set(KEYS.sfx, on); },
  setMusic(on){
    this.musicOn = on; LocalPrefs.set(KEYS.music, on);
    if(on) this.tryPlayMusic(); else this.music.pause();
  }
};

/* =========================================================
   НАВИГАЦИЯ / МОДАЛКИ
========================================================= */
function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }
function escapeHtml(str){ const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

const menuScreen = document.getElementById('menuScreen');
const gameScreen = document.getElementById('gameScreen');
const gameSelectScreen = document.getElementById('gameSelectScreen');
const clickerScreen = document.getElementById('clickerScreen');

document.querySelectorAll('[data-close]').forEach(btn=>{
  btn.addEventListener('click', ()=> hide(document.getElementById(btn.dataset.close)));
});
document.querySelectorAll('.modal').forEach(modal=>{
  modal.addEventListener('click', (e)=>{ if(e.target === modal) hide(modal); });
});

/* ---- Выбор игры (стартовый экран) и переходы между играми ---- */
document.getElementById('pickCatchBtn').addEventListener('click', ()=>{
  hide(gameSelectScreen); show(menuScreen);
});
document.getElementById('pickClickerBtn').addEventListener('click', ()=>{
  hide(gameSelectScreen); show(clickerScreen);
  if(window.Clicker) Clicker.renderAll();
});
document.getElementById('backToSelectBtn').addEventListener('click', ()=>{
  hide(menuScreen); show(gameSelectScreen);
});
document.getElementById('clickerBackBtn').addEventListener('click', ()=>{
  hide(clickerScreen); show(gameSelectScreen);
});
document.getElementById('clickerAchBtn').addEventListener('click', ()=>{
  show(document.getElementById('clickerAchModal'));
});
document.getElementById('profileBtn').addEventListener('click', ()=>{
  if(window.Profile) Profile.renderProfileUI();
  show(document.getElementById('profileModal'));
});

/* ---- Секретный проход в админ-панель: клик по лого ---- */
document.querySelector('.logo').addEventListener('click', ()=>{
  window.location.href = 'admin.html';
});

/* ---- Рекорды (общие, из облака) ---- */
const recordsBtn = document.getElementById('recordsBtn');
const recordsModal = document.getElementById('recordsModal');
const recordsList = document.getElementById('recordsList');
let unsubscribeRecords = null;

function renderRecords(list){
  recordsList.innerHTML = '';
  if(list.length === 0){
    recordsList.innerHTML = '<p class="news-empty">Пока нет рекордов. Стань первым!</p>';
    return;
  }
  const myId = getPlayerId();
  list.slice(0, 20).forEach(r=>{
    const li = document.createElement('li');
    if(r.playerId === myId) li.classList.add('my-record');
    li.innerHTML = `${r.score} очков <span>— ${escapeHtml(r.name)}, ${r.date}</span>`;
    recordsList.appendChild(li);
  });
}
recordsBtn.addEventListener('click', ()=>{
  show(recordsModal);
  if(unsubscribeRecords) unsubscribeRecords();
  if(window.DB){
    unsubscribeRecords = DB.watchRecords(renderRecords);
  } else {
    recordsList.innerHTML = '<p class="news-empty">Рекорды сейчас недоступны. Попробуй обновить страницу.</p>';
  }
});

function submitScore(score){
  if(!window.DB) return;
  DB.addRecord(getPlayerId(), getNickname(), score);
}

/* ---- Настройки (звук/музыка) ---- */
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const sfxToggle = document.getElementById('sfxToggle');
const musicToggle = document.getElementById('musicToggle');

function refreshToggle(btn, on){
  btn.dataset.on = on;
  btn.textContent = on ? 'Вкл' : 'Выкл';
}
function isNicknameLocked(){ return !!LocalPrefs.get(KEYS.nicknameLocked, false); }

settingsBtn.addEventListener('click', ()=>{
  refreshToggle(sfxToggle, SoundManager.sfxOn);
  refreshToggle(musicToggle, SoundManager.musicOn);
  show(settingsModal);
});
sfxToggle.addEventListener('click', ()=> refreshToggle(sfxToggle, sfxToggle.dataset.on !== 'true'));
musicToggle.addEventListener('click', ()=> refreshToggle(musicToggle, musicToggle.dataset.on !== 'true'));
document.getElementById('saveSettingsBtn').addEventListener('click', ()=>{
  SoundManager.setSfx(sfxToggle.dataset.on === 'true');
  SoundManager.setMusic(musicToggle.dataset.on === 'true');
  hide(settingsModal);
});

/* ---- Никнейм (в главном меню — экран выбора игры) ----
   Никнейм общий для обеих игр (кликер и "Лови сгущёнку"), поэтому
   задаётся один раз наверху главного меню, а не в настройках
   отдельной игры. Новым игрокам никнейм придумывается случайно
   (см. generateRandomNickname в player.js) — его всё ещё можно
   один раз заменить своим вручную здесь. */
const nicknameDisplay = document.getElementById('nicknameDisplay');
const nicknameEditBtn = document.getElementById('nicknameEditBtn');
const nicknameEditRow = document.getElementById('nicknameEditRow');
const nicknameInput = document.getElementById('nicknameInput');
const nicknameLockNote = document.getElementById('nicknameLockNote');
const saveNicknameBtn = document.getElementById('saveNicknameBtn');

function refreshNicknameBar(){
  if(nicknameDisplay) nicknameDisplay.textContent = getNickname();
}
refreshNicknameBar();

if(nicknameEditBtn){
  nicknameEditBtn.addEventListener('click', ()=>{
    const locked = isNicknameLocked();
    nicknameInput.value = getNickname();
    nicknameInput.disabled = locked;
    nicknameLockNote.classList.toggle('hidden', !locked);
    nicknameEditRow.classList.toggle('hidden');
  });
}
if(saveNicknameBtn){
  saveNicknameBtn.addEventListener('click', ()=>{
    if(!isNicknameLocked()){
      const nick = nicknameInput.value.trim().slice(0,16) || getNickname();
      LocalPrefs.set(KEYS.nickname, nick);
      LocalPrefs.set(KEYS.nicknameLocked, true);
      if(window.DB){
        DB.setItem('profiles', getPlayerId(), { name: nick });
        DB.setItem('clickerPlayers', getPlayerId(), { name: nick });
      }
    }
    refreshNicknameBar();
    nicknameEditRow.classList.add('hidden');
  });
}

/* ---- Новости (общие, из облака) ---- */
const newsBtn = document.getElementById('newsBtn');
const newsBadge = document.getElementById('newsBadge');
const newsModal = document.getElementById('newsModal');
const newsList = document.getElementById('newsList');
const newsReaderModal = document.getElementById('newsReaderModal');
let latestNewsList = [];
let unsubscribeNews = null;

function refreshNewsBadge(){
  const lastSeen = LocalPrefs.get(KEYS.lastSeenNews, 0);
  const newestTs = latestNewsList.reduce((max, n)=> Math.max(max, n.ts||0), 0);
  (newestTs > lastSeen) ? show(newsBadge) : hide(newsBadge);
}
function renderNewsList(list){
  // новые сверху, старые снизу
  latestNewsList = list.slice().sort((a,b)=> (b.ts||0) - (a.ts||0));
  newsList.innerHTML = '';
  if(latestNewsList.length === 0){
    newsList.innerHTML = '<p class="news-empty">Новостей пока нет.</p>';
  } else {
    latestNewsList.forEach(n=>{
      const preview = n.text.length > 90 ? n.text.slice(0,90) + '…' : n.text;
      const item = document.createElement('button');
      item.className = 'news-item';
      item.innerHTML = `<h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(preview)}</p><time>${n.date}</time><div class="read-more">Читать →</div>`;
      item.addEventListener('click', ()=> openNewsReader(n));
      newsList.appendChild(item);
    });
  }
  refreshNewsBadge();
}
newsBtn.addEventListener('click', ()=>{
  show(newsModal);
  if(unsubscribeNews) unsubscribeNews();
  if(window.DB){
    unsubscribeNews = DB.watchNews(renderNewsList);
  } else {
    renderNewsList([]);
  }
  const newestTs = latestNewsList.reduce((max, n)=> Math.max(max, n.ts||0), 0);
  LocalPrefs.set(KEYS.lastSeenNews, Math.max(newestTs, Date.now()));
  hide(newsBadge);
});

function getVotes(){ return LocalPrefs.get(KEYS.votes, {}); }
function setVote(newsId, type){
  const votes = getVotes();
  if(type === null) delete votes[newsId];
  else votes[newsId] = type;
  LocalPrefs.set(KEYS.votes, votes);
}

function openNewsReader(n){
  document.getElementById('readerTitle').textContent = n.title;
  document.getElementById('readerDate').textContent = n.date;
  document.getElementById('readerText').textContent = n.text;
  document.getElementById('likesCount').textContent = n.likes || 0;
  document.getElementById('dislikesCount').textContent = n.dislikes || 0;
  document.getElementById('sgushenkaCount').textContent = n.sgushenka || 0;

  const myVote = getVotes()[n.id] || null;
  document.querySelectorAll('.reaction-btn').forEach(btn=>{
    btn.classList.toggle('voted', btn.dataset.reaction === myVote);
    btn.onclick = ()=>{
      const current = getVotes()[n.id] || null;
      const field = btn.dataset.reaction;
      const span = btn.querySelector('span');

      if(current === field){
        // повторный клик по своей же реакции — снимаем голос
        if(window.DB) DB.changeReaction(n.id, null, field);
        setVote(n.id, null);
        span.textContent = Math.max(0, (parseInt(span.textContent,10)||0) - 1);
        btn.classList.remove('voted');
        return;
      }

      // ставим новую реакцию, снимая предыдущую (если была)
      if(window.DB) DB.changeReaction(n.id, field, current);
      setVote(n.id, field);
      if(window.Profile) Profile.addReaction();
      span.textContent = (parseInt(span.textContent,10)||0) + 1;
      if(current){
        const oldBtn = document.querySelector(`.reaction-btn[data-reaction="${current}"]`);
        if(oldBtn){
          const oldSpan = oldBtn.querySelector('span');
          oldSpan.textContent = Math.max(0, (parseInt(oldSpan.textContent,10)||0) - 1);
          oldBtn.classList.remove('voted');
        }
      }
      document.querySelectorAll('.reaction-btn').forEach(b=> b.classList.toggle('voted', b === btn));
    };
  });

  show(newsReaderModal);
}

/* следим за новостями в реальном времени, чтобы значок появлялся сразу.
   ВАЖНО: этот вызов раньше не был защищён проверкой на window.DB. Если
   db.js по любой причине не загрузился/не успел выполниться (медленная
   мобильная сеть, блокировщик рекламы, Firebase недоступен и т.п.),
   DB оказывался undefined, обращение к DB.watchNews бросало
   ReferenceError, и ВЕСЬ остальной код этого файла — включая навешивание
   обработчиков на кнопки игры (playBtn, pauseBtn, restartBtn и т.д.)
   в самом низу файла — просто переставал выполняться. Именно поэтому
   могли не работать вообще никакие кнопки. Теперь код устойчив к сбою DB. */
if(window.DB){
  DB.watchNews(list=>{
    latestNewsList = list.slice().sort((a,b)=> (b.ts||0) - (a.ts||0));
    refreshNewsBadge();
  });
} else {
  console.warn('DB недоступен — новости и облачные функции отключены, но остальной сайт работает.');
}

/* =========================================================
   ИГРА
========================================================= */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreValueEl = document.getElementById('scoreValue');
const pauseOverlay = document.getElementById('pauseOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const gameWrap = document.querySelector('.game-wrap');
const hud = document.querySelector('.hud');
const topbar = document.querySelector('.topbar');

let mouthX = 0.5; // 0..1, доля ширины
let score = 0;
let drops = [];
let particles = [];
let spawnTimer = 0;
let spawnInterval = 900;
let dropSpeed = 2.2;
let running = false;
let paused = false;
let lastTime = 0;

/* Анимация рта — теперь по времени (мс), а не по кадрам, и заметно медленнее */
const MOUTH_ANIM_DURATION = 650; // мс — насколько "медленно" рот открывается/закрывается
let mouthAnim = { emoji: '👄', active: false, elapsed: 0 };

const DROP_TYPES = {
  good:  { emoji: '🫙', weight: 65, r: 26 },
  bad:   { emoji: '💩', weight: 25, r: 24 },
  bomb:  { emoji: '💣', weight: 10, r: 26 }
};

function pickType(){
  const r = Math.random() * 100;
  if(r < DROP_TYPES.good.weight) return 'good';
  if(r < DROP_TYPES.good.weight + DROP_TYPES.bad.weight) return 'bad';
  return 'bomb';
}

/* ---- адаптивный размер канваса под мобильные экраны ---- */
function fitCanvasHeight(){
  if(gameScreen.classList.contains('hidden')) return;
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const used = topbar.offsetHeight + hud.offsetHeight + 40;
  const height = Math.max(320, vh - used);
  gameWrap.style.height = height + 'px';
  canvas.style.height = height + 'px';
  resizeCanvasBuffer();
}
function resizeCanvasBuffer(){
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * devicePixelRatio);
  canvas.height = Math.round(rect.height * devicePixelRatio);
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
}
window.addEventListener('resize', fitCanvasHeight);
window.addEventListener('orientationchange', ()=> setTimeout(fitCanvasHeight, 200));
if(window.visualViewport) window.visualViewport.addEventListener('resize', fitCanvasHeight);

function spawnDrop(){
  const type = pickType();
  const def = DROP_TYPES[type];
  const rect = canvas.getBoundingClientRect();
  drops.push({
    type, emoji: def.emoji, r: def.r,
    x: def.r + Math.random() * (rect.width - def.r*2),
    y: -def.r,
    speed: dropSpeed + Math.random()*1.2
  });
}
function spawnParticles(x, y, color){
  for(let i=0;i<10;i++){
    particles.push({ x, y, vx:(Math.random()-0.5)*4, vy:(Math.random()-1.5)*4, life: 30, color });
  }
}

function resetGame(){
  score = 0; drops = []; particles = [];
  spawnTimer = 0; spawnInterval = 900; dropSpeed = 2.2;
  mouthX = 0.5;
  playtimeAccumMs = 0;
  mouthAnim = { emoji: '👄', active: false, elapsed: 0 };
  scoreValueEl.textContent = '0';
  hide(gameOverOverlay); hide(pauseOverlay);
}
function startGame(){
  resetGame();
  running = true; paused = false;
  hide(menuScreen); show(gameScreen);
  fitCanvasHeight();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}
function endGame(reason){
  running = false;
  if(reason === 'bomb') SoundManager.playBomb();
  submitScore(score);
  document.getElementById('finalScore').textContent = score;
  document.getElementById('gameOverTitle').textContent = reason === 'bomb' ? '💥 Бум! Игра окончена' : 'Игра окончена';
  document.getElementById('newRecordText').classList.add('hidden');
  show(gameOverOverlay);
}

let playtimeAccumMs = 0;
function loop(now){
  if(!running) return;
  const dt = now - lastTime;
  lastTime = now;
  if(!paused){
    update(dt);
    render();
    playtimeAccumMs += dt;
    if(playtimeAccumMs >= 1000 && window.Profile){
      const seconds = Math.floor(playtimeAccumMs / 1000);
      Profile.addPlaytime(seconds);
      playtimeAccumMs -= seconds * 1000;
    }
  }
  requestAnimationFrame(loop);
}

function triggerMouthAnim(emoji){
  mouthAnim.emoji = emoji;
  mouthAnim.active = true;
  mouthAnim.elapsed = 0;
}

function update(dt){
  spawnTimer += dt;
  if(spawnTimer > spawnInterval){
    spawnTimer = 0;
    spawnDrop();
    spawnInterval = Math.max(380, spawnInterval - 6);
    dropSpeed = Math.min(7, dropSpeed + 0.03);
  }

  const rect = canvas.getBoundingClientRect();
  const mx = mouthX * rect.width;
  const my = rect.height - 46;

  for(let i = drops.length - 1; i >= 0; i--){
    const d = drops[i];
    d.y += d.speed;
    const dist = Math.hypot(d.x - mx, d.y - my);
    if(dist < d.r + 34){
      if(d.type === 'good'){
        score += 1; SoundManager.playGood();
        if(window.Profile) Profile.addPoints(1);
        spawnParticles(d.x, d.y, '#F2B705');
        triggerMouthAnim('😋');
      } else if(d.type === 'bad'){
        score -= 1; SoundManager.playBad();
        spawnParticles(d.x, d.y, '#6B4226');
        triggerMouthAnim('😖');
      } else if(d.type === 'bomb'){
        drops.splice(i,1);
        triggerMouthAnim('😵');
        endGame('bomb');
        return;
      }
      scoreValueEl.textContent = score;
      drops.splice(i,1);
      continue;
    }
    if(d.y - d.r > rect.height) drops.splice(i,1);
  }

  for(let i = particles.length - 1; i >= 0; i--){
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--;
    if(p.life <= 0) particles.splice(i,1);
  }

  if(mouthAnim.active){
    mouthAnim.elapsed += dt;
    if(mouthAnim.elapsed >= MOUTH_ANIM_DURATION) mouthAnim.active = false;
  }
}

function render(){
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0,0,rect.width, rect.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drops.forEach(d=>{
    const img = dropImages[d.type];
    if(img){
      const size = d.r * 2.3;
      ctx.drawImage(img, d.x - size/2, d.y - size/2, size, size);
    } else {
      ctx.font = `${d.r*1.8}px serif`;
      ctx.fillText(d.emoji, d.x, d.y);
    }
  });

  particles.forEach(p=>{
    ctx.globalAlpha = Math.max(p.life/30, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // рот игрока с медленной плавной анимацией "поймал"
  const mx = mouthX * rect.width;
  const my = rect.height - 46;
  let scale = 1;
  let emoji = '👄';
  if(mouthAnim.active){
    const progress = Math.min(1, mouthAnim.elapsed / MOUTH_ANIM_DURATION);
    // плавная синусоида: открылся не спеша — задержался — закрылся не спеша
    scale = 1 + Math.sin(progress * Math.PI) * 0.55;
    emoji = mouthAnim.emoji;
  }
  ctx.save();
  ctx.translate(mx, my);
  ctx.scale(scale, scale);
  ctx.font = '52px serif';
  ctx.fillText(emoji, 0, 0);
  ctx.restore();
}

/* ---- управление (мышь + сенсор + клавиатура) ---- */
function setMouthFromClientX(clientX){
  const rect = canvas.getBoundingClientRect();
  let x = (clientX - rect.left) / rect.width;
  mouthX = Math.min(1, Math.max(0, x));
}
canvas.addEventListener('mousemove', e => setMouthFromClientX(e.clientX));
canvas.addEventListener('touchstart', e => {
  if(e.touches[0]) setMouthFromClientX(e.touches[0].clientX);
}, { passive:true });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if(e.touches[0]) setMouthFromClientX(e.touches[0].clientX);
}, { passive:false });
gameWrap.addEventListener('touchmove', e => e.preventDefault(), { passive:false });

document.addEventListener('keydown', e=>{
  if(!running || paused) return;
  if(e.key === 'ArrowLeft') mouthX = Math.max(0, mouthX - 0.04);
  if(e.key === 'ArrowRight') mouthX = Math.min(1, mouthX + 0.04);
});

/* ---- кнопки игры ---- */
document.getElementById('playBtn').addEventListener('click', ()=>{ SoundManager.tryPlayMusic(); startGame(); });
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('goMenuBtn').addEventListener('click', ()=>{ hide(gameScreen); show(menuScreen); });
document.getElementById('exitBtn').addEventListener('click', ()=>{ running = false; hide(gameScreen); show(menuScreen); });
document.getElementById('pauseBtn').addEventListener('click', ()=>{ paused = true; show(pauseOverlay); });
document.getElementById('resumeBtn').addEventListener('click', ()=>{ paused = false; lastTime = performance.now(); hide(pauseOverlay); });
document.getElementById('pauseExitBtn').addEventListener('click', ()=>{
  paused = false; running = false;
  hide(pauseOverlay); hide(gameScreen); show(menuScreen);
});

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
========================================================= */
SoundManager.init();
if(window.Profile){
  try{ Profile.init(); } catch(err){ console.error('Profile.init() упал:', err); }
}
if(window.Events){
  try{ Events.init(); } catch(err){ console.error('Events.init() упал:', err); }
}
if(window.Clicker){
  try{ Clicker.init(); } catch(err){ console.error('Clicker.init() упал:', err); }
}
if(window.Snake){
  try{ Snake.init(); } catch(err){ console.error('Snake.init() упал:', err); }
}
if(window.Doodle){
  try{ Doodle.init(); } catch(err){ console.error('Doodle.init() упал:', err); }
}

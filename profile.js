/* =========================================================
   ПРОФИЛЬ ИГРОКА — общие очки, уровни и достижения сайта
   (не путать с отдельной прокачкой в кликере — та в clicker.js)
========================================================= */
function escapeHtml(str){ const d = document.createElement('div'); d.textContent = str == null ? '' : str; return d.innerHTML; }

function todayStr(d){
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function yesterdayStr(){
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayStr(d);
}

const Profile = {
  playerId: null,
  data: { points: 0, reactions: 0, playSeconds: 0, streak: 0, lastLoginDate: null, unlocked: {} },
  levels: [],
  achievements: [],
  _ready: false,

  init(){
    this.playerId = getPlayerId();

    // Без DB (или DEFAULTS) профиль и достижения работать не могут —
    // выходим тихо, не бросая исключение. Раньше здесь при отсутствии
    // DB/DEFAULTS вылетала ошибка, которая обрывала init() и мешала
    // выполниться следующим строчкам инициализации в script.js
    // (Events.init(), Clicker.init()) — из-за этого мог не работать кликер.
    if(!window.DB || !window.DEFAULTS){
      console.warn('Profile: DB или DEFAULTS недоступны — профиль и достижения отключены.');
      return;
    }

    DB.seedIfEmpty('levels', DEFAULTS.levels);
    DB.seedIfEmpty('achievements', DEFAULTS.achievements);

    DB.watchCollection('levels', list=>{
      this.levels = list.slice().sort((a,b)=> (a.min||0) - (b.min||0));
      this.renderProfileUI();
    });
    DB.watchCollection('achievements', list=>{
      this.achievements = list.slice().sort((a,b)=> (a.target||0) - (b.target||0));
      this.renderProfileUI();
      this.checkAchievements();
    });
    DB.watchItem('profiles', this.playerId, (doc)=>{
      this.data = Object.assign({ points:0, reactions:0, playSeconds:0, streak:0, unlocked:{} }, doc || {});
      this._ready = true;
      this.renderProfileUI();
      this.checkAchievements();
    });

    this.ensureProfileAndStreak();
  },

  ensureProfileAndStreak(){
    if(!window.DB) return;
    DB.getItemOnce('profiles', this.playerId).then(doc=>{
      const today = todayStr();
      if(!doc){
        DB.setItem('profiles', this.playerId, {
          name: getNickname(), points: 0, reactions: 0, playSeconds: 0,
          streak: 1, lastLoginDate: today, unlocked: {}
        });
        return;
      }
      const patch = {};
      if(doc.name !== getNickname()) patch.name = getNickname();
      if(doc.lastLoginDate !== today){
        patch.streak = (doc.lastLoginDate === yesterdayStr()) ? (doc.streak || 0) + 1 : 1;
        patch.lastLoginDate = today;
      }
      if(Object.keys(patch).length) DB.setItem('profiles', this.playerId, patch);
    });
  },

  addPoints(n){ if(window.DB) DB.incrementItem('profiles', this.playerId, { points: n }); },
  addReaction(){ if(window.DB) DB.incrementItem('profiles', this.playerId, { reactions: 1 }); },
  addPlaytime(sec){ if(window.DB) DB.incrementItem('profiles', this.playerId, { playSeconds: sec }); },

  getLevelForPoints(points){
    if(!this.levels.length) return null;
    let level = this.levels[0];
    this.levels.forEach(l=>{ if(points >= l.min) level = l; });
    return level;
  },
  getNextLevel(points){
    for(const l of this.levels){ if(points < l.min) return l; }
    return null;
  },

  checkAchievements(){
    if(!this.achievements.length || !this._ready) return;
    const unlocked = this.data.unlocked || {};
    const metricValue = (type)=>{
      if(type === 'reactions') return this.data.reactions || 0;
      if(type === 'playtime') return this.data.playSeconds || 0;
      if(type === 'streak') return this.data.streak || 0;
      if(type === 'points') return this.data.points || 0;
      return 0;
    };
    const newly = this.achievements.filter(a=> !unlocked[a.id] && metricValue(a.type) >= (a.target || 0));
    if(newly.length){
      if(window.DB) DB.markUnlocked('profiles', this.playerId, newly.map(a=> a.id));
      newly.forEach(a=> showAchievementToast(a, 'general'));
    }
  },

  /* ---------------- UI ---------------- */
  renderProfileUI(){
    const points = this.data.points || 0;
    const level = this.getLevelForPoints(points);
    const next = this.getNextLevel(points);

    const badgeEmoji = document.getElementById('profileBadgeEmoji');
    if(badgeEmoji) badgeEmoji.textContent = level ? level.emoji : '🥄';

    const nameEl = document.getElementById('profileLevelName');
    const pointsEl = document.getElementById('profilePoints');
    const barFill = document.getElementById('profileBarFill');
    const nextText = document.getElementById('profileNextLevel');

    if(nameEl) nameEl.textContent = level ? level.name : 'Новичок';
    if(pointsEl) pointsEl.textContent = points;

    if(barFill && level){
      let pct = 100;
      if(next){
        const span = Math.max(1, next.min - level.min);
        pct = Math.min(100, Math.max(0, ((points - level.min) / span) * 100));
      }
      barFill.style.width = pct + '%';
    }
    if(nextText){
      nextText.textContent = next
        ? `До уровня «${next.name}»: ещё ${Math.max(0, next.min - points)} очк.`
        : 'Достигнут максимальный уровень!';
    }

    const grid = document.getElementById('achievementsGrid');
    if(grid){
      const unlocked = this.data.unlocked || {};
      grid.innerHTML = this.achievements.map(a=>{
        const done = !!unlocked[a.id];
        return `<div class="ach-card ${done ? 'unlocked' : 'locked'}">
          <div class="ach-emoji">${done ? a.emoji : '🔒'}</div>
          <div class="ach-title">${escapeHtml(a.title)}</div>
          <div class="ach-desc">${escapeHtml(a.desc || '')}</div>
        </div>`;
      }).join('') || '<p class="news-empty">Достижений пока нет.</p>';
    }
  }
};

// делаем Profile доступным как window.Profile — иначе `if(window.Profile)`
// в script.js всегда ложно (top-level const не создаёт window-свойство).
window.Profile = Profile;

/* ---- всплывающий тост о новом достижении ---- */
let toastQueue = [];
let toastShowing = false;
// scope: 'clicker' — тост только для достижений кликера, показываем,
// только если сейчас открыт именно экран кликера. 'snake' — тост
// только для достижений змейки, показываем, только если сейчас
// открыт экран змейки (меню или сама игра). 'general' — тосты
// общего профиля (очки/реакции/стрик/время на сайте), показываем
// везде, КРОМЕ экрана кликера и экранов змейки — чтобы всплывающие
// окна одной игры не появлялись поверх другой.
function showAchievementToast(a, scope){
  const onClickerScreen = isScreenVisible('clickerScreen');
  const onSnakeScreen = isScreenVisible('snakeGameScreen') || isScreenVisible('snakeMenuScreen');
  const onDoodleScreen = isScreenVisible('doodleGameScreen') || isScreenVisible('doodleMenuScreen');
  const onTTTScreen = isScreenVisible('tttGameScreen') || isScreenVisible('tttMenuScreen');
  if(scope === 'clicker' && !onClickerScreen) return;
  if(scope === 'snake' && !onSnakeScreen) return;
  if(scope === 'doodle' && !onDoodleScreen) return;
  if(scope === 'ttt' && !onTTTScreen) return;
  if(scope === 'general' && (onClickerScreen || onSnakeScreen || onDoodleScreen || onTTTScreen)) return;
  toastQueue.push(a);
  if(!toastShowing) advanceToast();
}
function advanceToast(){
  const a = toastQueue.shift();
  if(!a){ toastShowing = false; return; }
  toastShowing = true;
  const el = document.getElementById('achievementToast');
  if(!el){ toastShowing = false; return; }
  document.getElementById('toastEmoji').textContent = a.emoji;
  document.getElementById('toastTitle').textContent = a.title;
  el.classList.remove('hidden');
  requestAnimationFrame(()=> el.classList.add('show'));
  setTimeout(()=>{
    el.classList.remove('show');
    setTimeout(()=>{ el.classList.add('hidden'); advanceToast(); }, 400);
  }, 3200);
}

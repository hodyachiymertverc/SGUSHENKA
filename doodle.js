/* =========================================================
   DOODLE-ПРЫЖКИ — мини-игра в духе Doodle Jump: персонаж
   (картинка img/doodle_sguchenka.png, если она есть — иначе
   рисуется банка-заменитель) сам подпрыгивает на банках и
   постепенно взбирается всё выше. Игрок двигает его влево-
   вправо (палец / мышь / стрелки / A-D), экран закольцован
   по горизонтали.

   Механика (как в оригинале):
     - персонаж падает под гравитацией и подпрыгивает,
       приземлившись на банку сверху;
     - обычные банки — просто платформа;
     - движущиеся банки едут туда-сюда;
     - хрупкие банки разваливаются после одного приземления;
     - на некоторых банках есть пружинка — подбрасывает выше
       обычного;
     - испорченные банки (враги) двигаются по воздуху — если
       коснуться такой банки, игра заканчивается;
     - если упасть ниже экрана — игра тоже заканчивается;
     - счёт — набранная высота, чем выше забрался, тем больше
       очков (и очки не уменьшаются, даже если персонаж потом
       немного просел вниз — как и в оригинальной игре).

   У Doodle-прыжков свои рекорды, свои уровни игрока и свои
   достижения — независимо от других игр сайта. Все данные
   (уровни/достижения/рекорды/статистика игроков) хранятся
   через общий DB-слой и полностью редактируются из админки.
========================================================= */
function escapeHtmlD(str){ const d = document.createElement('div'); d.textContent = str == null ? '' : str; return d.innerHTML; }
function doodleShow(el){ if(el) el.classList.remove('hidden'); }
function doodleHide(el){ if(el) el.classList.add('hidden'); }

/* картинка персонажа — своя, если положена в img/doodle_sguchenka.png,
   иначе рисуем баночку-заменитель (сайт не ломается без картинки) */
const DOODLE_CHAR_SRC = 'img/doodle_sguchenka.png';
let doodleCharImg = null;
(function preloadDoodleCharImg(){
  const img = new Image();
  img.onload = ()=> { doodleCharImg = img; };
  img.onerror = ()=> {};
  img.src = DOODLE_CHAR_SRC;
})();

function doodleRoundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const Doodle = {
  playerId: null,
  data: { bestScore: 0, totalScore: 0, gamesPlayed: 0, springsUsed: 0, unlocked: {} },
  levels: [],
  achievements: [],
  _ready: false,
  _recordsSubscribed: false,
  _loopBound: null,

  running: false,
  paused: false,
  keys: { left: false, right: false },
  pointerTargetX: null,

  init(){
    this.playerId = getPlayerId();
    this.bindUI();

    if(!window.DB || !window.DEFAULTS){
      console.warn('Doodle: DB или DEFAULTS недоступны — Doodle-прыжки отключены.');
      return;
    }

    DB.seedIfEmpty('doodleLevels', DEFAULTS.doodleLevels);
    DB.seedIfEmpty('doodleAchievements', DEFAULTS.doodleAchievements);

    DB.watchCollection('doodleLevels', list=>{
      this.levels = list.slice().sort((a,b)=> (a.min||0) - (b.min||0));
      this.renderMenuUI();
      this.renderProfileUI();
    });
    DB.watchCollection('doodleAchievements', list=>{
      this.achievements = list.slice().sort((a,b)=> (a.target||0) - (b.target||0));
      this.renderProfileUI();
      this.checkAchievements();
    });
    DB.watchItem('doodlePlayers', this.playerId, doc=>{
      this.data = Object.assign(
        { bestScore: 0, totalScore: 0, gamesPlayed: 0, springsUsed: 0, unlocked: {} },
        doc || {}
      );
      this._ready = true;
      this.renderMenuUI();
      this.renderProfileUI();
      this.checkAchievements();
    });

    DB.getItemOnce('doodlePlayers', this.playerId).then(doc=>{
      if(!doc){
        DB.setItem('doodlePlayers', this.playerId, {
          name: getNickname(), bestScore: 0, totalScore: 0, gamesPlayed: 0, springsUsed: 0, unlocked: {}
        });
      } else if(doc.name !== getNickname()){
        DB.setItem('doodlePlayers', this.playerId, { name: getNickname() });
      }
    });
  },

  /* ---------------- уровни ---------------- */
  getLevelForScore(v){
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
      if(type === 'bestScore') return this.data.bestScore || 0;
      if(type === 'totalScore') return this.data.totalScore || 0;
      if(type === 'games') return this.data.gamesPlayed || 0;
      if(type === 'springs') return this.data.springsUsed || 0;
      return 0;
    };
    const newly = this.achievements.filter(a=> !unlocked[a.id] && metric(a.type) >= (a.target || 0));
    if(newly.length){
      DB.markUnlocked('doodlePlayers', this.playerId, newly.map(a=> a.id));
      newly.forEach(a=> showAchievementToast(a, 'doodle'));
    }
  },

  /* ---------------- рекорды ---------------- */
  submitScore(score){
    if(!window.DB) return;
    DB.addRecordIn('doodleRecords', this.playerId, getNickname(), score);
  },
  recordGameEnd(score, springsThisGame){
    if(!window.DB || !this._ready) return;
    const patch = { totalScore: score, gamesPlayed: 1 };
    if(springsThisGame) patch.springsUsed = springsThisGame;
    DB.incrementItem('doodlePlayers', this.playerId, patch);
    if(score > (this.data.bestScore || 0)){
      DB.setItem('doodlePlayers', this.playerId, { bestScore: score });
    }
    this.submitScore(score);
  },

  /* ---------------- UI: пилюля уровня в меню ---------------- */
  renderMenuUI(){
    const total = this.data.totalScore || 0;
    const level = this.getLevelForScore(total);
    const next = this.getNextLevel(total);
    const emojiEl = document.getElementById('doodleLevelEmoji');
    if(emojiEl) emojiEl.textContent = level ? level.emoji : '🥄';
    const nameEl = document.getElementById('doodleLevelName');
    if(nameEl) nameEl.textContent = level ? level.name : 'Новичок-прыгун';
    const nextEl = document.getElementById('doodleLevelNext');
    if(nextEl){
      nextEl.textContent = next
        ? `До «${next.name}»: ещё ${Math.max(0, next.min - total)} очков высоты`
        : 'Максимальный уровень!';
    }
  },

  /* ---------------- UI: профиль/достижения ---------------- */
  renderProfileUI(){
    const total = this.data.totalScore || 0;
    const level = this.getLevelForScore(total);
    const next = this.getNextLevel(total);

    const emojiEl = document.getElementById('doodleProfileEmoji');
    if(emojiEl) emojiEl.textContent = level ? level.emoji : '🥄';
    const nameEl = document.getElementById('doodleProfileLevelName');
    if(nameEl) nameEl.textContent = level ? level.name : 'Новичок-прыгун';
    const pointsEl = document.getElementById('doodleProfilePoints');
    if(pointsEl) pointsEl.textContent = total;

    const barFill = document.getElementById('doodleProfileBarFill');
    if(barFill && level){
      let pct = 100;
      if(next){
        const span = Math.max(1, next.min - level.min);
        pct = Math.min(100, Math.max(0, ((total - level.min) / span) * 100));
      }
      barFill.style.width = pct + '%';
    }
    const nextText = document.getElementById('doodleProfileNextLevel');
    if(nextText){
      nextText.textContent = next
        ? `До уровня «${next.name}»: ещё ${Math.max(0, next.min - total)} очков высоты.`
        : 'Достигнут максимальный уровень!';
    }

    const grid = document.getElementById('doodleAchievementsGrid');
    if(grid){
      const unlocked = this.data.unlocked || {};
      grid.innerHTML = this.achievements.map(a=>{
        const done = !!unlocked[a.id];
        return `<div class="ach-card ${done ? 'unlocked' : 'locked'}">
          <div class="ach-emoji">${done ? a.emoji : '🔒'}</div>
          <div class="ach-title">${escapeHtmlD(a.title)}</div>
          <div class="ach-desc">${escapeHtmlD(a.desc || '')}</div>
        </div>`;
      }).join('') || '<p class="news-empty">Достижений пока нет.</p>';
    }
  },

  /* ---------------- UI: рекорды ---------------- */
  openRecords(){
    doodleShow(document.getElementById('doodleRecordsModal'));
    if(!this._recordsSubscribed && window.DB){
      this._recordsSubscribed = true;
      DB.watchRecordsIn('doodleRecords', list=> this.renderRecordsList(list));
    }
  },
  renderRecordsList(list){
    const el = document.getElementById('doodleRecordsList');
    if(!el) return;
    if(!list.length){
      el.innerHTML = '<p class="news-empty">Пока нет рекордов. Стань первым!</p>';
      return;
    }
    const myId = this.playerId;
    el.innerHTML = list.slice(0, 20).map(r=>{
      const cls = r.playerId === myId ? ' class="my-record"' : '';
      return `<li${cls}>${r.score} очков <span>— ${escapeHtmlD(r.name)}, ${r.date}</span></li>`;
    }).join('');
  },

  /* =========================================================
     ИГРОВОЙ ДВИЖОК
  ========================================================= */
  fitCanvas(){
    const screen = document.getElementById('doodleGameScreen');
    const canvas = document.getElementById('doodleCanvas');
    const wrap = document.getElementById('doodleGameWrap');
    if(!screen || !canvas || !wrap || screen.classList.contains('hidden')) return;
    const topbar = document.querySelector('.topbar');
    const hud = document.getElementById('doodleHud');
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const used = (topbar ? topbar.offsetHeight : 0) + (hud ? hud.offsetHeight : 0) + 40;
    const height = Math.max(320, vh - used);
    wrap.style.height = height + 'px';
    canvas.style.height = height + 'px';
    this.resizeCanvasBuffer();
  },
  resizeCanvasBuffer(){
    const canvas = document.getElementById('doodleCanvas');
    if(!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  },

  /* ---------------- физика/настройки ---------------- */
  GRAVITY: 0.5,
  JUMP_VELOCITY: -13,
  SPRING_VELOCITY: -21,
  MOVE_ACCEL: 0.9,
  MOVE_MAX: 6.2,
  FRICTION: 0.86,
  POINTS_PER_PIXEL: 0.1, // высота в пикселях -> очки

  startGame(){
    doodleHide(document.getElementById('doodleMenuScreen'));
    doodleShow(document.getElementById('doodleGameScreen'));
    doodleHide(document.getElementById('doodleGameOverOverlay'));
    doodleHide(document.getElementById('doodlePauseOverlay'));

    this.fitCanvas();

    const canvas = document.getElementById('doodleCanvas');
    const rect = canvas.getBoundingClientRect();
    this.W = rect.width;
    this.H = rect.height;

    this.resetGameState();

    const scoreEl = document.getElementById('doodleScoreValue');
    if(scoreEl) scoreEl.textContent = '0';

    this.running = true;
    this.paused = false;
    this._lastTime = performance.now();
    if(!this._loopBound) this._loopBound = this.loop.bind(this);
    requestAnimationFrame(this._loopBound);
  },

  resetGameState(){
    this.platW = Math.max(56, this.W * 0.22);
    this.platH = Math.max(14, this.platW * 0.24);
    this.playerSize = Math.max(40, this.W * 0.15);

    this.player = {
      x: this.W / 2,
      y: this.H - 70,
      vx: 0,
      vy: this.JUMP_VELOCITY,
      facing: 1
    };
    this.camTop = 0;
    this.score = 0;
    this.springsThisGame = 0;
    this.keys = { left: false, right: false };
    this.pointerTargetX = null;
    this.platforms = [];
    this.monsters = [];
    this.particles = [];
    this._highestGenY = this.player.y; // самая верхняя (по факту наименьшая) сгенерированная координата

    // стартовая платформа прямо под игроком
    this.platforms.push({
      id: 'start', x: this.player.x, y: this.player.y + this.playerSize * 0.5,
      w: this.platW, type: 'normal', spring: false, dir: 1, broken: false
    });

    this.generatePlatformsUpTo(this.player.y - this.H * 1.6);

    const scoreEl = document.getElementById('doodleScoreValue');
    if(scoreEl) scoreEl.textContent = '0';
  },

  /* сложность растёт вместе со счётом */
  difficultyFactors(score){
    const t = Math.min(1, score / 1800); // 0..1
    return {
      movingChance: 0.10 + t * 0.28,
      crumbleChance: t * 0.28,
      springChance: 0.09,
      monsterChance: 0.03 + t * 0.20,
      gapMin: 70 + t * 18,
      gapMax: 118 + t * 42
    };
  },

  generatePlatformsUpTo(targetY){
    const f = this.difficultyFactors(this.score);
    while(this._highestGenY > targetY){
      const gap = f.gapMin + Math.random() * (f.gapMax - f.gapMin);
      this._highestGenY -= gap;
      const x = this.platW / 2 + Math.random() * (this.W - this.platW);

      const roll = Math.random();
      let type = 'normal';
      if(roll < f.crumbleChance) type = 'crumble';
      else if(roll < f.crumbleChance + f.movingChance) type = 'moving';

      const spring = type !== 'crumble' && Math.random() < f.springChance;

      this.platforms.push({
        id: 'p' + Math.random().toString(36).slice(2, 9),
        x, y: this._highestGenY, w: this.platW,
        type, spring, dir: Math.random() < 0.5 ? -1 : 1, broken: false,
        moveRange: this.W * 0.32, baseX: x
      });

      if(Math.random() < f.monsterChance){
        const mx = this.platW / 2 + Math.random() * (this.W - this.platW);
        this.monsters.push({
          id: 'm' + Math.random().toString(36).slice(2, 9),
          x: mx, y: this._highestGenY - 55 - Math.random() * 40,
          baseX: mx, range: this.W * 0.22, dir: Math.random() < 0.5 ? -1 : 1,
          size: Math.max(34, this.W * 0.11), phase: Math.random() * Math.PI * 2
        });
      }
    }
  },

  cleanupOffscreen(){
    const bottomLimit = this.camTop + this.H + 140;
    this.platforms = this.platforms.filter(p=> p.y < bottomLimit && !p.removed);
    this.monsters = this.monsters.filter(m=> m.y < bottomLimit);
  },

  /* ---------------- ввод ---------------- */
  applyInput(frames){
    const p = this.player;
    if(this.keys.left && !this.keys.right){
      p.vx -= this.MOVE_ACCEL * frames;
      p.facing = -1;
      this.pointerTargetX = null;
    } else if(this.keys.right && !this.keys.left){
      p.vx += this.MOVE_ACCEL * frames;
      p.facing = 1;
      this.pointerTargetX = null;
    } else if(this.pointerTargetX !== null){
      const dx = this.pointerTargetX - p.x;
      p.vx += Math.max(-this.MOVE_ACCEL * 1.6, Math.min(this.MOVE_ACCEL * 1.6, dx * 0.09)) * frames;
      if(Math.abs(dx) > 3) p.facing = dx > 0 ? 1 : -1;
    } else {
      p.vx *= Math.pow(this.FRICTION, frames);
      if(Math.abs(p.vx) < 0.02) p.vx = 0;
    }
    p.vx = Math.max(-this.MOVE_MAX, Math.min(this.MOVE_MAX, p.vx));
  },

  /* ---------------- обновление ---------------- */
  update(dt){
    const frames = Math.min(2.2, dt / 16.6667);
    const p = this.player;

    this.applyInput(frames);

    // движущиеся платформы
    this.platforms.forEach(pl=>{
      if(pl.type === 'moving' && !pl.broken){
        pl.x += pl.dir * 2.1 * frames;
        if(pl.x < pl.baseX - pl.moveRange || pl.x > pl.baseX + pl.moveRange) pl.dir *= -1;
        pl.x = Math.max(pl.w / 2, Math.min(this.W - pl.w / 2, pl.x));
      }
    });
    // враги (испорченные банки)
    this.monsters.forEach(m=>{
      m.phase += 0.045 * frames;
      m.x = m.baseX + Math.sin(m.phase) * m.range;
    });

    // физика игрока
    p.vy += this.GRAVITY * frames;
    p.y += p.vy * frames;
    p.x += p.vx * frames;

    // закольцовка по горизонтали
    const half = this.playerSize / 2;
    if(p.x < -half) p.x = this.W + half;
    else if(p.x > this.W + half) p.x = -half;

    // приземление только когда падаем вниз
    if(p.vy > 0){
      for(const pl of this.platforms){
        if(pl.broken) continue;
        const withinX = Math.abs(p.x - pl.x) < (pl.w / 2 + this.playerSize * 0.32);
        const prevFeetY = p.y - p.vy * frames + this.playerSize * 0.42;
        const feetY = p.y + this.playerSize * 0.42;
        const platTop = pl.y - this.platH / 2;
        if(withinX && prevFeetY <= platTop + 6 && feetY >= platTop){
          if(pl.type === 'crumble'){
            pl.broken = true;
            pl.removed = true;
            p.vy = this.JUMP_VELOCITY;
          } else if(pl.spring){
            p.vy = this.SPRING_VELOCITY;
            this.springsThisGame++;
            this.spawnBoostParticles(pl.x, pl.y);
          } else {
            p.vy = this.JUMP_VELOCITY;
          }
          break;
        }
      }
    }

    // столкновение с врагом = конец игры
    for(const m of this.monsters){
      const dx = p.x - m.x, dy = p.y - m.y;
      const rr = (m.size * 0.42 + this.playerSize * 0.34);
      if(dx * dx + dy * dy < rr * rr){
        this.endGame('monster');
        return;
      }
    }

    // камера следует только вверх (никогда не откатывается вниз)
    const screenY = p.y - this.camTop;
    const followLine = this.H * 0.42;
    if(screenY < followLine){
      this.camTop -= (followLine - screenY);
    }
    const newScore = Math.max(this.score, Math.floor((0 - this.camTop) * this.POINTS_PER_PIXEL));
    if(newScore !== this.score){
      this.score = newScore;
      const scoreEl = document.getElementById('doodleScoreValue');
      if(scoreEl) scoreEl.textContent = this.score;
    }

    // падение ниже экрана = конец игры
    if(p.y - this.camTop > this.H + 60){
      this.endGame('fall');
      return;
    }

    // генерируем новые платформы по мере подъёма камеры
    this.generatePlatformsUpTo(this.camTop - this.H * 0.4);
    this.cleanupOffscreen();

    // частицы (пружина)
    this.particles = this.particles.filter(pt=>{
      pt.life -= frames;
      pt.y -= 1.6 * frames;
      return pt.life > 0;
    });
  },

  spawnBoostParticles(x, y){
    for(let i = 0; i < 6; i++){
      this.particles.push({ x: x + (Math.random() - 0.5) * 30, y, life: 26 + Math.random() * 10 });
    }
  },

  loop(now){
    if(!this.running) return;
    const dt = Math.min(48, now - this._lastTime);
    this._lastTime = now;
    if(!this.paused){
      this.update(dt);
      if(this.running) this.render();
    }
    if(this.running) requestAnimationFrame(this._loopBound);
  },

  endGame(reason){
    this.running = false;
    const score = this.score;
    const prevBest = this.data.bestScore || 0;
    const isNewRecord = score > prevBest && score > 0;

    this.recordGameEnd(score, this.springsThisGame);

    const finalScoreEl = document.getElementById('doodleFinalScore');
    if(finalScoreEl) finalScoreEl.textContent = score;
    const titleMap = {
      fall: '⬇️ Улетел вниз мимо банок!',
      monster: '🧟 Врезался в испорченную банку!'
    };
    const titleEl = document.getElementById('doodleGameOverTitle');
    if(titleEl) titleEl.textContent = titleMap[reason] || '💥 Игра окончена!';
    const recEl = document.getElementById('doodleNewRecordText');
    if(recEl) recEl.classList.toggle('hidden', !isNewRecord);
    doodleShow(document.getElementById('doodleGameOverOverlay'));
  },

  /* ---------------- отрисовка ---------------- */
  drawPlatform(ctx, pl){
    const sy = pl.y - this.camTop;
    if(sy < -60 || sy > this.H + 60) return;
    const x = pl.x - pl.w / 2, y = sy - this.platH / 2;

    let top = '#8BD46B', side = '#4E9A3A';
    if(pl.type === 'moving'){ top = '#7FC7F2'; side = '#3E8FC4'; }
    if(pl.type === 'crumble'){ top = '#E0B27A'; side = '#B07C42'; }

    ctx.fillStyle = side;
    doodleRoundRect(ctx, x, y + this.platH * 0.35, pl.w, this.platH * 0.65, this.platH * 0.3);
    ctx.fill();
    ctx.fillStyle = top;
    doodleRoundRect(ctx, x, y, pl.w, this.platH * 0.72, this.platH * 0.3);
    ctx.fill();

    if(pl.type === 'crumble'){
      ctx.strokeStyle = 'rgba(94,58,26,0.55)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 2, y + 1, pl.w - 4, this.platH * 0.7 - 2);
      ctx.setLineDash([]);
    }

    if(pl.spring){
      const cx = pl.x, topY = sy - this.platH / 2;
      ctx.strokeStyle = '#5E3A1A';
      ctx.lineWidth = Math.max(2, pl.w * 0.03);
      ctx.beginPath();
      const coilW = pl.w * 0.16, coils = 3;
      for(let i = 0; i <= coils * 2; i++){
        const yy = topY - (i / (coils * 2)) * (pl.w * 0.22);
        const xx = cx + (i % 2 === 0 ? -coilW : coilW);
        if(i === 0) ctx.moveTo(cx, topY); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      ctx.fillStyle = '#F2B705';
      doodleRoundRect(ctx, cx - pl.w * 0.16, topY - pl.w * 0.22 - 5, pl.w * 0.32, 7, 3);
      ctx.fill();
    }
  },

  drawMonster(ctx, m){
    const sy = m.y - this.camTop;
    if(sy < -80 || sy > this.H + 80) return;
    const pulse = 1 + Math.sin(Date.now() / 200 + m.phase) * 0.06;
    const r = m.size * 0.5 * pulse;
    ctx.beginPath();
    ctx.arc(m.x, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#B23A28';
    ctx.fill();
    ctx.lineWidth = Math.max(2, m.size * 0.06);
    ctx.strokeStyle = '#5E1A12';
    ctx.stroke();
    ctx.font = `${m.size * 0.62}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('👾', m.x, sy + 1);
  },

  drawPlayer(ctx){
    const p = this.player;
    const sy = p.y - this.camTop;
    const s = this.playerSize;
    ctx.save();
    ctx.translate(p.x, sy);
    if(p.facing < 0) ctx.scale(-1, 1);
    if(doodleCharImg){
      ctx.drawImage(doodleCharImg, -s / 2, -s / 2, s, s);
    } else {
      // запасной вариант — рисуем баночку-персонажа с лицом
      ctx.fillStyle = '#F2B705';
      doodleRoundRect(ctx, -s * 0.36, -s * 0.5, s * 0.72, s, s * 0.22);
      ctx.fill();
      ctx.strokeStyle = '#5E3A1A';
      ctx.lineWidth = Math.max(1.5, s * 0.035);
      ctx.stroke();
      ctx.fillStyle = '#FFF6E4';
      doodleRoundRect(ctx, -s * 0.36, -s * 0.5, s * 0.72, s * 0.22, s * 0.1);
      ctx.fill();
      ctx.fillStyle = '#5E3A1A';
      ctx.beginPath(); ctx.arc(-s * 0.12, s * 0.02, s * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.12, s * 0.02, s * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.arc(0, s * 0.16, s * 0.12, 0, Math.PI, false);
      ctx.stroke();
    }
    ctx.restore();
  },

  render(){
    const canvas = document.getElementById('doodleCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    // лёгкий параллакс-декор — облачка на заднем плане
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for(let i = 0; i < 4; i++){
      const cy = ((i * 220 - this.camTop * 0.35) % (this.H + 220) + (this.H + 220)) % (this.H + 220) - 110;
      const cx = (i * 137) % this.W;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 46, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    this.platforms.forEach(pl=> this.drawPlatform(ctx, pl));
    this.monsters.forEach(m=> this.drawMonster(ctx, m));

    // частицы пружины
    ctx.fillStyle = 'rgba(242,183,5,0.85)';
    this.particles.forEach(pt=>{
      ctx.beginPath();
      ctx.arc(pt.x, pt.y - this.camTop, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    this.drawPlayer(ctx);
  },

  /* ---------------- привязка UI ---------------- */
  bindUI(){
    const pickBtn = document.getElementById('pickDoodleBtn');
    if(pickBtn){
      pickBtn.addEventListener('click', ()=>{
        doodleHide(document.getElementById('gameSelectScreen'));
        doodleShow(document.getElementById('doodleMenuScreen'));
        this.renderMenuUI();
      });
    }
    const backBtn = document.getElementById('doodleBackToSelectBtn');
    if(backBtn){
      backBtn.addEventListener('click', ()=>{
        doodleHide(document.getElementById('doodleMenuScreen'));
        doodleShow(document.getElementById('gameSelectScreen'));
      });
    }

    const playBtn = document.getElementById('doodlePlayBtn');
    if(playBtn) playBtn.addEventListener('click', ()=> this.startGame());
    const restartBtn = document.getElementById('doodleRestartBtn');
    if(restartBtn) restartBtn.addEventListener('click', ()=> this.startGame());

    const toMenu = ()=>{
      this.running = false; this.paused = false;
      doodleHide(document.getElementById('doodlePauseOverlay'));
      doodleHide(document.getElementById('doodleGameScreen'));
      doodleShow(document.getElementById('doodleMenuScreen'));
    };
    const goMenuBtn = document.getElementById('doodleGoMenuBtn');
    if(goMenuBtn) goMenuBtn.addEventListener('click', toMenu);
    const exitBtn = document.getElementById('doodleExitBtn');
    if(exitBtn) exitBtn.addEventListener('click', toMenu);
    const pauseExitBtn = document.getElementById('doodlePauseExitBtn');
    if(pauseExitBtn) pauseExitBtn.addEventListener('click', toMenu);

    const pauseBtn = document.getElementById('doodlePauseBtn');
    if(pauseBtn){
      pauseBtn.addEventListener('click', ()=>{
        if(!this.running) return;
        this.paused = true;
        doodleShow(document.getElementById('doodlePauseOverlay'));
      });
    }
    const resumeBtn = document.getElementById('doodleResumeBtn');
    if(resumeBtn){
      resumeBtn.addEventListener('click', ()=>{
        this.paused = false;
        this._lastTime = performance.now();
        doodleHide(document.getElementById('doodlePauseOverlay'));
      });
    }

    const recordsBtn = document.getElementById('doodleRecordsBtn');
    if(recordsBtn) recordsBtn.addEventListener('click', ()=> this.openRecords());
    const profileBtn = document.getElementById('doodleProfileBtn');
    if(profileBtn){
      profileBtn.addEventListener('click', ()=>{
        this.renderProfileUI();
        doodleShow(document.getElementById('doodleProfileModal'));
      });
    }

    // клавиатура (стрелки, A/D, Ф/В для рус. раскладки)
    const leftKeys = new Set(['ArrowLeft', 'a', 'A', 'ф', 'Ф']);
    const rightKeys = new Set(['ArrowRight', 'd', 'D', 'в', 'В']);
    document.addEventListener('keydown', e=>{
      if(!isScreenVisible('doodleGameScreen')) return;
      if(leftKeys.has(e.key)){ e.preventDefault(); this.keys.left = true; }
      else if(rightKeys.has(e.key)){ e.preventDefault(); this.keys.right = true; }
    });
    document.addEventListener('keyup', e=>{
      if(leftKeys.has(e.key)) this.keys.left = false;
      else if(rightKeys.has(e.key)) this.keys.right = false;
    });

    // палец/мышь — персонаж стремится к позиции пальца по X
    const canvas = document.getElementById('doodleCanvas');
    if(canvas){
      const setPointerFromEvent = (clientX)=>{
        const rect = canvas.getBoundingClientRect();
        this.pointerTargetX = clientX - rect.left;
      };
      canvas.addEventListener('touchstart', e=>{
        if(!e.touches[0]) return;
        setPointerFromEvent(e.touches[0].clientX);
      }, { passive: true });
      canvas.addEventListener('touchmove', e=>{
        e.preventDefault();
        if(!e.touches[0]) return;
        setPointerFromEvent(e.touches[0].clientX);
      }, { passive: false });
      canvas.addEventListener('touchend', ()=>{ this.pointerTargetX = null; });
      canvas.addEventListener('touchcancel', ()=>{ this.pointerTargetX = null; });

      canvas.addEventListener('mousemove', e=> setPointerFromEvent(e.clientX));
      canvas.addEventListener('mouseleave', ()=>{ this.pointerTargetX = null; });
    }

    window.addEventListener('resize', ()=> this.fitCanvas());
    window.addEventListener('orientationchange', ()=> setTimeout(()=> this.fitCanvas(), 200));
    if(window.visualViewport) window.visualViewport.addEventListener('resize', ()=> this.fitCanvas());
  }
};

// делаем Doodle доступным как window.Doodle — иначе `if(window.Doodle)`
// в script.js всегда ложно (top-level const не создаёт window-свойство).
window.Doodle = Doodle;

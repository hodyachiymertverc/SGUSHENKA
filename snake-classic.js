/* =========================================================
   ЗМЕЙКА — мини-игра: собирай сгущёнку, змейка растёт и
   постепенно ускоряется. Два уровня сложности:
     - лёгкий: обычная змейка;
     - сложный: на карте появляются бомбы (сначала одна,
       потом по одной новой через какое-то время).
   У змейки свои рекорды (отдельно лёгкий/сложный), свои
   уровни игрока и свои достижения — независимо от общего
   профиля сайта и от кликера. Всплывающие окна о достижениях
   змейки показываются только на экранах змейки (см. profile.js).

   Этот файл полностью самодостаточен: сам вешает все свои
   обработчики кнопок (кроме перехода на экран змейки из
   общего меню выбора игры — см. script.js, как и для кликера).
========================================================= */
/* картинка сгущёнки для еды — своя, независимая загрузка,
   чтобы не зависеть от порядка подключения script.js */
const SNAKE_CLASSIC_FOOD_SRC = 'img/sgushenka.png';
let snakeClassicFoodImg = null;
(function preloadSnakeClassicFoodImg(){
  const img = new Image();
  img.onload = ()=> { snakeClassicFoodImg = img; };
  img.onerror = ()=> {};
  img.src = SNAKE_CLASSIC_FOOD_SRC;
})();

function snakeClassicRoundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const SnakeClassic = {
  playerId: null,
  data: { totalCaught: 0, gamesPlayed: 0, bestEasy: 0, bestHard: 0, unlocked: {} },
  levels: [],
  achievements: [],
  _ready: false,
  _recordsSubscribed: false,
  _loopBound: null,

  difficulty: 'easy',
  running: false,
  paused: false,

  init(){
    this.playerId = getPlayerId();
    this.bindUI();

    if(!window.DB || !window.DEFAULTS){
      console.warn('SnakeClassic: DB или DEFAULTS недоступны — обычная змейка отключена.');
      return;
    }

    DB.seedIfEmpty('snakeClassicLevels', DEFAULTS.snakeClassicLevels);
    DB.seedIfEmpty('snakeClassicAchievements', DEFAULTS.snakeClassicAchievements);

    DB.watchCollection('snakeClassicLevels', list=>{
      this.levels = list.slice().sort((a,b)=> (a.min||0) - (b.min||0));
      this.renderMenuUI();
      this.renderProfileUI();
    });
    DB.watchCollection('snakeClassicAchievements', list=>{
      this.achievements = list.slice().sort((a,b)=> (a.target||0) - (b.target||0));
      this.renderProfileUI();
      this.checkAchievements();
    });
    DB.watchItem('snakeClassicPlayers', this.playerId, doc=>{
      this.data = Object.assign(
        { totalCaught: 0, gamesPlayed: 0, bestEasy: 0, bestHard: 0, unlocked: {} },
        doc || {}
      );
      this._ready = true;
      this.renderMenuUI();
      this.renderProfileUI();
      this.checkAchievements();
    });

    DB.getItemOnce('snakeClassicPlayers', this.playerId).then(doc=>{
      if(!doc){
        DB.setItem('snakeClassicPlayers', this.playerId, {
          name: getNickname(), totalCaught: 0, gamesPlayed: 0, bestEasy: 0, bestHard: 0, unlocked: {}
        });
      } else if(doc.name !== getNickname()){
        DB.setItem('snakeClassicPlayers', this.playerId, { name: getNickname() });
      }
    });
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
      if(type === 'bestHard') return this.data.bestHard || 0;
      return 0;
    };
    const newly = this.achievements.filter(a=> !unlocked[a.id] && metric(a.type) >= (a.target || 0));
    if(newly.length){
      DB.markUnlocked('snakeClassicPlayers', this.playerId, newly.map(a=> a.id));
      newly.forEach(a=> showAchievementToast(a, 'snakeClassic'));
    }
  },

  /* ---------------- рекорды ---------------- */
  collectionFor(diff){ return diff === 'hard' ? 'snakeClassicRecordsHard' : 'snakeClassicRecordsEasy'; },
  submitScore(diff, score){
    if(!window.DB) return;
    DB.addRecordIn(this.collectionFor(diff), this.playerId, getNickname(), score);
  },
  recordGameEnd(diff, score, caughtThisGame){
    if(!window.DB || !this._ready) return;
    DB.incrementItem('snakeClassicPlayers', this.playerId, { totalCaught: caughtThisGame, gamesPlayed: 1 });
    const bestKey = diff === 'hard' ? 'bestHard' : 'bestEasy';
    if(score > (this.data[bestKey] || 0)){
      const patch = {}; patch[bestKey] = score;
      DB.setItem('snakeClassicPlayers', this.playerId, patch);
    }
    this.submitScore(diff, score);
  },

  /* ---------------- UI: пилюля уровня в меню ---------------- */
  renderMenuUI(){
    const caught = this.data.totalCaught || 0;
    const level = this.getLevelForCaught(caught);
    const next = this.getNextLevel(caught);
    const emojiEl = document.getElementById('snakeClassicLevelEmoji');
    if(emojiEl) emojiEl.textContent = level ? level.emoji : '🥄';
    const nameEl = document.getElementById('snakeClassicLevelName');
    if(nameEl) nameEl.textContent = level ? level.name : 'Новичок-змейка';
    const nextEl = document.getElementById('snakeClassicLevelNext');
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

    const emojiEl = document.getElementById('snakeClassicProfileEmoji');
    if(emojiEl) emojiEl.textContent = level ? level.emoji : '🥄';
    const nameEl = document.getElementById('snakeClassicProfileLevelName');
    if(nameEl) nameEl.textContent = level ? level.name : 'Новичок-змейка';
    const caughtEl = document.getElementById('snakeClassicProfileCaught');
    if(caughtEl) caughtEl.textContent = caught;

    const barFill = document.getElementById('snakeClassicProfileBarFill');
    if(barFill && level){
      let pct = 100;
      if(next){
        const span = Math.max(1, next.min - level.min);
        pct = Math.min(100, Math.max(0, ((caught - level.min) / span) * 100));
      }
      barFill.style.width = pct + '%';
    }
    const nextText = document.getElementById('snakeClassicProfileNextLevel');
    if(nextText){
      nextText.textContent = next
        ? `До уровня «${next.name}»: ещё ${Math.max(0, next.min - caught)} банок.`
        : 'Достигнут максимальный уровень!';
    }

    const grid = document.getElementById('snakeClassicAchievementsGrid');
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

  /* ---------------- UI: рекорды (2 вкладки) ---------------- */
  openRecords(){
    snakeShow(document.getElementById('snakeClassicRecordsModal'));
    if(!this._recordsSubscribed && window.DB){
      this._recordsSubscribed = true;
      DB.watchRecordsIn('snakeClassicRecordsEasy', list=> this.renderRecordsList('snakeClassicRecordsListEasy', list));
      DB.watchRecordsIn('snakeClassicRecordsHard', list=> this.renderRecordsList('snakeClassicRecordsListHard', list));
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
     ИГРОВОЙ ДВИЖОК
  ========================================================= */
  fitCanvas(){
    const screen = document.getElementById('snakeClassicGameScreen');
    const canvas = document.getElementById('snakeClassicCanvas');
    const wrap = document.getElementById('snakeClassicGameWrap');
    if(!screen || !canvas || !wrap || screen.classList.contains('hidden')) return;
    const topbar = document.querySelector('.topbar');
    const hud = document.getElementById('snakeClassicHud');
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const used = (topbar ? topbar.offsetHeight : 0) + (hud ? hud.offsetHeight : 0) + 40;
    // раньше здесь был фиксированный нижний порог (260px), который на
    // невысоких экранах (например, телефон в альбомной ориентации,
    // где HUD из-за длинного текста сложности переносится на 2 строки)
    // мог оказаться БОЛЬШЕ реально доступного места — из-за этого поле
    // становилось выше видимой области экрана и как будто "вылезало"
    // за рамку. Теперь высота никогда не превышает доступное вертикальное
    // пространство: нижний порог применяется только пока он не превышает
    // vh - used.
    const available = Math.max(0, vh - used);
    const minHeight = Math.min(220, available || 220);
    const height = Math.max(minHeight, available);
    wrap.style.height = height + 'px';
    canvas.style.height = height + 'px';
    this.resizeCanvasBuffer();
  },
  resizeCanvasBuffer(){
    const canvas = document.getElementById('snakeClassicCanvas');
    if(!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  },

  startGame(diff){
    snakeHide(document.getElementById('snakeClassicMenuScreen'));
    snakeShow(document.getElementById('snakeClassicGameScreen'));
    snakeHide(document.getElementById('snakeClassicGameOverOverlay'));
    snakeHide(document.getElementById('snakeClassicPauseOverlay'));

    const diffPill = document.getElementById('snakeClassicDiffPill');
    if(diffPill) diffPill.textContent = diff === 'hard' ? '💣 Сложный' : '🥄 Лёгкий';

    this.fitCanvas();
    // подстраховка: через кадр ещё раз пересчитываем размер — сразу
    // после снятия .hidden браузер иногда ещё не успел применить
    // перенос строк в HUD (например, если добавляется/меняется текст
    // сложности), из-за чего первый расчёт высоты может быть неточным
    requestAnimationFrame(()=> this.fitCanvas());

    const canvas = document.getElementById('snakeClassicCanvas');
    const rect = canvas.getBoundingClientRect();
    const target = 24;
    this.cols = Math.min(22, Math.max(9, Math.floor(rect.width / target)));
    this.rows = Math.min(26, Math.max(9, Math.floor(rect.height / target)));

    this.resetGameState(diff);

    const scoreEl = document.getElementById('snakeClassicScoreValue');
    if(scoreEl) scoreEl.textContent = '0';

    this.running = true;
    this.paused = false;
    this._lastTime = performance.now();
    if(!this._loopBound) this._loopBound = this.loop.bind(this);
    requestAnimationFrame(this._loopBound);
  },

  resetGameState(diff){
    this.difficulty = diff;
    const cx = Math.floor(this.cols / 2), cy = Math.floor(this.rows / 2);
    this.snakeBody = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.score = 0;
    this.tickInterval = 220;
    this.minTickInterval = 75;
    this.speedStep = 4;
    this._tickAccum = 0;
    this.bombs = [];
    this.bombTimer = 0;
    this.bombInterval = 9000;
    this.minBombInterval = 4000;
    this.maxBombs = Math.max(4, Math.floor(this.cols * this.rows * 0.06));
    this.food = null;
    this.spawnFood();
    if(diff === 'hard') this.spawnBomb();
  },

  freeCells(){
    const occupied = new Set(this.snakeBody.map(s=> s.x + ',' + s.y));
    (this.bombs || []).forEach(b=> occupied.add(b.x + ',' + b.y));
    const free = [];
    for(let x = 0; x < this.cols; x++){
      for(let y = 0; y < this.rows; y++){
        const k = x + ',' + y;
        if(!occupied.has(k)) free.push({ x, y });
      }
    }
    return free;
  },
  spawnFood(){
    const free = this.freeCells();
    if(!free.length){ this.food = null; return; }
    this.food = free[Math.floor(Math.random() * free.length)];
  },
  spawnBomb(){
    let free = this.freeCells();
    if(this.food) free = free.filter(c=> !(c.x === this.food.x && c.y === this.food.y));
    if(!free.length) return;
    this.bombs.push(free[Math.floor(Math.random() * free.length)]);
  },

  queueDirection(dir){
    if(!dir || !this.running || this.paused) return;
    // запрещаем разворот на 180° за один шаг
    if(this.snakeBody.length > 1 && dir.x === -this.direction.x && dir.y === -this.direction.y) return;
    this.nextDirection = dir;
  },

  step(){
    this.direction = this.nextDirection || this.direction;
    const head = this.snakeBody[0];
    const newHead = { x: head.x + this.direction.x, y: head.y + this.direction.y };

    if(newHead.x < 0 || newHead.x >= this.cols || newHead.y < 0 || newHead.y >= this.rows){
      this.endGame('wall'); return;
    }

    const willEat = !!(this.food && newHead.x === this.food.x && newHead.y === this.food.y);
    const bodyToCheck = willEat ? this.snakeBody : this.snakeBody.slice(0, -1);
    if(bodyToCheck.some(seg=> seg.x === newHead.x && seg.y === newHead.y)){
      this.endGame('self'); return;
    }
    if(this.difficulty === 'hard' && this.bombs.some(b=> b.x === newHead.x && b.y === newHead.y)){
      this.endGame('bomb'); return;
    }

    this.snakeBody.unshift(newHead);
    if(willEat){
      this.score++;
      const scoreEl = document.getElementById('snakeClassicScoreValue');
      if(scoreEl) scoreEl.textContent = this.score;
      this.tickInterval = Math.max(this.minTickInterval, this.tickInterval - this.speedStep);
      this.spawnFood();
    } else {
      this.snakeBody.pop();
    }
  },

  loop(now){
    if(!this.running) return;
    const dt = now - this._lastTime;
    this._lastTime = now;
    if(!this.paused){
      if(this.difficulty === 'hard'){
        this.bombTimer += dt;
        if(this.bombTimer >= this.bombInterval && this.bombs.length < this.maxBombs){
          this.bombTimer = 0;
          this.spawnBomb();
          this.bombInterval = Math.max(this.minBombInterval, this.bombInterval - 300);
        }
      }
      this._tickAccum += dt;
      while(this.running && this._tickAccum >= this.tickInterval){
        this._tickAccum -= this.tickInterval;
        this.step();
      }
      if(this.running) this.render();
    }
    if(this.running) requestAnimationFrame(this._loopBound);
  },

  endGame(reason){
    this.running = false;
    const diff = this.difficulty;
    const score = this.score;
    const prevBest = diff === 'hard' ? (this.data.bestHard || 0) : (this.data.bestEasy || 0);
    const isNewRecord = score > prevBest && score > 0;

    this.recordGameEnd(diff, score, score);

    const finalScoreEl = document.getElementById('snakeClassicFinalScore');
    if(finalScoreEl) finalScoreEl.textContent = score;
    const titleMap = {
      wall: '🧱 Врезался в стену!',
      self: '🐍 Змейка укусила себя!',
      bomb: '💥 Бум! Бомба взорвалась!'
    };
    const titleEl = document.getElementById('snakeClassicGameOverTitle');
    if(titleEl) titleEl.textContent = titleMap[reason] || '💥 Игра окончена!';
    const recEl = document.getElementById('snakeClassicNewRecordText');
    if(recEl) recEl.classList.toggle('hidden', !isNewRecord);
    snakeShow(document.getElementById('snakeClassicGameOverOverlay'));
  },

  render(){
    const canvas = document.getElementById('snakeClassicCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    // небольшой отступ от самого края канваса — чтобы толстая стена
    // поля никогда не рисовалась впритык к границе (и тем более не
    // "вылезала" за неё из-за субпиксельного округления при масштабировании)
    const PAD = 3;
    const innerW = Math.max(0, rect.width - PAD * 2);
    const innerH = Math.max(0, rect.height - PAD * 2);
    const cs = Math.min(innerW / this.cols, innerH / this.rows);
    const offX = PAD + (innerW - cs * this.cols) / 2;
    const offY = PAD + (innerH - cs * this.rows) / 2;

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(offX, offY, cs * this.cols, cs * this.rows);

    // тонкая сетка поля — чтобы клетки было легче различать
    ctx.strokeStyle = 'rgba(94,58,26,0.08)';
    ctx.lineWidth = 1;
    for(let x = 1; x < this.cols; x++){
      ctx.beginPath();
      ctx.moveTo(offX + x * cs, offY);
      ctx.lineTo(offX + x * cs, offY + cs * this.rows);
      ctx.stroke();
    }
    for(let y = 1; y < this.rows; y++){
      ctx.beginPath();
      ctx.moveTo(offX, offY + y * cs);
      ctx.lineTo(offX + cs * this.cols, offY + y * cs);
      ctx.stroke();
    }

    // стены — хорошо заметная толстая рамка по границе поля
    const wallW = Math.max(4, cs * 0.14);
    ctx.strokeStyle = '#5E3A1A';
    ctx.lineWidth = wallW;
    ctx.strokeRect(offX + wallW / 2, offY + wallW / 2, cs * this.cols - wallW, cs * this.rows - wallW);
    ctx.strokeStyle = 'rgba(242,183,5,0.9)';
    ctx.lineWidth = Math.max(2, wallW * 0.35);
    ctx.strokeRect(offX + wallW / 2, offY + wallW / 2, cs * this.cols - wallW, cs * this.rows - wallW);

    // еда
    if(this.food){
      const fx = offX + this.food.x * cs, fy = offY + this.food.y * cs;
      if(snakeClassicFoodImg){
        const pad = cs * 0.12;
        ctx.drawImage(snakeClassicFoodImg, fx + pad, fy + pad, cs - pad * 2, cs - pad * 2);
      } else {
        ctx.font = `${cs * 0.8}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🫙', fx + cs / 2, fy + cs / 2);
      }
    }

    // бомбы — яркий тёмно-красный кружок с пульсацией, чтобы их было
    // хорошо видно на любом фоне, плюс сам эмодзи бомбы сверху
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const pulse = 1 + Math.sin(Date.now() / 220) * 0.08;
    this.bombs.forEach(b=>{
      const bx = offX + b.x * cs + cs / 2, by = offY + b.y * cs + cs / 2;
      const r = cs * 0.42 * pulse;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = '#3B2115';
      ctx.fill();
      ctx.lineWidth = Math.max(2, cs * 0.06);
      ctx.strokeStyle = '#E5533D';
      ctx.stroke();
      ctx.font = `${cs * 0.62}px serif`;
      ctx.fillText('💣', bx, by);
    });

    // тело змейки
    this.snakeBody.forEach((seg, i)=>{
      const sx = offX + seg.x * cs, sy = offY + seg.y * cs;
      const isHead = i === 0;
      ctx.fillStyle = isHead ? '#FF6F91' : '#F2B705';
      snakeClassicRoundRect(ctx, sx + cs * 0.06, sy + cs * 0.06, cs * 0.88, cs * 0.88, cs * 0.28);
      ctx.fill();
      ctx.strokeStyle = '#5E3A1A';
      ctx.lineWidth = Math.max(1, cs * 0.04);
      ctx.stroke();
      if(isHead){
        ctx.fillStyle = '#5E3A1A';
        const cxp = sx + cs / 2, cyp = sy + cs / 2;
        const dx = this.direction.x, dy = this.direction.y;
        const ex1 = cxp + dx * cs * 0.18 - dy * cs * 0.16;
        const ey1 = cyp + dy * cs * 0.18 + dx * cs * 0.16;
        const ex2 = cxp + dx * cs * 0.18 + dy * cs * 0.16;
        const ey2 = cyp + dy * cs * 0.18 - dx * cs * 0.16;
        ctx.beginPath(); ctx.arc(ex1, ey1, cs * 0.07, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex2, ey2, cs * 0.07, 0, Math.PI * 2); ctx.fill();
      }
    });
  },

  /* ---------------- привязка UI ---------------- */
  bindUI(){
    const pickBtn = document.getElementById('pickSnakeClassicBtn');
    if(pickBtn){
      pickBtn.addEventListener('click', ()=>{
        snakeHide(document.getElementById('gameSelectScreen'));
        snakeShow(document.getElementById('snakeClassicMenuScreen'));
        this.renderMenuUI();
      });
    }
    const backBtn = document.getElementById('snakeClassicBackToSelectBtn');
    if(backBtn){
      backBtn.addEventListener('click', ()=>{
        snakeHide(document.getElementById('snakeClassicMenuScreen'));
        snakeShow(document.getElementById('gameSelectScreen'));
      });
    }

    const easyBtn = document.getElementById('snakeClassicEasyBtn');
    if(easyBtn) easyBtn.addEventListener('click', ()=> this.startGame('easy'));
    const hardBtn = document.getElementById('snakeClassicHardBtn');
    if(hardBtn) hardBtn.addEventListener('click', ()=> this.startGame('hard'));

    const restartBtn = document.getElementById('snakeClassicRestartBtn');
    if(restartBtn) restartBtn.addEventListener('click', ()=> this.startGame(this.difficulty));

    const toMenu = ()=>{
      this.running = false; this.paused = false;
      snakeHide(document.getElementById('snakeClassicPauseOverlay'));
      snakeHide(document.getElementById('snakeClassicGameScreen'));
      snakeShow(document.getElementById('snakeClassicMenuScreen'));
    };
    const goMenuBtn = document.getElementById('snakeClassicGoMenuBtn');
    if(goMenuBtn) goMenuBtn.addEventListener('click', toMenu);
    const exitBtn = document.getElementById('snakeClassicExitBtn');
    if(exitBtn) exitBtn.addEventListener('click', toMenu);
    const pauseExitBtn = document.getElementById('snakeClassicPauseExitBtn');
    if(pauseExitBtn) pauseExitBtn.addEventListener('click', toMenu);

    const pauseBtn = document.getElementById('snakeClassicPauseBtn');
    if(pauseBtn){
      pauseBtn.addEventListener('click', ()=>{
        if(!this.running) return;
        this.paused = true;
        snakeShow(document.getElementById('snakeClassicPauseOverlay'));
      });
    }
    const resumeBtn = document.getElementById('snakeClassicResumeBtn');
    if(resumeBtn){
      resumeBtn.addEventListener('click', ()=>{
        this.paused = false;
        this._lastTime = performance.now();
        snakeHide(document.getElementById('snakeClassicPauseOverlay'));
      });
    }

    const recordsBtn = document.getElementById('snakeClassicRecordsBtn');
    if(recordsBtn) recordsBtn.addEventListener('click', ()=> this.openRecords());
    const profileBtn = document.getElementById('snakeClassicProfileBtn');
    if(profileBtn){
      profileBtn.addEventListener('click', ()=>{
        this.renderProfileUI();
        snakeShow(document.getElementById('snakeClassicProfileModal'));
      });
    }

    // вкладки рекордов (лёгкий/сложный)
    document.querySelectorAll('[data-snakeclassictab]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        document.querySelectorAll('[data-snakeclassictab]').forEach(b=> b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.snakeclassictab;
        snakeHide(document.getElementById('snakeClassicRecordsListEasy'));
        snakeHide(document.getElementById('snakeClassicRecordsListHard'));
        snakeShow(document.getElementById(tab === 'hard' ? 'snakeClassicRecordsListHard' : 'snakeClassicRecordsListEasy'));
      });
    });

    // клавиатура (стрелки, WASD, ЦФЫВ для рус. раскладки)
    const keyMap = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
      W: { x: 0, y: -1 }, S: { x: 0, y: 1 }, A: { x: -1, y: 0 }, D: { x: 1, y: 0 },
      ц: { x: 0, y: -1 }, ы: { x: 0, y: 1 }, ф: { x: -1, y: 0 }, в: { x: 1, y: 0 }
    };
    document.addEventListener('keydown', e=>{
      if(!isScreenVisible('snakeClassicGameScreen')) return;
      const dir = keyMap[e.key];
      if(dir){ e.preventDefault(); this.queueDirection(dir); }
    });

    // D-pad больше не используется — управление на телефоне через
    // свайпы прямо по игровому полю (см. ниже), на компьютере — клавиатура

    // свайпы по игровому полю — управление "на ощупь": как только палец
    // сдвигается достаточно далеко в одну сторону, змейка поворачивает
    // туда, а точка отсчёта сразу сбрасывается на текущее положение
    // пальца — так можно вести змейку непрерывно, не отрывая палец
    const canvas = document.getElementById('snakeClassicCanvas');
    if(canvas){
      const swipeThreshold = 16;
      let sx = 0, sy = 0, active = false;

      canvas.addEventListener('touchstart', e=>{
        if(!e.touches[0]) return;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; active = true;
      }, { passive: true });

      canvas.addEventListener('touchmove', e=>{
        e.preventDefault();
        if(!active || !e.touches[0]) return;
        const cx = e.touches[0].clientX, cy = e.touches[0].clientY;
        const dx = cx - sx, dy = cy - sy;
        if(Math.abs(dx) < swipeThreshold && Math.abs(dy) < swipeThreshold) return;
        if(Math.abs(dx) > Math.abs(dy)) this.queueDirection({ x: dx > 0 ? 1 : -1, y: 0 });
        else this.queueDirection({ x: 0, y: dy > 0 ? 1 : -1 });
        // сбрасываем точку отсчёта, чтобы вести змейку без отрыва пальца
        sx = cx; sy = cy;
      }, { passive: false });

      canvas.addEventListener('touchend', ()=>{ active = false; });
      canvas.addEventListener('touchcancel', ()=>{ active = false; });
    }

    window.addEventListener('resize', ()=> this.fitCanvas());
    window.addEventListener('orientationchange', ()=> setTimeout(()=> this.fitCanvas(), 200));
    if(window.visualViewport) window.visualViewport.addEventListener('resize', ()=> this.fitCanvas());
  }
};

// делаем SnakeClassic доступным как window.SnakeClassic — иначе
// `if(window.SnakeClassic)` в script.js всегда ложно (top-level const
// не создаёт window-свойство).
window.SnakeClassic = SnakeClassic;

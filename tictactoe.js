/* =========================================================
   КРЕСТИКИ-НОЛИКИ — мини-игра: игра против бота (3 уровня
   сложности) или онлайн со случайным другим игроком.

   Крестик — img/x.png
   Нолик — img/o.png

   ОНЛАЙН-ИГРА:
   - Если у сайта настроено облако (Firebase, см. db.js) —
     онлайн-игра работает по-настоящему, между любыми
     устройствами: два игрока попадают в общую очередь
     ("tttLobby"), после чего для них создаётся общая партия
     ("tttGames"), и оба клиента видят ходы друг друга в
     реальном времени через DB.watchItem.
   - Если облако не настроено — всё то же самое работает
     локально, через localStorage и события 'storage'
     (см. db.js), а значит "онлайн" получится сыграть между
     двумя вкладками/окнами ЭТОГО ЖЕ браузера на одном устройстве.

   ПРАВИЛА ОНЛАЙН-ПАРТИИ:
   - На каждый ход даётся 30 секунд. Если игрок, чья очередь
     ходить, не успевает — ждущий соперник засчитывает себе
     победу (declareOpponentTimeout).
   - Если игрок выходит из ещё не завершённой онлайн-партии
     (кнопкой "Выход" или закрытием вкладки) — победа
     засчитывается сопернику (exitOnlineGame(forfeit=true)).
   - В игре против бота таймер работает так же: если человек
     не успевает походить за 30 секунд, засчитывается
     поражение (forfeitBotGame).
========================================================= */

function escapeHtmlT(str){
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}
function tttShow(el){ if(el) el.classList.remove('hidden'); }
function tttHide(el){ if(el) el.classList.add('hidden'); }

// Основной путь — латиница в нижнем регистре. GitHub Pages (как и
// большинство хостингов) раздаёт файлы с учётом регистра, поэтому если
// в репозитории почему-то лежат X.png/O.png (с большой буквы) — на
// локальном сервере (Windows/Mac, регистр не важен) картинки всё равно
// загрузятся, а на GitHub — нет. Чтобы не зависеть от точного регистра
// файлов в img/, ниже добавлена подстраховка через onerror.
const TTT_MARK_SRC = { X: 'img/x.png', O: 'img/o.png' };
const TTT_MARK_SRC_ALT = { X: 'img/X.png', O: 'img/O.png' };
const TTT_MOVE_SECONDS = 30;

const TTT_WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

/* =========================================================
   ЛОГИКА ПОЛЯ
========================================================= */
function tttResult(board){
  for(const line of TTT_WIN_LINES){
    const [a,b,c] = line;
    if(board[a] && board[a] === board[b] && board[a] === board[c]){
      return { winner: board[a], line };
    }
  }
  if(board.every(cell => cell)) return { winner: 'draw', line: null };
  return null;
}
function tttEmptyCells(board){
  const out = [];
  board.forEach((v,i)=>{ if(!v) out.push(i); });
  return out;
}

/* =========================================================
   БОТ: 3 уровня сложности
========================================================= */
function tttRandomMove(board){
  const empty = tttEmptyCells(board);
  return empty[Math.floor(Math.random() * empty.length)];
}
// средний уровень: выиграть, если можно; иначе заблокировать игрока;
// иначе занять центр/угол, иначе случайно
function tttMediumMove(board, botSym, humanSym){
  for(const i of tttEmptyCells(board)){
    const copy = board.slice(); copy[i] = botSym;
    const r = tttResult(copy);
    if(r && r.winner === botSym) return i;
  }
  for(const i of tttEmptyCells(board)){
    const copy = board.slice(); copy[i] = humanSym;
    const r = tttResult(copy);
    if(r && r.winner === humanSym) return i;
  }
  if(!board[4]) return 4;
  const corners = [0,2,6,8].filter(i => !board[i]);
  if(corners.length) return corners[Math.floor(Math.random() * corners.length)];
  return tttRandomMove(board);
}
// сложный уровень: минимакс — играет безошибочно (максимум ничья)
function tttMinimax(board, sym, botSym, humanSym, depth){
  const res = tttResult(board);
  if(res){
    if(res.winner === botSym) return { score: 10 - depth };
    if(res.winner === humanSym) return { score: depth - 10 };
    return { score: 0 };
  }
  const moves = tttEmptyCells(board).map(i=>{
    const copy = board.slice(); copy[i] = sym;
    const next = tttMinimax(copy, sym === botSym ? humanSym : botSym, botSym, humanSym, depth + 1);
    return { i, score: next.score };
  });
  if(sym === botSym){
    return moves.reduce((best, m) => m.score > best.score ? m : best, moves[0]);
  }
  return moves.reduce((best, m) => m.score < best.score ? m : best, moves[0]);
}
function tttBotMove(board, difficulty, botSym, humanSym){
  if(difficulty === 'easy') return tttRandomMove(board);
  if(difficulty === 'hard') return tttMinimax(board, botSym, botSym, humanSym, 0).i;
  return tttMediumMove(board, botSym, humanSym);
}

const TTT_DIFF_LABEL = { easy: '🥄 Лёгкий бот', medium: '🥫 Средний бот', hard: '👑 Сложный бот' };

/* =========================================================
   ОСНОВНОЙ ОБЪЕКТ ИГРЫ
========================================================= */
const TicTacToe = {
  playerId: null,
  data: { wins: 0, losses: 0, draws: 0, gamesPlayed: 0, winsVsBot: 0, winsOnline: 0, streak: 0, bestStreak: 0, unlocked: {} },
  levels: [],
  achievements: [],
  _ready: false,

  mode: null,          // 'bot' | 'online'
  botDifficulty: 'medium',
  board: [],
  mySymbol: 'X',
  turn: 'X',
  gameOver: false,
  opponentName: '',

  // онлайн
  myLobbyId: null,
  onlineGameId: null,
  _unsubLobby: null,
  _unsubGames: null,
  _unsubActiveGame: null,
  _processedGameIds: null,

  // таймер хода (используется и для бота, и для онлайна)
  _moveTimerInterval: null,
  _botTurnStartTs: null,
  _lastMoveTs: null,

  init(){
    this.playerId = getPlayerId();
    this._processedGameIds = new Set();
    this.bindUI();
    this.buildBoardSkeleton();

    // best-effort: если игрок закрывает вкладку/уходит со страницы
    // посреди онлайн-партии — пробуем засчитать победу сопернику
    window.addEventListener('pagehide', ()=> this.forfeitOnUnload());
    window.addEventListener('beforeunload', ()=> this.forfeitOnUnload());

    if(!window.DB || !window.DEFAULTS){
      console.warn('TicTacToe: DB или DEFAULTS недоступны — крестики-нолики отключены.');
      return;
    }

    DB.seedIfEmpty('tttLevels', DEFAULTS.tttLevels);
    DB.seedIfEmpty('tttAchievements', DEFAULTS.tttAchievements);

    DB.watchCollection('tttLevels', list=>{
      this.levels = list.slice().sort((a,b)=> (a.min||0) - (b.min||0));
      this.renderMenuUI();
      this.renderProfileUI();
    });
    DB.watchCollection('tttAchievements', list=>{
      this.achievements = list.slice().sort((a,b)=> (a.target||0) - (b.target||0));
      this.renderProfileUI();
      this.checkAchievements();
    });
    DB.watchItem('tttPlayers', this.playerId, doc=>{
      this.data = Object.assign(
        { wins: 0, losses: 0, draws: 0, gamesPlayed: 0, winsVsBot: 0, winsOnline: 0, streak: 0, bestStreak: 0, unlocked: {} },
        doc || {}
      );
      this._ready = true;
      this.renderMenuUI();
      this.renderProfileUI();
      this.checkAchievements();
    });

    DB.getItemOnce('tttPlayers', this.playerId).then(doc=>{
      if(!doc){
        DB.setItem('tttPlayers', this.playerId, {
          name: getNickname(), wins: 0, losses: 0, draws: 0, gamesPlayed: 0,
          winsVsBot: 0, winsOnline: 0, streak: 0, bestStreak: 0, unlocked: {}
        });
      } else if(doc.name !== getNickname()){
        DB.setItem('tttPlayers', this.playerId, { name: getNickname() });
      }
    });
  },

  /* ---------------- уровни ---------------- */
  getLevelForWins(v){
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
      if(type === 'games') return this.data.gamesPlayed || 0;
      if(type === 'wins') return this.data.wins || 0;
      if(type === 'winsVsBot') return this.data.winsVsBot || 0;
      if(type === 'winsOnline') return this.data.winsOnline || 0;
      if(type === 'draws') return this.data.draws || 0;
      if(type === 'streak') return this.data.bestStreak || 0;
      return 0;
    };
    const newly = this.achievements.filter(a=> !unlocked[a.id] && metric(a.type) >= (a.target || 0));
    if(newly.length){
      DB.markUnlocked('tttPlayers', this.playerId, newly.map(a=> a.id));
      newly.forEach(a=> showAchievementToast(a, 'ttt'));
    }
  },

  /* ---------------- итог партии: статистика + рекорды ---------------- */
  recordResult(outcome, source){
    if(!window.DB || !this._ready) return;
    const deltas = { gamesPlayed: 1 };
    if(outcome === 'win'){
      deltas.wins = 1;
      if(source === 'bot') deltas.winsVsBot = 1; else deltas.winsOnline = 1;
    } else if(outcome === 'loss'){
      deltas.losses = 1;
    } else {
      deltas.draws = 1;
    }
    DB.incrementItem('tttPlayers', this.playerId, deltas);

    const newStreak = outcome === 'win' ? (this.data.streak || 0) + 1 : 0;
    const patch = { streak: newStreak };
    if(newStreak > (this.data.bestStreak || 0)) patch.bestStreak = newStreak;
    DB.setItem('tttPlayers', this.playerId, patch);

    const predictedWins = (this.data.wins || 0) + (deltas.wins || 0);
    DB.addRecordIn('tttRecords', this.playerId, getNickname(), predictedWins);
  },

  /* ---------------- UI: пилюля уровня в меню ---------------- */
  renderMenuUI(){
    const wins = this.data.wins || 0;
    const level = this.getLevelForWins(wins);
    const next = this.getNextLevel(wins);
    const emojiEl = document.getElementById('tttLevelEmoji');
    if(emojiEl) emojiEl.textContent = level ? level.emoji : '🎯';
    const nameEl = document.getElementById('tttLevelName');
    if(nameEl) nameEl.textContent = level ? level.name : 'Новичок клеточек';
    const nextEl = document.getElementById('tttLevelNext');
    if(nextEl){
      nextEl.textContent = next
        ? `До «${next.name}»: ещё ${Math.max(0, next.min - wins)} побед`
        : 'Максимальный уровень!';
    }
  },

  /* ---------------- UI: профиль/достижения ---------------- */
  renderProfileUI(){
    const wins = this.data.wins || 0;
    const level = this.getLevelForWins(wins);
    const next = this.getNextLevel(wins);

    const emojiEl = document.getElementById('tttProfileEmoji');
    if(emojiEl) emojiEl.textContent = level ? level.emoji : '🎯';
    const nameEl = document.getElementById('tttProfileLevelName');
    if(nameEl) nameEl.textContent = level ? level.name : 'Новичок клеточек';
    const winsEl = document.getElementById('tttProfileWins');
    if(winsEl) winsEl.textContent = wins;
    const gamesEl = document.getElementById('tttProfileGames');
    if(gamesEl) gamesEl.textContent = this.data.gamesPlayed || 0;

    const barFill = document.getElementById('tttProfileBarFill');
    if(barFill && level){
      let pct = 100;
      if(next){
        const span = Math.max(1, next.min - level.min);
        pct = Math.min(100, Math.max(0, ((wins - level.min) / span) * 100));
      }
      barFill.style.width = pct + '%';
    }
    const nextText = document.getElementById('tttProfileNextLevel');
    if(nextText){
      nextText.textContent = next
        ? `До уровня «${next.name}»: ещё ${Math.max(0, next.min - wins)} побед.`
        : 'Достигнут максимальный уровень!';
    }

    const setStat = (id, v)=>{ const el = document.getElementById(id); if(el) el.textContent = v; };
    setStat('tttStatWins', this.data.wins || 0);
    setStat('tttStatLosses', this.data.losses || 0);
    setStat('tttStatDraws', this.data.draws || 0);
    setStat('tttStatStreak', this.data.streak || 0);

    const grid = document.getElementById('tttAchievementsGrid');
    if(grid){
      const unlocked = this.data.unlocked || {};
      grid.innerHTML = this.achievements.map(a=>{
        const done = !!unlocked[a.id];
        return `<div class="ach-card ${done ? 'unlocked' : 'locked'}">
          <div class="ach-emoji">${done ? a.emoji : '🔒'}</div>
          <div class="ach-title">${escapeHtmlT(a.title)}</div>
          <div class="ach-desc">${escapeHtmlT(a.desc || '')}</div>
        </div>`;
      }).join('') || '<p class="news-empty">Достижений пока нет.</p>';
    }
  },

  /* ---------------- UI: рекорды ---------------- */
  _recordsSubscribed: false,
  openRecords(){
    tttShow(document.getElementById('tttRecordsModal'));
    if(!this._recordsSubscribed && window.DB){
      this._recordsSubscribed = true;
      DB.watchRecordsIn('tttRecords', list=> this.renderRecordsList(list));
    }
  },
  renderRecordsList(list){
    const el = document.getElementById('tttRecordsList');
    if(!el) return;
    if(!list.length){
      el.innerHTML = '<p class="news-empty">Пока нет рекордов. Стань первым!</p>';
      return;
    }
    const myId = this.playerId;
    el.innerHTML = list.slice(0, 20).map(r=>{
      const cls = r.playerId === myId ? ' class="my-record"' : '';
      const word = r.score === 1 ? 'победа' : (r.score >= 2 && r.score <= 4 ? 'победы' : 'побед');
      return `<li${cls}>${r.score} ${word} <span>— ${escapeHtmlT(r.name)}, ${r.date}</span></li>`;
    }).join('');
  },

  /* =========================================================
     ПОЛЕ: разметка и отрисовка
  ========================================================= */
  buildBoardSkeleton(){
    const boardEl = document.getElementById('tttBoard');
    if(!boardEl) return;
    boardEl.innerHTML = '';
    for(let i = 0; i < 9; i++){
      const btn = document.createElement('button');
      btn.className = 'ttt-cell';
      btn.dataset.i = i;
      btn.innerHTML = '<img class="ttt-mark" alt=""><span class="ttt-mark-fallback"></span>';
      btn.addEventListener('click', ()=> this.handleCellClick(i));
      boardEl.appendChild(btn);
    }
  },
  renderBoard(winLine){
    const boardEl = document.getElementById('tttBoard');
    if(!boardEl) return;
    const cells = boardEl.querySelectorAll('.ttt-cell');
    cells.forEach((cell, i)=>{
      const val = this.board[i];
      const img = cell.querySelector('.ttt-mark');
      const fallback = cell.querySelector('.ttt-mark-fallback');
      if(!img) return;
      if(val === 'X' || val === 'O'){
        img.alt = val === 'X' ? 'Крестик' : 'Нолик';
        // если основной путь не загрузился — пробуем альтернативный
        // регистр имени файла, а если и это не помогло — рисуем эмодзи,
        // чтобы клетка никогда не осталась пустой из-за хостинга
        img.onerror = ()=>{
          img.onerror = ()=>{
            img.onerror = null;
            img.classList.remove('shown');
            img.removeAttribute('src');
            if(fallback){ fallback.textContent = val === 'X' ? '❌' : '⭕'; fallback.classList.add('shown'); }
          };
          img.src = TTT_MARK_SRC_ALT[val];
        };
        img.src = TTT_MARK_SRC[val];
        img.classList.add('shown');
        if(fallback) fallback.classList.remove('shown');
      } else {
        img.onerror = null;
        img.classList.remove('shown');
        img.removeAttribute('src');
        img.alt = '';
        if(fallback) fallback.classList.remove('shown');
      }
      cell.disabled = !!val || this.gameOver;
      cell.classList.toggle('win-cell', !!winLine && winLine.includes(i));
    });
  },
  renderTurnPill(){
    const pill = document.getElementById('tttTurnPill');
    if(!pill) return;
    if(this.gameOver){ pill.textContent = 'Игра окончена'; return; }
    const isMyTurn = this.turn === this.mySymbol;
    pill.textContent = isMyTurn ? `Ходишь ты: ${this.turn === 'X' ? '❌' : '⭕'}` : `Ход соперника: ${this.turn === 'X' ? '❌' : '⭕'}`;
  },
  renderPlayersRow(){
    const xNameEl = document.getElementById('tttPlayerXName');
    const oNameEl = document.getElementById('tttPlayerOName');
    const xPill = document.getElementById('tttPlayerXPill');
    const oPill = document.getElementById('tttPlayerOPill');
    if(xNameEl) xNameEl.textContent = this.mySymbol === 'X' ? 'Ты' : (this.opponentName || (this.mode === 'bot' ? 'Бот' : 'Соперник'));
    if(oNameEl) oNameEl.textContent = this.mySymbol === 'O' ? 'Ты' : (this.opponentName || (this.mode === 'bot' ? 'Бот' : 'Соперник'));
    if(xPill) xPill.classList.toggle('active-turn', !this.gameOver && this.turn === 'X');
    if(oPill) oPill.classList.toggle('active-turn', !this.gameOver && this.turn === 'O');
  },
  renderModePill(){
    const pill = document.getElementById('tttModePill');
    if(!pill) return;
    if(this.mode === 'bot'){
      pill.textContent = TTT_DIFF_LABEL[this.botDifficulty] || '🤖 Бот';
    } else {
      pill.textContent = '🌐 Играешь с: ' + (this.opponentName || 'соперник');
    }
  },
  showGameOver(outcome, res){
    const titleEl = document.getElementById('tttGameOverTitle');
    const textEl = document.getElementById('tttGameOverText');
    const timeout = !!(res && res.timeout);
    const forfeit = !!(res && res.forfeit);
    if(outcome === 'win'){
      titleEl.textContent = '🎉 Победа!';
      if(forfeit) textEl.textContent = 'Соперник покинул игру — тебе засчитана победа!';
      else if(timeout) textEl.textContent = 'Соперник не успел сходить за 30 секунд — победа твоя!';
      else textEl.textContent = 'Ты собрал три в ряд — отличная игра!';
    } else if(outcome === 'loss'){
      titleEl.textContent = '😔 Поражение';
      if(timeout) textEl.textContent = 'Ты не успел сходить за 30 секунд — засчитано поражение.';
      else textEl.textContent = this.mode === 'bot' ? 'В этот раз бот оказался хитрее.' : 'Соперник оказался хитрее — реванш?';
    } else {
      titleEl.textContent = '🤝 Ничья';
      textEl.textContent = 'Никто не собрал линию — поле закончилось вничью.';
    }
    tttShow(document.getElementById('tttGameOverOverlay'));
  },

  /* =========================================================
     ТАЙМЕР ХОДА (30 секунд)
     Работает и в игре с ботом (пока ходит человек), и онлайн
     (пока ходит любой из игроков — таймер общий для обоих).
  ========================================================= */
  renderTimerUI(remaining){
    const pill = document.getElementById('tttTimerPill');
    if(!pill) return;
    if(remaining === null || remaining === undefined){
      tttHide(pill);
      return;
    }
    tttShow(pill);
    pill.textContent = '⏱ ' + remaining + ' с';
    pill.classList.toggle('ttt-timer-warn', remaining <= 10);
  },
  startMoveTimer(){
    this.stopMoveTimer();
    this._moveTimerInterval = setInterval(()=> this.tickMoveTimer(), 250);
    this.tickMoveTimer();
  },
  stopMoveTimer(){
    if(this._moveTimerInterval){ clearInterval(this._moveTimerInterval); this._moveTimerInterval = null; }
    this.renderTimerUI(null);
  },
  tickMoveTimer(){
    if(this.gameOver){ this.stopMoveTimer(); return; }

    if(this.mode === 'bot'){
      // таймер идёт только пока ходит человек — бот отвечает мгновенно
      if(this.turn !== this.mySymbol){ this.renderTimerUI(null); return; }
      const elapsed = Math.floor((Date.now() - (this._botTurnStartTs || Date.now())) / 1000);
      const remaining = Math.max(0, TTT_MOVE_SECONDS - elapsed);
      this.renderTimerUI(remaining);
      if(remaining <= 0) this.forfeitBotGame();
      return;
    }

    if(this.mode === 'online'){
      const startTs = this._lastMoveTs || Date.now();
      const elapsedMs = Date.now() - startTs;
      const remaining = Math.max(0, TTT_MOVE_SECONDS - Math.floor(elapsedMs / 1000));
      this.renderTimerUI(remaining);
      // объявляем тайм-аут соперника только со стороны ЖДУЩЕГО игрока
      // (небольшой запас в 1 секунду — чтобы не спорить с последним кликом)
      if(this.turn !== this.mySymbol && elapsedMs >= (TTT_MOVE_SECONDS + 1) * 1000){
        this.declareOpponentTimeout();
      }
      return;
    }

    this.renderTimerUI(null);
  },

  /* =========================================================
     РЕЖИМ: ПРОТИВ БОТА
  ========================================================= */
  startBotGame(difficulty){
    this.mode = 'bot';
    this.botDifficulty = difficulty;
    this.board = Array(9).fill('');
    this.mySymbol = 'X';
    this.turn = 'X';
    this.gameOver = false;
    this.opponentName = TTT_DIFF_LABEL[difficulty] || 'Бот';

    tttHide(document.getElementById('tttGameOverOverlay'));
    this.renderModePill();
    this.renderPlayersRow();
    this.renderBoard();
    this.renderTurnPill();

    this._botTurnStartTs = Date.now();
    this.startMoveTimer();

    tttHide(document.getElementById('tttMenuScreen'));
    tttShow(document.getElementById('tttGameScreen'));
  },
  handleCellClickBot(i){
    if(this.gameOver || this.board[i] || this.turn !== this.mySymbol) return;
    this.board[i] = this.mySymbol;
    let res = tttResult(this.board);
    this.renderBoard(res && res.line);
    if(res){ this.endBotGame(res); return; }

    this.turn = (this.mySymbol === 'X') ? 'O' : 'X';
    this.renderTurnPill();
    this.renderPlayersRow();
    this.renderTimerUI(null); // ход бота — таймер человека не идёт

    setTimeout(()=>{
      if(this.gameOver || this.mode !== 'bot') return;
      const botSym = this.mySymbol === 'X' ? 'O' : 'X';
      const move = tttBotMove(this.board, this.botDifficulty, botSym, this.mySymbol);
      if(move === undefined || move === null) return;
      this.board[move] = botSym;
      res = tttResult(this.board);
      this.renderBoard(res && res.line);
      if(res){ this.endBotGame(res); return; }
      this.turn = this.mySymbol;
      this.renderTurnPill();
      this.renderPlayersRow();
      this._botTurnStartTs = Date.now(); // снова ходит человек — таймер сброшен
    }, 480);
  },
  forfeitBotGame(){
    if(this.gameOver) return;
    const winnerSym = this.mySymbol === 'X' ? 'O' : 'X';
    this.endBotGame({ winner: winnerSym, line: null, timeout: true });
  },
  endBotGame(res){
    this.gameOver = true;
    this.stopMoveTimer();
    this.renderTurnPill();
    this.renderPlayersRow();
    const outcome = res.winner === 'draw' ? 'draw' : (res.winner === this.mySymbol ? 'win' : 'loss');
    this.recordResult(outcome, 'bot');
    this.showGameOver(outcome, res);
  },

  /* =========================================================
     РЕЖИМ: ОНЛАЙН С ДРУГИМ ИГРОКОМ

     Вместо слепого автоподбора игрок видит список тех, кто
     сейчас тоже открыл раздел "Онлайн", и сам решает, к кому
     подключиться. Как только кто-то нажимает "Играть" рядом
     с чужим именем — создаётся партия, и она сразу же находится
     вторым игроком через handleGamesUpdate (он всё это время
     тоже слушает список активных партий, пока сидит в списке
     ожидания).
  ========================================================= */
  startOnlineSearch(){
    if(!window.DB) return;
    this.mode = 'online';
    this.onlineGameId = null;
    this._lastLobbyList = [];
    tttShow(document.getElementById('tttSearchModal'));
    this.renderLobbyList([]);

    this.myLobbyId = DB.addItem('tttLobby', { playerId: this.playerId, name: getNickname(), ts: Date.now() });
    this._unsubLobby = DB.watchCollection('tttLobby', list=>{
      this._lastLobbyList = list;
      this.renderLobbyList(list);
    });
    this._unsubGames = DB.watchCollection('tttGames', list=> this.handleGamesUpdate(list));
    // подтягиваем счётчик "ждёт N с" даже когда список никто не менял
    this._lobbyTickInterval = setInterval(()=> this.renderLobbyList(this._lastLobbyList || []), 1000);
  },
  cancelOnlineSearch(){
    if(this._unsubLobby){ this._unsubLobby(); this._unsubLobby = null; }
    if(this._unsubGames){ this._unsubGames(); this._unsubGames = null; }
    if(this._lobbyTickInterval){ clearInterval(this._lobbyTickInterval); this._lobbyTickInterval = null; }
    if(this.myLobbyId && window.DB) DB.deleteItem('tttLobby', this.myLobbyId);
    this.myLobbyId = null;
    tttHide(document.getElementById('tttSearchModal'));
  },
  renderLobbyList(list){
    const el = document.getElementById('tttLobbyList');
    if(!el) return;
    const now = Date.now();
    const others = [];
    (list || []).forEach(e=>{
      if(e.id === this.myLobbyId) return;
      if(now - (e.ts || 0) >= 120000){
        // запись "протухла" (например, игрок закрыл вкладку/приложение,
        // не дождавшись pagehide/beforeunload, или свернул браузер на
        // телефоне) — раньше такие записи только скрывались в списке, но
        // оставались в базе навсегда, из-за чего один и тот же игрок мог
        // мелькать в списке снова и снова. Теперь чистим их по-настоящему.
        if(window.DB) DB.deleteItem('tttLobby', e.id);
        return;
      }
      others.push(e);
    });
    others.sort((a,b)=> (a.ts || 0) - (b.ts || 0));

    if(!others.length){
      el.innerHTML = `
        <p class="news-empty">Пока никого нет в сети. Как только кто-то откроет этот раздел — вы увидите друг друга, и партию можно будет начать в один клик.</p>
        <div class="ttt-spinner"></div>
      `;
      return;
    }

    el.innerHTML = others.map(e=>{
      const waitSec = Math.max(0, Math.floor((now - (e.ts || 0)) / 1000));
      return `<div class="lobby-entry">
        <span class="lobby-entry-name">${escapeHtmlT(e.name || 'Игрок')}</span>
        <span class="lobby-entry-wait">ждёт ${waitSec} с</span>
        <button class="btn btn-primary btn-small" data-lobby-entry="${escapeHtmlT(e.id)}">▶ Играть</button>
      </div>`;
    }).join('');

    el.querySelectorAll('[data-lobby-entry]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const target = others.find(e=> e.id === btn.dataset.lobbyEntry);
        if(target) this.connectToPlayer(target);
      });
    });
  },
  // приглашаем конкретного игрока из списка: создаём партию на двоих
  // и сразу входим в неё сами — второй игрок подключится автоматически
  connectToPlayer(target){
    if(this.onlineGameId || !this.myLobbyId || !window.DB) return;
    const iAmX = Math.random() < 0.5; // случайно решаем, кто ходит первым

    // id партии — ДЕТЕРМИНИРОВАННЫЙ (собран из id обоих игроков в
    // одинаковом порядке), а не случайный. Это специально: если оба
    // игрока почти одновременно нажмут "Играть" друг напротив друга
    // (пока список ещё не успел обновиться на обеих сторонах), они оба
    // попытаются создать партию — и без этого получились бы ДВЕ разные
    // комнаты для одной и той же пары ("та же партия и новая комната от
    // того же игрока"). С одинаковым id обе попытки метят в одну и ту же
    // запись, а DB.createIfAbsent гарантирует, что реально создастся
    // только одна из них (в облаке — атомарно), и оба игрока попадут в
    // ОДНУ общую партию.
    const gameId = 'ttt_' + [this.playerId, target.playerId].sort().join('__');
    DB.createIfAbsent('tttGames', gameId, {
      board: Array(9).fill(''),
      turn: 'X',
      status: 'playing',
      winner: null,
      players: iAmX
        ? { X: { id: this.playerId, name: getNickname() }, O: { id: target.playerId, name: target.name } }
        : { X: { id: target.playerId, name: target.name }, O: { id: this.playerId, name: getNickname() } },
      createdTs: Date.now(),
      moveTs: Date.now()
    }, 'finished'); // 'finished' — если по этому id уже лежит СТАРАЯ завершённая партия с этим же соперником, считаем место свободным и начинаем новую поверх неё

    DB.deleteItem('tttLobby', this.myLobbyId);
    DB.deleteItem('tttLobby', target.id);
    this.joinOnlineGame(gameId);
  },
  // пока сидим в списке ожидания, слушаем и партии — вдруг кто-то
  // выбрал НАС из своего списка
  handleGamesUpdate(list){
    this.purgeStaleGames(list);
    if(this.onlineGameId) return;
    const mine = list.find(g=> g.status === 'playing' && g.players && (
      (g.players.X && g.players.X.id === this.playerId) ||
      (g.players.O && g.players.O.id === this.playerId)
    ));
    if(mine) this.joinOnlineGame(mine.id);
  },
  // дополнительная защита от "призрачных" партий: если игрок закрыл
  // вкладку/приложение так резко, что не сработали ни pagehide, ни
  // beforeunload, ни setTimeout из scheduleFinishedGameCleanup (например,
  // процесс был убит системой), запись в tttGames может остаться висеть
  // навсегда — 'finished' и никогда не удалиться, либо 'playing' без
  // единого хода долгое время. Раз в обновление списка партий чистим и
  // такие записи, а не только записи из tttLobby — чтобы одна и та же
  // "комната" не продолжала висеть в базе бесконечно.
  purgeStaleGames(list){
    if(!window.DB) return;
    const now = Date.now();
    (list || []).forEach(g=>{
      if(this.onlineGameId === g.id) return; // не трогаем свою активную партию
      const last = g.moveTs || g.createdTs || 0;
      const isStaleFinished = g.status === 'finished' && now - last >= 15000;
      const isAbandonedPlaying = g.status === 'playing' && now - last >= 300000;
      if(isStaleFinished || isAbandonedPlaying){
        DB.deleteItem('tttGames', g.id);
      }
    });
  },
  joinOnlineGame(gameId){
    if(this.onlineGameId) return;
    this.onlineGameId = gameId;
    this.myLobbyId = null;
    if(this._unsubLobby){ this._unsubLobby(); this._unsubLobby = null; }
    if(this._unsubGames){ this._unsubGames(); this._unsubGames = null; }
    if(this._lobbyTickInterval){ clearInterval(this._lobbyTickInterval); this._lobbyTickInterval = null; }
    tttHide(document.getElementById('tttSearchModal'));
    tttHide(document.getElementById('tttGameOverOverlay'));

    this._unsubActiveGame = DB.watchItem('tttGames', gameId, doc=> this.renderOnlineGame(doc, gameId));
    this.startMoveTimer();
    tttHide(document.getElementById('tttMenuScreen'));
    tttShow(document.getElementById('tttGameScreen'));
  },
  renderOnlineGame(doc, gameId){
    if(!doc){
      // партию удалили (например, соперник вышел раньше, чем мы успели подписаться)
      return;
    }
    this.mode = 'online';

    // нормализуем поле: только 'X'/'O', иначе пустая клетка
    const rawBoard = Array.isArray(doc.board) ? doc.board.slice(0, 9) : [];
    this.board = Array.from({ length: 9 }, (_, i)=> (rawBoard[i] === 'X' || rawBoard[i] === 'O') ? rawBoard[i] : '');

    this.turn = doc.turn || 'X';
    this.gameOver = doc.status === 'finished';
    this._lastMoveTs = doc.moveTs || Date.now();

    const amX = doc.players && doc.players.X && doc.players.X.id === this.playerId;
    this.mySymbol = amX ? 'X' : 'O';
    const opponent = amX ? (doc.players && doc.players.O) : (doc.players && doc.players.X);
    this.opponentName = (opponent && opponent.name) || 'Соперник';

    const res = doc.status === 'finished'
      ? { winner: doc.winner, line: doc.winLine || null, timeout: !!doc.timeoutReason, forfeit: !!doc.forfeitReason }
      : null;

    this.renderModePill();
    this.renderPlayersRow();
    this.renderBoard(res && res.line);
    this.renderTurnPill();

    if(doc.status === 'finished' && !this._processedGameIds.has(gameId)){
      this._processedGameIds.add(gameId);
      this.stopMoveTimer();
      const outcome = doc.winner === 'draw' ? 'draw' : (doc.winner === this.mySymbol ? 'win' : 'loss');
      this.recordResult(outcome, 'online');
      this.showGameOver(outcome, res);
      // партия больше не нужна — удаляем через небольшую паузу, чтобы
      // второй клиент точно успел получить финальное состояние. ВАЖНО:
      // раньше удаление проверялось через `this.onlineGameId === gameId`,
      // но если игрок успевал нажать "В меню" раньше, чем сработает этот
      // таймер, onlineGameId уже обнулялся — и завершённая партия навсегда
      // "зависала" в базе (это и была причина, по которой в списке
      // онлайн-игроков можно было снова увидеть уже сыгранный матч).
      // Вместо этого просто перепроверяем актуальный статус партии перед
      // удалением — так безопаснее (не удалим случайно уже НОВУЮ партию,
      // если тот же соперник успел переиспользовать этот id для реванша).
      this.scheduleFinishedGameCleanup(gameId);
    }
  },
  // удаляет завершённую ('finished') онлайн-партию из базы через паузу,
  // предварительно перепроверяя, что она всё ещё в статусе 'finished'
  // (а не была тем временем переиспользована под новую игру с тем же id)
  scheduleFinishedGameCleanup(gameId){
    setTimeout(()=>{
      if(!window.DB) return;
      DB.getItemOnce('tttGames', gameId).then(cur=>{
        if(cur && cur.status === 'finished') DB.deleteItem('tttGames', gameId);
      });
    }, 4000);
  },
  handleCellClickOnline(i){
    if(!this.onlineGameId || this.gameOver) return;
    if(this.turn !== this.mySymbol || this.board[i]) return;
    const newBoard = this.board.slice();
    newBoard[i] = this.mySymbol;
    const res = tttResult(newBoard);
    const patch = {
      board: newBoard,
      turn: this.mySymbol === 'X' ? 'O' : 'X',
      moveTs: Date.now()
    };
    if(res){
      patch.status = 'finished';
      patch.winner = res.winner;
      patch.winLine = res.line || null;
    }
    DB.setItem('tttGames', this.onlineGameId, patch);
  },
  // ждущий игрок (не его ход) объявляет, что соперник не успел
  // сходить за 30 секунд — победа достаётся ждущему
  declareOpponentTimeout(){
    if(!this.onlineGameId || this.gameOver) return;
    if(!window.DB) return;
    DB.setItem('tttGames', this.onlineGameId, {
      status: 'finished',
      winner: this.mySymbol,
      winLine: null,
      timeoutReason: true,
      moveTs: Date.now()
    });
  },
  // игрок покидает ещё не завершённую партию — победа сопернику
  exitOnlineGame(forfeit){
    if(this._unsubActiveGame){ this._unsubActiveGame(); this._unsubActiveGame = null; }
    if(this.onlineGameId && window.DB && !this.gameOver){
      if(forfeit){
        const winnerSym = this.mySymbol === 'X' ? 'O' : 'X';
        const finishedId = this.onlineGameId;
        DB.setItem('tttGames', finishedId, {
          status: 'finished',
          winner: winnerSym,
          winLine: null,
          forfeitReason: true,
          moveTs: Date.now()
        });
        // не удаляем сразу — даём сопернику время получить финальное состояние
        this.scheduleFinishedGameCleanup(finishedId);
      } else {
        DB.deleteItem('tttGames', this.onlineGameId);
      }
    }
    this.onlineGameId = null;
    this.stopMoveTimer();
  },
  // best-effort попытка засчитать поражение, если вкладку закрыли
  // прямо посреди онлайн-партии
  forfeitOnUnload(){
    if(!window.DB) return;
    // если мы всё ещё в статусе "ищу соперника" (список открыт, но матч
    // ещё не начался) и в этот момент закрываем вкладку — обязательно
    // убираем свою запись из списка ожидающих. Раньше это не делалось,
    // и "призрачная" запись висела в базе до 2 минут (а то и дольше на
    // мобильных, где вкладка может просто уйти в фон без событий) —
    // именно это чаще всего и выглядело как "тот же игрок снова и снова
    // появляется в списке".
    if(this.myLobbyId){
      try{ DB.deleteItem('tttLobby', this.myLobbyId); }catch(err){ /* страница уже закрывается */ }
    }
    if(this.mode === 'online' && this.onlineGameId && !this.gameOver){
      try{
        const winnerSym = this.mySymbol === 'X' ? 'O' : 'X';
        DB.setItem('tttGames', this.onlineGameId, {
          status: 'finished',
          winner: winnerSym,
          winLine: null,
          forfeitReason: true,
          moveTs: Date.now()
        });
      } catch(err){ /* ничего не поделать, страница уже закрывается */ }
    }
  },

  /* ---------------- общий обработчик клика по клетке ---------------- */
  handleCellClick(i){
    if(this.mode === 'bot') this.handleCellClickBot(i);
    else if(this.mode === 'online') this.handleCellClickOnline(i);
  },

  /* ---------------- навигация/привязка UI ---------------- */
  goToMenu(){
    // выходим из игры добровольно: если онлайн-партия ещё не
    // завершена, засчитываем поражение и отдаём победу сопернику
    if(this.mode === 'online') this.exitOnlineGame(true);
    this.stopMoveTimer();
    this.gameOver = true;
    this.mode = null;
    tttHide(document.getElementById('tttGameScreen'));
    tttHide(document.getElementById('tttGameOverOverlay'));
    tttShow(document.getElementById('tttMenuScreen'));
  },
  restartCurrent(){
    tttHide(document.getElementById('tttGameOverOverlay'));
    if(this.mode === 'bot'){
      this.startBotGame(this.botDifficulty);
    } else {
      // игра уже завершена к этому моменту — форфейта не будет
      this.exitOnlineGame(false);
      tttHide(document.getElementById('tttGameScreen'));
      tttShow(document.getElementById('tttMenuScreen'));
      this.startOnlineSearch();
    }
  },

  bindUI(){
    const pickBtn = document.getElementById('pickTTTBtn');
    if(pickBtn){
      pickBtn.addEventListener('click', ()=>{
        tttHide(document.getElementById('gameSelectScreen'));
        tttShow(document.getElementById('tttMenuScreen'));
        this.renderMenuUI();
        const hint = document.getElementById('tttCloudHint');
        if(hint) hint.classList.toggle('hidden', !!(window.DB && DB.cloud));
      });
    }
    const backBtn = document.getElementById('tttBackToSelectBtn');
    if(backBtn){
      backBtn.addEventListener('click', ()=>{
        tttHide(document.getElementById('tttMenuScreen'));
        tttShow(document.getElementById('gameSelectScreen'));
      });
    }

    const vsBotBtn = document.getElementById('tttVsBotBtn');
    const diffRow = document.getElementById('tttBotDifficultyRow');
    if(vsBotBtn && diffRow){
      vsBotBtn.addEventListener('click', ()=> diffRow.classList.toggle('hidden'));
      diffRow.querySelectorAll('[data-diff]').forEach(btn=>{
        btn.addEventListener('click', ()=> this.startBotGame(btn.dataset.diff));
      });
    }
    const vsOnlineBtn = document.getElementById('tttVsOnlineBtn');
    if(vsOnlineBtn) vsOnlineBtn.addEventListener('click', ()=> this.startOnlineSearch());
    const cancelSearchBtn = document.getElementById('tttCancelSearchBtn');
    if(cancelSearchBtn) cancelSearchBtn.addEventListener('click', ()=> this.cancelOnlineSearch());
    // модалка поиска соперника закрывается тапом по фону мимо карточки
    // (см. общий обработчик .modal в script.js) — но она специально
    // исключена там из общего поведения (иначе "закрытие" просто прятало
    // бы окно, а поиск в базе продолжал бы висеть активным и оставлял бы
    // "призрачную" запись в списке ожидающих игроков). Здесь обрабатываем
    // именно этот клик правильно — через полноценную отмену поиска.
    const searchModal = document.getElementById('tttSearchModal');
    if(searchModal){
      searchModal.addEventListener('click', (e)=>{
        if(e.target === searchModal) this.cancelOnlineSearch();
      });
    }

    const exitBtn = document.getElementById('tttExitBtn');
    if(exitBtn) exitBtn.addEventListener('click', ()=> this.goToMenu());
    const goMenuBtn = document.getElementById('tttGoMenuBtn');
    if(goMenuBtn) goMenuBtn.addEventListener('click', ()=> this.goToMenu());
    const restartBtn = document.getElementById('tttRestartBtn');
    if(restartBtn) restartBtn.addEventListener('click', ()=> this.restartCurrent());

    const recordsBtn = document.getElementById('tttRecordsBtn');
    if(recordsBtn) recordsBtn.addEventListener('click', ()=> this.openRecords());
    const profileBtn = document.getElementById('tttProfileBtn');
    if(profileBtn){
      profileBtn.addEventListener('click', ()=>{
        this.renderProfileUI();
        tttShow(document.getElementById('tttProfileModal'));
      });
    }
  }
};

// делаем TicTacToe доступным как window.TicTacToe — иначе
// `if(window.TicTacToe)` в script.js всегда ложно (top-level
// const не создаёт window-свойство).
window.TicTacToe = TicTacToe;

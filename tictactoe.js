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

const TTT_MARK_SRC = { X: 'img/X.png', O: 'img/O.png' };
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
      btn.innerHTML = '<img class="ttt-mark" alt="">';
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
      if(!img) return;
      if(val === 'X' || val === 'O'){
        img.src = TTT_MARK_SRC[val];
        img.alt = val === 'X' ? 'Крестик' : 'Нолик';
        img.classList.add('shown');
      } else {
        img.classList.remove('shown');
        img.removeAttribute('src');
        img.alt = '';
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
    pill.textContent = this.mode === 'bot' ? (TTT_DIFF_LABEL[this.botDifficulty] || '🤖 Бот') : '🌐 Онлайн';
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
  ========================================================= */
  startOnlineSearch(){
    if(!window.DB) return;
    this.mode = 'online';
    this.onlineGameId = null;
    tttShow(document.getElementById('tttSearchModal'));

    this.myLobbyId = DB.addItem('tttLobby', { playerId: this.playerId, name: getNickname(), ts: Date.now() });
    this._unsubLobby = DB.watchCollection('tttLobby', list=> this.handleLobbyUpdate(list));
    this._unsubGames = DB.watchCollection('tttGames', list=> this.handleGamesUpdate(list));
  },
  cancelOnlineSearch(){
    if(this._unsubLobby){ this._unsubLobby(); this._unsubLobby = null; }
    if(this._unsubGames){ this._unsubGames(); this._unsubGames = null; }
    if(this.myLobbyId && window.DB) DB.deleteItem('tttLobby', this.myLobbyId);
    this.myLobbyId = null;
    tttHide(document.getElementById('tttSearchModal'));
  },
  // подбор пары: сортируем очередь по времени, первые двое — пара.
  // Партию создаёт тот, кто пришёл ВТОРЫМ (чтобы оба клиента не
  // создавали игру одновременно); первый просто ждёт появления
  // новой игры в handleGamesUpdate.
  handleLobbyUpdate(list){
    if(this.onlineGameId || !this.myLobbyId) return;
    const now = Date.now();
    const waiting = list
      .filter(e=> now - (e.ts || 0) < 120000)
      .sort((a,b)=> (a.ts || 0) - (b.ts || 0));
    if(waiting.length < 2) return;
    const [older, newer] = waiting;
    if(this.myLobbyId !== older.id && this.myLobbyId !== newer.id) return;
    if(this.myLobbyId === newer.id){
      const gameId = DB.addItem('tttGames', {
        board: Array(9).fill(''),
        turn: 'X',
        status: 'playing',
        winner: null,
        players: {
          X: { id: older.playerId, name: older.name },
          O: { id: newer.playerId, name: newer.name }
        },
        createdTs: Date.now(),
        moveTs: Date.now()
      });
      DB.deleteItem('tttLobby', older.id);
      DB.deleteItem('tttLobby', newer.id);
      this.joinOnlineGame(gameId);
    }
    // если я "older" — просто жду, меня подхватит handleGamesUpdate
  },
  handleGamesUpdate(list){
    if(this.onlineGameId) return;
    const mine = list.find(g=> g.status === 'playing' && g.players && (
      (g.players.X && g.players.X.id === this.playerId) ||
      (g.players.O && g.players.O.id === this.playerId)
    ));
    if(mine) this.joinOnlineGame(mine.id);
  },
  joinOnlineGame(gameId){
    if(this.onlineGameId) return;
    this.onlineGameId = gameId;
    this.myLobbyId = null;
    if(this._unsubLobby){ this._unsubLobby(); this._unsubLobby = null; }
    if(this._unsubGames){ this._unsubGames(); this._unsubGames = null; }
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
      // партия больше не нужна — удаляем через небольшую паузу,
      // чтобы второй клиент точно успел получить финальное состояние
      setTimeout(()=>{ if(window.DB && this.onlineGameId === gameId) DB.deleteItem('tttGames', gameId); }, 4000);
    }
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
        DB.setItem('tttGames', this.onlineGameId, {
          status: 'finished',
          winner: winnerSym,
          winLine: null,
          forfeitReason: true,
          moveTs: Date.now()
        });
        // не удаляем сразу — даём сопернику время получить финальное состояние
        const finishedId = this.onlineGameId;
        setTimeout(()=>{ if(window.DB) DB.deleteItem('tttGames', finishedId); }, 4000);
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
    if(this.mode === 'online' && this.onlineGameId && !this.gameOver && window.DB){
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

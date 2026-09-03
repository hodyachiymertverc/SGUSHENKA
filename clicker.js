/* =========================================================
   КЛИКЕР СГУЩЁНКИ — отдельная мини-игра со своим балансом,
   прокачкой, автокликом, уровнями и достижениями.
========================================================= */
function escapeHtmlC(str){ const d = document.createElement('div'); d.textContent = str == null ? '' : str; return d.innerHTML; }
function formatNum(n){
  n = Math.floor(n || 0);
  if(n < 1000) return String(n);
  if(n < 1e6) return (n/1e3).toFixed(n % 1e3 === 0 ? 0 : 1).replace(/\.0$/,'') + 'K';
  if(n < 1e9) return (n/1e6).toFixed(2).replace(/\.?0+$/,'') + 'M';
  return (n/1e9).toFixed(2).replace(/\.?0+$/,'') + 'B';
}

const Clicker = {
  playerId: null,
  data: { balance: 0, totalEarned: 0, autoEarned: 0, totalClicks: 0, upgradesBought: 0, upgradeLevels: {}, unlocked: {} },
  levels: [],
  achievements: [],
  upgrades: [],
  clickPower: 1,
  autoPower: 0,
  _ready: false,

  init(){
    this.playerId = getPlayerId();
    DB.seedIfEmpty('clickerLevels', DEFAULTS.clickerLevels);
    DB.seedIfEmpty('clickerAchievements', DEFAULTS.clickerAchievements);
    DB.seedIfEmpty('clickerUpgrades', DEFAULTS.clickerUpgrades);

    DB.watchCollection('clickerLevels', list=>{
      this.levels = list.slice().sort((a,b)=> (a.min||0) - (b.min||0));
      this.renderAll();
    });
    DB.watchCollection('clickerAchievements', list=>{
      this.achievements = list.slice().sort((a,b)=> (a.target||0) - (b.target||0));
      this.renderAll();
      this.checkAchievements();
    });
    DB.watchCollection('clickerUpgrades', list=>{
      this.upgrades = list.slice().sort((a,b)=> (a.order||0) - (b.order||0));
      this.recalcPower();
      this.renderShop();
    });
    DB.watchItem('clickerPlayers', this.playerId, doc=>{
      this.data = Object.assign(
        { balance:0, totalEarned:0, autoEarned:0, totalClicks:0, upgradesBought:0, upgradeLevels:{}, unlocked:{} },
        doc || {}
      );
      this._ready = true;
      this.recalcPower();
      this.renderAll();
      this.checkAchievements();
    });

    DB.getItemOnce('clickerPlayers', this.playerId).then(doc=>{
      if(!doc){
        DB.setItem('clickerPlayers', this.playerId, {
          name: getNickname(), balance: 0, totalEarned: 0, autoEarned: 0,
          totalClicks: 0, upgradesBought: 0, upgradeLevels: {}, unlocked: {}
        });
      } else if(doc.name !== getNickname()){
        DB.setItem('clickerPlayers', this.playerId, { name: getNickname() });
      }
    });

    this.bindUI();
    setInterval(()=> this.autoTick(), 1000);
    setTimeout(()=>{
      if(!this._ready){
        const hint = document.getElementById('clickerLoadHint');
        if(hint) hint.classList.remove('hidden');
        console.error('Clicker: данные не загрузились за 4с — проверь интернет и правила Firebase (см. admin.html → Диагностика).');
      }
    }, 4000);
  },

  bindUI(){
    const can = document.getElementById('clickerCan');
    if(can){
      can.addEventListener('click', (e)=> this.handleClick(e.clientX, e.clientY));
    }
    const restartBtn = document.getElementById('clickerRestartBtn');
    if(restartBtn){
      restartBtn.addEventListener('click', ()=> this.restart());
    }
  },

  // полный сброс прогресса кликера (баланс, прокачки, достижения) —
  // сам игрок начинает эту игру заново, на другие игры сайта не влияет
  restart(){
    if(!this._ready) return;
    if(!confirm('Точно начать кликер заново? Баланс, прокачки и достижения кликера обнулятся.')) return;
    const fresh = {
      balance: 0, totalEarned: 0, autoEarned: 0, totalClicks: 0,
      upgradesBought: 0, upgradeLevels: {}, unlocked: {}
    };
    DB.setItem('clickerPlayers', this.playerId, fresh);
    this.data = Object.assign({ name: getNickname() }, fresh);
    this.recalcPower();
    this.renderAll();
  },

  recalcPower(){
    let click = 1, auto = 0;
    const levels = this.data.upgradeLevels || {};
    this.upgrades.forEach(u=>{
      const lvl = levels[u.id] || 0;
      if(lvl <= 0) return;
      if(u.type === 'auto') auto += (u.value || 0) * lvl;
      else click += (u.value || 0) * lvl;
    });
    this.clickPower = click;
    this.autoPower = auto;
    const pv = document.getElementById('clickerPowerValue'); if(pv) pv.textContent = click;
    const ar = document.getElementById('clickerAutoRate'); if(ar) ar.textContent = formatNum(auto);
  },

  autoTick(){
    if(!this._ready || this.autoPower <= 0) return;
    DB.incrementItem('clickerPlayers', this.playerId, {
      balance: this.autoPower, totalEarned: this.autoPower, autoEarned: this.autoPower
    });
  },

  handleClick(clientX, clientY){
    if(!this._ready) return;
    DB.incrementItem('clickerPlayers', this.playerId, {
      balance: this.clickPower, totalEarned: this.clickPower, totalClicks: 1
    });
    this.playClickAnim(clientX, clientY);
  },

  playClickAnim(x, y){
    const can = document.getElementById('clickerCan');
    if(can){
      can.classList.remove('squish');
      void can.offsetWidth; // перезапускаем CSS-анимацию
      can.classList.add('squish');
    }
    const wrap = document.getElementById('clickerParticles');
    if(wrap){
      const rect = wrap.getBoundingClientRect();
      const p = document.createElement('div');
      p.className = 'click-particle';
      p.textContent = '+' + formatNum(this.clickPower);
      const relX = (x != null ? x - rect.left : rect.width / 2) + (Math.random() * 40 - 20);
      const relY = (y != null ? y - rect.top : rect.height / 2);
      p.style.left = relX + 'px';
      p.style.top = relY + 'px';
      wrap.appendChild(p);
      setTimeout(()=> p.remove(), 850);
    }
  },

  getLevelForEarned(v){
    if(!this.levels.length) return null;
    let level = this.levels[0];
    this.levels.forEach(l=>{ if(v >= l.min) level = l; });
    return level;
  },
  getNextLevel(v){
    for(const l of this.levels){ if(v < l.min) return l; }
    return null;
  },

  costFor(upgrade, level){
    return Math.round((upgrade.baseCost || 1) * Math.pow(upgrade.growth || 1.15, level));
  },

  buy(upId){
    const u = this.upgrades.find(x=> x.id === upId);
    if(!u || !this._ready) return;
    const level = (this.data.upgradeLevels || {})[upId] || 0;
    const cost = this.costFor(u, level);
    if((this.data.balance || 0) < cost) return;
    DB.incrementItem('clickerPlayers', this.playerId, { balance: -cost, upgradesBought: 1 });
    DB.incrementNested('clickerPlayers', this.playerId, 'upgradeLevels/' + upId, 1);
  },

  checkAchievements(){
    if(!this.achievements.length || !this._ready) return;
    const unlocked = this.data.unlocked || {};
    const metric = (type)=>{
      if(type === 'clicks') return this.data.totalClicks || 0;
      if(type === 'earned') return this.data.totalEarned || 0;
      if(type === 'autoEarned') return this.data.autoEarned || 0;
      if(type === 'upgrades') return this.data.upgradesBought || 0;
      if(type === 'balance') return this.data.balance || 0;
      return 0;
    };
    const newly = this.achievements.filter(a=> !unlocked[a.id] && metric(a.type) >= (a.target || 0));
    if(newly.length){
      DB.markUnlocked('clickerPlayers', this.playerId, newly.map(a=> a.id));
      newly.forEach(a=> showAchievementToast(a, 'clicker'));
    }
  },

  /* ---------------- UI ---------------- */
  renderAll(){
    if(!this._ready) return;
    const hint = document.getElementById('clickerLoadHint');
    if(hint) hint.classList.add('hidden');
    const bal = document.getElementById('clickerBalance');
    if(bal) bal.textContent = formatNum(this.data.balance || 0);
    const clicksEl = document.getElementById('clickerClicksValue');
    if(clicksEl) clicksEl.textContent = formatNum(this.data.totalClicks || 0);
    const ar = document.getElementById('clickerAutoRate');
    if(ar) ar.textContent = formatNum(this.autoPower);
    const pv = document.getElementById('clickerPowerValue');
    if(pv) pv.textContent = this.clickPower;

    const earned = this.data.totalEarned || 0;
    const level = this.getLevelForEarned(earned);
    const next = this.getNextLevel(earned);
    const lvlEmoji = document.getElementById('clickerLevelEmoji');
    if(lvlEmoji) lvlEmoji.textContent = level ? level.emoji : '🥄';
    const lvlName = document.getElementById('clickerLevelName');
    if(lvlName) lvlName.textContent = level ? level.name : 'Новичок с ложкой';
    const lvlNext = document.getElementById('clickerLevelNext');
    if(lvlNext){
      lvlNext.textContent = next
        ? `До «${next.name}»: ещё ${formatNum(Math.max(0, next.min - earned))}`
        : 'Максимальный уровень!';
    }

    const grid = document.getElementById('clickerAchGrid');
    if(grid){
      const unlocked = this.data.unlocked || {};
      grid.innerHTML = this.achievements.map(a=>{
        const done = !!unlocked[a.id];
        return `<div class="ach-card ${done ? 'unlocked' : 'locked'}">
          <div class="ach-emoji">${done ? a.emoji : '🔒'}</div>
          <div class="ach-title">${escapeHtmlC(a.title)}</div>
          <div class="ach-desc">${escapeHtmlC(a.desc || '')}</div>
        </div>`;
      }).join('') || '<p class="news-empty">Достижений пока нет.</p>';
    }
    this.renderShop();
  },

  renderShop(){
    const shop = document.getElementById('clickerShop');
    if(!shop || !this._ready) return;
    const levels = this.data.upgradeLevels || {};
    const balance = this.data.balance || 0;
    shop.innerHTML = this.upgrades.map(u=>{
      const level = levels[u.id] || 0;
      const cost = this.costFor(u, level);
      const affordable = balance >= cost;
      return `<div class="shop-item ${affordable ? '' : 'disabled'}">
        <div class="shop-item-emoji">${u.emoji || '🥄'}</div>
        <div class="shop-item-info">
          <div class="shop-item-name">${escapeHtmlC(u.name)}${level > 0 ? ` <span class="shop-item-lvl">ур. ${level}</span>` : ''}</div>
          <div class="shop-item-desc">${escapeHtmlC(u.desc || '')}</div>
        </div>
        <button class="shop-buy-btn" data-buy="${u.id}" ${affordable ? '' : 'disabled'}>${formatNum(cost)} 🥫</button>
      </div>`;
    }).join('') || '<p class="news-empty">Прокачек пока нет.</p>';
    shop.querySelectorAll('[data-buy]').forEach(btn=>{
      btn.addEventListener('click', ()=> this.buy(btn.dataset.buy));
    });
  }
};

// делаем Clicker доступным как window.Clicker — иначе `if(window.Clicker)`
// в script.js всегда ложно (top-level const не создаёт window-свойство).
window.Clicker = Clicker;

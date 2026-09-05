/* Пароль администратора теперь хранится ОТДЕЛЬНО, в файле
   admin-config.js (который не должен попадать в публичный
   репозиторий на GitHub — см. .gitignore и SETUP-SECRETS.md).
   Здесь мы только читаем то, что этот файл положил в window. */
const ADMIN_PASSWORD = window.ADMIN_PASSWORD || '';

function escapeHtml(str){ const d=document.createElement('div'); d.textContent=str; return d.innerHTML; }
function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

document.querySelectorAll('[data-close]').forEach(btn=>{
  btn.addEventListener('click', ()=> hide(document.getElementById(btn.dataset.close)));
});
document.querySelectorAll('.modal').forEach(modal=>{
  modal.addEventListener('click', (e)=>{ if(e.target === modal) hide(modal); });
});

const lockCard = document.getElementById('lockCard');
const panelWrap = document.getElementById('panelWrap');
const passInput = document.getElementById('passInput');
const loginError = document.getElementById('loginError');
const statusBadge = document.getElementById('statusBadge');

document.getElementById('loginBtn').addEventListener('click', tryLogin);
passInput.addEventListener('keydown', e => { if(e.key === 'Enter') tryLogin(); });

let unsubNews = null;
let unsubRecords = null;
let currentNewsList = [];
let currentRecordsList = [];

let unsubSnakeEasy = null;
let unsubSnakeHard = null;
let unsubSnakeMedium = null;
let unsubSnakeOnline = null;
let currentSnakeEasyList = [];
let currentSnakeHardList = [];

let unsubSnakeClassicEasy = null;
let unsubSnakeClassicHard = null;
let currentSnakeClassicEasyList = [];
let currentSnakeClassicHardList = [];

let unsubDoodleRecords = null;
let currentDoodleRecordsList = [];

let unsubTTTRecords = null;
let currentTTTRecordsList = [];

function tryLogin(){
  if(!ADMIN_PASSWORD){
    loginError.textContent = 'Пароль администратора не настроен. Создай файл admin-config.js по примеру admin-config.example.js (см. SETUP-SECRETS.md).';
    loginError.classList.remove('hidden');
    return;
  }
  if(passInput.value === ADMIN_PASSWORD){
    lockCard.classList.add('hidden');
    panelWrap.classList.remove('hidden');

    statusBadge.textContent = DB.cloud
      ? '🟢 Подключено к общему облачному хранилищу'
      : '🟡 Облако не настроено — данные только в этом браузере (см. README.md)';
    statusBadge.classList.toggle('offline', !DB.cloud);

    unsubNews = DB.watchNews(list=> renderAdminNews(list));
    unsubRecords = DB.watchRecords(list=>{ currentRecordsList = list; renderAdminRecords(list); });
    unsubSnakeEasy = DB.watchRecordsIn('snakeRecordsEasy', list=>{
      currentSnakeEasyList = list;
      renderAdminSnakeRecords('adminSnakeRecordsEasy', list, 'snakeRecordsEasy');
    });
    unsubSnakeHard = DB.watchRecordsIn('snakeRecordsHard', list=>{
      currentSnakeHardList = list;
      renderAdminSnakeRecords('adminSnakeRecordsHard', list, 'snakeRecordsHard');
    });
    unsubSnakeMedium = DB.watchRecordsIn('snakeRecordsMedium', list=>{
      renderAdminSnakeRecords('adminSnakeRecordsMedium', list, 'snakeRecordsMedium');
    });
    unsubSnakeOnline = DB.watchRecordsIn('snakeRecordsOnline', list=>{
      renderAdminSnakeRecords('adminSnakeRecordsOnline', list, 'snakeRecordsOnline');
    });
    unsubSnakeClassicEasy = DB.watchRecordsIn('snakeClassicRecordsEasy', list=>{
      currentSnakeClassicEasyList = list;
      renderAdminSnakeRecords('adminSnakeClassicRecordsEasy', list, 'snakeClassicRecordsEasy');
    });
    unsubSnakeClassicHard = DB.watchRecordsIn('snakeClassicRecordsHard', list=>{
      currentSnakeClassicHardList = list;
      renderAdminSnakeRecords('adminSnakeClassicRecordsHard', list, 'snakeClassicRecordsHard');
    });
    unsubDoodleRecords = DB.watchRecordsIn('doodleRecords', list=>{
      currentDoodleRecordsList = list;
      renderAdminDoodleRecords(list);
    });
    unsubTTTRecords = DB.watchRecordsIn('tttRecords', list=>{
      currentTTTRecordsList = list;
      renderAdminTTTRecords(list);
    });

    if(!window._configMounted){
      window._configMounted = true;
      mountAllConfigSections();
      mountTabs();
      runDiagnostics();
    }
  } else {
    loginError.textContent = 'Неверный пароль';
    loginError.classList.remove('hidden');
  }
}

/* ---------------- НОВОСТИ ---------------- */
function renderAdminNews(list){
  // новые сверху, старые снизу
  list = list.slice().sort((a,b)=> (b.ts||0) - (a.ts||0));
  currentNewsList = list;
  const container = document.getElementById('adminNewsList');
  container.innerHTML = '';
  if(list.length === 0){
    container.innerHTML = '<p class="news-empty">Пока нет новостей.</p>';
    return;
  }
  list.forEach(n=>{
    const preview = n.text.length > 80 ? n.text.slice(0,80) + '…' : n.text;
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    item.innerHTML = `
      <div class="row">
        <div class="info">
          <strong>${escapeHtml(n.title)}</strong><br>
          <span style="font-size:0.9rem;color:#6b4a2e;">${escapeHtml(preview)}</span><br>
          <time style="font-size:0.75rem;color:#a17a4d;">${n.date}</time>
        </div>
        <div class="actions">
          <button class="mini-btn view-btn" data-view="${n.id}">Просмотреть</button>
          <button class="mini-btn del-btn" data-del="${n.id}">Удалить</button>
        </div>
      </div>
    `;
    container.appendChild(item);
  });
  container.querySelectorAll('[data-view]').forEach(btn=>{
    btn.addEventListener('click', ()=> openReader(btn.dataset.view));
  });
  container.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(confirm('Удалить эту новость у всех?')) DB.deleteNews(btn.dataset.del);
    });
  });
}

document.getElementById('publishBtn').addEventListener('click', ()=>{
  const title = document.getElementById('titleInput').value.trim();
  const text = document.getElementById('textInput').value.trim();
  if(!title || !text){ alert('Заполни заголовок и текст новости'); return; }
  DB.addNews(title, text);
  document.getElementById('titleInput').value = '';
  document.getElementById('textInput').value = '';
});

let currentReaderId = null;
function openReader(id){
  const n = currentNewsList.find(x => x.id === id);
  if(!n) return;
  currentReaderId = id;
  document.getElementById('adminReaderTitle').textContent = n.title;
  document.getElementById('adminReaderDate').textContent = n.date;
  document.getElementById('adminReaderText').textContent = n.text;
  document.getElementById('editLikes').value = n.likes || 0;
  document.getElementById('editDislikes').value = n.dislikes || 0;
  document.getElementById('editSgushenka').value = n.sgushenka || 0;
  show(document.getElementById('adminReaderModal'));
}

document.getElementById('saveReactionsBtn').addEventListener('click', ()=>{
  if(!currentReaderId) return;
  DB.setReactionCounts(currentReaderId, {
    likes: Math.max(0, parseInt(document.getElementById('editLikes').value,10) || 0),
    dislikes: Math.max(0, parseInt(document.getElementById('editDislikes').value,10) || 0),
    sgushenka: Math.max(0, parseInt(document.getElementById('editSgushenka').value,10) || 0)
  });
  hide(document.getElementById('adminReaderModal'));
});

document.getElementById('deleteFromReaderBtn').addEventListener('click', ()=>{
  if(!currentReaderId) return;
  if(confirm('Удалить эту новость у всех?')){
    DB.deleteNews(currentReaderId);
    hide(document.getElementById('adminReaderModal'));
  }
});

/* ---------------- РЕКОРДЫ (общий помощник для всех игр) ----------------
   Используется и для основной игры "Лови сгущёнку", и для рекордов
   змейки (лёгкий/сложный). Позволяет менять никнейм И очки прямо
   в списке, а не только удалять запись. */
function renderRecordsAdmin(containerId, list, opts){
  // opts: { updateFn(id,patch), deleteFn(id), state:{editingId}, rerender() }
  const container = document.getElementById(containerId);
  if(!container) return;
  // пока открыта форма редактирования одной из записей — не
  // перестраиваем список при живых обновлениях (см. mountConfigSection)
  if(opts.state.editingId !== null) return;
  container.innerHTML = '';
  if(list.length === 0){
    container.innerHTML = '<p class="news-empty">Пока нет рекордов.</p>';
    return;
  }
  list.slice(0, 50).forEach(r=>{
    const card = document.createElement('div');
    card.className = 'admin-list-item';
    card.innerHTML = `
      <div class="row">
        <div class="info"><strong>${r.score} очков</strong> — <span>${escapeHtml(r.name)}</span>
          <br><time style="font-size:0.75rem;color:#a17a4d;">${r.date}</time></div>
        <div class="actions">
          <button class="mini-btn view-btn" data-editrec="1">✏️ Изменить</button>
          <button class="mini-btn del-btn" data-delrec="1">Удалить</button>
        </div>
      </div>
      <div class="cfg-form hidden" data-editform="1"></div>
    `;
    container.appendChild(card);

    const editBtn = card.querySelector('[data-editrec]');
    const delBtn = card.querySelector('[data-delrec]');
    const formEl = card.querySelector('[data-editform]');
    const prefix = 'rec_' + containerId + '_' + r.id;

    editBtn.addEventListener('click', ()=>{
      if(!formEl.classList.contains('hidden')){
        formEl.classList.add('hidden');
        opts.state.editingId = null;
        opts.rerender();
        return;
      }
      opts.state.editingId = r.id;
      formEl.innerHTML = `
        <label class="cfg-field">Никнейм<input type="text" id="${prefix}_name" value="${escapeHtml(r.name)}" maxlength="16"></label>
        <label class="cfg-field">Очки<input type="number" id="${prefix}_score" value="${r.score}"></label>
        <div class="cfg-form-actions">
          <button class="mini-btn save-btn" type="button" data-saverec="1">💾 Сохранить</button>
        </div>
      `;
      formEl.classList.remove('hidden');
      formEl.querySelector('[data-saverec]').addEventListener('click', ()=>{
        const nick = (document.getElementById(prefix + '_name').value || '').trim().slice(0, 16) || r.name;
        const score = parseInt(document.getElementById(prefix + '_score').value, 10) || 0;
        opts.updateFn(r.id, { name: nick, score });
        formEl.classList.add('hidden');
        opts.state.editingId = null;
        opts.rerender();
      });
    });

    delBtn.addEventListener('click', ()=>{
      if(confirm('Удалить этот рекорд у всех?')) opts.deleteFn(r.id);
    });
  });
}

/* ---------------- РЕКОРДЫ (основная игра "Лови сгущёнку") ---------------- */
const mainRecordsState = { editingId: null };
function renderAdminRecords(list){
  currentRecordsList = list;
  renderRecordsAdmin('adminRecordsList', list, {
    updateFn: (id, patch)=> DB.updateRecord(id, patch),
    deleteFn: (id)=> DB.deleteRecord(id),
    state: mainRecordsState,
    rerender: ()=> renderAdminRecords(currentRecordsList)
  });
}

document.getElementById('clearAllRecordsBtn').addEventListener('click', ()=>{
  if(confirm('Точно очистить ВСЕ рекорды у всех игроков?')){
    DB.clearAllRecords(currentRecordsList);
  }
});

/* ---------------- ЗМЕЙКА: рекорды (лёгкий/средний/сложный/онлайн) ----------------
   Раньше здесь были отдельные переменные и функции под каждую сложность —
   теперь один общий реестр по имени коллекции, чтобы легко добавлять новые
   режимы (например, средний уровень и онлайн), не дублируя код. */
const snakeRecordsRegistry = {
  snakeRecordsEasy:   { list: [], state: { editingId: null }, containerId: 'adminSnakeRecordsEasy' },
  snakeRecordsMedium: { list: [], state: { editingId: null }, containerId: 'adminSnakeRecordsMedium' },
  snakeRecordsHard:   { list: [], state: { editingId: null }, containerId: 'adminSnakeRecordsHard' },
  snakeRecordsOnline: { list: [], state: { editingId: null }, containerId: 'adminSnakeRecordsOnline' },
  // Змейка-классика — отдельная игра, отдельные рекорды (только
  // лёгкий/сложный — там нет ни среднего уровня, ни онлайна)
  snakeClassicRecordsEasy: { list: [], state: { editingId: null }, containerId: 'adminSnakeClassicRecordsEasy' },
  snakeClassicRecordsHard: { list: [], state: { editingId: null }, containerId: 'adminSnakeClassicRecordsHard' }
};
function renderAdminSnakeRecords(containerId, list, collectionName){
  const entry = snakeRecordsRegistry[collectionName];
  if(!entry) return;
  entry.list = list;
  if(collectionName === 'snakeRecordsEasy') currentSnakeEasyList = list;
  if(collectionName === 'snakeRecordsHard') currentSnakeHardList = list;
  if(collectionName === 'snakeClassicRecordsEasy') currentSnakeClassicEasyList = list;
  if(collectionName === 'snakeClassicRecordsHard') currentSnakeClassicHardList = list;
  renderRecordsAdmin(containerId, list, {
    updateFn: (id, patch)=> DB.updateRecordIn(collectionName, id, patch),
    deleteFn: (id)=> DB.deleteRecordIn(collectionName, id),
    state: entry.state,
    rerender: ()=> renderAdminSnakeRecords(containerId, entry.list, collectionName)
  });
}

function bindClearSnakeBtn(btnId, collectionName, label){
  const btn = document.getElementById(btnId);
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    if(confirm(`Точно очистить ВСЕ рекорды (${label}) змейки?`)){
      DB.clearRecordsIn(collectionName, snakeRecordsRegistry[collectionName].list);
    }
  });
}
bindClearSnakeBtn('clearSnakeEasyBtn', 'snakeRecordsEasy', 'лёгкий уровень, Змейка.io');
bindClearSnakeBtn('clearSnakeMediumBtn', 'snakeRecordsMedium', 'средний уровень, Змейка.io');
bindClearSnakeBtn('clearSnakeHardBtn', 'snakeRecordsHard', 'сложный уровень, Змейка.io');
bindClearSnakeBtn('clearSnakeOnlineBtn', 'snakeRecordsOnline', 'онлайн, Змейка.io');
bindClearSnakeBtn('clearSnakeClassicEasyBtn', 'snakeClassicRecordsEasy', 'лёгкий уровень, змейка-классика');
bindClearSnakeBtn('clearSnakeClassicHardBtn', 'snakeClassicRecordsHard', 'сложный уровень, змейка-классика');

/* ---------------- DOODLE-ПРЫЖКИ: рекорды ---------------- */
const doodleRecordsState = { editingId: null };
function renderAdminDoodleRecords(list){
  currentDoodleRecordsList = list;
  renderRecordsAdmin('adminDoodleRecordsList', list, {
    updateFn: (id, patch)=> DB.updateRecordIn('doodleRecords', id, patch),
    deleteFn: (id)=> DB.deleteRecordIn('doodleRecords', id),
    state: doodleRecordsState,
    rerender: ()=> renderAdminDoodleRecords(currentDoodleRecordsList)
  });
}

document.getElementById('clearDoodleRecordsBtn').addEventListener('click', ()=>{
  if(confirm('Точно очистить ВСЕ рекорды Doodle-прыжков?')){
    DB.clearRecordsIn('doodleRecords', currentDoodleRecordsList);
  }
});

/* ---------------- КРЕСТИКИ-НОЛИКИ: рекорды ---------------- */
const tttRecordsState = { editingId: null };
function renderAdminTTTRecords(list){
  currentTTTRecordsList = list;
  renderRecordsAdmin('adminTTTRecordsList', list, {
    updateFn: (id, patch)=> DB.updateRecordIn('tttRecords', id, patch),
    deleteFn: (id)=> DB.deleteRecordIn('tttRecords', id),
    state: tttRecordsState,
    rerender: ()=> renderAdminTTTRecords(currentTTTRecordsList)
  });
}

document.getElementById('clearTTTRecordsBtn').addEventListener('click', ()=>{
  if(confirm('Точно очистить ВСЕ рекорды крестиков-ноликов?')){
    DB.clearRecordsIn('tttRecords', currentTTTRecordsList);
  }
});

/* =========================================================
   ГЕНЕРИЧНЫЙ РЕДАКТОР КОЛЛЕКЦИЙ
   (уровни, достижения, события, прокачки кликера и т.д.)
========================================================= */
function fieldHTML(f, prefix, values){
  const id = prefix + '_' + f.key;
  const has = values && Object.prototype.hasOwnProperty.call(values, f.key);
  const val = has ? values[f.key] : (f.default !== undefined ? f.default : '');
  if(f.type === 'checkbox'){
    return `<label class="cfg-field cfg-check ${f.wide ? 'wide' : ''}"><input type="checkbox" id="${id}" ${val ? 'checked' : ''}> ${escapeHtml(f.label)}</label>`;
  }
  if(f.type === 'select'){
    const opts = (f.options || []).map(([v,l])=> `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('');
    return `<label class="cfg-field ${f.wide ? 'wide' : ''}">${escapeHtml(f.label)}<select id="${id}">${opts}</select></label>`;
  }
  if(f.type === 'textarea'){
    return `<label class="cfg-field wide">${escapeHtml(f.label)}<textarea id="${id}">${escapeHtml(val)}</textarea></label>`;
  }
  if(f.type === 'number'){
    return `<label class="cfg-field">${escapeHtml(f.label)}<input type="number" id="${id}" value="${val}" step="${f.step || 1}"></label>`;
  }
  return `<label class="cfg-field ${f.wide ? 'wide' : ''}">${escapeHtml(f.label)}<input type="text" id="${id}" value="${escapeHtml(val)}"></label>`;
}

function readFields(fields, prefix){
  const out = {};
  fields.forEach(f=>{
    const el = document.getElementById(prefix + '_' + f.key);
    if(!el) return;
    if(f.type === 'checkbox') out[f.key] = el.checked;
    else if(f.type === 'number') out[f.key] = parseFloat(el.value) || 0;
    else out[f.key] = el.value;
  });
  return out;
}

function mountConfigSection(opts){
  DB.seedIfEmpty(opts.collection, opts.seed || []);

  const addFormEl = document.getElementById(opts.addFormElId);
  const addBtnEl = document.getElementById(opts.addBtnId);
  const listEl = document.getElementById(opts.listElId);
  if(!addFormEl || !addBtnEl || !listEl) return;

  function buildAddForm(){
    addFormEl.className = 'cfg-form hidden';
    addFormEl.innerHTML = opts.fields.map(f=> fieldHTML(f, 'add_' + opts.collection, {})).join('')
      + `<div class="cfg-form-actions">
           <button class="btn btn-primary btn-small" id="${opts.collection}_saveAdd" type="button">Сохранить</button>
           <button class="btn btn-secondary btn-small" id="${opts.collection}_cancelAdd" type="button">Отмена</button>
         </div>`;
    document.getElementById(opts.collection + '_saveAdd').addEventListener('click', ()=>{
      const values = readFields(opts.fields, 'add_' + opts.collection);
      DB.addItem(opts.collection, values);
      buildAddForm(); // очищаем форму под следующее добавление
    });
    document.getElementById(opts.collection + '_cancelAdd').addEventListener('click', ()=>{
      addFormEl.classList.add('hidden');
    });
  }
  buildAddForm();

  addBtnEl.addEventListener('click', ()=> addFormEl.classList.toggle('hidden'));

  // ВАЖНО: пока открыта форма редактирования одной из записей, мы
  // НЕ перестраиваем список при живых обновлениях из Firebase —
  // иначе, например, у "прокачек кликера" список может прилететь
  // с сервера в любой момент (даже без реальных изменений в самой
  // коллекции) и снести открытую форму раньше, чем игрок успеет
  // нажать "Сохранить". Последние данные всё равно запоминаем
  // (latestList) и перерисовываем список сразу, как только
  // редактирование закончится (сохранением или отменой).
  let latestList = [];
  let editingId = null;
  function setEditingId(id){
    editingId = id;
    if(id === null) renderConfigList(listEl, latestList, opts, null, setEditingId);
  }

  DB.watchCollection(opts.collection, list=>{
    latestList = list;
    if(editingId === null) renderConfigList(listEl, list, opts, editingId, setEditingId);
  });
}

function renderConfigList(listEl, list, opts, editingId, setEditingId){
  listEl.innerHTML = '';
  if(!list.length){
    listEl.innerHTML = `<p class="news-empty">${escapeHtml(opts.emptyText || 'Пока пусто.')}</p>`;
    return;
  }
  list.forEach(item=>{
    const sum = opts.summary(item);
    const card = document.createElement('div');
    card.className = 'admin-list-item';
    card.innerHTML = `
      <div class="row">
        <div class="info">
          <div class="cfg-item-title">${escapeHtml(sum.title || '')}</div>
          <div class="cfg-item-sub">${escapeHtml(sum.sub || '')}</div>
        </div>
        <div class="actions">
          <button class="mini-btn view-btn" data-edit="1">✏️ Изменить</button>
          <button class="mini-btn del-btn" data-del="1">Удалить</button>
        </div>
      </div>
      <div class="cfg-form hidden" data-editform="1"></div>
    `;
    listEl.appendChild(card);

    const editBtn = card.querySelector('[data-edit]');
    const delBtn = card.querySelector('[data-del]');
    const formEl = card.querySelector('[data-editform]');

    editBtn.addEventListener('click', ()=>{
      if(!formEl.classList.contains('hidden')){
        formEl.classList.add('hidden');
        setEditingId(null);
        return;
      }
      setEditingId(item.id);
      const prefix = 'edit_' + opts.collection + '_' + item.id;
      formEl.innerHTML = opts.fields.map(f=> fieldHTML(f, prefix, item)).join('')
        + `<div class="cfg-form-actions">
             <button class="mini-btn save-btn" type="button" data-savebtn="1">💾 Сохранить</button>
           </div>`;
      formEl.classList.remove('hidden');
      formEl.querySelector('[data-savebtn]').addEventListener('click', ()=>{
        const values = readFields(opts.fields, prefix);
        DB.setItem(opts.collection, item.id, values);
        formEl.classList.add('hidden');
        setEditingId(null);
      });
    });

    delBtn.addEventListener('click', ()=>{
      if(confirm('Удалить эту запись? Это затронет всех игроков.')){
        DB.deleteItem(opts.collection, item.id);
      }
    });
  });
}

/* =========================================================
   МОНТИРУЕМ ВСЕ РЕДАКТИРУЕМЫЕ РАЗДЕЛЫ
========================================================= */
function mountAllConfigSections(){

  /* ---- уровни игрока ---- */
  mountConfigSection({
    collection: 'levels',
    addFormElId: 'levelsAddForm', addBtnId: 'levelsAddBtn', listElId: 'levelsList',
    seed: (window.DEFAULTS && DEFAULTS.levels) || [],
    emptyText: 'Пока нет уровней.',
    fields: [
      { key:'emoji', label:'Эмодзи', type:'text', default:'🥄' },
      { key:'name',  label:'Название', type:'text', default:'' },
      { key:'min',   label:'От (очков)', type:'number', default:0 },
      { key:'max',   label:'До (очков)', type:'number', default:10 }
    ],
    summary(item){ return { title: `${item.emoji || ''} ${item.name || ''}`, sub: `${item.min}–${item.max} очков` }; }
  });

  /* ---- общие достижения ---- */
  const achTypeLabels = { reactions:'реакций', playtime:'сек игры', streak:'дней подряд', points:'очков' };
  mountConfigSection({
    collection: 'achievements',
    addFormElId: 'achievementsAddForm', addBtnId: 'achievementsAddBtn', listElId: 'achievementsList',
    seed: (window.DEFAULTS && DEFAULTS.achievements) || [],
    emptyText: 'Пока нет достижений.',
    fields: [
      { key:'emoji', label:'Эмодзи', type:'text', default:'🏆' },
      { key:'title', label:'Название', type:'text', default:'' },
      { key:'desc',  label:'Описание', type:'textarea', default:'' },
      { key:'type',  label:'Тип условия', type:'select', default:'reactions', options: [
        ['reactions','Реакции (всего)'], ['playtime','Время игры (сек)'], ['streak','Дней подряд'], ['points','Очки (всего)']
      ]},
      { key:'target', label:'Нужное значение', type:'number', default:1 }
    ],
    summary(item){
      return { title: `${item.emoji || ''} ${item.title || ''}`, sub: `${item.desc || ''} · условие: ${item.target} ${achTypeLabels[item.type] || item.type}` };
    }
  });

  /* ---- случайные события ---- */
  mountConfigSection({
    collection: 'events',
    addFormElId: 'eventsAddForm', addBtnId: 'eventsAddBtn', listElId: 'eventsList',
    seed: (window.DEFAULTS && DEFAULTS.events) || [],
    emptyText: 'Пока нет событий.',
    fields: [
      { key:'emoji',  label:'Эмодзи', type:'text', default:'🥫' },
      { key:'title',  label:'Заголовок', type:'text', default:'СРОЧНО!' },
      { key:'text',   label:'Текст', type:'textarea', default:'' },
      { key:'chance', label:'Шанс появления, %', type:'number', default:20 },
      { key:'active', label:'Событие включено', type:'checkbox', default:true, wide:true }
    ],
    summary(item){
      return {
        title: `${item.emoji || ''} ${item.title || ''}${item.active === false ? ' (выключено)' : ''}`,
        sub: `${item.text || ''} · шанс ${item.chance ?? 0}%`
      };
    }
  });

  /* ---- прокачки кликера ---- */
  mountConfigSection({
    collection: 'clickerUpgrades',
    addFormElId: 'clickerUpgradesAddForm', addBtnId: 'clickerUpgradesAddBtn', listElId: 'clickerUpgradesList',
    seed: (window.DEFAULTS && DEFAULTS.clickerUpgrades) || [],
    emptyText: 'Пока нет прокачек.',
    fields: [
      { key:'emoji', label:'Эмодзи', type:'text', default:'🥄' },
      { key:'name',  label:'Название', type:'text', default:'' },
      { key:'desc',  label:'Описание', type:'textarea', default:'' },
      { key:'type',  label:'Тип эффекта', type:'select', default:'click', options: [['click','Сила клика'], ['auto','Авто-доход в секунду']] },
      { key:'value',    label:'Значение за уровень', type:'number', default:1 },
      { key:'baseCost', label:'Базовая цена', type:'number', default:10 },
      { key:'growth',   label:'Рост цены (×)', type:'number', default:1.15, step:'0.01' },
      { key:'order',    label:'Порядок в магазине', type:'number', default:1 }
    ],
    summary(item){
      const typeLabel = item.type === 'auto' ? 'банок/сек' : 'к силе клика';
      return { title: `${item.emoji || ''} ${item.name || ''}`, sub: `+${item.value} ${typeLabel} · цена от ${item.baseCost} (×${item.growth})` };
    }
  });

  /* ---- уровни кликера ---- */
  mountConfigSection({
    collection: 'clickerLevels',
    addFormElId: 'clickerLevelsAddForm', addBtnId: 'clickerLevelsAddBtn', listElId: 'clickerLevelsList',
    seed: (window.DEFAULTS && DEFAULTS.clickerLevels) || [],
    emptyText: 'Пока нет уровней.',
    fields: [
      { key:'emoji', label:'Эмодзи', type:'text', default:'🥄' },
      { key:'name',  label:'Название', type:'text', default:'' },
      { key:'min',   label:'От (заработано всего)', type:'number', default:0 },
      { key:'max',   label:'До (заработано всего)', type:'number', default:100 }
    ],
    summary(item){ return { title: `${item.emoji || ''} ${item.name || ''}`, sub: `${item.min}–${item.max} заработано` }; }
  });

  /* ---- достижения кликера ---- */
  const clickerAchTypeLabels = { clicks:'кликов', earned:'заработано всего', autoEarned:'заработано автокликом', upgrades:'прокачек куплено', balance:'текущий баланс' };
  mountConfigSection({
    collection: 'clickerAchievements',
    addFormElId: 'clickerAchievementsAddForm', addBtnId: 'clickerAchievementsAddBtn', listElId: 'clickerAchievementsList',
    seed: (window.DEFAULTS && DEFAULTS.clickerAchievements) || [],
    emptyText: 'Пока нет достижений.',
    fields: [
      { key:'emoji', label:'Эмодзи', type:'text', default:'🏆' },
      { key:'title', label:'Название', type:'text', default:'' },
      { key:'desc',  label:'Описание', type:'textarea', default:'' },
      { key:'type',  label:'Тип условия', type:'select', default:'clicks', options: [
        ['clicks','Кликов всего'], ['earned','Заработано всего'], ['autoEarned','Заработано автокликом'], ['upgrades','Прокачек куплено'], ['balance','Баланс сейчас']
      ]},
      { key:'target', label:'Нужное значение', type:'number', default:1 }
    ],
    summary(item){
      return { title: `${item.emoji || ''} ${item.title || ''}`, sub: `${item.desc || ''} · условие: ${item.target} (${clickerAchTypeLabels[item.type] || item.type})` };
    }
  });

  mountClickerPlayers();

  /* ---- уровни змейки ---- */
  mountConfigSection({
    collection: 'snakeLevels',
    addFormElId: 'snakeLevelsAddForm', addBtnId: 'snakeLevelsAddBtn', listElId: 'snakeLevelsList',
    seed: (window.DEFAULTS && DEFAULTS.snakeLevels) || [],
    emptyText: 'Пока нет уровней.',
    fields: [
      { key:'emoji', label:'Эмодзи', type:'text', default:'🥄' },
      { key:'name',  label:'Название', type:'text', default:'' },
      { key:'min',   label:'От (банок поймано)', type:'number', default:0 },
      { key:'max',   label:'До (банок поймано)', type:'number', default:10 }
    ],
    summary(item){ return { title: `${item.emoji || ''} ${item.name || ''}`, sub: `${item.min}–${item.max} банок поймано` }; }
  });

  /* ---- достижения змейки ---- */
  const snakeAchTypeLabels = { caught:'банок поймано всего', games:'игр сыграно', bestEasy:'рекорд (лёгкий)', bestMedium:'рекорд (средний)', bestHard:'рекорд (сложный)', bestOnline:'рекорд (онлайн)' };
  mountConfigSection({
    collection: 'snakeAchievements',
    addFormElId: 'snakeAchievementsAddForm', addBtnId: 'snakeAchievementsAddBtn', listElId: 'snakeAchievementsList',
    seed: (window.DEFAULTS && DEFAULTS.snakeAchievements) || [],
    emptyText: 'Пока нет достижений.',
    fields: [
      { key:'emoji', label:'Эмодзи', type:'text', default:'🏆' },
      { key:'title', label:'Название', type:'text', default:'' },
      { key:'desc',  label:'Описание', type:'textarea', default:'' },
      { key:'type',  label:'Тип условия', type:'select', default:'caught', options: [
        ['caught','Банок поймано всего'], ['games','Игр сыграно'], ['bestEasy','Рекорд на лёгком уровне'],
        ['bestMedium','Рекорд на среднем уровне'], ['bestHard','Рекорд на сложном уровне'], ['bestOnline','Рекорд в онлайне']
      ]},
      { key:'target', label:'Нужное значение', type:'number', default:1 }
    ],
    summary(item){
      return { title: `${item.emoji || ''} ${item.title || ''}`, sub: `${item.desc || ''} · условие: ${item.target} (${snakeAchTypeLabels[item.type] || item.type})` };
    }
  });

  /* ---- уровни змейки-классики (отдельная игра, отдельная коллекция) ---- */
  mountConfigSection({
    collection: 'snakeClassicLevels',
    addFormElId: 'snakeClassicLevelsAddForm', addBtnId: 'snakeClassicLevelsAddBtn', listElId: 'snakeClassicLevelsList',
    seed: (window.DEFAULTS && DEFAULTS.snakeClassicLevels) || [],
    emptyText: 'Пока нет уровней.',
    fields: [
      { key:'emoji', label:'Эмодзи', type:'text', default:'🥄' },
      { key:'name',  label:'Название', type:'text', default:'' },
      { key:'min',   label:'От (банок поймано)', type:'number', default:0 },
      { key:'max',   label:'До (банок поймано)', type:'number', default:10 }
    ],
    summary(item){ return { title: `${item.emoji || ''} ${item.name || ''}`, sub: `${item.min}–${item.max} банок поймано` }; }
  });

  /* ---- достижения змейки-классики ---- */
  const snakeClassicAchTypeLabels = { caught:'банок поймано всего', games:'игр сыграно', bestEasy:'рекорд (лёгкий)', bestHard:'рекорд (сложный)' };
  mountConfigSection({
    collection: 'snakeClassicAchievements',
    addFormElId: 'snakeClassicAchievementsAddForm', addBtnId: 'snakeClassicAchievementsAddBtn', listElId: 'snakeClassicAchievementsList',
    seed: (window.DEFAULTS && DEFAULTS.snakeClassicAchievements) || [],
    emptyText: 'Пока нет достижений.',
    fields: [
      { key:'emoji', label:'Эмодзи', type:'text', default:'🏆' },
      { key:'title', label:'Название', type:'text', default:'' },
      { key:'desc',  label:'Описание', type:'textarea', default:'' },
      { key:'type',  label:'Тип условия', type:'select', default:'caught', options: [
        ['caught','Банок поймано всего'], ['games','Игр сыграно'], ['bestEasy','Рекорд на лёгком уровне'],
        ['bestHard','Рекорд на сложном уровне']
      ]},
      { key:'target', label:'Нужное значение', type:'number', default:1 }
    ],
    summary(item){
      return { title: `${item.emoji || ''} ${item.title || ''}`, sub: `${item.desc || ''} · условие: ${item.target} (${snakeClassicAchTypeLabels[item.type] || item.type})` };
    }
  });

  /* ---- уровни Doodle-прыжков ---- */
  mountConfigSection({
    collection: 'doodleLevels',
    addFormElId: 'doodleLevelsAddForm', addBtnId: 'doodleLevelsAddBtn', listElId: 'doodleLevelsList',
    seed: (window.DEFAULTS && DEFAULTS.doodleLevels) || [],
    emptyText: 'Пока нет уровней.',
    fields: [
      { key:'emoji', label:'Эмодзи', type:'text', default:'🥄' },
      { key:'name',  label:'Название', type:'text', default:'' },
      { key:'min',   label:'От (высоты всего)', type:'number', default:0 },
      { key:'max',   label:'До (высоты всего)', type:'number', default:200 }
    ],
    summary(item){ return { title: `${item.emoji || ''} ${item.name || ''}`, sub: `${item.min}–${item.max} очков высоты всего` }; }
  });

  /* ---- достижения Doodle-прыжков ---- */
  const doodleAchTypeLabels = { bestScore:'рекорд за одну игру', totalScore:'высота всего', games:'игр сыграно', springs:'прыжков на пружине' };
  mountConfigSection({
    collection: 'doodleAchievements',
    addFormElId: 'doodleAchievementsAddForm', addBtnId: 'doodleAchievementsAddBtn', listElId: 'doodleAchievementsList',
    seed: (window.DEFAULTS && DEFAULTS.doodleAchievements) || [],
    emptyText: 'Пока нет достижений.',
    fields: [
      { key:'emoji', label:'Эмодзи', type:'text', default:'🏆' },
      { key:'title', label:'Название', type:'text', default:'' },
      { key:'desc',  label:'Описание', type:'textarea', default:'' },
      { key:'type',  label:'Тип условия', type:'select', default:'bestScore', options: [
        ['bestScore','Рекорд за одну игру'], ['totalScore','Высота всего (сумма)'], ['games','Игр сыграно'], ['springs','Прыжков на пружине']
      ]},
      { key:'target', label:'Нужное значение', type:'number', default:1 }
    ],
    summary(item){
      return { title: `${item.emoji || ''} ${item.title || ''}`, sub: `${item.desc || ''} · условие: ${item.target} (${doodleAchTypeLabels[item.type] || item.type})` };
    }
  });

  mountDoodlePlayers();

  /* ---- уровни крестиков-ноликов ---- */
  mountConfigSection({
    collection: 'tttLevels',
    addFormElId: 'tttLevelsAddForm', addBtnId: 'tttLevelsAddBtn', listElId: 'tttLevelsList',
    seed: (window.DEFAULTS && DEFAULTS.tttLevels) || [],
    emptyText: 'Пока нет уровней.',
    fields: [
      { key:'emoji', label:'Эмодзи', type:'text', default:'🎯' },
      { key:'name',  label:'Название', type:'text', default:'' },
      { key:'min',   label:'От (побед)', type:'number', default:0 },
      { key:'max',   label:'До (побед)', type:'number', default:10 }
    ],
    summary(item){ return { title: `${item.emoji || ''} ${item.name || ''}`, sub: `${item.min}–${item.max} побед` }; }
  });

  /* ---- достижения крестиков-ноликов ---- */
  const tttAchTypeLabels = { games:'партий сыграно', wins:'побед всего', winsVsBot:'побед над ботом', winsOnline:'побед онлайн', draws:'ничьих', streak:'лучшая серия побед' };
  mountConfigSection({
    collection: 'tttAchievements',
    addFormElId: 'tttAchievementsAddForm', addBtnId: 'tttAchievementsAddBtn', listElId: 'tttAchievementsList',
    seed: (window.DEFAULTS && DEFAULTS.tttAchievements) || [],
    emptyText: 'Пока нет достижений.',
    fields: [
      { key:'emoji', label:'Эмодзи', type:'text', default:'🏆' },
      { key:'title', label:'Название', type:'text', default:'' },
      { key:'desc',  label:'Описание', type:'textarea', default:'' },
      { key:'type',  label:'Тип условия', type:'select', default:'wins', options: [
        ['games','Партий сыграно'], ['wins','Побед всего'], ['winsVsBot','Побед над ботом'],
        ['winsOnline','Побед онлайн'], ['draws','Ничьих'], ['streak','Лучшая серия побед']
      ]},
      { key:'target', label:'Нужное значение', type:'number', default:1 }
    ],
    summary(item){
      return { title: `${item.emoji || ''} ${item.title || ''}`, sub: `${item.desc || ''} · условие: ${item.target} (${tttAchTypeLabels[item.type] || item.type})` };
    }
  });

  mountTTTPlayers();
}

/* =========================================================
   КРЕСТИКИ-НОЛИКИ — РЕДАКТИРОВАНИЕ СТАТИСТИКИ ИГРОКОВ
========================================================= */
function mountTTTPlayers(){
  const listEl = document.getElementById('tttPlayersList');
  const searchEl = document.getElementById('tttPlayersSearch');
  if(!listEl || !searchEl) return;

  let allPlayers = [];
  let editingId = null;

  function renderPlayers(){
    if(editingId !== null) return;
    const q = (searchEl.value || '').trim().toLowerCase();
    const filtered = q ? allPlayers.filter(p=> (p.name || '').toLowerCase().includes(q)) : allPlayers;
    listEl.innerHTML = '';
    if(!filtered.length){
      listEl.innerHTML = '<p class="news-empty">Игроков не найдено.</p>';
      return;
    }
    filtered.slice(0, 100).forEach(p=>{
      const card = document.createElement('div');
      card.className = 'admin-list-item';
      card.innerHTML = `
        <div class="row">
          <div class="info">
            <div class="cfg-item-title">${escapeHtml(p.name || 'Без имени')}</div>
            <div class="cfg-item-sub">Побед: ${p.wins || 0} · Поражений: ${p.losses || 0} · Ничьих: ${p.draws || 0} · Партий: ${p.gamesPlayed || 0} · Серия: ${p.streak || 0}</div>
          </div>
          <div class="actions">
            <button class="mini-btn view-btn" data-edittp="1">✏️ Изменить</button>
          </div>
        </div>
        <div class="cfg-form hidden" data-edittpform="1"></div>
      `;
      listEl.appendChild(card);

      card.querySelector('[data-edittp]').addEventListener('click', ()=>{
        const formEl = card.querySelector('[data-edittpform]');
        if(!formEl.classList.contains('hidden')){
          formEl.classList.add('hidden');
          editingId = null;
          renderPlayers();
          return;
        }
        editingId = p.id;
        const prefix = 'tp_' + p.id;
        formEl.innerHTML = `
          <label class="cfg-field wide">Никнейм<input type="text" id="${prefix}_name" value="${escapeHtml(p.name || '')}" maxlength="16"></label>
          <label class="cfg-field">Побед<input type="number" id="${prefix}_wins" value="${p.wins || 0}"></label>
          <label class="cfg-field">Поражений<input type="number" id="${prefix}_losses" value="${p.losses || 0}"></label>
          <label class="cfg-field">Ничьих<input type="number" id="${prefix}_draws" value="${p.draws || 0}"></label>
          <label class="cfg-field">Партий сыграно<input type="number" id="${prefix}_games" value="${p.gamesPlayed || 0}"></label>
          <label class="cfg-field">Побед над ботом<input type="number" id="${prefix}_bot" value="${p.winsVsBot || 0}"></label>
          <label class="cfg-field">Побед онлайн<input type="number" id="${prefix}_online" value="${p.winsOnline || 0}"></label>
          <label class="cfg-field">Текущая серия побед<input type="number" id="${prefix}_streak" value="${p.streak || 0}"></label>
          <label class="cfg-field">Лучшая серия побед<input type="number" id="${prefix}_beststreak" value="${p.bestStreak || 0}"></label>
          <div class="cfg-form-actions">
            <button class="mini-btn save-btn" type="button" data-savetp="1">💾 Сохранить</button>
          </div>
        `;
        formEl.classList.remove('hidden');
        formEl.querySelector('[data-savetp]').addEventListener('click', ()=>{
          const nick = (document.getElementById(prefix + '_name').value || '').trim().slice(0, 16) || p.name;
          const wins = parseInt(document.getElementById(prefix + '_wins').value, 10) || 0;
          DB.setItem('tttPlayers', p.id, {
            name: nick,
            wins,
            losses: parseInt(document.getElementById(prefix + '_losses').value, 10) || 0,
            draws: parseInt(document.getElementById(prefix + '_draws').value, 10) || 0,
            gamesPlayed: parseInt(document.getElementById(prefix + '_games').value, 10) || 0,
            winsVsBot: parseInt(document.getElementById(prefix + '_bot').value, 10) || 0,
            winsOnline: parseInt(document.getElementById(prefix + '_online').value, 10) || 0,
            streak: parseInt(document.getElementById(prefix + '_streak').value, 10) || 0,
            bestStreak: parseInt(document.getElementById(prefix + '_beststreak').value, 10) || 0
          });
          // держим таблицу рекордов (по победам) в согласии с ручной правкой
          // (запись рекорда хранится под своим ID, а не ID игрока — ищем по playerId)
          const rec = currentTTTRecordsList.find(r=> r.playerId === p.id);
          if(rec) DB.updateRecordIn('tttRecords', rec.id, { name: nick, score: wins });
          formEl.classList.add('hidden');
          editingId = null;
          renderPlayers();
        });
      });
    });
  }

  DB.watchCollection('tttPlayers', list=>{
    allPlayers = list.slice().sort((a,b)=> (b.wins || 0) - (a.wins || 0));
    renderPlayers();
  });
  searchEl.addEventListener('input', renderPlayers);
}

/* =========================================================
   DOODLE-ПРЫЖКИ — РЕДАКТИРОВАНИЕ СТАТИСТИКИ ИГРОКОВ
========================================================= */
function mountDoodlePlayers(){
  const listEl = document.getElementById('doodlePlayersList');
  const searchEl = document.getElementById('doodlePlayersSearch');
  if(!listEl || !searchEl) return;

  let allPlayers = [];
  let editingId = null;

  function renderPlayers(){
    if(editingId !== null) return;
    const q = (searchEl.value || '').trim().toLowerCase();
    const filtered = q ? allPlayers.filter(p=> (p.name || '').toLowerCase().includes(q)) : allPlayers;
    listEl.innerHTML = '';
    if(!filtered.length){
      listEl.innerHTML = '<p class="news-empty">Игроков не найдено.</p>';
      return;
    }
    filtered.slice(0, 100).forEach(p=>{
      const card = document.createElement('div');
      card.className = 'admin-list-item';
      card.innerHTML = `
        <div class="row">
          <div class="info">
            <div class="cfg-item-title">${escapeHtml(p.name || 'Без имени')}</div>
            <div class="cfg-item-sub">Рекорд: ${Math.floor(p.bestScore || 0)} · Высота всего: ${Math.floor(p.totalScore || 0)} · Игр: ${p.gamesPlayed || 0} · Пружин: ${p.springsUsed || 0}</div>
          </div>
          <div class="actions">
            <button class="mini-btn view-btn" data-editdp="1">✏️ Изменить</button>
          </div>
        </div>
        <div class="cfg-form hidden" data-editdpform="1"></div>
      `;
      listEl.appendChild(card);

      card.querySelector('[data-editdp]').addEventListener('click', ()=>{
        const formEl = card.querySelector('[data-editdpform]');
        if(!formEl.classList.contains('hidden')){
          formEl.classList.add('hidden');
          editingId = null;
          renderPlayers();
          return;
        }
        editingId = p.id;
        const prefix = 'dp_' + p.id;
        formEl.innerHTML = `
          <label class="cfg-field wide">Никнейм<input type="text" id="${prefix}_name" value="${escapeHtml(p.name || '')}" maxlength="16"></label>
          <label class="cfg-field">Рекорд (за игру)<input type="number" id="${prefix}_best" value="${Math.floor(p.bestScore || 0)}"></label>
          <label class="cfg-field">Высота всего<input type="number" id="${prefix}_total" value="${Math.floor(p.totalScore || 0)}"></label>
          <label class="cfg-field">Игр сыграно<input type="number" id="${prefix}_games" value="${p.gamesPlayed || 0}"></label>
          <label class="cfg-field">Прыжков на пружине<input type="number" id="${prefix}_springs" value="${p.springsUsed || 0}"></label>
          <div class="cfg-form-actions">
            <button class="mini-btn save-btn" type="button" data-savedp="1">💾 Сохранить</button>
          </div>
        `;
        formEl.classList.remove('hidden');
        formEl.querySelector('[data-savedp]').addEventListener('click', ()=>{
          const nick = (document.getElementById(prefix + '_name').value || '').trim().slice(0, 16) || p.name;
          DB.setItem('doodlePlayers', p.id, {
            name: nick,
            bestScore: parseFloat(document.getElementById(prefix + '_best').value) || 0,
            totalScore: parseFloat(document.getElementById(prefix + '_total').value) || 0,
            gamesPlayed: parseInt(document.getElementById(prefix + '_games').value, 10) || 0,
            springsUsed: parseInt(document.getElementById(prefix + '_springs').value, 10) || 0
          });
          formEl.classList.add('hidden');
          editingId = null;
          renderPlayers();
        });
      });
    });
  }

  DB.watchCollection('doodlePlayers', list=>{
    allPlayers = list.slice().sort((a,b)=> (b.bestScore || 0) - (a.bestScore || 0));
    renderPlayers();
  });
  searchEl.addEventListener('input', renderPlayers);
}

/* =========================================================
   КЛИКЕР — РЕДАКТИРОВАНИЕ БАЛАНСОВ ИГРОКОВ
========================================================= */
function mountClickerPlayers(){
  const listEl = document.getElementById('clickerPlayersList');
  const searchEl = document.getElementById('clickerPlayersSearch');
  if(!listEl || !searchEl) return;

  let allPlayers = [];
  // пока открыта форма редактирования конкретного игрока — не
  // перестраиваем список. Баланс игроков меняется в реальном
  // времени (автоклик, клики) у ЛЮБОГО активного игрока на сайте,
  // так что без этой защиты открытая форма редактирования могла
  // закрыться сама собой в любой момент, не дав ничего сохранить.
  let editingId = null;

  function renderPlayers(){
    if(editingId !== null) return;
    const q = (searchEl.value || '').trim().toLowerCase();
    const filtered = q ? allPlayers.filter(p=> (p.name || '').toLowerCase().includes(q)) : allPlayers;
    listEl.innerHTML = '';
    if(!filtered.length){
      listEl.innerHTML = '<p class="news-empty">Игроков не найдено.</p>';
      return;
    }
    filtered.slice(0, 100).forEach(p=>{
      const card = document.createElement('div');
      card.className = 'admin-list-item';
      card.innerHTML = `
        <div class="row">
          <div class="info">
            <div class="cfg-item-title">${escapeHtml(p.name || 'Без имени')}</div>
            <div class="cfg-item-sub">Баланс: ${Math.floor(p.balance || 0)} · Заработано всего: ${Math.floor(p.totalEarned || 0)} · Кликов: ${p.totalClicks || 0}</div>
          </div>
          <div class="actions">
            <button class="mini-btn view-btn" data-editp="1">✏️ Изменить</button>
          </div>
        </div>
        <div class="cfg-form hidden" data-editpform="1"></div>
      `;
      listEl.appendChild(card);

      card.querySelector('[data-editp]').addEventListener('click', ()=>{
        const formEl = card.querySelector('[data-editpform]');
        if(!formEl.classList.contains('hidden')){
          formEl.classList.add('hidden');
          editingId = null;
          renderPlayers(); // подхватываем всё, что накопилось, пока форма была открыта
          return;
        }
        editingId = p.id;
        const prefix = 'cp_' + p.id;
        formEl.innerHTML = `
          <label class="cfg-field wide">Никнейм<input type="text" id="${prefix}_name" value="${escapeHtml(p.name || '')}" maxlength="16"></label>
          <label class="cfg-field">Баланс<input type="number" id="${prefix}_bal" value="${Math.floor(p.balance || 0)}"></label>
          <label class="cfg-field">Всего заработано<input type="number" id="${prefix}_earn" value="${Math.floor(p.totalEarned || 0)}"></label>
          <label class="cfg-field">Кликов всего<input type="number" id="${prefix}_clicks" value="${p.totalClicks || 0}"></label>
          <div class="cfg-form-actions">
            <button class="mini-btn save-btn" type="button" data-savep="1">💾 Сохранить</button>
          </div>
        `;
        formEl.classList.remove('hidden');
        formEl.querySelector('[data-savep]').addEventListener('click', ()=>{
          const nick = (document.getElementById(prefix + '_name').value || '').trim().slice(0, 16) || p.name;
          DB.setItem('clickerPlayers', p.id, {
            name: nick,
            balance: parseFloat(document.getElementById(prefix + '_bal').value) || 0,
            totalEarned: parseFloat(document.getElementById(prefix + '_earn').value) || 0,
            totalClicks: parseInt(document.getElementById(prefix + '_clicks').value, 10) || 0
          });
          formEl.classList.add('hidden');
          editingId = null;
          renderPlayers();
        });
      });
    });
  }

  DB.watchCollection('clickerPlayers', list=>{
    allPlayers = list.slice().sort((a,b)=> (b.balance || 0) - (a.balance || 0));
    renderPlayers();
  });
  searchEl.addEventListener('input', renderPlayers);
}

/* =========================================================
   ВКЛАДКИ ПО ИГРАМ
========================================================= */
function mountTabs(){
  const tabs = document.querySelectorAll('.admin-tab');
  const panels = document.querySelectorAll('.admin-tab-panel');
  tabs.forEach(tab=>{
    tab.addEventListener('click', ()=>{
      tabs.forEach(t=> t.classList.remove('active'));
      tab.classList.add('active');
      panels.forEach(p=>{
        p.classList.toggle('hidden', p.dataset.panel !== tab.dataset.tab);
      });
    });
  });
}

/* =========================================================
   ДИАГНОСТИКА ПОДКЛЮЧЕНИЯ — проверяет доступ на чтение/запись
   к каждому новому разделу (уровни, достижения, кликер и т.п.),
   чтобы сразу было видно, если что-то не работает из-за правил Firebase.
========================================================= */
const DIAG_COLLECTIONS = [
  { name: 'levels',              label: 'Уровни игрока' },
  { name: 'achievements',        label: 'Достижения' },
  { name: 'events',              label: 'Случайные события' },
  { name: 'profiles',            label: 'Профили игроков' },
  { name: 'clickerLevels',       label: 'Кликер: уровни' },
  { name: 'clickerAchievements', label: 'Кликер: достижения' },
  { name: 'clickerUpgrades',     label: 'Кликер: прокачки' },
  { name: 'clickerPlayers',      label: 'Кликер: балансы игроков' },
  { name: 'snakeLevels',         label: 'Змейка.io: уровни' },
  { name: 'snakeAchievements',   label: 'Змейка.io: достижения' },
  { name: 'snakePlayers',        label: 'Змейка.io: профили игроков' },
  { name: 'snakeRecordsEasy',    label: 'Змейка.io: рекорды (лёгкий)' },
  { name: 'snakeRecordsMedium',  label: 'Змейка.io: рекорды (средний)' },
  { name: 'snakeRecordsHard',    label: 'Змейка.io: рекорды (сложный)' },
  { name: 'snakeRecordsOnline',  label: 'Змейка.io: рекорды (онлайн)' },
  { name: 'snakeRooms',          label: 'Змейка.io: онлайн-комнаты' },
  { name: 'snakeOnlinePlayers',  label: 'Змейка.io: онлайн-игроки' },
  { name: 'snakeClassicLevels',        label: 'Змейка-классика: уровни' },
  { name: 'snakeClassicAchievements',  label: 'Змейка-классика: достижения' },
  { name: 'snakeClassicPlayers',       label: 'Змейка-классика: профили игроков' },
  { name: 'snakeClassicRecordsEasy',   label: 'Змейка-классика: рекорды (лёгкий)' },
  { name: 'snakeClassicRecordsHard',   label: 'Змейка-классика: рекорды (сложный)' },
  { name: 'doodleLevels',        label: 'Doodle-прыжки: уровни' },
  { name: 'doodleAchievements',  label: 'Doodle-прыжки: достижения' },
  { name: 'doodlePlayers',       label: 'Doodle-прыжки: профили игроков' },
  { name: 'doodleRecords',       label: 'Doodle-прыжки: рекорды' },
  { name: 'tttLevels',           label: 'Крестики-нолики: уровни' },
  { name: 'tttAchievements',     label: 'Крестики-нолики: достижения' },
  { name: 'tttPlayers',          label: 'Крестики-нолики: профили игроков' },
  { name: 'tttRecords',          label: 'Крестики-нолики: рекорды' },
  { name: 'tttLobby',            label: 'Крестики-нолики: очередь онлайн-игры' },
  { name: 'tttGames',            label: 'Крестики-нолики: активные онлайн-партии' }
];

async function runDiagnostics(){
  const listEl = document.getElementById('diagList');
  const hintEl = document.getElementById('diagRulesHint');
  if(!listEl) return;
  listEl.innerHTML = DIAG_COLLECTIONS.map(c=>
    `<div class="diag-item" id="diag_${c.name}"><span class="diag-dot"></span><span class="diag-name">${escapeHtml(c.label)}</span></div>`
  ).join('');

  let anyFail = false;

  for(const c of DIAG_COLLECTIONS){
    const el = document.getElementById('diag_' + c.name);
    try{
      // читаем — если правила запрещают путь, промис отклонится (permission_denied)
      await DB.listOnce(c.name);
      // пробуем записать тестовое значение и сразу удалить
      if(DB.cloud){
        await DB.rtdb.ref(c.name + '/_diag_test').set({ ts: Date.now() });
        await DB.rtdb.ref(c.name + '/_diag_test').remove();
      }
      el.classList.add('ok');
      el.innerHTML += '<span class="diag-msg" style="color:#2C7A3D;">ок</span>';
    }catch(err){
      anyFail = true;
      el.classList.add('fail');
      el.innerHTML += `<span class="diag-msg">${escapeHtml((err && err.message) || 'нет доступа')}</span>`;
    }
  }

  if(anyFail && hintEl){
    hintEl.classList.remove('hidden');
    hintEl.textContent =
`Похоже, правила Firebase Realtime Database запрещают доступ к новым разделам.
Открой Firebase Console → Realtime Database → Rules и убедись, что новые
пути разрешены так же, как "records" и "news", например:

{
  "rules": {
    ".read": true,
    ".write": true
  }
}

(или добавь по одному блоку ${"{"} ".read": true, ".write": true ${"}"}
для каждого раздела: levels, achievements, events, profiles,
clickerLevels, clickerAchievements, clickerUpgrades, clickerPlayers,
snakeLevels, snakeAchievements, snakePlayers, snakeRecordsEasy,
snakeRecordsMedium, snakeRecordsHard, snakeRecordsOnline, snakeRooms,
snakeOnlinePlayers, snakeClassicLevels, snakeClassicAchievements,
snakeClassicPlayers, snakeClassicRecordsEasy, snakeClassicRecordsHard,
doodleLevels, doodleAchievements, doodlePlayers,
doodleRecords — по аналогии с тем, как уже разрешены records и news).`;
  } else if(hintEl){
    hintEl.classList.add('hidden');
  }
}

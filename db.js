/* =========================================================
   DB — единый слой доступа к данным.
   Если в firebase-config.js вставлены настоящие ключи —
   рекорды и новости хранятся в облаке (Firebase Realtime
   Database) и видны всем игрокам на любом устройстве.
   Если ключи не вставлены — всё работает локально
   (localStorage), а изменения из админки на этом же
   устройстве применяются сразу же (через локальную
   "рассылку" изменений), чтобы сайт не ломался без
   настройки облака.
========================================================= */
const DB = {
  cloud: false,
  rtdb: null,
  _listeners: { records: new Set(), news: new Set() },

  init(){
    const cfg = window.FIREBASE_CONFIG;
    const looksConfigured = cfg && cfg.apiKey && cfg.databaseURL && !String(cfg.apiKey).includes('ВСТАВЬ');
    if(looksConfigured && window.firebase){
      try{
        firebase.initializeApp(cfg);
        this.rtdb = firebase.database();
        this.cloud = true;
      }catch(e){
        console.warn('Firebase не настроен, использую локальное хранилище', e);
      }
    }
    if(!this.cloud){
      // если админка открыта в другой вкладке того же браузера — подхватываем изменения
      window.addEventListener('storage', (e)=>{
        if(!e.key) return;
        if(e.key === 'gd_records') this._notify('records');
        else if(e.key === 'gd_news') this._notify('news');
        else if(e.key.startsWith('gd_col_')) this._notifyCollection(e.key.slice('gd_col_'.length));
        else if(e.key.startsWith('gd_rec_')) this._notifyRecordsIn(e.key.slice('gd_rec_'.length));
      });
    }
  },

  /* ---------- локальное хранилище (запасной вариант) ---------- */
  _genId(){
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  },
  _localGet(key, fallback){
    try{ const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch(e){ return fallback; }
  },
  _localSet(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){}
  },
  _notify(type){
    if(this.cloud) return;
    if(type === 'records'){
      const list = this._localGet('gd_records', []).sort((a,b)=> b.score - a.score);
      this._listeners.records.forEach(cb=> cb(list));
    } else {
      const list = this._localGet('gd_news', []).sort((a,b)=> b.ts - a.ts);
      this._listeners.news.forEach(cb=> cb(list));
    }
  },
  /* превращает объект snap.val() (ключ -> запись) в массив [{id, ...}] */
  _snapToList(val){
    if(!val) return [];
    return Object.keys(val).map(id => ({ id, ...val[id] }));
  },

  /* ================= РЕКОРДЫ ================= */
  // callback(records[]) вызывается сразу и повторно при любом изменении
  watchRecords(callback){
    if(this.cloud){
      const ref = this.rtdb.ref('records');
      const listener = ref.on('value', snap=>{
        const list = this._snapToList(snap.val()).sort((a,b)=> b.score - a.score).slice(0, 50);
        callback(list);
      }, err=>{ console.warn('records read error', err); callback([]); });
      return ()=> ref.off('value', listener);
    } else {
      this._listeners.records.add(callback);
      const list = this._localGet('gd_records', []).sort((a,b)=> b.score - a.score);
      callback(list);
      return ()=> this._listeners.records.delete(callback);
    }
  },

  // Один игрок (playerId, закреплён за устройством) — одна запись в таблице рекордов.
  // Если запись уже есть: обновляем счёт/дату, только если новый счёт лучше,
  // и НЕ трогаем имя (чтобы правка ника в админке не затиралась следующей игрой).
  // Если записи ещё нет — создаём её с текущим ником игрока.
  addRecord(playerId, name, score){
    const date = new Date().toLocaleDateString('ru-RU');
    if(this.cloud){
      const ref = this.rtdb.ref('records');
      ref.orderByChild('playerId').equalTo(playerId).once('value').then(snap=>{
        if(snap.exists()){
          let key = null, cur = null;
          snap.forEach(child=>{ key = child.key; cur = child.val(); return true; });
          if(key && score > (cur.score || 0)){
            this.rtdb.ref('records/' + key).update({ score, date, ts: Date.now() }).catch(err=> console.warn(err));
          }
        } else {
          // записи с таким playerId нет (например, у игрока сбросился
          // локальный ID) — прежде чем создавать новую запись, ищем
          // существующий рекорд с ТЕМ ЖЕ ником и обновляем его, чтобы
          // не плодить дубли одного и того же игрока в таблице
          ref.orderByChild('name').equalTo(name).once('value').then(snap2=>{
            if(snap2.exists()){
              let key2 = null, cur2 = null;
              snap2.forEach(child=>{ key2 = child.key; cur2 = child.val(); return true; });
              if(key2){
                const updates = { playerId, date, ts: Date.now() };
                if(score > (cur2.score || 0)) updates.score = score;
                this.rtdb.ref('records/' + key2).update(updates).catch(err=> console.warn(err));
                return;
              }
            }
            ref.push({ playerId, name, score, date, ts: Date.now() }).catch(err=> console.warn(err));
          }).catch(err=> console.warn('addRecord name lookup error', err));
        }
      }).catch(err=> console.warn('addRecord lookup error', err));
    } else {
      const list = this._localGet('gd_records', []);
      let idx = list.findIndex(r => r.playerId === playerId);
      if(idx === -1){
        idx = list.findIndex(r => (r.name || '').trim().toLowerCase() === (name || '').trim().toLowerCase());
      }
      if(idx > -1){
        list[idx].playerId = playerId;
        if(score > list[idx].score){
          list[idx].score = score;
          list[idx].date = date;
          list[idx].ts = Date.now();
        }
      } else {
        list.push({ id: this._genId(), playerId, name, score, date, ts: Date.now() });
      }
      this._localSet('gd_records', list.slice(0, 200));
      this._notify('records');
    }
  },
  deleteRecord(id){
    if(this.cloud){
      this.rtdb.ref('records/' + id).remove().catch(err=> console.warn(err));
    } else {
      const list = this._localGet('gd_records', []).filter(r => String(r.id) !== String(id));
      this._localSet('gd_records', list);
      this._notify('records');
    }
  },
  clearAllRecords(list){
    if(this.cloud){
      const updates = {};
      list.forEach(r => updates[r.id] = null);
      this.rtdb.ref('records').update(updates).catch(err=> console.warn(err));
    } else {
      this._localSet('gd_records', []);
      this._notify('records');
    }
  },
  // переименовать игрока в таблице рекордов (только из админ-панели)
  updateRecordName(id, name){
    if(this.cloud){
      this.rtdb.ref('records/' + id).update({ name }).catch(err=> console.warn(err));
    } else {
      const list = this._localGet('gd_records', []);
      const item = list.find(r => String(r.id) === String(id));
      if(item){ item.name = name; this._localSet('gd_records', list); this._notify('records'); }
    }
  },
  // изменить произвольные поля записи рекорда (ник и/или очки) — из админки
  updateRecord(id, patch){
    if(this.cloud){
      this.rtdb.ref('records/' + id).update(patch).catch(err=> console.warn(err));
    } else {
      const list = this._localGet('gd_records', []);
      const item = list.find(r => String(r.id) === String(id));
      if(item){ Object.assign(item, patch); this._localSet('gd_records', list); this._notify('records'); }
    }
  },

  /* =========================================================
     РЕКОРДЫ (ОБОБЩЁННАЯ ВЕРСИЯ) — то же самое, что addRecord/
     watchRecords/deleteRecord/clearAllRecords/updateRecordName
     выше, но с произвольным именем коллекции. Используется для
     отдельных таблиц рекордов других игр (например, змейка —
     свои таблицы для лёгкого и сложного уровня). Функции выше
     (для основной игры "Лови сгущёнку") НЕ трогаем и не переводим
     на этот код, чтобы не рисковать уже рабочей логикой и не
     потерять уже сохранённые локально записи под старыми ключами.
  ========================================================= */
  _recListeners: {},
  _recLocalKey(name){ return 'gd_rec_' + name; },

  watchRecordsIn(name, callback){
    if(this.cloud){
      const ref = this.rtdb.ref(name);
      const listener = ref.on('value', snap=>{
        const list = this._snapToList(snap.val()).sort((a,b)=> b.score - a.score).slice(0, 50);
        callback(list);
      }, err=>{ console.warn(name + ' read error', err); callback([]); });
      return ()=> ref.off('value', listener);
    } else {
      if(!this._recListeners[name]) this._recListeners[name] = new Set();
      this._recListeners[name].add(callback);
      const list = this._localGet(this._recLocalKey(name), []).sort((a,b)=> b.score - a.score);
      callback(list);
      return ()=> this._recListeners[name] && this._recListeners[name].delete(callback);
    }
  },
  _notifyRecordsIn(name){
    if(this.cloud) return;
    const list = this._localGet(this._recLocalKey(name), []).sort((a,b)=> b.score - a.score);
    (this._recListeners[name] || []).forEach(cb=> cb(list));
  },
  addRecordIn(name, playerId, playerName, score){
    const date = new Date().toLocaleDateString('ru-RU');
    if(this.cloud){
      const ref = this.rtdb.ref(name);
      ref.orderByChild('playerId').equalTo(playerId).once('value').then(snap=>{
        if(snap.exists()){
          let key = null, cur = null;
          snap.forEach(child=>{ key = child.key; cur = child.val(); return true; });
          if(key && score > (cur.score || 0)){
            this.rtdb.ref(name + '/' + key).update({ score, date, ts: Date.now() }).catch(err=> console.warn(err));
          }
        } else {
          ref.orderByChild('name').equalTo(playerName).once('value').then(snap2=>{
            if(snap2.exists()){
              let key2 = null, cur2 = null;
              snap2.forEach(child=>{ key2 = child.key; cur2 = child.val(); return true; });
              if(key2){
                const updates = { playerId, date, ts: Date.now() };
                if(score > (cur2.score || 0)) updates.score = score;
                this.rtdb.ref(name + '/' + key2).update(updates).catch(err=> console.warn(err));
                return;
              }
            }
            ref.push({ playerId, name: playerName, score, date, ts: Date.now() }).catch(err=> console.warn(err));
          }).catch(err=> console.warn('addRecordIn name lookup error', err));
        }
      }).catch(err=> console.warn('addRecordIn lookup error', err));
    } else {
      const list = this._localGet(this._recLocalKey(name), []);
      let idx = list.findIndex(r => r.playerId === playerId);
      if(idx === -1){
        idx = list.findIndex(r => (r.name || '').trim().toLowerCase() === (playerName || '').trim().toLowerCase());
      }
      if(idx > -1){
        list[idx].playerId = playerId;
        if(score > list[idx].score){
          list[idx].score = score;
          list[idx].date = date;
          list[idx].ts = Date.now();
        }
      } else {
        list.push({ id: this._genId(), playerId, name: playerName, score, date, ts: Date.now() });
      }
      this._localSet(this._recLocalKey(name), list.slice(0, 200));
      this._notifyRecordsIn(name);
    }
  },
  deleteRecordIn(name, id){
    if(this.cloud){
      this.rtdb.ref(name + '/' + id).remove().catch(err=> console.warn(err));
    } else {
      const list = this._localGet(this._recLocalKey(name), []).filter(r => String(r.id) !== String(id));
      this._localSet(this._recLocalKey(name), list);
      this._notifyRecordsIn(name);
    }
  },
  clearRecordsIn(name, list){
    if(this.cloud){
      const updates = {};
      list.forEach(r => updates[r.id] = null);
      this.rtdb.ref(name).update(updates).catch(err=> console.warn(err));
    } else {
      this._localSet(this._recLocalKey(name), []);
      this._notifyRecordsIn(name);
    }
  },
  updateRecordNameIn(name, id, newName){
    if(this.cloud){
      this.rtdb.ref(name + '/' + id).update({ name: newName }).catch(err=> console.warn(err));
    } else {
      const list = this._localGet(this._recLocalKey(name), []);
      const item = list.find(r => String(r.id) === String(id));
      if(item){ item.name = newName; this._localSet(this._recLocalKey(name), list); this._notifyRecordsIn(name); }
    }
  },
  // изменить произвольные поля записи (ник и/или очки) в обобщённой таблице — из админки
  updateRecordIn(name, id, patch){
    if(this.cloud){
      this.rtdb.ref(name + '/' + id).update(patch).catch(err=> console.warn(err));
    } else {
      const list = this._localGet(this._recLocalKey(name), []);
      const item = list.find(r => String(r.id) === String(id));
      if(item){ Object.assign(item, patch); this._localSet(this._recLocalKey(name), list); this._notifyRecordsIn(name); }
    }
  },

  /* ================= НОВОСТИ ================= */
  // всегда сортируются от новых к старым (ts desc)
  watchNews(callback){
    if(this.cloud){
      const ref = this.rtdb.ref('news');
      const listener = ref.on('value', snap=>{
        const list = this._snapToList(snap.val()).sort((a,b)=> (b.ts||0) - (a.ts||0)).slice(0, 50);
        callback(list);
      }, err=>{ console.warn('news read error', err); callback([]); });
      return ()=> ref.off('value', listener);
    } else {
      this._listeners.news.add(callback);
      const list = this._localGet('gd_news', []).sort((a,b)=> b.ts - a.ts);
      callback(list);
      return ()=> this._listeners.news.delete(callback);
    }
  },
  addNews(title, text){
    const entry = {
      title, text,
      date: new Date().toLocaleDateString('ru-RU'),
      ts: Date.now(),
      likes: 0, dislikes: 0, sgushenka: 0
    };
    if(this.cloud){
      this.rtdb.ref('news').push(entry).catch(err=> console.warn('addNews error', err));
    } else {
      entry.id = this._genId();
      const list = this._localGet('gd_news', []);
      list.push(entry);
      this._localSet('gd_news', list);
      this._notify('news');
    }
  },
  deleteNews(id){
    if(this.cloud){
      this.rtdb.ref('news/' + id).remove().catch(err=> console.warn(err));
    } else {
      const list = this._localGet('gd_news', []).filter(n => String(n.id) !== String(id));
      this._localSet('gd_news', list);
      this._notify('news');
    }
  },
  // ставит реакцию addField (если задана) и одновременно снимает removeField
  // (если игрок до этого голосовал за другой вариант). Любой из параметров можно
  // передать как null: changeReaction(id, null, 'likes') — просто снять лайк;
  // changeReaction(id, 'dislikes', null) — поставить дизлайк, ничего не снимая.
  changeReaction(id, addField, removeField){
    if(this.cloud){
      const updates = {};
      if(addField) updates['news/' + id + '/' + addField] = firebase.database.ServerValue.increment(1);
      if(removeField) updates['news/' + id + '/' + removeField] = firebase.database.ServerValue.increment(-1);
      if(Object.keys(updates).length){
        this.rtdb.ref().update(updates).catch(err=> console.warn(err));
      }
    } else {
      const list = this._localGet('gd_news', []);
      const item = list.find(n => String(n.id) === String(id));
      if(item){
        if(addField) item[addField] = (item[addField] || 0) + 1;
        if(removeField) item[removeField] = Math.max(0, (item[removeField] || 0) - 1);
        this._localSet('gd_news', list);
        this._notify('news');
      }
    }
  },
  setReactionCounts(id, counts){
    if(this.cloud){
      this.rtdb.ref('news/' + id).update(counts).catch(err=> console.warn(err));
    } else {
      const list = this._localGet('gd_news', []);
      const item = list.find(n => String(n.id) === String(id));
      if(item){ Object.assign(item, counts); this._localSet('gd_news', list); this._notify('news'); }
    }
  },

  /* =========================================================
     ОБЩИЙ (ГЕНЕРИЧНЫЙ) СЛОЙ — используется для уровней,
     достижений, случайных событий, профилей игроков и всего
     кликера. Каждая "коллекция" — это набор записей {id, ...}.
     Локально хранится под ключом gd_col_<name>.
  ========================================================= */
  _genListeners: {},

  watchCollection(name, callback){
    if(this.cloud){
      const ref = this.rtdb.ref(name);
      const listener = ref.on('value', snap=>{
        callback(this._snapToList(snap.val()));
      }, err=>{ console.warn(name + ' read error', err); callback([]); });
      return ()=> ref.off('value', listener);
    } else {
      if(!this._genListeners[name]) this._genListeners[name] = new Set();
      this._genListeners[name].add(callback);
      callback(this._localGet('gd_col_' + name, []));
      return ()=> this._genListeners[name] && this._genListeners[name].delete(callback);
    }
  },
  _notifyCollection(name){
    if(this.cloud) return;
    const list = this._localGet('gd_col_' + name, []);
    (this._genListeners[name] || []).forEach(cb=> cb(list));
  },
  addItem(name, obj){
    if(this.cloud){
      const ref = this.rtdb.ref(name).push();
      ref.set(obj).catch(err=> console.warn(err));
      return ref.key;
    } else {
      const list = this._localGet('gd_col_' + name, []);
      const id = this._genId();
      list.push({ id, ...obj });
      this._localSet('gd_col_' + name, list);
      this._notifyCollection(name);
      return id;
    }
  },
  // создаёт запись с точным id, если её ещё нет (используется для сидирования)
  addItemWithId(name, id, obj){
    if(this.cloud){
      this.rtdb.ref(name + '/' + id).set(obj).catch(err=> console.warn(err));
    } else {
      const list = this._localGet('gd_col_' + name, []);
      if(!list.find(x=> String(x.id) === String(id))){
        list.push({ id, ...obj });
        this._localSet('gd_col_' + name, list);
        this._notifyCollection(name);
      }
    }
  },
  setItem(name, id, patch){
    if(this.cloud){
      this.rtdb.ref(name + '/' + id).update(patch).catch(err=> console.warn(err));
    } else {
      const list = this._localGet('gd_col_' + name, []);
      const item = list.find(x=> String(x.id) === String(id));
      if(item){ Object.assign(item, patch); }
      else { list.push({ id, ...patch }); }
      this._localSet('gd_col_' + name, list);
      this._notifyCollection(name);
    }
  },
  // атомарно прибавляет (или отнимает, если число отрицательное) значения
  // нескольким полям записи — используется для очков, кликов, баланса и т.п.
  incrementItem(name, id, deltas){
    if(this.cloud){
      const updates = {};
      Object.keys(deltas).forEach(f=> updates[name + '/' + id + '/' + f] = firebase.database.ServerValue.increment(deltas[f]));
      this.rtdb.ref().update(updates).catch(err=> console.warn(err));
    } else {
      const list = this._localGet('gd_col_' + name, []);
      let item = list.find(x=> String(x.id) === String(id));
      if(!item){ item = { id }; list.push(item); }
      Object.keys(deltas).forEach(f=> { item[f] = (item[f] || 0) + deltas[f]; });
      this._localSet('gd_col_' + name, list);
      this._notifyCollection(name);
    }
  },
  // атомарно прибавляет значение ВЛОЖЕННОМУ полю, например 'upgradeLevels/up1'
  incrementNested(name, id, path, delta){
    if(this.cloud){
      const updates = {};
      updates[name + '/' + id + '/' + path] = firebase.database.ServerValue.increment(delta);
      this.rtdb.ref().update(updates).catch(err=> console.warn(err));
    } else {
      const list = this._localGet('gd_col_' + name, []);
      let item = list.find(x=> String(x.id) === String(id));
      if(!item){ item = { id }; list.push(item); }
      const parts = path.split('/');
      let obj = item;
      for(let i = 0; i < parts.length - 1; i++){
        if(!obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      const last = parts[parts.length - 1];
      obj[last] = (obj[last] || 0) + delta;
      this._localSet('gd_col_' + name, list);
      this._notifyCollection(name);
    }
  },
  // отмечает достижения как разблокированные (nested unlocked.<achId> = true),
  // работает одинаково в облаке и локально
  markUnlocked(name, id, achIds){
    if(!achIds || !achIds.length) return;
    if(this.cloud){
      const updates = {};
      achIds.forEach(aid=> updates[name + '/' + id + '/unlocked/' + aid] = true);
      this.rtdb.ref().update(updates).catch(err=> console.warn(err));
    } else {
      const list = this._localGet('gd_col_' + name, []);
      let item = list.find(x=> String(x.id) === String(id));
      if(!item){ item = { id, unlocked: {} }; list.push(item); }
      if(!item.unlocked) item.unlocked = {};
      achIds.forEach(aid=> { item.unlocked[aid] = true; });
      this._localSet('gd_col_' + name, list);
      this._notifyCollection(name);
    }
  },
  deleteItem(name, id){
    if(this.cloud){
      this.rtdb.ref(name + '/' + id).remove().catch(err=> console.warn(err));
    } else {
      const list = this._localGet('gd_col_' + name, []).filter(x=> String(x.id) !== String(id));
      this._localSet('gd_col_' + name, list);
      this._notifyCollection(name);
    }
  },
  getItemOnce(name, id){
    if(this.cloud){
      return this.rtdb.ref(name + '/' + id).once('value').then(snap=> snap.val());
    } else {
      const list = this._localGet('gd_col_' + name, []);
      const item = list.find(x=> String(x.id) === String(id));
      return Promise.resolve(item || null);
    }
  },
  watchItem(name, id, callback){
    if(this.cloud){
      const ref = this.rtdb.ref(name + '/' + id);
      const listener = ref.on('value', snap=> callback(snap.val()));
      return ()=> ref.off('value', listener);
    } else {
      const wrapped = (list)=>{
        const item = list.find(x=> String(x.id) === String(id));
        callback(item || null);
      };
      return this.watchCollection(name, wrapped);
    }
  },
  // разовое чтение целой коллекции (без подписки)
  listOnce(name){
    if(this.cloud){
      return this.rtdb.ref(name).once('value').then(snap=> this._snapToList(snap.val()));
    } else {
      return Promise.resolve(this._localGet('gd_col_' + name, []));
    }
  },
  /* каждой коллекции нужно один раз "засеять" данные по умолчанию,
     если она ещё пуста (первый запуск сайта / без облака) */
  seedIfEmpty(name, seedList){
    if(this.cloud){
      this.rtdb.ref(name).once('value').then(snap=>{
        if(!snap.exists()){
          const updates = {};
          seedList.forEach(item=>{
            const { id, ...rest } = item;
            updates[id] = rest;
          });
          this.rtdb.ref(name).update(updates).catch(err=> console.warn(err));
        }
      }).catch(err=> console.warn(err));
    } else {
      const list = this._localGet('gd_col_' + name, null);
      if(!list || list.length === 0){
        this._localSet('gd_col_' + name, seedList);
        this._notifyCollection(name);
      }
    }
  }
};

// делаем DB доступным как window.DB — иначе проверки вида
// `if(window.DB)` в других файлах (script.js, profile.js) всегда
// ложны, потому что `const DB = {...}` на верхнем уровне обычного
// <script> НЕ создаёт свойство window.DB (в отличие от var/function).
window.DB = DB;

DB.init();

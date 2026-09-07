/* =========================================================
   СЛУЧАЙНЫЕ СОБЫТИЯ — иногда при открытии сайта показываем
   всплывающее окно (список редактируется в админке).
========================================================= */
const Events = {
  init(){
    DB.seedIfEmpty('events', DEFAULTS.events);
    setTimeout(()=> this.maybeShow(), 1200);
  },
  maybeShow(){
    DB.listOnce('events').then(list=>{
      const active = list.filter(e=> e.active !== false);
      if(!active.length) return;
      const shuffled = active.slice().sort(()=> Math.random() - 0.5);
      for(const ev of shuffled){
        const chance = typeof ev.chance === 'number' ? ev.chance : 20;
        if(Math.random() * 100 < chance){
          this.show(ev);
          break;
        }
      }
    }).catch(()=>{});
  },
  show(ev){
    // это общее событие сайта/игры "Лови сгущёнку" — не показываем
    // его поверх кликера или змейки, у них свои достижения и своя атмосфера
    if(isScreenVisible('clickerScreen')) return;
    if(isScreenVisible('snakeGameScreen') || isScreenVisible('snakeMenuScreen')) return;
    const modal = document.getElementById('eventModal');
    if(!modal) return;
    document.getElementById('eventEmoji').textContent = ev.emoji || '🥫';
    document.getElementById('eventTitle').textContent = ev.title || 'Событие!';
    document.getElementById('eventText').textContent = ev.text || '';
    modal.classList.remove('hidden');
  }
};

// делаем Events доступным как window.Events — иначе `if(window.Events)`
// в script.js всегда ложно (top-level const не создаёт window-свойство).
window.Events = Events;

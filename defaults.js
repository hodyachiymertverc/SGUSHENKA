/* =========================================================
   СТАНДАРТНЫЕ ДАННЫЕ (сид) — используются только один раз,
   при самом первом запуске сайта, чтобы БД не была пустой.
   Дальше всё это редактируется через админ-панель.
========================================================= */
const DEFAULTS = {

  /* ---- общие уровни игрока (по очкам) ---- */
  levels: [
    { id: 'lvl1', min: 0,   max: 10,  name: 'Любитель сгущёнки',  emoji: '🥄' },
    { id: 'lvl2', min: 11,  max: 20,  name: 'Сгущёночный фанат',  emoji: '🥫' },
    { id: 'lvl3', min: 21,  max: 50,  name: 'Повелитель сгущёнки', emoji: '👑' },
    { id: 'lvl4', min: 51,  max: 100, name: 'Легенда банки',      emoji: '🏆' }
  ],

  /* ---- общие достижения ---- */
  achievements: [
    { id: 'ach1', emoji: '🥫', title: 'Первая банка',        desc: 'Поставь первую реакцию под новостью',      type: 'reactions', target: 1 },
    { id: 'ach2', emoji: '💧', title: 'Протекло',             desc: 'Поставь 10 реакций под новостями',          type: 'reactions', target: 10 },
    { id: 'ach3', emoji: '🔥', title: 'Сгущёночный маньяк',   desc: 'Играй в «Лови сгущёнку!» суммарно 5 минут', type: 'playtime',  target: 300 },
    { id: 'ach4', emoji: '⚡', title: '24/7',                 desc: 'Заходи на сайт несколько дней подряд',      type: 'streak',    target: 3 }
  ],

  /* ---- случайные события (всплывающие окна) ---- */
  events: [
    { id: 'ev1', emoji: '🥫', title: 'СРОЧНО!', text: 'Ваня снова обнаружил сгущёнку и уже бежит к ней!', chance: 20, active: true }
  ],

  /* ---- уровни в кликере (по всего заработанному) ---- */
  clickerLevels: [
    { id: 'clvl1', min: 0,      max: 100,     name: 'Новичок с ложкой',  emoji: '🥄' },
    { id: 'clvl2', min: 101,    max: 1000,    name: 'Любитель клика',    emoji: '🥫' },
    { id: 'clvl3', min: 1001,   max: 10000,   name: 'Кликер-мастер',     emoji: '⚙️' },
    { id: 'clvl4', min: 10001,  max: 100000,  name: 'Король сгущёнки',   emoji: '👑' },
    { id: 'clvl5', min: 100001, max: 1000000, name: 'Легенда клика',     emoji: '🌟' }
  ],

  /* ---- достижения в кликере ---- */
  clickerAchievements: [
    { id: 'cach1', emoji: '👆', title: 'Первый клик',        desc: 'Кликни по банке в первый раз',          type: 'clicks',   target: 1 },
    { id: 'cach2', emoji: '💪', title: 'Сотня кликов',        desc: 'Сделай 100 кликов',                     type: 'clicks',   target: 100 },
    { id: 'cach3', emoji: '🖐️', title: 'Кликовая мозоль',     desc: 'Сделай 1000 кликов',                    type: 'clicks',   target: 1000 },
    { id: 'cach4', emoji: '🏦', title: 'Первая тысяча',       desc: 'Заработай суммарно 1 000 банок',        type: 'earned',   target: 1000 },
    { id: 'cach5', emoji: '📈', title: 'Сгущёночный магнат',  desc: 'Заработай суммарно 100 000 банок',      type: 'earned',   target: 100000 },
    { id: 'cach6', emoji: '🛒', title: 'Шоппер',              desc: 'Купи прокачку 5 раз (суммарно)',        type: 'upgrades', target: 5 },
    { id: 'cach7', emoji: '🤖', title: 'Автоматизация',       desc: 'Заработай 1000 банок автокликом',       type: 'autoEarned', target: 1000 }
  ],

  /* ---- прокачки в кликере ---- */
  clickerUpgrades: [
    { id: 'up1', emoji: '🥄', name: 'Ложка побольше',   desc: '+1 к силе клика',        type: 'click', value: 1,  baseCost: 15,    growth: 1.15, order: 1 },
    { id: 'up2', emoji: '🍴', name: 'Стальной половник', desc: '+5 к силе клика',        type: 'click', value: 5,  baseCost: 200,   growth: 1.15, order: 2 },
    { id: 'up3', emoji: '🥫', name: 'Банка XXL',        desc: '+25 к силе клика',       type: 'click', value: 25, baseCost: 3000,  growth: 1.15, order: 3 },
    { id: 'up4', emoji: '🐄', name: 'Корова',           desc: '+1 банка в секунду',     type: 'auto',  value: 1,  baseCost: 50,    growth: 1.15, order: 4 },
    { id: 'up5', emoji: '🏭', name: 'Мини-завод',       desc: '+10 банок в секунду',    type: 'auto',  value: 10, baseCost: 1000,  growth: 1.15, order: 5 },
    { id: 'up6', emoji: '🚚', name: 'Грузовик доставки', desc: '+50 банок в секунду',   type: 'auto',  value: 50, baseCost: 15000, growth: 1.15, order: 6 },
    { id: 'up7', emoji: '🚀', name: 'Ракета сгущёнки',  desc: '+250 банок в секунду',   type: 'auto',  value: 250,baseCost: 200000,growth: 1.15, order: 7 }
  ],

  /* ---- уровни в змейке (по суммарно пойманным банкам за все игры) ---- */
  snakeLevels: [
    { id: 'slvl1', min: 0,   max: 14,     name: 'Новичок-змейка',  emoji: '🥄' },
    { id: 'slvl2', min: 15,  max: 39,     name: 'Голодная змейка', emoji: '🐍' },
    { id: 'slvl3', min: 40,  max: 89,     name: 'Ловкая змейка',   emoji: '⚡' },
    { id: 'slvl4', min: 90,  max: 199,    name: 'Королева банок',  emoji: '👑' },
    { id: 'slvl5', min: 200, max: 999999, name: 'Легенда змейки',  emoji: '🌟' }
  ],

  /* ---- достижения в змейке ---- */
  snakeAchievements: [
    { id: 'sach1', emoji: '🥄', title: 'Первая банка',   desc: 'Поймай первую сгущёнку в змейке',       type: 'caught',   target: 1 },
    { id: 'sach2', emoji: '🍯', title: 'Сытая змейка',    desc: 'Поймай суммарно 50 банок',              type: 'caught',   target: 50 },
    { id: 'sach3', emoji: '🏆', title: 'Сотня банок',     desc: 'Поймай суммарно 100 банок',             type: 'caught',   target: 100 },
    { id: 'sach4', emoji: '🎮', title: 'Разминка',        desc: 'Сыграй 5 игр в змейку',                 type: 'games',    target: 5 },
    { id: 'sach5', emoji: '🥇', title: 'Крепкий рекорд',  desc: 'Набери 20 очков на лёгком уровне',      type: 'bestEasy', target: 20 },
    { id: 'sach6', emoji: '💣', title: 'Сапёр',           desc: 'Набери 15 очков на сложном уровне',     type: 'bestHard', target: 15 },
    { id: 'sach7', emoji: '⚡', title: 'Твёрдая середина', desc: 'Набери 25 очков на среднем уровне',     type: 'bestMedium', target: 25 },
    { id: 'sach8', emoji: '🌐', title: 'Онлайн-охотник',  desc: 'Набери 30 очков в онлайн-игре',         type: 'bestOnline', target: 30 }
  ],

  /* ---- уровни в змейке-классике (по суммарно пойманным банкам за все игры) ---- */
  snakeClassicLevels: [
    { id: 'sclvl1', min: 0,   max: 14,     name: 'Новичок-змейка',  emoji: '🥄' },
    { id: 'sclvl2', min: 15,  max: 39,     name: 'Голодная змейка', emoji: '🐍' },
    { id: 'sclvl3', min: 40,  max: 89,     name: 'Ловкая змейка',   emoji: '⚡' },
    { id: 'sclvl4', min: 90,  max: 199,    name: 'Королева банок',  emoji: '👑' },
    { id: 'sclvl5', min: 200, max: 999999, name: 'Легенда змейки',  emoji: '🌟' }
  ],

  /* ---- достижения в змейке-классике ---- */
  snakeClassicAchievements: [
    { id: 'scach1', emoji: '🥄', title: 'Первая банка',   desc: 'Поймай первую сгущёнку в змейке',       type: 'caught',   target: 1 },
    { id: 'scach2', emoji: '🍯', title: 'Сытая змейка',    desc: 'Поймай суммарно 50 банок',              type: 'caught',   target: 50 },
    { id: 'scach3', emoji: '🏆', title: 'Сотня банок',     desc: 'Поймай суммарно 100 банок',             type: 'caught',   target: 100 },
    { id: 'scach4', emoji: '🎮', title: 'Разминка',        desc: 'Сыграй 5 игр в змейку',                 type: 'games',    target: 5 },
    { id: 'scach5', emoji: '🥇', title: 'Крепкий рекорд',  desc: 'Набери 20 очков на лёгком уровне',      type: 'bestEasy', target: 20 },
    { id: 'scach6', emoji: '💣', title: 'Сапёр',           desc: 'Набери 15 очков на сложном уровне',     type: 'bestHard', target: 15 }
  ],

  /* ---- уровни в Doodle-прыжках (по суммарной высоте за все игры) ---- */
  doodleLevels: [
    { id: 'dlvl1', min: 0,    max: 199,    name: 'Новичок-прыгун',      emoji: '🥄' },
    { id: 'dlvl2', min: 200,  max: 799,    name: 'Прыгучая сгущёнка',   emoji: '🦘' },
    { id: 'dlvl3', min: 800,  max: 2499,   name: 'Покоритель высот',    emoji: '⭐' },
    { id: 'dlvl4', min: 2500, max: 5999,   name: 'Небесный прыгун',     emoji: '👑' },
    { id: 'dlvl5', min: 6000, max: 999999, name: 'Легенда прыжков',     emoji: '🌟' }
  ],

  /* ---- достижения в Doodle-прыжках ---- */
  doodleAchievements: [
    { id: 'dach1', emoji: '🦘', title: 'Первый прыжок',     desc: 'Сыграй свою первую игру в Doodle-прыжки', type: 'games',      target: 1 },
    { id: 'dach2', emoji: '🥫', title: 'Сотня банок',       desc: 'Забрайся на высоту 100 очков за одну игру', type: 'bestScore', target: 100 },
    { id: 'dach3', emoji: '⭐', title: 'Высоко в облаках',  desc: 'Забрайся на высоту 500 очков за одну игру', type: 'bestScore', target: 500 },
    { id: 'dach4', emoji: '👑', title: 'Покоритель неба',   desc: 'Забрайся на высоту 1500 очков за одну игру', type: 'bestScore', target: 1500 },
    { id: 'dach5', emoji: '🏃', title: 'Марафонец',         desc: 'Набери суммарно 2000 очков высоты за все игры', type: 'totalScore', target: 2000 },
    { id: 'dach6', emoji: '🌀', title: 'Пружинный мастер',  desc: 'Подпрыгни на пружине 10 раз',              type: 'springs',    target: 10 },
    { id: 'dach7', emoji: '🎮', title: 'Разминка',          desc: 'Сыграй 10 игр в Doodle-прыжки',            type: 'games',      target: 10 }
  ],

  /* ---- уровни в крестиках-ноликах (по числу побед) ---- */
  tttLevels: [
    { id: 'tlvl1', min: 0,  max: 2,      name: 'Новичок клеточек',        emoji: '🎯' },
    { id: 'tlvl2', min: 3,  max: 9,      name: 'Тактик крестиков-ноликов', emoji: '✏️' },
    { id: 'tlvl3', min: 10, max: 24,     name: 'Мастер трёх в ряд',       emoji: '🧠' },
    { id: 'tlvl4', min: 25, max: 49,     name: 'Гроссмейстер поля',       emoji: '👑' },
    { id: 'tlvl5', min: 50, max: 999999, name: 'Легенда крестиков-ноликов', emoji: '🌟' }
  ],

  /* ---- достижения в крестиках-ноликах ---- */
  tttAchievements: [
    { id: 'tach1', emoji: '🎮', title: 'Первая партия',   desc: 'Сыграй свою первую игру в крестики-нолики', type: 'games',       target: 1 },
    { id: 'tach2', emoji: '🏆', title: 'Первая победа',   desc: 'Выиграй свою первую партию',                type: 'wins',        target: 1 },
    { id: 'tach3', emoji: '🤖', title: 'Побеждён бот',    desc: 'Выиграй у компьютера 5 раз',                type: 'winsVsBot',   target: 5 },
    { id: 'tach4', emoji: '🌐', title: 'Онлайн-чемпион',  desc: 'Выиграй 5 онлайн-партий у других игроков',  type: 'winsOnline',  target: 5 },
    { id: 'tach5', emoji: '🔥', title: 'Победная серия',  desc: 'Выиграй 3 партии подряд',                   type: 'streak',      target: 3 },
    { id: 'tach6', emoji: '🤝', title: 'Мирная ничья',    desc: 'Сыграй 5 партий вничью',                    type: 'draws',       target: 5 },
    { id: 'tach7', emoji: '💯', title: 'Сто партий',      desc: 'Сыграй 100 партий в крестики-нолики',       type: 'games',       target: 100 }
  ]
};

// делаем DEFAULTS доступным как window.DEFAULTS — иначе проверки
// вида `if(window.DEFAULTS)` в profile.js/admin.js всегда ложны,
// т.к. top-level const этого свойства не создаёт.
window.DEFAULTS = DEFAULTS;

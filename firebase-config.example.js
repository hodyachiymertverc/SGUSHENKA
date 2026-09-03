/* =========================================================
   ШАБЛОН для firebase-config.js — этот файл (.example.js)
   можно спокойно коммитить в GitHub, в нём нет реальных ключей.

   Как пользоваться:
   1. Скопируй этот файл и назови копию firebase-config.js
      (без .example) — он уже в .gitignore, поэтому не попадёт
      в репозиторий.
   2. Вставь свои значения из Firebase Console → Настройки
      проекта → Общие → "Приложения" → SDK setup and config.
   3. Если сайт разворачивается через GitHub Actions (см.
      SETUP-SECRETS.md) — этот шаг делать не нужно, файл
      соберётся автоматически из секретов репозитория.

   Примечание: сам apiKey у Firebase не считается секретом —
   его в любом случае видно в исходном коде работающего сайта.
   Реальная защита данных обеспечивается правилами Realtime
   Database (Firebase Console → Realtime Database → Rules),
   а не тем, что этот файл спрятан.
========================================================= */
window.FIREBASE_CONFIG = {
  apiKey: "ВСТАВЬ_СВОЙ_API_KEY",
  authDomain: "ВСТАВЬ_СВОЙ_ПРОЕКТ.firebaseapp.com",
  databaseURL: "https://ВСТАВЬ_СВОЙ_ПРОЕКТ-default-rtdb.ФИРМА.firebasedatabase.app",
  projectId: "ВСТАВЬ_СВОЙ_ПРОЕКТ",
  storageBucket: "ВСТАВЬ_СВОЙ_ПРОЕКТ.firebasestorage.app",
  messagingSenderId: "ВСТАВЬ_СВОЙ_ID",
  appId: "ВСТАВЬ_СВОЙ_APP_ID"
};

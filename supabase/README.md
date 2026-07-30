# Supabase для HOOPMAP

Текущая версия работает без отдельного Django-хостинга, Redis, Celery и постоянно запущенного
процесса Telegram-бота. Next.js размещается на Vercel и выполняет API-функции, а Supabase
предоставляет PostgreSQL/PostGIS, Auth и Storage.

## 1. Создание базы

1. Создайте бесплатный проект Supabase.
2. Откройте **SQL Editor → New query**.
3. Скопируйте весь файл `bootstrap.sql`, вставьте и нажмите **Run**.
4. При желании сразу добавьте тестовые площадки: выполните `seed.sql` тем же способом.

`bootstrap.sql` можно запускать повторно. Он создаёт таблицы, индексы PostGIS, атомарные функции
для игр и подтверждений, ограничения частоты запросов и RLS-политики.

После обновления проекта запускайте актуальный `bootstrap.sql` повторно: он также добавляет
настройку приблизительного стартового района и безопасные одноразовые ссылки привязки Telegram,
не удаляя пользователей и другие данные.

## 2. Ключи

В Supabase откройте **Project Settings → API Keys** и скопируйте:

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`;
- Publishable key (или legacy `anon`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- Secret key (или legacy `service_role`) → `SUPABASE_SERVICE_ROLE_KEY`.

Publishable/anon key разрешено передавать браузеру: доступ ограничен RLS. Secret/service-role key
обходит RLS и должен находиться только в Vercel Environment Variables. Никогда не добавляйте его в
переменную с префиксом `NEXT_PUBLIC_`, GitHub или сообщения.

Storage bucket `hoopmap-media` создаётся SQL-скриптом автоматически.

## 3. Vercel

1. Импортируйте GitHub-репозиторий в Vercel.
2. В **Root Directory** укажите `frontend`.
3. Framework оставьте `Next.js`.
4. Добавьте все переменные из `frontend/.env.vercel.example`, подставив реальные значения.
   `SITE_URL` должен быть равен production-адресу сайта, например
   `https://hoop-map.vercel.app`.
5. Нажмите **Deploy**.

Отдельный Vercel-проект для `backend` создавать не нужно. `NEXT_PUBLIC_API_URL` должен оставаться
равным `/api/v1`.

## 4. Вход по email без Telegram

Email-аккаунты используют Supabase Auth и обычную таблицу `profiles`. Поле `telegram_id` у них
остаётся пустым, поэтому Telegram для регистрации и работы сайта не нужен.

1. В Supabase откройте **Authentication → Providers → Email** и включите Email provider.
2. Для безопасной регистрации оставьте включённым **Confirm email**.
3. Откройте **Authentication → URL Configuration**:
   - **Site URL**: `https://YOUR_PROJECT.vercel.app`;
   - **Redirect URLs**: добавьте:
     - `https://YOUR_PROJECT.vercel.app/login`;
     - `https://YOUR_PROJECT.vercel.app/auth/recovery`.
4. В Vercel задайте `SITE_URL=https://YOUR_PROJECT.vercel.app` и выполните Redeploy.

После регистрации пользователь получает письмо Supabase, подтверждает адрес и входит с паролем.
Пароль не записывается в таблицы HOOPMAP. В API хранится только короткоживущий access token в
памяти страницы, а refresh token помещается в `HttpOnly` cookie.

Для локальной разработки добавьте `http://localhost:3000/login` и
`http://localhost:3000/auth/recovery` в Redirect URLs, затем установите
`SITE_URL=http://localhost:3000` в `frontend/.env.local`.

На странице входа доступна ссылка **Забыли пароль?**. Запрос всегда показывает одинаковый ответ,
чтобы по форме нельзя было узнать, зарегистрирован ли конкретный email. Ссылка из письма
обменивается на короткую PKCE-сессию, а смена пароля дополнительно разрешена только по подписанному
одноразовому подтверждению.

Встроенный почтовый сервис Supabase подходит для проверки, но имеет строгие лимиты. Перед
публичным production-запуском настройте собственный SMTP в **Authentication → Email**.

### Вход через Google

1. В Google Auth Platform создайте OAuth Client типа **Web application**.
2. В **Authorized JavaScript origins** добавьте:
   - `https://YOUR_PROJECT.vercel.app`;
   - `http://localhost:3000` для локальной разработки.
3. В **Authorized redirect URIs** добавьте callback, показанный в
   **Supabase → Authentication → Sign In / Providers → Google**. Он имеет вид
   `https://PROJECT_REF.supabase.co/auth/v1/callback`.
4. Включите Google provider в Supabase и сохраните там Google Client ID и Client Secret.
5. В **Supabase → Authentication → URL Configuration → Redirect URLs** добавьте:
   - `https://YOUR_PROJECT.vercel.app/auth/callback`;
   - `http://localhost:3000/auth/callback` для локальной разработки.

Google Client Secret хранится только в Supabase и не добавляется в Vercel. HOOPMAP использует
серверный PKCE-flow, сохраняет refresh token в `HttpOnly` cookie и создаёт обычную запись
`profiles` после первого успешного входа.

## 5. Telegram

После первого deployment:

1. Установите `TELEGRAM_WEBAPP_URL` равным production URL сайта.
2. Сгенерируйте `TELEGRAM_WEBHOOK_SECRET` и `RATE_LIMIT_SECRET` как разные случайные строки длиной
   минимум 32 байта.
3. Redeploy проект, чтобы новые переменные применились.
4. Зарегистрируйте webhook:

   ```bash
   cd frontend
   TELEGRAM_BOT_TOKEN='...' \
   TELEGRAM_WEBHOOK_SECRET='...' \
   TELEGRAM_WEBAPP_URL='https://YOUR_PROJECT.vercel.app' \
   npm run telegram:webhook
   ```

5. В BotFather настройте Menu Button/Web App на `TELEGRAM_WEBAPP_URL`.

Бот принимает Telegram updates по адресу `/api/telegram/webhook`; отдельный контейнер больше не
нужен.

### Вход через Telegram на обычном сайте

Один и тот же `telegram_id` используется в Mini App и на сайте, поэтому избранное, добавленные
площадки, игры и роль пользователя автоматически относятся к одному профилю.

Основной совместимый вариант использует классический Telegram Login Widget:

1. Отправьте `@BotFather` команду `/setdomain`, выберите бота и укажите production-домен без
   протокола и пути: `YOUR_PROJECT.vercel.app`.
2. В Vercel → **Settings → Environment Variables** добавьте
   `TELEGRAM_BOT_USERNAME=имя_бота_без_@`.
3. Убедитесь, что уже заданы `TELEGRAM_BOT_TOKEN`, `SITE_URL` и `TELEGRAM_WEBAPP_URL`.
4. Выполните Redeploy.

Подписанные Telegram параметры проверяются сервером с помощью `TELEGRAM_BOT_TOKEN`; токен никогда
не передаётся в браузер.

### Привязка Telegram к Google/email-профилю

Войдите на сайт через Google или email, откройте **Профиль → Способы входа** и нажмите
**Подключить** напротив Telegram. Сайт откроет бота с одноразовой ссылкой, действующей 10 минут.

Если пользователь раньше открывал Mini App и у него уже появился отдельный Telegram-профиль,
сервер в одной транзакции переносит в основной профиль площадки, фотографии, отзывы, избранное,
проверки и игры. Сама ссылка хранится в Supabase только в виде SHA-256 хэша, используется один раз
и не может объединить Telegram, который уже связан с настоящим Google/email-аккаунтом.

Новый OIDC-вариант также поддерживается, если в BotFather доступен раздел **Web Login**. В этом
случае зарегистрируйте origin `https://YOUR_PROJECT.vercel.app` и callback
`https://YOUR_PROJECT.vercel.app/api/v1/auth/telegram/callback/`, затем добавьте в Vercel
`TELEGRAM_LOGIN_CLIENT_ID` и `TELEGRAM_LOGIN_CLIENT_SECRET`. При наличии этих двух переменных
HOOPMAP автоматически предпочитает OIDC.

`TELEGRAM_LOGIN_CLIENT_SECRET`, как и токен бота, является серверным секретом. Его нельзя
добавлять в `NEXT_PUBLIC_*`, GitHub или клиентский код.

## 6. Первый администратор

Сначала создайте аккаунт по email или откройте сайт через Telegram Mini App хотя бы один раз.
Затем в Supabase:

1. Откройте **Table Editor → profiles**.
2. Найдите свой профиль по имени или `telegram_id`.
3. Поменяйте `role` с `user` на `admin`.

После этого появится доступ к `/moderation`.

### Приблизительный стартовый район

Авторизованный пользователь может отдельно согласиться сохранить стартовый район карты.
Сервер округляет широту и долготу до двух знаков — примерно до 1 км — и не сохраняет точную
геопозицию. Настройку можно обновить или удалить в профиле. Без явного нажатия пользователя
координаты в Supabase не отправляются.

## 7. Импорт собственной карты из Яндекса

Дополнительные ключи API не нужны:

1. В Яндекс Картах откройте **Мои карты → Конструктор карт**.
2. Откройте созданную вами карту и выберите **Экспорт**.
3. Скачайте файл в формате **CSV** или **GeoJSON**.
4. В HOOPMAP откройте **Модерация → Импорт площадок**.
5. Выберите файл, укажите город и общие параметры площадок.
6. Подтвердите право на использование данных и запустите импорт.

За один запрос принимается до 200 точек и файл до 2 МБ. Уже импортированные точки и площадки,
которые находятся ближе 50 метров к существующим, пропускаются. Новые площадки создаются со
статусом `pending` и должны быть проверены в обычном интерфейсе модерации.

Этот механизм предназначен только для собственных объектов из Конструктора. Он не выполняет
скрейпинг обычных Яндекс Карт и не сохраняет результаты API поиска по организациям.

## Проверка

- `/api/telegram/webhook` возвращает JSON с `ok: true`;
- `/login` позволяет создать независимый email-аккаунт и войти после подтверждения адреса;
- `/forgot-password` отправляет письмо, а `/reset-password` принимает новый пароль только после
  перехода по действующей ссылке;
- `/login` открывает Telegram Web Login, после входа `/profile` показывает тот же аккаунт;
- в `/profile` можно безопасно подключить существующий Telegram к Google/email-профилю;
- карта показывает данные из `seed.sql`;
- новая площадка получает статус `pending`;
- обычный пользователь не видит чужие pending-площадки;
- администратор видит их на странице `/moderation`;
- фотография загружается напрямую в Storage по одноразовой подписанной ссылке;
- секретные ключи отсутствуют в browser bundle и `NEXT_PUBLIC_*`.

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
5. Нажмите **Deploy**.

Отдельный Vercel-проект для `backend` создавать не нужно. `NEXT_PUBLIC_API_URL` должен оставаться
равным `/api/v1`.

## 4. Telegram

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

## 5. Первый администратор

Сначала откройте сайт через Telegram Mini App хотя бы один раз. Затем в Supabase:

1. Откройте **Table Editor → profiles**.
2. Найдите себя по `telegram_id`.
3. Поменяйте `role` с `user` на `admin`.

После этого появится доступ к `/moderation`.

## Проверка

- `/api/telegram/webhook` возвращает JSON с `ok: true`;
- карта показывает данные из `seed.sql`;
- новая площадка получает статус `pending`;
- обычный пользователь не видит чужие pending-площадки;
- администратор видит их на странице `/moderation`;
- фотография загружается напрямую в Storage по одноразовой подписанной ссылке;
- секретные ключи отсутствуют в browser bundle и `NEXT_PUBLIC_*`.

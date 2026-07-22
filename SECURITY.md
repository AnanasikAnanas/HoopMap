# Безопасность HOOPMAP

## Что уже защищено

- Telegram `initData` проверяется на backend по подписи, возрасту, дубликатам полей и допустимому
  идентификатору; данные из `initDataUnsafe` не считаются доверенными.
- Access JWT живёт 15 минут и хранится только в памяти браузера. Refresh JWT находится в
  `HttpOnly` cookie, живёт 14 дней, ротируется и отзывается при выходе.
- Refresh/logout принимают cookie только от origin из `CORS_ALLOWED_ORIGINS`; ответы авторизации
  помечены `no-store`.
- Публичные ответы не содержат Telegram ID и email. Изменение ролей, статусов публикации и статуса
  игры недоступно обычным клиентским запросам.
- На API, авторизацию, создание объектов, загрузки, отзывы, жалобы и участие в играх действуют
  отдельные rate limits.
- Изображения ограничены по размеру файла, числу пикселей и сторонам, полностью декодируются и
  перекодируются без EXIF перед сохранением.
- Frontend выдаёт nonce-based CSP, HSTS и защитные browser headers. Разрешённые API/map/media hosts
  формируются из environment, а не из wildcard `https://**`.
- Production-контейнеры запускаются без Linux capabilities, с `no-new-privileges` и
  непривилегированным пользователем backend.
- CI проверяет Python и npm зависимости по базе уязвимостей, типы, lint, миграции, тесты и
  production build.

## Обязательные настройки перед выпуском

1. Создайте отдельные случайные значения не короче 32 байт для `DJANGO_SECRET_KEY` и
   `INTERNAL_API_TOKEN`. Не используйте один секрет в нескольких окружениях.
2. Установите `DJANGO_DEBUG=false`, `API_DOCS_PUBLIC=false`, `AUTH_COOKIE_SECURE=true` и точные
   значения `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS`.
3. Храните Supabase Database password и S3 keys только в secret manager backend/worker. Никогда не
   добавляйте их в Vercel-переменные с префиксом `NEXT_PUBLIC_`.
4. Используйте `sslmode=require` для Supabase, приватную схему `hoopmap` и SQL из
   `supabase/bootstrap.sql`. Не размещайте Django-таблицы в схеме, открытой через Data API.
5. Задайте `NEXT_PUBLIC_MEDIA_HOST` точным hostname Supabase/CDN. Если map style обращается к другим
   HTTPS-hosts, перечислите их в `CSP_CONNECT_SRC` через пробел.
6. Запустите перед релизом:

   ```bash
   python manage.py check --deploy --fail-level ERROR
   python manage.py migrate --check
   python manage.py check_supabase --storage
   pip-audit -r requirements.txt
   npm audit --audit-level=high
   ```

7. Включите резервные копии базы и Storage, retention логов, оповещения по HTTP 5xx, всплескам 401,
   403 и 429, ошибкам Celery и заполнению диска/пула соединений.

## Домены Vercel и API

Лучший вариант — `app.example.com` для Vercel и `api.example.com` для Django. Используйте
`AUTH_COOKIE_SAMESITE=Lax` и `AUTH_COOKIE_DOMAIN=.example.com`.

Если сайты действительно разные, cookie требует `SameSite=None; Secure`; `AUTH_COOKIE_DOMAIN`
должен быть пустым. В этом режиме особенно важно указывать только точный production origin в CORS.
Preview-домены Vercel не следует автоматически разрешать wildcard-правилом.

## Ротация и инциденты

- При утечке `DJANGO_SECRET_KEY` немедленно замените ключ: это завершит все JWT-сессии. Затем
  смените все прочие секреты, которые могли находиться в том же хранилище.
- При утечке `INTERNAL_API_TOKEN` замените его одновременно у backend и бота.
- При утечке Supabase S3 keys отзовите пару в Supabase, создайте новую и обновите backend/worker.
- При утечке Telegram bot token отзовите его через BotFather и обновите backend и bot.
- После ротации проверьте auth, upload/delete Storage, Celery и Telegram, затем изучите логи на
  необычные origin, IP, массовые refresh-запросы и операции записи.

Секреты запрещено помещать в репозиторий, Docker image, browser bundle, логи и сообщения об ошибках.

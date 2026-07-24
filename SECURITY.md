# Безопасность HOOPMAP

## Реализовано

- Telegram `initData` проверяется сервером через HMAC-SHA256, constant-time comparison, `auth_date`
  и запрет дублирующихся полей.
- Supabase Auth выдаёт короткоживущий access token. Он хранится только в памяти вкладки; refresh
  token находится в ограниченной по пути `HttpOnly`, `Secure` cookie.
- Все таблицы приложения защищены RLS. Клиент не может назначить себе роль, опубликовать площадку,
  читать чужую очередь модерации или управлять чужими объектами.
- `telegram_id`, `auth_user_id` и service-role key не доступны через публичный Data API.
- Операции создания, загрузки, входа, подтверждений и участия в играх ограничены database-backed
  rate limits, работающими между всеми serverless-инстансами.
- Создание игры, join/leave, проверка вместимости и cooldown подтверждений выполняются атомарными
  PostgreSQL-функциями.
- Фотографии ограничены 10 МБ и типами JPEG/PNG/WebP. Upload выполняется по одноразовой подписанной
  ссылке в путь, привязанный к пользователю и площадке.
- Telegram webhook принимает запросы только с секретным заголовком Bot API.
- Frontend использует nonce-based CSP, HSTS, `nosniff`, строгую referrer policy и ограниченную
  Permissions Policy.

## Секреты

Следующие значения разрешены только в Vercel server-side Environment Variables:

- `SUPABASE_SERVICE_ROLE_KEY`;
- `TELEGRAM_BOT_TOKEN`;
- `TELEGRAM_WEBHOOK_SECRET`;
- `RATE_LIMIT_SECRET`.

Только `NEXT_PUBLIC_SUPABASE_URL` и publishable/anon key имеют префикс `NEXT_PUBLIC_`. Публичность
anon key предусмотрена Supabase и безопасна только вместе с включёнными RLS-политиками.

Никогда не присылайте service-role key, Telegram token или значения секретов в чат и не добавляйте
их в GitHub.

## Перед выпуском

1. Выполните актуальный `supabase/bootstrap.sql`.
2. Создайте разные случайные `TELEGRAM_WEBHOOK_SECRET` и `RATE_LIMIT_SECRET` длиной минимум 32 байта.
3. Проверьте, что Vercel Root Directory равен `frontend`.
4. Убедитесь, что `NEXT_PUBLIC_API_URL=/api/v1`.
5. Назначайте `admin` только вручную доверенному профилю.
6. Выполните `npm audit --audit-level=high`, тесты и production build.
7. Включите MFA в GitHub, Vercel, Supabase и Telegram.

## При утечке

- service-role key: немедленно создайте новый secret key в Supabase и обновите Vercel;
- Telegram token: отзовите его через BotFather, обновите Vercel и заново зарегистрируйте webhook;
- webhook secret: замените переменную и повторно установите webhook;
- refresh session: удалите пользователя или завершите его сессии в Supabase Auth.

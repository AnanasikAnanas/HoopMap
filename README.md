# HOOPMAP

Карта баскетбольных площадок, открытые игры и Telegram Mini App. Основной deployment полностью
serverless и помещается в бесплатные тарифы Vercel Hobby и Supabase Free для личного MVP.

## Текущая архитектура

```mermaid
flowchart LR
  U["Сайт / Telegram Mini App"] --> V["Next.js на Vercel"]
  TG["Telegram Bot API"] --> W["Webhook в Next.js"]
  V --> A["Next.js API Routes"]
  W --> A
  A --> S[("Supabase PostgreSQL + PostGIS")]
  A --> AU["Supabase Auth"]
  A --> ST["Supabase Storage"]
```

Отдельный backend-хост, Redis, Celery и Docker для deployment не нужны. Каталоги `backend/`,
`bot/`, Compose и Nginx сохранены как legacy-реализация на время перехода, но Vercel их не
собирает и не запускает.

## Возможности

- MapLibre-карта с загрузкой площадок по текущему `bbox`;
- геопоиск PostGIS и сортировка по расстоянию;
- добавление площадок и фотографий с модерацией;
- защищённый импорт собственных CSV/GeoJSON-карт из Яндекс Конструктора;
- независимая регистрация по email и паролю через Supabase Auth;
- вход через Google и защищённое восстановление пароля;
- безопасная проверка Telegram `initData`;
- одноразовая привязка Telegram к существующему Google/email-профилю с объединением данных;
- единый Telegram-профиль для Mini App и обычного сайта через Login Widget или OpenID Connect;
- Supabase Auth sessions: access token в памяти, refresh token в `HttpOnly` cookie;
- RLS-права для пользователей, модераторов и администраторов;
- избранное, подтверждения актуальности и открытые игры;
- атомарное присоединение к игре с контролем количества мест;
- Telegram webhook с картой, играми и поиском по геолокации;
- database-backed rate limits для чувствительных операций;
- CSP, HSTS и защитные HTTP-заголовки.

## Структура активной версии

```text
basketball-courts/
├── frontend/
│   ├── src/app/api/v1/            API площадок, игр и авторизации
│   ├── src/app/api/telegram/       Telegram webhook
│   ├── src/lib/supabase/           Auth, clients и сериализация
│   └── .env.vercel.example
├── supabase/
│   ├── bootstrap.sql               схема, PostGIS, RLS и функции
│   ├── seed.sql                    необязательные демо-площадки
│   └── README.md                   пошаговый deployment
├── backend/                        legacy Django
└── bot/                            legacy aiogram polling bot
```

## Локальный запуск без Docker

1. Выполните `supabase/bootstrap.sql` в своём Supabase-проекте.
2. Скопируйте переменные:

   ```bash
   cp frontend/.env.vercel.example frontend/.env.local
   ```

3. Заполните Supabase и Telegram значения.
4. Запустите:

   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

Сайт будет доступен на <http://localhost:3000>. Для публичного просмотра карты Telegram token не
нужен; он требуется для входа и webhook.

## Deployment

Полный пошаговый процесс находится в [`supabase/README.md`](supabase/README.md). Коротко:

1. выполнить `supabase/bootstrap.sql`;
2. при необходимости выполнить `supabase/seed.sql`;
3. импортировать репозиторий в Vercel с **Root Directory = `frontend`**;
4. добавить переменные из `frontend/.env.vercel.example`;
5. выполнить deployment;
6. зарегистрировать Telegram webhook.

## API

Клиентский контракт сохранён с префиксом `/api/v1`:

```text
POST   /auth/telegram/
GET    /auth/telegram/start/
GET    /auth/telegram/callback/
POST   /auth/email/register/
POST   /auth/email/login/
POST   /auth/password/reset/
POST   /auth/password/update/
POST   /auth/telegram-link/
POST   /auth/refresh/
POST   /auth/logout/
PATCH  /auth/map-home/
GET    /auth/me/

GET    /courts/
POST   /courts/
POST   /courts/import/
GET    /courts/{id-or-slug}/
GET    /courts/nearby/
POST   /courts/{id}/photos/
POST   /courts/{id}/verify/
POST   /courts/{id}/favorite/
DELETE /courts/{id}/favorite/
POST   /courts/{id}/moderate/

GET    /games/
POST   /games/
GET    /games/{id}/
POST   /games/{id}/join/
POST   /games/{id}/leave/
```

Загрузка фотографий идёт напрямую browser → Supabase Storage по одноразовой подписанной ссылке,
поэтому не упирается в лимит размера тела Vercel Functions.

Импорт Яндекс Карт предназначен для собственных объектов, экспортированных через
**Мои карты → Конструктор карт → Экспорт**. Автоматическое копирование результатов обычного
поиска Яндекс Карт не используется: сохранение данных поиска зависит от условий лицензии Яндекса.

## Проверки

```bash
cd frontend
npm run typecheck
npm run lint
npm test
npm run build
```

Vercel Hobby предназначен для личных некоммерческих проектов. Для коммерческого запуска или
гарантированного SLA понадобится платный тариф, но архитектуру переписывать повторно не потребуется.

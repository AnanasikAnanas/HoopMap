# Supabase setup for HOOPMAP

Supabase provides PostgreSQL/PostGIS and public image storage. Django continues to own the
application schema, JWT authentication, permissions and business logic. Supabase Auth and the
Supabase Data API are intentionally not used.

## 1. Prepare the database

1. Create a Supabase project in a region close to the Django API service.
2. Open **SQL Editor**, paste `bootstrap.sql` and run it once.
3. Open **Connect**, select **Session pooler**, and copy the connection string.

The bootstrap creates a private `hoopmap` schema and enables PostGIS. Django places its tables in
that schema instead of `public`, so they are not exposed through the Supabase Data API.

Copy the environment template and fill it with real values:

```bash
cp .env.supabase.example .env.supabase
```

Use the Session pooler URL on port `5432` with `DB_POOL_MODE=session`. If the deployment platform
only supports short-lived/serverless connections, use the Transaction pooler URL on port `6543`
and set `DB_POOL_MODE=transaction`; the project then disables persistent and prepared connections.

If the database password contains `@`, `:`, `/`, `#`, `%` or other URL-special characters, percent-
encode it before placing it in `DATABASE_URL`.

## 2. Prepare Storage

1. Open **Storage** and create a public bucket named `hoopmap-media`.
2. Set its file size limit to `10 MB`.
3. Allow `image/jpeg`, `image/png` and `image/webp`.
4. Open **Storage > Configuration > S3**, enable the S3 protocol and generate server-side access
   keys.
5. Copy the endpoint, region, access key and secret into `.env.supabase`.

Use the direct storage endpoint shown in the template:

```text
https://PROJECT_REF.storage.supabase.co/storage/v1/s3
```

The S3 keys bypass Storage RLS. Keep them only in the Django API/worker secret manager and never
add them to Vercel or any `NEXT_PUBLIC_*` variable. The bucket is public only because court photos
must be directly readable by browsers; all writes still go through authenticated Django endpoints.

## 3. Initialize the application

Run these as one-off commands on the Django hosting platform:

```bash
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser
python manage.py check_supabase --storage
```

The last command verifies the active private schema, PostGIS and a complete temporary Storage
write/read/delete cycle. It does not leave a test object behind.

Start the long-running services separately:

```text
web:          gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 3 --timeout 60
worker:       celery -A config worker -l INFO --concurrency=2
scheduler:    celery -A config beat -l INFO
telegram-bot: python -m app.main
```

The backend platform must also provide a Redis URL. Supabase does not replace Redis or the Celery
worker processes.

## 4. Configure Vercel

Import the repository in Vercel and set the project root to `frontend`. Add only the variables from
`frontend/.env.vercel.example`. In particular:

```text
NEXT_PUBLIC_API_URL=https://api.example.com/api/v1
NEXT_PUBLIC_MEDIA_HOST=PROJECT_REF.supabase.co
```

On the Django host, update these variables with the real domains:

```text
DJANGO_ALLOWED_HOSTS=api.example.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://app.example.com,https://api.example.com
CORS_ALLOWED_ORIGINS=https://app.example.com
TELEGRAM_WEBAPP_URL=https://app.example.com
BACKEND_API_URL=https://api.example.com/api/v1
```

Prefer custom sibling domains such as `app.example.com` and `api.example.com`, with
`AUTH_COOKIE_SAMESITE=Lax` and `AUTH_COOKIE_DOMAIN=.example.com`. If Vercel and the API are on
unrelated sites, use `AUTH_COOKIE_SAMESITE=None`, `AUTH_COOKIE_SECURE=true`, leave
`AUTH_COOKIE_DOMAIN` empty, and allow only the exact production Vercel origin in CORS.

Use the same Supabase region for database and storage, and place the Django service as close to that
region as the hosting provider allows.

## 5. Release checklist

- `DJANGO_DEBUG=false` and unique `DJANGO_SECRET_KEY` / `INTERNAL_API_TOKEN` values are set.
- `API_DOCS_PUBLIC=false`, HTTPS redirect and secure refresh cookies are enabled.
- `DJANGO_ALLOWED_HOSTS`, CORS and CSRF origins contain exact production domains without wildcards.
- `bootstrap.sql` ran successfully before the first Django migration.
- The `hoopmap-media` bucket is public; S3 access keys exist only on backend services.
- `python manage.py check --deploy` reports no unexpected warnings.
- `python manage.py check_supabase --storage` succeeds.
- Django, worker, scheduler and bot use the same release and environment values.
- Database and Storage backups/retention are configured for the selected Supabase plan.

import os
import re
from datetime import timedelta
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).lower() in {"1", "true", "yes", "on"}


def database_config() -> dict:
    """Build a GeoDjango database config from DATABASE_URL or POSTGRES_* variables."""
    config: dict = {
        "ENGINE": os.getenv("DJANGO_DB_ENGINE", "django.contrib.gis.db.backends.postgis"),
        "NAME": os.getenv("POSTGRES_DB", "hoopmap"),
        "USER": os.getenv("POSTGRES_USER", "hoopmap"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "hoopmap"),
        "HOST": os.getenv("POSTGRES_HOST", "localhost"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
    }

    database_url = os.getenv("DATABASE_URL", "").strip()
    query_options: dict[str, str] = {}
    if database_url:
        parsed = urlsplit(database_url)
        if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
            raise ImproperlyConfigured("DATABASE_URL must be a valid PostgreSQL URL")
        try:
            port = parsed.port or 5432
        except ValueError as exc:
            raise ImproperlyConfigured("DATABASE_URL contains an invalid port") from exc
        config.update(
            {
                "NAME": unquote(parsed.path.lstrip("/")) or "postgres",
                "USER": unquote(parsed.username or "postgres"),
                "PASSWORD": unquote(parsed.password or ""),
                "HOST": parsed.hostname,
                "PORT": str(port),
            }
        )
        query_options = dict(parse_qsl(parsed.query, keep_blank_values=False))

    pool_mode = os.getenv("DB_POOL_MODE", "session").strip().lower()
    if pool_mode not in {"session", "transaction", "direct"}:
        raise ImproperlyConfigured("DB_POOL_MODE must be session, transaction, or direct")

    conn_max_age = int(os.getenv("DB_CONN_MAX_AGE", "60"))
    if pool_mode == "transaction":
        conn_max_age = 0

    options: dict[str, object] = {}
    sslmode = query_options.get("sslmode") or os.getenv("DB_SSL_MODE", "")
    if sslmode:
        options["sslmode"] = sslmode
    elif env_bool("DB_SSL_REQUIRE"):
        options["sslmode"] = "require"

    search_path = os.getenv("DB_SEARCH_PATH", "").strip()
    if search_path:
        schemas = [schema.strip() for schema in search_path.split(",") if schema.strip()]
        if not schemas or any(not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", s) for s in schemas):
            raise ImproperlyConfigured("DB_SEARCH_PATH contains an invalid PostgreSQL schema")
        options["options"] = f"-c search_path={','.join(schemas)}"

    # Supavisor transaction mode cannot retain session state or server-side prepared statements.
    if pool_mode == "transaction":
        options["prepare_threshold"] = None

    config["CONN_MAX_AGE"] = conn_max_age
    config["CONN_HEALTH_CHECKS"] = conn_max_age > 0
    if options:
        config["OPTIONS"] = options
    return config


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "unsafe-development-key")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = [
    v.strip()
    for v in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if v.strip()
]
CSRF_TRUSTED_ORIGINS = [
    v.strip()
    for v in os.getenv("DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost").split(",")
    if v.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.gis",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
    "storages",
    "apps.common.apps.CommonConfig",
    "apps.accounts",
    "apps.courts",
    "apps.games",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

DATABASES = {"default": database_config()}

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "ru"
TIME_ZONE = "Europe/Samara"
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

if os.getenv("S3_ENDPOINT_URL"):
    STORAGES = {
        "default": {"BACKEND": "storages.backends.s3.S3Storage"},
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }
    AWS_S3_ENDPOINT_URL = os.environ["S3_ENDPOINT_URL"]
    AWS_ACCESS_KEY_ID = os.getenv("S3_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.getenv("S3_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "hoopmap-media")
    AWS_S3_REGION_NAME = os.getenv("S3_REGION_NAME", "us-east-1")
    AWS_S3_USE_SSL = env_bool("S3_USE_SSL")
    AWS_S3_ADDRESSING_STYLE = os.getenv("S3_ADDRESSING_STYLE", "path")
    AWS_S3_SIGNATURE_VERSION = "s3v4"
    AWS_S3_FILE_OVERWRITE = False
    AWS_QUERYSTRING_AUTH = False
    AWS_DEFAULT_ACL = None
    AWS_S3_CUSTOM_DOMAIN = os.getenv("S3_CUSTOM_DOMAIN") or None
    AWS_S3_URL_PROTOCOL = "https:" if AWS_S3_USE_SSL else "http:"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "apps.accounts.authentication.InternalTokenAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticatedOrReadOnly",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardPagination",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.common.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("THROTTLE_ANON_RATE", "120/minute"),
        "user": os.getenv("THROTTLE_USER_RATE", "600/minute"),
        "court_create": "5/day",
        "court_verify": "20/day",
        "photo_upload": "10/hour",
        "review_write": "30/hour",
        "report_create": "10/hour",
        "game_create": "10/day",
        "game_join": "60/hour",
        "telegram_auth": "10/minute",
        "token_refresh": "120/hour",
        "internal_bot": "240/minute",
    },
    "NUM_PROXIES": int(os.getenv("API_NUM_PROXIES", "1")),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUDIENCE": os.getenv("JWT_AUDIENCE", "hoopmap-client"),
    "ISSUER": os.getenv("JWT_ISSUER", "hoopmap-api"),
    "LEEWAY": 10,
}

AUTH_REFRESH_COOKIE_NAME = os.getenv("AUTH_REFRESH_COOKIE_NAME", "hoopmap_refresh")
AUTH_REFRESH_COOKIE_PATH = "/api/v1/auth/"
AUTH_REFRESH_COOKIE_MAX_AGE = 14 * 24 * 60 * 60
AUTH_COOKIE_DOMAIN = os.getenv("AUTH_COOKIE_DOMAIN", "")
AUTH_COOKIE_SECURE = env_bool("AUTH_COOKIE_SECURE", not DEBUG)
AUTH_COOKIE_SAMESITE = os.getenv("AUTH_COOKIE_SAMESITE", "Lax").capitalize()
if AUTH_COOKIE_SAMESITE not in {"Lax", "Strict", "None"}:
    raise ImproperlyConfigured("AUTH_COOKIE_SAMESITE must be Lax, Strict, or None")
if AUTH_COOKIE_SAMESITE == "None" and not AUTH_COOKIE_SECURE:
    raise ImproperlyConfigured("AUTH_COOKIE_SECURE must be true with SameSite=None")

SPECTACULAR_SETTINGS = {
    "TITLE": "HOOPMAP API",
    "DESCRIPTION": "API поиска баскетбольных площадок и организации игр",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

CORS_ALLOWED_ORIGINS = [
    v.strip()
    for v in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if v.strip()
]
CORS_ALLOW_CREDENTIALS = True
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FIELDS = 200
DATA_UPLOAD_MAX_NUMBER_FILES = 2
FILE_UPLOAD_PERMISSIONS = 0o640
COURT_VERIFICATION_COOLDOWN_DAYS = int(os.getenv("COURT_VERIFICATION_COOLDOWN_DAYS", "30"))
COURT_DUPLICATE_RADIUS_METERS = int(os.getenv("COURT_DUPLICATE_RADIUS_METERS", "50"))
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_AUTH_MAX_AGE_SECONDS = int(os.getenv("TELEGRAM_AUTH_MAX_AGE_SECONDS", "3600"))
INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN", "")
API_DOCS_PUBLIC = env_bool("API_DOCS_PUBLIC", DEBUG)

CELERY_BROKER_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 300
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": os.getenv("REDIS_URL", "redis://localhost:6379/1"),
    }
}

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", not DEBUG)
SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_SECURE_HSTS_SECONDS", "0" if DEBUG else "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS")
SECURE_HSTS_PRELOAD = env_bool("DJANGO_SECURE_HSTS_PRELOAD")
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 8 * 60 * 60
SESSION_COOKIE_NAME = "hoopmap_session"
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin-allow-popups"
X_FRAME_OPTIONS = "SAMEORIGIN"
PASSWORD_RESET_TIMEOUT = 60 * 60

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.getenv("LOG_LEVEL", "INFO")},
}

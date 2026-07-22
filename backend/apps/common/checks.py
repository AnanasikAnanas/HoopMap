from urllib.parse import urlsplit

from django.conf import settings
from django.core.checks import CheckMessage, Error, Tags, Warning, register


@register(Tags.security, deploy=True)
def hoopmap_deployment_security_checks(app_configs, **kwargs):
    issues: list[CheckMessage] = []
    if len(settings.INTERNAL_API_TOKEN) < 32:
        issues.append(
            Error(
                "INTERNAL_API_TOKEN must contain at least 32 characters.",
                id="hoopmap.E001",
            )
        )
    if not settings.TELEGRAM_BOT_TOKEN:
        issues.append(
            Warning(
                "TELEGRAM_BOT_TOKEN is empty; Telegram authentication is disabled.",
                id="hoopmap.W001",
            )
        )
    if "*" in settings.ALLOWED_HOSTS:
        issues.append(
            Error("Wildcard DJANGO_ALLOWED_HOSTS is unsafe in production.", id="hoopmap.E002")
        )
    insecure_origins = [
        origin
        for origin in (*settings.CORS_ALLOWED_ORIGINS, *settings.CSRF_TRUSTED_ORIGINS)
        if urlsplit(origin).scheme != "https"
        and urlsplit(origin).hostname not in {"localhost", "127.0.0.1", "::1"}
    ]
    if insecure_origins:
        issues.append(
            Error(
                "Production CORS and CSRF origins must use HTTPS.",
                id="hoopmap.E003",
            )
        )
    if settings.API_DOCS_PUBLIC:
        issues.append(Warning("API documentation is public in production.", id="hoopmap.W002"))
    if not settings.AUTH_COOKIE_SECURE:
        issues.append(
            Error("Refresh-token cookies must be Secure in production.", id="hoopmap.E004")
        )
    return issues

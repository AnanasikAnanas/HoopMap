import secrets

from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import User


class InternalTokenAuthentication(BaseAuthentication):
    """Authenticates the trusted bot without giving it database access."""

    def authenticate(self, request):
        token = request.headers.get("X-Internal-Token", "")
        telegram_id = request.headers.get("X-Telegram-Id", "")
        if not token and not telegram_id:
            return None
        if not settings.INTERNAL_API_TOKEN or not secrets.compare_digest(
            token, settings.INTERNAL_API_TOKEN
        ):
            raise AuthenticationFailed("Invalid internal token")
        try:
            user = User.objects.get(telegram_id=int(telegram_id), is_active=True)
        except (ValueError, User.DoesNotExist) as exc:
            raise AuthenticationFailed("Unknown Telegram user") from exc
        return user, None

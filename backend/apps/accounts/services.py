import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from rest_framework.exceptions import AuthenticationFailed

from .models import User


@dataclass(frozen=True)
class TelegramIdentity:
    telegram_id: int
    username: str
    first_name: str
    last_name: str
    avatar_url: str


def _telegram_text(user_data: dict, field: str, max_length: int) -> str:
    value = user_data.get(field, "")
    if not isinstance(value, str) or len(value) > max_length:
        raise AuthenticationFailed("Malformed Telegram user data")
    return value.strip()


def validate_telegram_init_data(
    init_data: str, max_age_seconds: int | None = None
) -> TelegramIdentity:
    if not settings.TELEGRAM_BOT_TOKEN:
        raise AuthenticationFailed("Telegram bot token is not configured")
    pairs = parse_qsl(init_data, keep_blank_values=True)
    if len(pairs) != len({key for key, _ in pairs}):
        raise AuthenticationFailed("Telegram initData contains duplicate fields")
    values = dict(pairs)
    received_hash = values.pop("hash", "")
    if len(received_hash) != 64:
        raise AuthenticationFailed("Telegram signature is missing")
    data_check_string = "\n".join(f"{key}={values[key]}" for key in sorted(values))
    secret = hmac.new(b"WebAppData", settings.TELEGRAM_BOT_TOKEN.encode(), hashlib.sha256).digest()
    expected_hash = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_hash, received_hash):
        raise AuthenticationFailed("Invalid Telegram signature")
    try:
        auth_date = int(values["auth_date"])
        user_data = json.loads(values["user"])
        telegram_id = int(user_data["id"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise AuthenticationFailed("Malformed Telegram initData") from exc
    if not isinstance(user_data, dict) or not 0 < telegram_id < 2**52:
        raise AuthenticationFailed("Malformed Telegram user data")
    if user_data.get("is_bot") is True:
        raise AuthenticationFailed("Bot accounts cannot authenticate as users")
    max_age_seconds = max_age_seconds or settings.TELEGRAM_AUTH_MAX_AGE_SECONDS
    if auth_date > time.time() + 60 or time.time() - auth_date > max_age_seconds:
        raise AuthenticationFailed("Telegram initData has expired")

    avatar_url = _telegram_text(user_data, "photo_url", 500)
    if avatar_url:
        try:
            URLValidator(schemes=("https",))(avatar_url)
        except DjangoValidationError:
            avatar_url = ""
    return TelegramIdentity(
        telegram_id=telegram_id,
        username=_telegram_text(user_data, "username", 150),
        first_name=_telegram_text(user_data, "first_name", 150),
        last_name=_telegram_text(user_data, "last_name", 150),
        avatar_url=avatar_url,
    )


def get_or_update_telegram_user(identity: TelegramIdentity) -> User:
    defaults = {
        "username": identity.username or f"tg_{identity.telegram_id}",
        "first_name": identity.first_name,
        "last_name": identity.last_name,
        "avatar_url": identity.avatar_url,
        "is_active": True,
    }
    user, _ = User.objects.update_or_create(telegram_id=identity.telegram_id, defaults=defaults)
    return user

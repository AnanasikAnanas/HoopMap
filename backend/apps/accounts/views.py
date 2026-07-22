import secrets
from contextlib import suppress
from typing import Literal, cast

from django.conf import settings
from django.core.exceptions import PermissionDenied
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import BotUserSerializer, TelegramAuthSerializer, UserSerializer
from .services import get_or_update_telegram_user, validate_telegram_init_data


def _set_refresh_cookie(response: Response, token: str) -> None:
    same_site = cast(Literal["Lax", "Strict", "None"], settings.AUTH_COOKIE_SAMESITE)
    response.set_cookie(
        key=settings.AUTH_REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.AUTH_REFRESH_COOKIE_MAX_AGE,
        domain=settings.AUTH_COOKIE_DOMAIN or None,
        path=settings.AUTH_REFRESH_COOKIE_PATH,
        secure=settings.AUTH_COOKIE_SECURE,
        httponly=True,
        samesite=same_site,
    )
    response["Cache-Control"] = "no-store"
    response["Pragma"] = "no-cache"


def _clear_refresh_cookie(response: Response) -> None:
    same_site = cast(Literal["Lax", "Strict", "None"], settings.AUTH_COOKIE_SAMESITE)
    response.delete_cookie(
        key=settings.AUTH_REFRESH_COOKIE_NAME,
        domain=settings.AUTH_COOKIE_DOMAIN or None,
        path=settings.AUTH_REFRESH_COOKIE_PATH,
        samesite=same_site,
    )


def _validate_cookie_request_origin(request) -> None:
    """Reject browser cookie requests initiated by an untrusted site."""
    origin = request.headers.get("Origin")
    if origin and origin not in settings.CORS_ALLOWED_ORIGINS:
        raise PermissionDenied("Untrusted request origin")
    if not origin and request.headers.get("Sec-Fetch-Site") == "cross-site":
        raise PermissionDenied("Cross-site browser request is missing an origin")


class TelegramAuthView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "telegram_auth"

    @extend_schema(request=TelegramAuthSerializer, responses={200: UserSerializer})
    def post(self, request):
        serializer = TelegramAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identity = validate_telegram_init_data(serializer.validated_data["init_data"])
        user = get_or_update_telegram_user(identity)
        refresh = RefreshToken.for_user(user)
        response = Response(
            {
                "access": str(refresh.access_token),
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )
        _set_refresh_cookie(response, str(refresh))
        return response


class CookieTokenRefreshView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "token_refresh"

    def post(self, request):
        _validate_cookie_request_origin(request)
        raw_refresh = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME, "")
        if not raw_refresh:
            raise InvalidToken("Refresh cookie is missing")
        serializer = TokenRefreshSerializer(data={"refresh": raw_refresh})
        serializer.is_valid(raise_exception=True)
        response = Response({"access": serializer.validated_data["access"]})
        rotated_refresh = serializer.validated_data.get("refresh", raw_refresh)
        _set_refresh_cookie(response, str(rotated_refresh))
        return response


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "token_refresh"

    def post(self, request):
        _validate_cookie_request_origin(request)
        raw_refresh = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME, "")
        if raw_refresh:
            with suppress(TokenError):
                RefreshToken(raw_refresh).blacklist()
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        response["Cache-Control"] = "no-store"
        return response


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=UserSerializer)
    def get(self, request):
        response = Response(UserSerializer(request.user).data)
        response["Cache-Control"] = "private, no-store"
        return response


class BotUserUpsertView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "internal_bot"

    @extend_schema(request=BotUserSerializer, responses=UserSerializer, exclude=True)
    def post(self, request):
        token = request.headers.get("X-Internal-Token", "")
        if not settings.INTERNAL_API_TOKEN or not secrets.compare_digest(
            token, settings.INTERNAL_API_TOKEN
        ):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        serializer = BotUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        telegram_id = data.pop("telegram_id")
        username = data.get("username") or f"tg_{telegram_id}"
        user, _ = User.objects.update_or_create(
            telegram_id=telegram_id, defaults={**data, "username": username, "is_active": True}
        )
        return Response(UserSerializer(user).data)

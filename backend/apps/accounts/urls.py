from django.urls import path

from .views import BotUserUpsertView, CookieTokenRefreshView, LogoutView, MeView, TelegramAuthView

urlpatterns = [
    path("telegram/", TelegramAuthView.as_view(), name="telegram-auth"),
    path("refresh/", CookieTokenRefreshView.as_view(), name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("bot-user/", BotUserUpsertView.as_view(), name="bot-user"),
]

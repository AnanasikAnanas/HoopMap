from typing import Any, cast

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class HoopmapUserAdmin(UserAdmin):
    list_display = ("username", "telegram_id", "role", "reputation", "is_active", "created_at")
    list_filter = ("role", "is_active", "is_staff")
    search_fields = ("username", "first_name", "last_name", "telegram_id", "email")
    fieldsets = cast(tuple[Any, ...], UserAdmin.fieldsets) + (
        ("HOOPMAP", {"fields": ("telegram_id", "avatar_url", "role", "reputation")}),
    )

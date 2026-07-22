from typing import ClassVar

from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class HoopmapUserManager(UserManager["User"]):
    def create_superuser(
        self, username: str, email: str | None = None, password: str | None = None, **extra_fields
    ):
        extra_fields.setdefault("role", User.Role.ADMIN)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        USER = "user", "Пользователь"
        MODERATOR = "moderator", "Модератор"
        ADMIN = "admin", "Администратор"

    telegram_id = models.BigIntegerField(unique=True, null=True, blank=True, db_index=True)
    avatar_url = models.URLField(blank=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.USER, db_index=True)
    reputation = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects: ClassVar[HoopmapUserManager] = HoopmapUserManager()

    @property
    def is_moderator(self) -> bool:
        return self.is_staff or self.role in {self.Role.MODERATOR, self.Role.ADMIN}

from django.conf import settings
from django.db import models

from apps.courts.models import Court


class GameEvent(models.Model):
    class SkillLevel(models.TextChoices):
        ANY = "any", "Любой"
        BEGINNER = "beginner", "Новичок"
        INTERMEDIATE = "intermediate", "Средний"
        ADVANCED = "advanced", "Опытный"

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Запланирована"
        IN_PROGRESS = "in_progress", "Проходит"
        FINISHED = "finished", "Завершена"
        CANCELLED = "cancelled", "Отменена"

    court = models.ForeignKey(Court, on_delete=models.PROTECT, related_name="games")
    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="created_games"
    )
    title = models.CharField(max_length=180)
    description = models.TextField(max_length=3000, blank=True)
    starts_at = models.DateTimeField(db_index=True)
    ends_at = models.DateTimeField()
    skill_level = models.CharField(
        max_length=20, choices=SkillLevel.choices, default=SkillLevel.ANY
    )
    max_players = models.PositiveSmallIntegerField(default=10)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.SCHEDULED, db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("starts_at",)
        indexes = [models.Index(fields=("status", "starts_at"))]

    def __str__(self) -> str:
        return self.title


class GameParticipant(models.Model):
    class Status(models.TextChoices):
        JOINED = "joined", "Участвует"
        LEFT = "left", "Вышел"

    game = models.ForeignKey(GameEvent, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="game_participations"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.JOINED)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("game", "user"), name="unique_game_participant")
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.game}"

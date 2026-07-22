import os
from typing import Any

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

PointField: Any
if os.getenv("HOOPMAP_NO_GIS"):

    class TypecheckPointField(models.Field):
        def __init__(self, *args, geography=True, srid=4326, spatial_index=True, **kwargs):
            super().__init__(*args, **kwargs)

    PointField = TypecheckPointField
else:
    from django.contrib.gis.db.models import PointField as GISPointField

    PointField = GISPointField


class Court(models.Model):
    class CourtType(models.TextChoices):
        FULL = "full", "Полноценная"
        HALF = "half", "Половина площадки"
        SINGLE_HOOP = "single_hoop", "Одно кольцо"
        INDOOR = "indoor", "Крытая площадка"
        OUTDOOR = "outdoor", "Уличная площадка"

    class AccessType(models.TextChoices):
        FREE = "free", "Свободный"
        RESTRICTED = "restricted", "Ограниченный"
        PAID = "paid", "Платный"
        PRIVATE = "private", "Частный"

    class Surface(models.TextChoices):
        ASPHALT = "asphalt", "Асфальт"
        RUBBER = "rubber", "Резина"
        CONCRETE = "concrete", "Бетон"
        PARQUET = "parquet", "Паркет"
        OTHER = "other", "Другое"

    class Condition(models.TextChoices):
        EXCELLENT = "excellent", "Отличное"
        GOOD = "good", "Хорошее"
        FAIR = "fair", "Удовлетворительное"
        POOR = "poor", "Плохое"
        UNKNOWN = "unknown", "Неизвестно"

    class Status(models.TextChoices):
        DRAFT = "draft", "Черновик"
        PENDING = "pending", "На модерации"
        PUBLISHED = "published", "Опубликована"
        REJECTED = "rejected", "Отклонена"
        TEMPORARILY_CLOSED = "temporarily_closed", "Временно закрыта"
        CLOSED = "closed", "Закрыта"

    name = models.CharField(max_length=180)
    slug = models.SlugField(max_length=220, unique=True)
    description = models.TextField(blank=True)
    address = models.CharField(max_length=300)
    city = models.CharField(max_length=120, db_index=True)
    country = models.CharField(max_length=120, db_index=True)
    location = PointField(geography=True, srid=4326, spatial_index=True)
    court_type = models.CharField(max_length=20, choices=CourtType.choices)
    access_type = models.CharField(
        max_length=20, choices=AccessType.choices, default=AccessType.FREE
    )
    surface = models.CharField(max_length=20, choices=Surface.choices, default=Surface.OTHER)
    hoops_count = models.PositiveSmallIntegerField(default=1, validators=[MaxValueValidator(20)])
    has_lighting = models.BooleanField(default=False)
    has_marking = models.BooleanField(default=True)
    has_nets = models.BooleanField(default=False)
    condition = models.CharField(
        max_length=20, choices=Condition.choices, default=Condition.UNKNOWN
    )
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    source = models.CharField(max_length=80, blank=True)
    source_id = models.CharField(max_length=160, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="courts"
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("source", "source_id"),
                condition=~models.Q(source="") & ~models.Q(source_id=""),
                name="unique_nonempty_court_source",
            )
        ]

    def __str__(self) -> str:
        return self.name


class CourtPhoto(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "На модерации"
        APPROVED = "approved", "Одобрена"
        REJECTED = "rejected", "Отклонена"

    court = models.ForeignKey(Court, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to="courts/originals/%Y/%m/")
    thumbnail = models.ImageField(upload_to="courts/thumbnails/%Y/%m/", blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="court_photos"
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Фото: {self.court}"


class CourtReview(models.Model):
    court = models.ForeignKey(Court, on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="court_reviews"
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    text = models.TextField(max_length=3000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("court", "user"), name="unique_court_review")
        ]

    def __str__(self) -> str:
        return f"{self.user}: {self.court} — {self.rating}/5"


class CourtReport(models.Model):
    class ReportType(models.TextChoices):
        NOT_EXISTS = "not_exists", "Площадки не существует"
        CLOSED = "closed", "Площадка закрыта"
        HOOP_DAMAGED = "hoop_damaged", "Повреждено кольцо"
        SURFACE_DAMAGED = "surface_damaged", "Повреждено покрытие"
        WRONG_ADDRESS = "wrong_address", "Неверный адрес"
        WRONG_DETAILS = "wrong_details", "Неверные характеристики"
        DUPLICATE = "duplicate", "Дубликат"
        OTHER = "other", "Другое"

    class Status(models.TextChoices):
        OPEN = "open", "Открыта"
        RESOLVED = "resolved", "Решена"
        REJECTED = "rejected", "Отклонена"

    court = models.ForeignKey(Court, on_delete=models.CASCADE, related_name="reports")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="court_reports"
    )
    report_type = models.CharField(max_length=24, choices=ReportType.choices)
    description = models.TextField(max_length=3000, blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.OPEN, db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.get_report_type_display()}: {self.court}"


class CourtVerification(models.Model):
    court = models.ForeignKey(Court, on_delete=models.CASCADE, related_name="verifications")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="court_verifications"
    )
    is_confirmed = models.BooleanField(default=True)
    comment = models.TextField(max_length=1000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self) -> str:
        return f"{self.user}: {self.court}"


class FavoriteCourt(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="favorite_courts"
    )
    court = models.ForeignKey(Court, on_delete=models.CASCADE, related_name="favorited_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("user", "court"), name="unique_favorite_court")
        ]

    def __str__(self) -> str:
        return f"{self.user}: {self.court}"

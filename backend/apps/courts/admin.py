import logging

from django.contrib import admin, messages
from django.contrib.gis.admin import GISModelAdmin
from django.utils import timezone
from django.utils.html import format_html

from .models import Court, CourtPhoto, CourtReport, CourtReview, CourtVerification, FavoriteCourt
from .services import find_duplicate_courts
from .tasks import notify_court_moderation

logger = logging.getLogger(__name__)


class PhotoInline(admin.TabularInline):
    model = CourtPhoto
    extra = 0
    readonly_fields = ("preview", "created_at")

    @admin.display(description="Фото")
    def preview(self, obj):
        if not obj.thumbnail:
            return "—"
        return format_html(
            '<img src="{}" width="120" style="border-radius:8px" />', obj.thumbnail.url
        )


@admin.action(description="Опубликовать выбранные площадки")
def publish_courts(modeladmin, request, queryset):
    updated = queryset.update(status=Court.Status.PUBLISHED, verified_at=timezone.now())
    for court in queryset.select_related("created_by"):
        notify_court_moderation.delay(
            getattr(court.created_by, "telegram_id", None), court.name, Court.Status.PUBLISHED
        )
    logger.info("admin_action=publish_courts actor=%s count=%s", request.user.pk, updated)
    modeladmin.message_user(request, f"Опубликовано: {updated}", messages.SUCCESS)


@admin.action(description="Отклонить выбранные площадки")
def reject_courts(modeladmin, request, queryset):
    updated = queryset.update(status=Court.Status.REJECTED)
    for court in queryset.select_related("created_by"):
        notify_court_moderation.delay(
            getattr(court.created_by, "telegram_id", None), court.name, Court.Status.REJECTED
        )
    logger.info("admin_action=reject_courts actor=%s count=%s", request.user.pk, updated)
    modeladmin.message_user(request, f"Отклонено: {updated}", messages.WARNING)


@admin.register(Court)
class CourtAdmin(GISModelAdmin):
    list_display = (
        "name",
        "city",
        "status",
        "condition",
        "created_by",
        "verified_at",
        "duplicate_count",
    )
    list_filter = ("status", "city", "country", "condition", "surface", "access_type")
    search_fields = ("name", "address", "city", "source_id", "created_by__username")
    readonly_fields = ("slug", "created_at", "updated_at", "possible_duplicates")
    actions = (publish_courts, reject_courts)
    inlines = (PhotoInline,)

    @admin.display(description="Дубликаты ≤ 50 м")
    def duplicate_count(self, obj):
        return find_duplicate_courts(obj).count() if obj.pk else 0

    @admin.display(description="Возможные дубликаты")
    def possible_duplicates(self, obj):
        if not obj.pk:
            return "Сохраните площадку для поиска"
        duplicates = find_duplicate_courts(obj)[:10]
        return (
            ", ".join(f"{item.name} ({round(item.distance.m)} м)" for item in duplicates)
            or "Не найдены"
        )

    def save_model(self, request, obj, form, change):
        logger.info(
            "admin_model_save actor=%s court=%s changed=%s",
            request.user.pk,
            obj.pk,
            form.changed_data,
        )
        super().save_model(request, obj, form, change)


@admin.register(CourtPhoto)
class CourtPhotoAdmin(admin.ModelAdmin):
    list_display = ("court", "preview", "status", "uploaded_by", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("court__name", "uploaded_by__username")
    actions = ("approve", "reject")

    @admin.display(description="Фото")
    def preview(self, obj):
        source = obj.thumbnail or obj.image
        return format_html('<img src="{}" width="100" style="border-radius:8px" />', source.url)

    @admin.action(description="Одобрить фотографии")
    def approve(self, request, queryset):
        queryset.update(status=CourtPhoto.Status.APPROVED)

    @admin.action(description="Отклонить фотографии")
    def reject(self, request, queryset):
        queryset.update(status=CourtPhoto.Status.REJECTED)


@admin.register(CourtReport)
class CourtReportAdmin(admin.ModelAdmin):
    list_display = ("court", "report_type", "status", "user", "created_at")
    list_filter = ("status", "report_type", "created_at")
    search_fields = ("court__name", "description", "user__username")


admin.site.register(CourtReview)
admin.site.register(CourtVerification)
admin.site.register(FavoriteCourt)
admin.site.site_header = "HOOPMAP — управление"
admin.site.site_title = "HOOPMAP"

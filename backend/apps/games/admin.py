from django.contrib import admin

from .models import GameEvent, GameParticipant


class ParticipantInline(admin.TabularInline):
    model = GameParticipant
    extra = 0
    readonly_fields = ("joined_at",)


@admin.register(GameEvent)
class GameEventAdmin(admin.ModelAdmin):
    list_display = ("title", "court", "starts_at", "skill_level", "status", "max_players")
    list_filter = ("status", "skill_level", "starts_at")
    search_fields = ("title", "court__name", "creator__username")
    inlines = (ParticipantInline,)

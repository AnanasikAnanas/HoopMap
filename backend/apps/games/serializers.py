from rest_framework import serializers

from apps.accounts.serializers import PublicUserSerializer
from apps.courts.models import Court
from apps.courts.serializers import CourtSerializer

from .models import GameEvent, GameParticipant


class GameParticipantSerializer(serializers.ModelSerializer):
    user = PublicUserSerializer(read_only=True)

    class Meta:
        model = GameParticipant
        fields = ("id", "user", "status", "joined_at")


class GameSerializer(serializers.ModelSerializer):
    creator = PublicUserSerializer(read_only=True)
    court = serializers.PrimaryKeyRelatedField(
        queryset=Court.objects.filter(status=Court.Status.PUBLISHED), write_only=True
    )
    court_details = CourtSerializer(source="court", read_only=True)
    participants = serializers.SerializerMethodField()
    players_count = serializers.IntegerField(read_only=True)
    is_joined = serializers.SerializerMethodField()

    class Meta:
        model = GameEvent
        fields = (
            "id",
            "court",
            "court_details",
            "creator",
            "title",
            "description",
            "starts_at",
            "ends_at",
            "skill_level",
            "max_players",
            "status",
            "created_at",
            "updated_at",
            "participants",
            "players_count",
            "is_joined",
        )
        read_only_fields = ("id", "creator", "status", "created_at", "updated_at")

    def validate(self, attrs):
        starts = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({"ends_at": "Окончание должно быть позже начала"})
        max_players = attrs.get("max_players", getattr(self.instance, "max_players", 10))
        if not 2 <= max_players <= 100:
            raise serializers.ValidationError({"max_players": "Допустимо от 2 до 100 игроков"})
        return attrs

    def get_participants(self, obj: GameEvent):
        active = obj.participants.filter(status=GameParticipant.Status.JOINED)
        return GameParticipantSerializer(active, many=True).data

    def get_is_joined(self, obj: GameEvent) -> bool:
        request = self.context.get("request")
        return bool(
            request
            and request.user.is_authenticated
            and obj.participants.filter(
                user=request.user, status=GameParticipant.Status.JOINED
            ).exists()
        )

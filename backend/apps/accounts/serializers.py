from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "telegram_id",
            "username",
            "first_name",
            "last_name",
            "avatar_url",
            "email",
            "role",
            "reputation",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class PublicUserSerializer(serializers.ModelSerializer):
    """Public profile deliberately excludes Telegram and contact identifiers."""

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "avatar_url",
            "role",
            "reputation",
        )
        read_only_fields = fields


class TelegramAuthSerializer(serializers.Serializer):
    init_data = serializers.CharField(max_length=8192)


class BotUserSerializer(serializers.Serializer):
    telegram_id = serializers.IntegerField(min_value=1)
    username = serializers.CharField(max_length=150, allow_blank=True, required=False)
    first_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    last_name = serializers.CharField(max_length=150, allow_blank=True, required=False)

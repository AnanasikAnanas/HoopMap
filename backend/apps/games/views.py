from typing import cast

from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.db import transaction
from django.db.models import Count, Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.models import User

from .filters import GameFilter
from .models import GameEvent, GameParticipant
from .permissions import GamePermission
from .serializers import GameParticipantSerializer, GameSerializer
from .services import join_game, leave_game


class GameViewSet(viewsets.ModelViewSet):
    serializer_class = GameSerializer
    permission_classes = [GamePermission]
    filterset_class = GameFilter
    ordering_fields = ("starts_at", "created_at")

    def get_throttles(self):
        scopes = {"create": "game_create", "join": "game_join", "leave": "game_join"}
        throttles = super().get_throttles()
        if scope := scopes.get(self.action):
            self.throttle_scope = scope
            throttles.append(ScopedRateThrottle())
        return throttles

    def get_queryset(self):
        queryset = (
            GameEvent.objects.select_related("court", "creator")
            .prefetch_related("participants__user", "court__photos")
            .annotate(
                players_count=Count(
                    "participants", filter=Q(participants__status=GameParticipant.Status.JOINED)
                )
            )
        )
        if self.request.query_params.get("mine") == "true":
            if not self.request.user.is_authenticated:
                return queryset.none()
            queryset = queryset.filter(
                Q(creator=self.request.user)
                | Q(
                    participants__user=self.request.user,
                    participants__status=GameParticipant.Status.JOINED,
                )
            ).distinct()
        lat, lon, radius = (
            self.request.query_params.get("lat"),
            self.request.query_params.get("lon"),
            self.request.query_params.get("radius", "5000"),
        )
        if lat is not None or lon is not None:
            if lat is None or lon is None:
                raise ValidationError("Передайте одновременно lat и lon")
            try:
                point = Point(float(lon), float(lat), srid=4326)
                radius_int = int(radius)
            except (TypeError, ValueError) as exc:
                raise ValidationError("Некорректные lat, lon или radius") from exc
            if not (-90 <= point.y <= 90 and -180 <= point.x <= 180):
                raise ValidationError("Координаты вне допустимого диапазона")
            if not 1 <= radius_int <= 100_000:
                raise ValidationError("Радиус должен быть от 1 до 100000 метров")
            queryset = (
                queryset.filter(court__location__distance_lte=(point, D(m=radius_int)))
                .annotate(distance=Distance("court__location", point))
                .order_by("distance")
            )
        return queryset

    @transaction.atomic
    def perform_create(self, serializer):
        user = cast(User, self.request.user)
        game = serializer.save(creator=user, status=GameEvent.Status.SCHEDULED)
        GameParticipant.objects.create(game=game, user=user)

    def perform_destroy(self, instance):
        if instance.status == GameEvent.Status.SCHEDULED:
            instance.status = GameEvent.Status.CANCELLED
            instance.save(update_fields=("status", "updated_at"))
        else:
            raise ValidationError("Можно отменить только запланированную игру")

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def join(self, request, pk=None):
        participant = join_game(game=self.get_object(), user=request.user)
        return Response(GameParticipantSerializer(participant).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def leave(self, request, pk=None):
        leave_game(game=self.get_object(), user=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

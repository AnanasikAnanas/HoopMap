from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .filters import CourtFilter
from .models import Court, CourtReport, CourtReview, FavoriteCourt
from .permissions import CourtPermission, IsModerator
from .selectors import courts_in_bbox, courts_with_stats, nearby_courts
from .serializers import (
    CourtPhotoUploadSerializer,
    CourtReportSerializer,
    CourtReviewSerializer,
    CourtSerializer,
    CourtVerificationSerializer,
)
from .services import find_duplicate_courts, set_favorite, verify_court
from .tasks import notify_court_moderation


@extend_schema_view(
    list=extend_schema(
        parameters=[OpenApiParameter("bbox", str, description="min_lon,min_lat,max_lon,max_lat")]
    ),
    retrieve=extend_schema(description="Подробная информация о площадке"),
    create=extend_schema(description="Отправить новую площадку на модерацию"),
)
class CourtViewSet(viewsets.ModelViewSet):
    serializer_class = CourtSerializer
    permission_classes = [CourtPermission]
    filterset_class = CourtFilter
    ordering_fields = ("created_at", "verified_at", "name")
    lookup_field = "pk"

    def get_object(self):
        queryset = self.filter_queryset(self.get_queryset())
        lookup = self.kwargs["pk"]
        query = Q(pk=int(lookup)) if lookup.isdigit() else Q(slug=lookup)
        obj = get_object_or_404(queryset, query)
        self.check_object_permissions(self.request, obj)
        return obj

    def get_queryset(self):
        queryset = Court.objects.all()
        user = self.request.user
        if not (user.is_authenticated and user.is_moderator):
            visible = Q(status=Court.Status.PUBLISHED)
            if user.is_authenticated:
                visible |= Q(created_by=user)
            queryset = queryset.filter(visible)
        if self.request.query_params.get("mine") == "true":
            if not user.is_authenticated:
                return queryset.none()
            queryset = queryset.filter(created_by=user)
        if self.request.query_params.get("favorite") == "true":
            if not user.is_authenticated:
                return queryset.none()
            queryset = queryset.filter(favorited_by__user=user)
        queryset = courts_with_stats(queryset)
        if user.is_authenticated:
            queryset = queryset.annotate(
                is_favorite_value=Exists(
                    FavoriteCourt.objects.filter(court=OuterRef("pk"), user=user)
                )
            )
        bbox = self.request.query_params.get("bbox")
        if bbox:
            try:
                queryset = courts_in_bbox(queryset, bbox)
            except ValueError as exc:
                raise ValidationError({"bbox": str(exc)}) from exc
        return queryset

    def get_throttles(self):
        scopes = {
            "create": "court_create",
            "verify": "court_verify",
            "photos": "photo_upload",
            "reviews": "review_write",
            "reports": "report_create",
        }
        throttles = super().get_throttles()
        if scope := scopes.get(self.action):
            self.throttle_scope = scope
            throttles.append(ScopedRateThrottle())
        return throttles

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        court = self.get_object()
        if not request.user.is_moderator and court.status not in {
            Court.Status.DRAFT,
            Court.Status.PENDING,
        }:
            raise ValidationError("Опубликованную площадку может удалить только модератор")
        return super().destroy(request, *args, **kwargs)

    @extend_schema(
        parameters=[
            OpenApiParameter("lat", float),
            OpenApiParameter("lon", float),
            OpenApiParameter("radius", int),
        ]
    )
    @action(detail=False, methods=["get"], permission_classes=[permissions.AllowAny])
    def nearby(self, request):
        try:
            lat = float(request.query_params["lat"])
            lon = float(request.query_params["lon"])
            radius = int(request.query_params.get("radius", 5000))
            queryset = nearby_courts(self.filter_queryset(self.get_queryset()), lat, lon, radius)
        except (KeyError, ValueError) as exc:
            raise ValidationError("Передайте корректные lat, lon и radius") from exc
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page or queryset, many=True)
        return (
            self.get_paginated_response(serializer.data)
            if page is not None
            else Response(serializer.data)
        )

    @action(detail=True, methods=["get"], url_path="duplicates")
    def duplicates(self, request, pk=None):
        court = self.get_object()
        return Response(self.get_serializer(find_duplicate_courts(court), many=True).data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def photos(self, request, pk=None):
        serializer = CourtPhotoUploadSerializer(
            data=request.data, context={"request": request, "court": self.get_object()}
        )
        serializer.is_valid(raise_exception=True)
        photo = serializer.save()
        return Response(serializer.to_representation(photo), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def reviews(self, request, pk=None):
        serializer = CourtReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review, created = CourtReview.objects.update_or_create(
            court=self.get_object(), user=request.user, defaults=serializer.validated_data
        )
        return Response(
            CourtReviewSerializer(review).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def reports(self, request, pk=None):
        serializer = CourtReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = CourtReport.objects.create(
            court=self.get_object(), user=request.user, **serializer.validated_data
        )
        return Response(CourtReportSerializer(report).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def verify(self, request, pk=None):
        serializer = CourtVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        verification = verify_court(
            court=self.get_object(), user=request.user, **serializer.validated_data
        )
        return Response(
            CourtVerificationSerializer(verification).data, status=status.HTTP_201_CREATED
        )

    @action(
        detail=True, methods=["post", "delete"], permission_classes=[permissions.IsAuthenticated]
    )
    def favorite(self, request, pk=None):
        court = self.get_object()
        if request.method == "POST":
            _, created = set_favorite(court=court, user=request.user)
            return Response(
                {"is_favorite": True},
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
            )
        FavoriteCourt.objects.filter(court=court, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], permission_classes=[IsModerator])
    def moderate(self, request, pk=None):
        court = self.get_object()
        new_status = request.data.get("status")
        if new_status not in {
            Court.Status.PUBLISHED,
            Court.Status.REJECTED,
            Court.Status.CLOSED,
            Court.Status.TEMPORARILY_CLOSED,
        }:
            raise ValidationError("Недопустимый статус модерации")
        court.status = new_status
        court.save(update_fields=("status", "updated_at"))
        notify_court_moderation.delay(
            getattr(court.created_by, "telegram_id", None), court.name, new_status
        )
        return Response(self.get_serializer(court).data)

import uuid

from django.contrib.gis.geos import Point
from django.utils.text import slugify
from rest_framework import serializers

from apps.accounts.serializers import PublicUserSerializer

from .models import Court, CourtPhoto, CourtReport, CourtReview, CourtVerification
from .services import create_court_photo


class LocationField(serializers.Field):
    def to_representation(self, value: Point) -> dict[str, float]:
        return {"lat": value.y, "lon": value.x}

    def to_internal_value(self, data) -> Point:
        try:
            lat, lon = float(data["lat"]), float(data["lon"])
        except (KeyError, TypeError, ValueError) as exc:
            raise serializers.ValidationError("Передайте location в формате {lat, lon}") from exc
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise serializers.ValidationError("Координаты вне допустимого диапазона")
        return Point(lon, lat, srid=4326)


class CourtPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourtPhoto
        fields = ("id", "image", "thumbnail", "status", "created_at")
        read_only_fields = fields


class CourtReviewSerializer(serializers.ModelSerializer):
    user = PublicUserSerializer(read_only=True)

    class Meta:
        model = CourtReview
        fields = ("id", "user", "rating", "text", "created_at", "updated_at")
        read_only_fields = ("id", "user", "created_at", "updated_at")


class CourtSerializer(serializers.ModelSerializer):
    location = LocationField()
    created_by = PublicUserSerializer(read_only=True)
    photos = serializers.SerializerMethodField()
    average_rating = serializers.FloatField(read_only=True, allow_null=True)
    verifications_count = serializers.IntegerField(read_only=True, default=0)
    last_verified_at = serializers.DateTimeField(read_only=True, allow_null=True)
    distance_m = serializers.SerializerMethodField()
    is_favorite = serializers.SerializerMethodField()

    class Meta:
        model = Court
        fields = (
            "id",
            "name",
            "slug",
            "description",
            "address",
            "city",
            "country",
            "location",
            "court_type",
            "access_type",
            "surface",
            "hoops_count",
            "has_lighting",
            "has_marking",
            "has_nets",
            "condition",
            "status",
            "source",
            "source_id",
            "created_by",
            "verified_at",
            "created_at",
            "updated_at",
            "photos",
            "average_rating",
            "verifications_count",
            "last_verified_at",
            "distance_m",
            "is_favorite",
        )
        read_only_fields = ("id", "slug", "created_by", "verified_at", "created_at", "updated_at")

    def get_photos(self, obj: Court):
        request = self.context.get("request")
        can_moderate = bool(request and request.user.is_authenticated and request.user.is_moderator)
        is_owner = bool(
            request and request.user.is_authenticated and obj.created_by_id == request.user.id
        )
        photos = (
            obj.photos.all() if can_moderate or is_owner else getattr(obj, "approved_photos", [])
        )
        return CourtPhotoSerializer(photos, many=True, context=self.context).data

    def get_distance_m(self, obj: Court) -> int | None:
        distance = getattr(obj, "distance", None)
        return round(distance.m) if distance is not None else None

    def get_is_favorite(self, obj: Court) -> bool:
        request = self.context.get("request")
        annotated = getattr(obj, "is_favorite_value", None)
        if annotated is not None:
            return bool(annotated)
        return bool(
            request
            and request.user.is_authenticated
            and obj.favorited_by.filter(user=request.user).exists()
        )

    def validate_status(self, value: str) -> str:
        if self.instance is None:
            return Court.Status.PENDING
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or not request.user.is_moderator:
            raise serializers.ValidationError("Только модератор может менять статус")
        return value

    def create(self, validated_data):
        validated_data["status"] = Court.Status.PENDING
        validated_data["created_by"] = self.context["request"].user
        base = slugify(validated_data["name"], allow_unicode=True)[:180] or "court"
        validated_data["slug"] = f"{base}-{uuid.uuid4().hex[:8]}"
        if not self.context["request"].user.is_moderator:
            validated_data["source"] = ""
            validated_data["source_id"] = ""
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context["request"]
        if not request.user.is_moderator:
            for field in ("status", "source", "source_id"):
                validated_data.pop(field, None)
        return super().update(instance, validated_data)


class CourtPhotoUploadSerializer(serializers.Serializer):
    image = serializers.ImageField(write_only=True)
    photo = CourtPhotoSerializer(read_only=True)

    def create(self, validated_data):
        return create_court_photo(
            court=self.context["court"],
            user=self.context["request"].user,
            uploaded_file=validated_data["image"],
        )

    def to_representation(self, instance):
        return CourtPhotoSerializer(instance, context=self.context).data


class CourtReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourtReport
        fields = ("id", "report_type", "description", "status", "created_at", "resolved_at")
        read_only_fields = ("id", "status", "created_at", "resolved_at")


class CourtVerificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourtVerification
        fields = ("id", "is_confirmed", "comment", "created_at")
        read_only_fields = ("id", "created_at")

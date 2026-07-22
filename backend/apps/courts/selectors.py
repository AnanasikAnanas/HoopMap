from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point, Polygon
from django.contrib.gis.measure import D
from django.db.models import Avg, Count, Max, Prefetch, QuerySet

from .models import Court, CourtPhoto


def courts_with_stats(queryset: QuerySet[Court] | None = None) -> QuerySet[Court]:
    queryset = queryset or Court.objects.all()
    return (
        queryset.select_related("created_by")
        .prefetch_related(
            Prefetch(
                "photos",
                queryset=CourtPhoto.objects.filter(status=CourtPhoto.Status.APPROVED),
                to_attr="approved_photos",
            )
        )
        .annotate(
            average_rating=Avg("reviews__rating", distinct=True),
            verifications_count=Count("verifications", distinct=True),
            last_verified_at=Max("verifications__created_at"),
        )
    )


def courts_in_bbox(queryset: QuerySet[Court], bbox: str) -> QuerySet[Court]:
    try:
        min_lon, min_lat, max_lon, max_lat = map(float, bbox.split(","))
    except (TypeError, ValueError) as exc:
        raise ValueError("bbox must be min_lon,min_lat,max_lon,max_lat") from exc
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        raise ValueError("bbox coordinates are out of range")
    return queryset.filter(location__within=Polygon.from_bbox((min_lon, min_lat, max_lon, max_lat)))


def nearby_courts(
    queryset: QuerySet[Court], lat: float, lon: float, radius: int
) -> QuerySet[Court]:
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("Coordinates are out of range")
    if not (1 <= radius <= 100_000):
        raise ValueError("radius must be between 1 and 100000 meters")
    point = Point(lon, lat, srid=4326)
    return (
        queryset.filter(location__distance_lte=(point, D(m=radius)))
        .annotate(distance=Distance("location", point))
        .order_by("distance")
    )

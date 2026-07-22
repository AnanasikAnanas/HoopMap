import io
from datetime import timedelta

import pytest
from django.contrib.gis.geos import Point
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.exceptions import ValidationError

from apps.courts.models import Court, CourtVerification, FavoriteCourt
from apps.courts.services import create_court_photo, find_duplicate_courts, verify_court
from tests.conftest import CourtFactory

pytestmark = pytest.mark.django_db


def payload(**overrides):
    data = {
        "name": "Новая площадка",
        "address": "Мира, 1",
        "city": "Тольятти",
        "country": "Россия",
        "location": {"lat": 53.5, "lon": 49.4},
        "court_type": "outdoor",
        "access_type": "free",
        "surface": "asphalt",
        "hoops_count": 2,
        "has_lighting": True,
        "has_marking": True,
        "has_nets": True,
        "condition": "good",
        "description": "Описание",
    }
    data.update(overrides)
    return data


def test_create_court_is_always_pending(api_client, user):
    response = api_client.post(
        "/api/v1/courts/", payload(status="published", source="unsafe"), format="json"
    )
    assert response.status_code == 201
    court = Court.objects.get(pk=response.json()["id"])
    assert court.status == Court.Status.PENDING
    assert court.source == ""
    assert court.created_by == user


def test_bbox_returns_only_visible_courts(client):
    inside = CourtFactory(location=Point(49.4, 53.5, srid=4326))
    CourtFactory(location=Point(40.0, 50.0, srid=4326))
    response = client.get("/api/v1/courts/?bbox=49.0,53.0,50.0,54.0")
    assert response.status_code == 200
    assert [row["id"] for row in response.json()["results"]] == [inside.id]


def test_public_court_does_not_expose_private_user_identifiers(client):
    court = CourtFactory()
    court.created_by.telegram_id = 123456789
    court.created_by.email = "private@example.com"
    court.created_by.save(update_fields=("telegram_id", "email"))

    response = client.get(f"/api/v1/courts/{court.id}/")

    assert response.status_code == 200
    assert "telegram_id" not in response.json()["created_by"]
    assert "email" not in response.json()["created_by"]


def test_nearby_is_sorted_by_postgis_distance(client):
    nearest = CourtFactory(location=Point(49.4001, 53.5001, srid=4326))
    CourtFactory(location=Point(49.42, 53.52, srid=4326))
    response = client.get("/api/v1/courts/nearby/?lat=53.5&lon=49.4&radius=5000")
    assert response.status_code == 200
    assert response.json()["results"][0]["id"] == nearest.id
    assert response.json()["results"][0]["distance_m"] >= 0


def test_duplicate_search_uses_50_meter_radius():
    court = CourtFactory(location=Point(49.4, 53.5, srid=4326))
    duplicate = CourtFactory(location=Point(49.4002, 53.5002, srid=4326))
    CourtFactory(location=Point(49.42, 53.52, srid=4326))
    assert list(find_duplicate_courts(court)) == [duplicate]


def test_favorite_is_idempotent(api_client, court, user):
    assert api_client.post(f"/api/v1/courts/{court.id}/favorite/").status_code == 201
    assert api_client.post(f"/api/v1/courts/{court.id}/favorite/").status_code == 200
    assert FavoriteCourt.objects.filter(court=court, user=user).count() == 1
    assert api_client.delete(f"/api/v1/courts/{court.id}/favorite/").status_code == 204


@override_settings(COURT_VERIFICATION_COOLDOWN_DAYS=30)
def test_verification_cooldown(court, user):
    verify_court(court=court, user=user, is_confirmed=True)
    with pytest.raises(ValidationError):
        verify_court(court=court, user=user, is_confirmed=True)
    CourtVerification.objects.filter(court=court, user=user).update(
        created_at=timezone.now() - timedelta(days=31)
    )
    assert verify_court(court=court, user=user, is_confirmed=True)


def test_user_cannot_publish_own_court(api_client, user):
    court = CourtFactory(created_by=user, status=Court.Status.PENDING)
    response = api_client.patch(
        f"/api/v1/courts/{court.id}/", {"status": "published"}, format="json"
    )
    court.refresh_from_db()
    assert response.status_code == 400
    assert court.status == Court.Status.PENDING


def test_moderator_can_publish_court(api_client, user):
    user.role = user.Role.MODERATOR
    user.save(update_fields=("role",))
    court = CourtFactory(status=Court.Status.PENDING)
    response = api_client.post(
        f"/api/v1/courts/{court.id}/moderate/", {"status": "published"}, format="json"
    )
    court.refresh_from_db()
    assert response.status_code == 200
    assert court.status == Court.Status.PUBLISHED


def test_create_rate_limit(api_client):
    cache.clear()
    for index in range(5):
        response = api_client.post(
            "/api/v1/courts/", payload(name=f"Площадка {index}"), format="json"
        )
        assert response.status_code == 201
    assert (
        api_client.post(
            "/api/v1/courts/", payload(name="Лишняя площадка"), format="json"
        ).status_code
        == 429
    )


def test_rejects_image_with_unsafe_dimensions(court, user):
    raw = io.BytesIO()
    Image.new("RGB", (12_001, 1), color="white").save(raw, format="PNG")
    upload = SimpleUploadedFile("wide.png", raw.getvalue(), content_type="image/png")

    with pytest.raises(ValidationError, match="разрешение"):
        create_court_photo(court=court, user=user, uploaded_file=upload)

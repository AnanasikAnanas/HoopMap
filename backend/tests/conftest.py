import factory
import pytest
from django.contrib.gis.geos import Point
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courts.models import Court
from apps.games.models import GameEvent


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f"user{n}")


class CourtFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Court

    name = factory.Sequence(lambda n: f"Площадка {n}")
    slug = factory.Sequence(lambda n: f"court-{n}")
    address = "Спортивная, 1"
    city = "Тольятти"
    country = "Россия"
    location = Point(49.4, 53.5, srid=4326)
    court_type = Court.CourtType.OUTDOOR
    access_type = Court.AccessType.FREE
    surface = Court.Surface.ASPHALT
    hoops_count = 2
    status = Court.Status.PUBLISHED
    created_by = factory.SubFactory(UserFactory)


class GameFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = GameEvent

    court = factory.SubFactory(CourtFactory)
    creator = factory.SubFactory(UserFactory)
    title = "Вечерний 3×3"
    starts_at = factory.LazyFunction(
        lambda: __import__("django").utils.timezone.now() + __import__("datetime").timedelta(days=1)
    )
    ends_at = factory.LazyAttribute(
        lambda game: game.starts_at + __import__("datetime").timedelta(hours=2)
    )
    max_players = 10


@pytest.fixture
def user(db):
    return UserFactory()


@pytest.fixture
def api_client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def court(db):
    return CourtFactory()

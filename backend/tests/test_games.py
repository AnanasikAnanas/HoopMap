from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.games.models import GameEvent, GameParticipant
from apps.games.services import join_game, leave_game
from tests.conftest import GameFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_create_game_adds_creator(api_client, court, user):
    starts = timezone.now() + timedelta(days=1)
    response = api_client.post(
        "/api/v1/games/",
        {
            "court": court.id,
            "title": "Игра",
            "description": "",
            "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(hours=2)).isoformat(),
            "skill_level": "any",
            "max_players": 8,
        },
        format="json",
    )
    assert response.status_code == 201
    game = GameEvent.objects.get(pk=response.json()["id"])
    assert GameParticipant.objects.filter(game=game, user=user, status="joined").exists()


def test_join_and_leave_game():
    game = GameFactory()
    user = UserFactory()
    participant = join_game(game=game, user=user)
    assert participant.status == GameParticipant.Status.JOINED
    with pytest.raises(ValidationError):
        join_game(game=game, user=user)
    leave_game(game=game, user=user)
    participant.refresh_from_db()
    assert participant.status == GameParticipant.Status.LEFT


def test_game_capacity_is_transactionally_enforced():
    game = GameFactory(max_players=1)
    GameParticipant.objects.create(game=game, user=game.creator)
    with pytest.raises(ValidationError):
        join_game(game=game, user=UserFactory())


def test_creator_cannot_set_game_status_directly(api_client, user):
    game = GameFactory(creator=user, status=GameEvent.Status.SCHEDULED)

    response = api_client.patch(
        f"/api/v1/games/{game.id}/", {"status": GameEvent.Status.FINISHED}, format="json"
    )

    game.refresh_from_db()
    assert response.status_code == 200
    assert game.status == GameEvent.Status.SCHEDULED

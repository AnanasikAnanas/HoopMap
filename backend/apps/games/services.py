from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User

from .models import GameEvent, GameParticipant


@transaction.atomic
def join_game(*, game: GameEvent, user: User) -> GameParticipant:
    locked_game = GameEvent.objects.select_for_update().get(pk=game.pk)
    if locked_game.status != GameEvent.Status.SCHEDULED or locked_game.starts_at <= timezone.now():
        raise ValidationError("К этой игре уже нельзя присоединиться")
    joined_count = locked_game.participants.filter(status=GameParticipant.Status.JOINED).count()
    if joined_count >= locked_game.max_players:
        raise ValidationError("В игре нет свободных мест")
    participant, created = GameParticipant.objects.get_or_create(game=locked_game, user=user)
    if not created and participant.status == GameParticipant.Status.JOINED:
        raise ValidationError("Вы уже участвуете в этой игре")
    if not created:
        participant.status = GameParticipant.Status.JOINED
        participant.joined_at = timezone.now()
        participant.save(update_fields=("status", "joined_at"))
    return participant


@transaction.atomic
def leave_game(*, game: GameEvent, user: User) -> None:
    if game.creator_id == user.id:
        raise ValidationError("Создатель должен отменить игру, а не выходить из неё")
    updated = GameParticipant.objects.filter(
        game=game, user=user, status=GameParticipant.Status.JOINED
    ).update(status=GameParticipant.Status.LEFT)
    if not updated:
        raise ValidationError("Вы не участвуете в этой игре")

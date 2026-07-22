import io
import os
import random
from datetime import timedelta

from django.contrib.gis.geos import Point
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone
from PIL import Image, ImageDraw

from apps.accounts.models import User
from apps.games.models import GameEvent, GameParticipant

from ...models import Court, CourtPhoto, CourtReport, CourtReview, CourtVerification, FavoriteCourt


class Command(BaseCommand):
    help = "Создаёт демонстрационные данные для Тольятти"

    def handle(self, *args, **options) -> None:
        random.seed(42)
        admin, _ = User.objects.update_or_create(
            username="admin",
            defaults={
                "email": "admin@example.test",
                "role": User.Role.ADMIN,
                "is_staff": True,
                "is_superuser": True,
            },
        )
        admin.set_password(os.getenv("SEED_ADMIN_PASSWORD", "admin"))
        admin.save(update_fields=("password",))
        moderator, _ = User.objects.update_or_create(
            username="moderator",
            defaults={"role": User.Role.MODERATOR, "is_staff": True, "first_name": "Мария"},
        )
        users = [moderator]
        for index in range(1, 7):
            user, _ = User.objects.update_or_create(
                username=f"player{index}",
                defaults={
                    "first_name": f"Игрок {index}",
                    "telegram_id": 900_000 + index,
                    "reputation": index * 7,
                },
            )
            users.append(user)

        court_names = [
            "Парк Победы",
            "Набережная 6 квартала",
            "Фанни Парк",
            "Сквер Жилкина",
            "Школа №70",
            "Олимп",
            "Итальянский сквер",
            "Лесопарковое шоссе",
            "Парк Центрального района",
            "Спортивная 12",
            "Комсомольский парк",
            "Молодёжный бульвар",
            "Площадка на Тополиная",
            "Южное шоссе",
            "Революционная 52",
            "Автозаводской парк",
            "Певческое поле",
            "Стадион Торпедо",
            "Сквер Маяковского",
            "Шлюзовой",
            "Парк Сахарова",
            "Квартал 17",
            "Приморский бульвар",
            "Лицей №67",
        ]
        surfaces = list(Court.Surface.values)
        conditions = list(Court.Condition.values[:-1])
        courts: list[Court] = []
        for index, name in enumerate(court_names):
            lon = 49.28 + (index % 6) * 0.035 + random.uniform(-0.006, 0.006)
            lat = 53.47 + (index // 6) * 0.045 + random.uniform(-0.006, 0.006)
            court, created = Court.objects.update_or_create(
                slug=f"seed-court-{index + 1}",
                defaults={
                    "name": name,
                    "description": "Открытая площадка, добавленная сообществом HOOPMAP.",
                    "address": f"Тестовый адрес, {index + 1}",
                    "city": "Тольятти",
                    "country": "Россия",
                    "location": Point(lon, lat, srid=4326),
                    "court_type": Court.CourtType.OUTDOOR,
                    "access_type": Court.AccessType.FREE,
                    "surface": surfaces[index % len(surfaces)],
                    "hoops_count": 1 + index % 4,
                    "has_lighting": index % 3 == 0,
                    "has_marking": index % 5 != 0,
                    "has_nets": index % 2 == 0,
                    "condition": conditions[index % len(conditions)],
                    "status": Court.Status.PENDING if index >= 20 else Court.Status.PUBLISHED,
                    "created_by": users[index % len(users)],
                    "verified_at": timezone.now() - timedelta(days=index),
                    "source": "seed",
                    "source_id": str(index + 1),
                },
            )
            courts.append(court)
            if created or not court.photos.exists():
                image = Image.new("RGB", (1200, 800), color=(32, 37, 43))
                draw = ImageDraw.Draw(image)
                draw.rectangle((100, 100, 1100, 700), outline=(242, 106, 46), width=16)
                draw.ellipse((450, 250, 750, 550), outline=(245, 245, 242), width=10)
                buffer = io.BytesIO()
                image.save(buffer, "JPEG", quality=85)
                photo = CourtPhoto(
                    court=court, uploaded_by=court.created_by, status=CourtPhoto.Status.APPROVED
                )
                photo.image.save(f"seed-{index + 1}.jpg", ContentFile(buffer.getvalue()), save=True)

        for index, court in enumerate(courts[:20]):
            for offset in range(2):
                user = users[(index + offset) % len(users)]
                CourtReview.objects.update_or_create(
                    court=court,
                    user=user,
                    defaults={
                        "rating": 3 + (index + offset) % 3,
                        "text": "Хорошая площадка, можно играть.",
                    },
                )
            verifier = users[(index + 2) % len(users)]
            if not CourtVerification.objects.filter(court=court, user=verifier).exists():
                CourtVerification.objects.create(court=court, user=verifier, is_confirmed=True)
            FavoriteCourt.objects.get_or_create(court=court, user=users[index % len(users)])

        for index, court in enumerate(courts[:5]):
            CourtReport.objects.get_or_create(
                court=court,
                user=users[(index + 1) % len(users)],
                report_type=CourtReport.ReportType.WRONG_DETAILS,
                defaults={"description": "Проверьте состояние сетки."},
            )

        for index, court in enumerate(courts[:12]):
            starts = timezone.now() + timedelta(days=index - 3, hours=2)
            game, _ = GameEvent.objects.update_or_create(
                title=f"Игра #{index + 1}",
                court=court,
                defaults={
                    "creator": users[index % len(users)],
                    "description": "Открытая игра, берите светлую и тёмную форму.",
                    "starts_at": starts,
                    "ends_at": starts + timedelta(hours=2),
                    "skill_level": GameEvent.SkillLevel.values[
                        index % len(GameEvent.SkillLevel.values)
                    ],
                    "max_players": 10,
                    "status": GameEvent.Status.FINISHED
                    if index < 3
                    else GameEvent.Status.SCHEDULED,
                },
            )
            GameParticipant.objects.update_or_create(
                game=game, user=game.creator, defaults={"status": "joined"}
            )
            GameParticipant.objects.update_or_create(
                game=game, user=users[(index + 1) % len(users)], defaults={"status": "joined"}
            )

        self.stdout.write(
            self.style.SUCCESS(f"Готово: {len(courts)} площадки, {GameEvent.objects.count()} игр")
        )

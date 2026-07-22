import io
import uuid
import warnings
from datetime import timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User

from .models import Court, CourtPhoto, CourtVerification, FavoriteCourt
from .selectors import nearby_courts

ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
ALLOWED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
MAX_IMAGE_DIMENSION = 12_000


def find_duplicate_courts(court: Court, radius: int | None = None):
    distance = radius or settings.COURT_DUPLICATE_RADIUS_METERS
    return nearby_courts(
        Court.objects.exclude(pk=court.pk), court.location.y, court.location.x, distance
    )


@transaction.atomic
def verify_court(
    *, court: Court, user: User, is_confirmed: bool, comment: str = ""
) -> CourtVerification:
    cutoff = timezone.now() - timedelta(days=settings.COURT_VERIFICATION_COOLDOWN_DAYS)
    if CourtVerification.objects.filter(court=court, user=user, created_at__gte=cutoff).exists():
        raise ValidationError("Вы уже подтверждали эту площадку в течение установленного периода")
    verification = CourtVerification.objects.create(
        court=court, user=user, is_confirmed=is_confirmed, comment=comment
    )
    if is_confirmed:
        Court.objects.filter(pk=court.pk).update(verified_at=timezone.now())
    return verification


@transaction.atomic
def set_favorite(*, court: Court, user: User) -> tuple[FavoriteCourt, bool]:
    return FavoriteCourt.objects.get_or_create(court=court, user=user)


def create_court_photo(*, court: Court, user: User, uploaded_file) -> CourtPhoto:
    if uploaded_file.size > MAX_IMAGE_BYTES:
        raise ValidationError("Файл превышает лимит 10 МБ")
    if getattr(uploaded_file, "content_type", "") not in ALLOWED_IMAGE_MIME_TYPES:
        raise ValidationError("Недопустимый MIME-тип изображения")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(uploaded_file)
            if (
                image.width * image.height > MAX_IMAGE_PIXELS
                or max(image.size) > MAX_IMAGE_DIMENSION
            ):
                raise ValidationError("Слишком большое разрешение изображения")
            image.verify()
            uploaded_file.seek(0)
            image = Image.open(uploaded_file)
            image.load()
    except ValidationError:
        raise
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
    ) as exc:
        raise ValidationError("Файл не является корректным изображением") from exc
    if image is None:
        raise ValidationError("Файл не является корректным изображением")
    if image.format not in ALLOWED_IMAGE_FORMATS:
        raise ValidationError("Разрешены JPEG, PNG и WebP")
    transposed_image = ImageOps.exif_transpose(image)
    if transposed_image is None:
        raise ValidationError("Файл не является корректным изображением")
    converted_image = transposed_image.convert("RGB")
    converted_image.thumbnail((2400, 2400))
    original = io.BytesIO()
    converted_image.save(original, format="JPEG", quality=88, optimize=True)
    thumb_image = converted_image.copy()
    thumb_image.thumbnail((640, 640))
    thumbnail = io.BytesIO()
    thumb_image.save(thumbnail, format="JPEG", quality=82, optimize=True)
    stem = uuid.uuid4().hex
    photo = CourtPhoto(court=court, uploaded_by=user)
    photo.image.save(f"{stem}.jpg", ContentFile(original.getvalue()), save=False)
    photo.thumbnail.save(f"{stem}.jpg", ContentFile(thumbnail.getvalue()), save=False)
    photo.save()
    return photo

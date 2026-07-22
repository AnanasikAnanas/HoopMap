import requests
from celery import shared_task
from django.conf import settings


@shared_task(autoretry_for=(requests.RequestException,), retry_backoff=True, max_retries=5)
def notify_court_moderation(telegram_id: int | None, court_name: str, status: str) -> None:
    if not telegram_id or not settings.TELEGRAM_BOT_TOKEN:
        return
    labels = {"published": "опубликована", "rejected": "отклонена"}
    text = f"Площадка «{court_name}» {labels.get(status, status)}."
    response = requests.post(
        f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
        json={"chat_id": telegram_id, "text": text},
        timeout=10,
    )
    response.raise_for_status()

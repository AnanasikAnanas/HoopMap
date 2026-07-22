from typing import Any

import httpx

from .config import settings


class BackendClient:
    def __init__(self) -> None:
        self.client = httpx.AsyncClient(base_url=settings.backend_api_url, timeout=15)

    async def register_user(self, user) -> None:
        response = await self.client.post(
            "/auth/bot-user/",
            headers={"X-Internal-Token": settings.internal_api_token},
            json={
                "telegram_id": user.id,
                "username": user.username or "",
                "first_name": user.first_name or "",
                "last_name": user.last_name or "",
            },
        )
        response.raise_for_status()

    async def get(self, path: str, telegram_id: int | None = None) -> dict[str, Any]:
        headers: dict[str, str] = {}
        if telegram_id:
            headers = {"X-Internal-Token": settings.internal_api_token, "X-Telegram-Id": str(telegram_id)}
        response = await self.client.get(path, headers=headers)
        response.raise_for_status()
        return response.json()

    async def close(self) -> None:
        await self.client.aclose()


backend = BackendClient()


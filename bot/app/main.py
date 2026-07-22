import asyncio
import logging

from aiogram import Bot, Dispatcher

from .api import backend
from .config import settings
from .handlers import router


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    bot = Bot(settings.telegram_bot_token)
    dispatcher = Dispatcher()
    dispatcher.include_router(router)
    try:
        await dispatcher.start_polling(bot, allowed_updates=dispatcher.resolve_used_update_types())
    finally:
        await backend.close()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())


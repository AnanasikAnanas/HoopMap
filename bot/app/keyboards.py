from aiogram.types import KeyboardButton, ReplyKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from .config import settings


def main_menu() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🏀 Открыть карту"), KeyboardButton(text="📍 Найти рядом")],
            [KeyboardButton(text="➕ Добавить площадку"), KeyboardButton(text="🔥 Игры сегодня")],
            [KeyboardButton(text="Мои площадки"), KeyboardButton(text="Мои игры")],
        ],
        resize_keyboard=True,
        input_field_placeholder="Что хотите сделать?",
    )


def location_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="Отправить геолокацию", request_location=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def open_webapp(path: str, label: str = "Открыть в HOOPMAP"):
    builder = InlineKeyboardBuilder()
    builder.button(text=label, web_app={"url": f"{settings.telegram_webapp_url}{path}"})
    return builder.as_markup()


def court_actions(court: dict):
    builder = InlineKeyboardBuilder()
    builder.button(
        text="Открыть площадку",
        web_app={"url": f"{settings.telegram_webapp_url}/courts/{court['id']}"},
    )
    location = court["location"]
    builder.button(
        text="Маршрут",
        url=f"https://www.google.com/maps/dir/?api=1&destination={location['lat']},{location['lon']}",
    )
    builder.adjust(1)
    return builder.as_markup()


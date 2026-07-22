from datetime import date

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import Message

from .api import backend
from .keyboards import court_actions, location_keyboard, main_menu, open_webapp

router = Router()


@router.message(Command("start"))
async def start(message: Message) -> None:
    if message.from_user:
        await backend.register_user(message.from_user)
    await message.answer(
        "🏀 <b>HOOPMAP</b> — площадки и открытые игры рядом.\n\nВыберите действие в меню:",
        reply_markup=main_menu(),
        parse_mode="HTML",
    )


@router.message(Command("map"))
@router.message(F.text == "🏀 Открыть карту")
async def show_map(message: Message) -> None:
    await message.answer("Откройте живую карту площадок:", reply_markup=open_webapp("/map", "Открыть карту"))


@router.message(Command("add"))
@router.message(F.text == "➕ Добавить площадку")
async def add_court(message: Message) -> None:
    await message.answer(
        "Добавление займёт несколько минут. Площадка появится после модерации.",
        reply_markup=open_webapp("/courts/add", "Добавить площадку"),
    )


@router.message(Command("nearby"))
@router.message(F.text == "📍 Найти рядом")
async def request_location(message: Message) -> None:
    await message.answer(
        "Отправьте геолокацию — покажу до пяти ближайших площадок.",
        reply_markup=location_keyboard(),
    )


@router.message(F.location)
async def nearby(message: Message) -> None:
    location = message.location
    if not location:
        return
    try:
        data = await backend.get(
            f"/courts/nearby/?lat={location.latitude}&lon={location.longitude}&radius=5000&page_size=5"
        )
    except Exception:
        await message.answer("Не удалось связаться с сервисом. Попробуйте чуть позже.", reply_markup=main_menu())
        return
    courts = data.get("results", [])[:5]
    if not courts:
        await message.answer(
            "В радиусе 5 км площадок пока нет. Можете добавить первую!", reply_markup=main_menu()
        )
        return
    for court in courts:
        distance = court.get("distance_m")
        verified = court.get("last_verified_at") or "нет подтверждений"
        text = (
            f"🏀 <b>{court['name']}</b>\n📍 {distance} м · {court['address']}\n"
            f"Состояние: {court['condition']} · колец: {court['hoops_count']}\n"
            f"Освещение: {'есть' if court['has_lighting'] else 'нет'}\nПодтверждено: {verified}"
        )
        await message.answer(text, parse_mode="HTML", reply_markup=court_actions(court))
    await message.answer("Это ближайшие варианты.", reply_markup=main_menu())


@router.message(Command("games"))
@router.message(F.text == "🔥 Игры сегодня")
async def games_today(message: Message) -> None:
    await message.answer(
        "Открытые игры на сегодня:",
        reply_markup=open_webapp(f"/games?date={date.today().isoformat()}", "Смотреть игры"),
    )


@router.message(Command("profile"))
async def profile(message: Message) -> None:
    await message.answer("Ваш профиль HOOPMAP:", reply_markup=open_webapp("/profile", "Открыть профиль"))


@router.message(F.text == "Мои площадки")
async def my_courts(message: Message) -> None:
    await message.answer("Ваши площадки:", reply_markup=open_webapp("/profile/courts"))


@router.message(F.text == "Мои игры")
async def my_games(message: Message) -> None:
    await message.answer("Ваши игры:", reply_markup=open_webapp("/profile/games"))


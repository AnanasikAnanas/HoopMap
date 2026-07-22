from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    telegram_bot_token: str
    telegram_webapp_url: str = "http://localhost"
    backend_api_url: str = "http://backend:8000/api/v1"
    internal_api_token: str
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()


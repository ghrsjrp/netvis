from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    APP_NAME: str = "NetVis"
    DEBUG: bool = True
    DATABASE_URL: str = "postgresql://netvis:netvis@db:5432/netvis"
    REDIS_URL: str = "redis://redis:6379/0"
    SECRET_KEY: str = "changeme-in-production-use-long-random-string"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    class Config:
        env_file = ".env"

settings = Settings()

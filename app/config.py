from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="forbid",
    )

    CLIENT_ID: str = Field(..., min_length=20)
    OBJECT_ID: str = Field(..., min_length=20)
    TENANT_ID: str = Field(..., min_length=20)
    CLIENT_SECRET: str = Field(..., min_length=20)


settings = Settings()


def get_settings() -> Settings:
    return settings

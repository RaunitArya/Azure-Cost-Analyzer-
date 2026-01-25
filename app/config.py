from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="forbid",
    )

    AZURE_CLIENT_ID: str = Field(..., min_length=20)
    AZURE_OBJECT_ID: str = Field(..., min_length=20)
    AZURE_TENANT_ID: str = Field(..., min_length=20)
    AZURE_CLIENT_SECRET: str = Field(..., min_length=20)
    AZURE_SUBSCRIPTION_ID: str = Field(..., min_length=20)
    HOST: str = Field(default="127.0.0.1")
    PORT: int = Field(default=8000)
    POSTGRES_SERVER: str = Field(..., min_length=5)
    POSTGRES_PORT: int = Field(..., ge=1, le=65535)
    POSTGRES_DB: str = Field(..., min_length=3)
    POSTGRES_USER: str = Field(..., min_length=6)
    POSTGRES_PASSWORD: str = Field(..., min_length=4)
    PGADMIN_EMAIL: str = Field(..., min_length=10)
    PGADMIN_PASSWORD: str = Field(..., min_length=5)


settings = Settings()


def get_settings() -> Settings:
    return settings

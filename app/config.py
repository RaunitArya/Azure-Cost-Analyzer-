from enum import Enum
from pydantic import Field, PostgresDsn, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import logging
from loguru import logger
import sys


class Environment(str, Enum):
    """Application environment modes."""

    DEVELOPMENT = "development"
    PRODUCTION = "production"
    TESTING = "testing"


class InterceptHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        level: str | int
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        frame, depth = logging.currentframe(), 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(
            level, record.getMessage()
        )


def setup_logging(debug: bool = False) -> None:
    """Configure logging to use loguru for uvicorn logs."""
    log_level = logging.DEBUG if debug else logging.INFO

    logger.remove()
    logger.add(
        sys.stdout,
        level=log_level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <7}</level> | <level>{message}</level>",
        colorize=True,
        enqueue=True,
    )

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.setLevel(log_level)
        uvicorn_logger.propagate = False
        uvicorn_logger.addHandler(InterceptHandler())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="forbid",
    )

    # Environment configuration
    ENVIRONMENT: Environment = Field(default=Environment.DEVELOPMENT)
    DEBUG: bool = Field(default=False)

    # Azure credentials
    AZURE_CLIENT_ID: str = Field(..., min_length=20)
    AZURE_OBJECT_ID: str = Field(..., min_length=20)
    AZURE_TENANT_ID: str = Field(..., min_length=20)
    AZURE_CLIENT_SECRET: str = Field(..., min_length=20)
    AZURE_SUBSCRIPTION_ID: str = Field(..., min_length=20)

    # Server configuration
    HOST: str = Field(default="127.0.0.1")
    PORT: int = Field(default=8000)

    # Database configuration
    DATABASE_URL: PostgresDsn = Field(...)

    # Scheduler configuration
    ENABLE_SCHEDULER: bool = Field(
        default=True, description="Enable background job scheduler"
    )
    DAILY_COST_HOUR: int = Field(
        default=0, ge=0, le=23, description="Hour to fetch daily costs (0-23 hr)"
    )
    DAILY_COST_MINUTE: int = Field(
        default=0, ge=0, le=59, description="Minutes to fetch daily costs (0-59 min)"
    )
    SERVICE_COST_HOUR: int = Field(
        default=0,
        ge=0,
        le=23,
        description="Hours between service cost fetches (0-23 hr)",
    )
    SERVICE_COST_MINUTE: int = Field(
        default=0,
        ge=0,
        le=59,
        description="Minutes between service cost fetches (0-59 min)",
    )

    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.ENVIRONMENT == Environment.DEVELOPMENT

    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return self.ENVIRONMENT == Environment.PRODUCTION

    @property
    def is_testing(self) -> bool:
        """Check if running in testing mode."""
        return self.ENVIRONMENT == Environment.TESTING

    @property
    def show_docs(self) -> bool:
        """Determine if API docs should be shown."""
        return not self.is_production

    @property
    def show_debug_info(self) -> bool:
        """Determine if debug info should be exposed in responses."""
        return self.DEBUG or self.is_development

    @property
    def database_url_string(self) -> str:
        """Get DATABASE_URL as string for SQLAlchemy."""
        return str(self.DATABASE_URL)

    @model_validator(mode="after")
    def validate_minutes(self):
        if (
            getattr(self, "DAILY_COST_HOUR", 0) == 0
            and getattr(self, "DAILY_COST_MINUTE", 0) == 0
        ):
            raise ValueError(
                "DAILY_COST_HOUR and DAILY_COST_MINUTE cannot both be zero. This would cause the scheduler to run infinitely."
            )

        if (
            getattr(self, "SERVICE_COST_HOUR", 0) == 0
            and getattr(self, "SERVICE_COST_MINUTE", 0) == 0
        ):
            raise ValueError(
                "SERVICE_COST_HOUR and SERVICE_COST_MINUTE cannot both be zero. This would cause the scheduler to run infinitely."
            )
        return self


settings = Settings()

setup_logging(debug=settings.show_debug_info)


def get_settings() -> Settings:
    return settings

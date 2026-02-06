from sqlalchemy import text
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
import asyncio

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine, async_sessionmaker
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from config import settings
from loguru import logger

engine: AsyncEngine = create_async_engine(
    settings.database_url_string,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=3600,
    echo_pool=settings.DEBUG,
)

async_session: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def wait_for_db(
    max_retries: int = 3,
    retry_interval: float = 2.0,
    backoff_multiplier: float = 2.0,
) -> bool:
    """
    Wait for database to become available with exponential backoff.

    Args:
        max_retries: Maximum number of connection attempts
        retry_interval: Initial wait time between retries in seconds
        backoff_multiplier: Multiplier for exponential backoff

    Returns:
        True if connection successful

    Raises:
        ConnectionError: If database is unreachable after all retries
    """
    current_interval = retry_interval

    for attempt in range(1, max_retries + 1):
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
                if settings.show_debug_info:
                    logger.info(
                        f"Database connection established (attempt {attempt}/{max_retries})"
                    )
                else:
                    logger.info("Database connection established")
                return True
        except Exception as e:
            if attempt == max_retries:
                if settings.show_debug_info:
                    logger.error(
                        f"Database connection failed after {max_retries} attempts: {e}"
                    )
                else:
                    logger.error("Database connection failed")
                raise ConnectionError(
                    f"Could not connect to database after {max_retries} attempts"
                ) from e

            if settings.show_debug_info:
                logger.warning(
                    f"Database connection attempt {attempt}/{max_retries} failed. "
                    f"Retrying in {current_interval:.1f}s... Error: {e}"
                )
            else:
                logger.warning(
                    f"Database unavailable, retrying in {current_interval:.1f}s..."
                )

            await asyncio.sleep(current_interval)
            current_interval *= backoff_multiplier

    return False


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency that provides an async database session.
    Commits on success, rolls back on SQLAlchemy errors.
    """
    async with async_session() as session:
        try:
            yield session
        except asyncio.CancelledError:
            raise
        except SQLAlchemyError:
            await session.rollback()
            raise


@asynccontextmanager
async def get_session_context() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager for database sessions outside of FastAPI dependencies.

    Usage:
        async with get_session_context() as session:
            ...
    """
    async with async_session() as session:
        try:
            yield session
        except asyncio.CancelledError:
            raise
        except SQLAlchemyError:
            await session.rollback()
            raise


async def init_db() -> None:
    """Initialize the database by creating all tables."""
    await wait_for_db()
    try:
        async with engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)
            logger.info("Database tables created")
    except Exception:
        if settings.DEBUG:
            logger.exception("Error initializing database")
        else:
            logger.error("Error initializing database")
        raise


async def close_db() -> None:
    """Close the database engine and dispose connections."""
    await engine.dispose()

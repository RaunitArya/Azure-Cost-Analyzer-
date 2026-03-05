import os
import sys
from logging.config import fileConfig
from pathlib import Path

import db.models  # noqa: F401
from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

# -------------------------------------------------------
# PATH SETUP
# -------------------------------------------------------
# Add app/ directory to sys.path so we can import our modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# -------------------------------------------------------
# DATABASE URL SETUP
# -------------------------------------------------------
# Load DATABASE_URL directly from .env using python-dotenv.
# We intentionally avoid importing Settings from config.py
# because it requires all Azure credentials to be present,
# which Alembic doesn't need.

from dotenv import load_dotenv

# .env is two levels up from env.py: app/alembic/env.py -> project root
env_file = Path(__file__).resolve().parent.parent.parent / ".env"

if not env_file.exists():
    raise FileNotFoundError(f".env file not found at: {env_file}")

load_dotenv(env_file)

database_url = os.getenv("DATABASE_URL")

if not database_url:
    raise ValueError("DATABASE_URL not found in .env file")

# Alembic runs synchronously (it's a CLI tool, not an async server).
# psycopg3 async driver (postgresql+psycopg://) requires SelectorEventLoop
# on Windows, but Alembic doesn't need async at all.
# We convert to the sync psycopg3 driver to avoid all event loop issues.
database_url = database_url.replace("postgresql+psycopg://", "postgresql+psycopg://")

# If you want to be extra safe, use the explicit sync driver:
# database_url = database_url.replace("postgresql+psycopg://", "postgresql://")


# -------------------------------------------------------
# ALEMBIC CONFIG
# -------------------------------------------------------
config = context.config

# Set the database URL programmatically
config.set_main_option("sqlalchemy.url", database_url)

# Setup logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# This is what Alembic uses to detect schema changes
target_metadata = SQLModel.metadata


# -------------------------------------------------------
# MIGRATION FUNCTIONS
# -------------------------------------------------------


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.
    Generates SQL script without connecting to the database.
    Useful for reviewing what will be run before applying.

    Usage: alembic upgrade head --sql
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode.
    Connects to database and applies migrations directly.
    Uses synchronous engine - no async/event loop issues.

    Usage: alembic upgrade head
    """
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = database_url  # type: ignore

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

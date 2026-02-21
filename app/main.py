from contextlib import asynccontextmanager


import uvicorn
from config import settings

from fastapi import FastAPI

from loguru import logger
from routes.cost_routes import router as cost_router
from services.cost_service import shutdown_executor
from db.database import init_db, close_db, get_session_context

from handlers.exception_handlers import register_exception_handlers

from scheduler import (
    get_scheduler_status,
    shutdown_scheduler,
    start_scheduler,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI application.
    Handles startup and shutdown events.
    """
    # Startup
    logger.info("Starting Azure Cost Analyzer API...")
    logger.info("Initializing database connection...")
    await init_db()
    logger.info("Database initialized successfully")

    if settings.ENABLE_SCHEDULER:
        logger.info("Starting background scheduler...")
        start_scheduler()
        logger.info("Background scheduler started")
    else:
        logger.info("Background scheduler disabled (ENABLE_SCHEDULER=false)")

    yield

    # Shutdown
    logger.info("Shutting down Azure Cost Analyzer API...")

    if settings.ENABLE_SCHEDULER:
        logger.info("Stopping background scheduler...")
        shutdown_scheduler()
        logger.info("Background scheduler stopped")

    logger.info("Closing database connections...")
    await close_db()
    logger.info("Database connections closed")
    shutdown_executor()
    logger.info("Cleanup complete")


app = FastAPI(
    title="Azure Cost Analyzer API",
    version="1.0.0",
    description="API for analyzing Azure cloud costs and usage",
    lifespan=lifespan,
    # Hide docs in production
    docs_url="/docs" if settings.show_docs else None,
    redoc_url="/redoc" if settings.show_docs else None,
    openapi_url="/openapi.json" if settings.show_docs else None,
)


# Register exception handlers
register_exception_handlers(app)


# Register routers
app.include_router(cost_router)


@app.get("/")
async def home():
    response = {
        "message": "Welcome to Azure Cost Analyzer API",
        "version": "1.0.0",
        "description": "API for analyzing Azure cloud costs and usage",
        "endpoints": {"costs": "/costs", "health": "/health"},
    }

    # Only show docs URL in non-production
    if settings.show_docs:
        response["docs_url"] = "/docs"

    # Show environment info only in development
    if settings.show_debug_info:
        response["environment"] = settings.ENVIRONMENT.value
        response["debug_mode"] = settings.DEBUG

    return response


@app.get("/health")
async def health_check():
    from sqlalchemy import text

    try:
        async with get_session_context() as session:
            await session.exec(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    response = {
        "status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
    }

    # Add extra info in development
    if settings.show_debug_info:
        response["environment"] = settings.ENVIRONMENT.value

    return response


@app.get("/status", tags=["scheduler"])
async def scheduler_status():
    """
    Get current scheduler status and job information.
    Shows when jobs will run next.
    """
    return get_scheduler_status()


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.is_development,
        log_config=None,
    )

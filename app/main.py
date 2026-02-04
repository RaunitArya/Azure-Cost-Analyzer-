from contextlib import asynccontextmanager
import traceback

import uvicorn
from config import settings
from exceptions.cost_exceptions import (
    AzureApiError,
    DataProcessingError,
    DataValidationError,
)
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from loguru import logger
from routes.cost_routes import router as cost_router
from services.cost_service import shutdown_executor


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI application.
    Handles startup and shutdown events.
    """
    # Startup
    logger.info("Starting Azure Cost Analyzer API...")
    yield
    # Shutdown
    logger.info("Shutting down Azure Cost Analyzer API...")
    shutdown_executor()
    logger.info("Cleanup complete")


def create_error_response(
    status_code: int,
    message: str,
    exc: Exception | None = None,
    include_debug: bool = False,
) -> JSONResponse:
    """
    Create a standardized error response.
    In production, sensitive details are hidden.
    """
    content = {"detail": message}

    if include_debug and settings.show_debug_info and exc:
        content["debug"] = {
            "exception_type": type(exc).__name__,
            "exception_message": str(exc),
            "traceback": traceback.format_exc() if settings.DEBUG else None,
        }

    return JSONResponse(status_code=status_code, content=content)


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


# Global Exception Handlers
@app.exception_handler(AzureApiError)
async def azure_api_error_handler(request: Request, exc: AzureApiError):
    logger.error(f"Azure API error: {exc}")
    return create_error_response(
        status_code=502,
        message="Azure API error occurred" if settings.is_production else str(exc),
        exc=exc,
        include_debug=True,
    )


@app.exception_handler(DataProcessingError)
async def data_processing_error_handler(request: Request, exc: DataProcessingError):
    logger.error(f"Data processing error: {exc}")
    return create_error_response(
        status_code=500,
        message="Data processing error" if settings.is_production else str(exc),
        exc=exc,
        include_debug=True,
    )


@app.exception_handler(DataValidationError)
async def data_validation_error_handler(request: Request, exc: DataValidationError):
    logger.error(f"Data validation error: {exc}")
    return create_error_response(
        status_code=422,
        message="Data validation error" if settings.is_production else str(exc),
        exc=exc,
        include_debug=True,
    )


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    logger.exception(f"Unexpected error: {exc}")
    return create_error_response(
        status_code=500,
        message="An unexpected error occurred",
        exc=exc,
        include_debug=True,
    )


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
    response = {"status": "healthy"}

    # Add extra info in development
    if settings.show_debug_info:
        response["environment"] = settings.ENVIRONMENT.value

    return response


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.is_development,
        log_config=None,
    )

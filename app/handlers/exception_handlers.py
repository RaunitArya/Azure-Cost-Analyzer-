from fastapi import Request
from loguru import logger
from exceptions.cost_exceptions import (
    AzureApiError,
    DataProcessingError,
    DataValidationError,
)
from utils.responses import create_error_response
from config import settings


async def azure_api_error_handler(request: Request, exc: AzureApiError):
    logger.error(f"Azure API error: {exc}")
    return create_error_response(
        status_code=502,
        message="Azure API error occurred" if settings.is_production else str(exc),
        exc=exc,
        include_debug=True,
    )


async def data_processing_error_handler(request: Request, exc: DataProcessingError):
    logger.error(f"Data processing error: {exc}")
    return create_error_response(
        status_code=500,
        message="Data processing error" if settings.is_production else str(exc),
        exc=exc,
        include_debug=True,
    )


async def data_validation_error_handler(request: Request, exc: DataValidationError):
    logger.error(f"Data validation error: {exc}")
    return create_error_response(
        status_code=422,
        message="Data validation error" if settings.is_production else str(exc),
        exc=exc,
        include_debug=True,
    )


async def generic_error_handler(request: Request, exc: Exception):
    logger.exception(f"Unexpected error: {exc}")
    return create_error_response(
        status_code=500,
        message="An unexpected error occurred",
        exc=exc,
        include_debug=True,
    )


def register_exception_handlers(app):
    """Register all exception handlers with the FastAPI app."""
    app.add_exception_handler(AzureApiError, azure_api_error_handler)
    app.add_exception_handler(DataProcessingError, data_processing_error_handler)
    app.add_exception_handler(DataValidationError, data_validation_error_handler)
    app.add_exception_handler(Exception, generic_error_handler)

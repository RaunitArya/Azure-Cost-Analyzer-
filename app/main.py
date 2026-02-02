from contextlib import asynccontextmanager

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


app = FastAPI(lifespan=lifespan)


# Global Exception Handlers
@app.exception_handler(AzureApiError)
async def azure_api_error_handler(request: Request, exc: AzureApiError):
    logger.error(f"Azure API error: {exc}")
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(DataProcessingError)
async def data_processing_error_handler(request: Request, exc: DataProcessingError):
    logger.error(f"Data processing error: {exc}")
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.exception_handler(DataValidationError)
async def data_validation_error_handler(request: Request, exc: DataValidationError):
    logger.error(f"Data validation error: {exc}")
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    logger.exception(f"Unexpected error: {exc}")
    return JSONResponse(
        status_code=500, content={"detail": "An unexpected error occurred"}
    )


# Register routers
app.include_router(cost_router)


@app.get("/")
async def home():
    return {
        "message": "Welcome to Azure Cost Analyzer API",
        "version": "1.0.0",
        "description": "API for analyzing Azure cloud costs and usage",
        "docs_url": "/docs",
        "endpoints": {"costs": "/costs", "health": "/health"},
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )

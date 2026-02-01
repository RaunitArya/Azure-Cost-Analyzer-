import uvicorn
from config import settings
from fastapi import FastAPI
from routes.cost_routes import router as cost_router

app = FastAPI()

# Register routers
app.include_router(cost_router)


@app.get("/")
def home():
    return {
        "message": "Welcome to Azure Cost Analyzer API",
        "version": "1.0.0",
        "description": "API for analyzing Azure cloud costs and usage",
        "docs_url": "/docs",
        "endpoints": {"costs": "/costs", "health": "/health"},
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )

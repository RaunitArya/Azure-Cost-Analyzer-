from fastapi import FastAPI
import uvicorn
from config import settings

app = FastAPI()


@app.get("/")
def home():
    return {"message: Hello from azure-cost-analyzer!"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )

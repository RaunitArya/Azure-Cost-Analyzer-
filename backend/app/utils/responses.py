from fastapi.responses import JSONResponse
import traceback
from config import settings


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

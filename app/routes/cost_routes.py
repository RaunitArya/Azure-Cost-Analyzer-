from fastapi import APIRouter, HTTPException
from loguru import logger

from exceptions.cost_exceptions import (
    AzureApiError,
    DataProcessingError,
    DataValidationError,
)
from services.cost_service import (
    fetch_last_7_days_cost,
    fetch_month_to_date_cost_by_service,
)
from services.cost_preprocessor import (
    get_current_month_period,
    normalize_cost_response,
    preprocess_daily_costs,
    preprocess_service_costs,
)

router = APIRouter(prefix="/cost", tags=["cost"])


@router.get("/last-7-days")
def get_last_7_days_cost():
    """
    Get daily cost breakdown for the last 7 days with preprocessing.
    """
    try:
        raw_result = fetch_last_7_days_cost()
        normalized_data = normalize_cost_response(raw_result)

        billing_start, billing_end = get_current_month_period()

        processed_records = preprocess_daily_costs(
            normalized_data, billing_start, billing_end
        )

        # Convert to dict for JSON response
        return {
            "status": "success",
            "count": len(processed_records),
            "data": [record.model_dump() for record in processed_records],
        }
    except AzureApiError as e:
        logger.error(f"Azure API error in last-7-days: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    except DataProcessingError as e:
        logger.error(f"Data processing error in last-7-days: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except DataValidationError as e:
        logger.error(f"Data validation error in last-7-days: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error in last-7-days endpoint: {e}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred")


@router.get("/month-to-date")
def get_month_to_date_cost_by_service():
    """
    Get month-to-date costs grouped by Azure service with preprocessing.
    """
    try:
        raw_result = fetch_month_to_date_cost_by_service()
        normalized_data = normalize_cost_response(raw_result)

        billing_start, billing_end = get_current_month_period()

        processed_records = preprocess_service_costs(
            normalized_data, billing_start, billing_end
        )

        # Convert to dict for JSON response
        return {
            "status": "success",
            "count": len(processed_records),
            "data": [record.model_dump() for record in processed_records],
        }
    except AzureApiError as e:
        logger.error(f"Azure API error in month-to-date: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    except DataProcessingError as e:
        logger.error(f"Data processing error in month-to-date: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except DataValidationError as e:
        logger.error(f"Data validation error in month-to-date: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error in month-to-date endpoint: {e}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred")


@router.get("/month-to-date/raw")
def get_month_to_date_cost_raw():
    """
    Get raw month-to-date costs without preprocessing (for debugging).
    """
    try:
        raw_result = fetch_month_to_date_cost_by_service()
        data = normalize_cost_response(raw_result)
        return {"status": "success", "data": data}
    except AzureApiError as e:
        logger.error(f"Azure API error in month-to-date/raw: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    except DataProcessingError as e:
        logger.error(f"Data processing error in month-to-date/raw: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error in month-to-date/raw endpoint: {e}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred")

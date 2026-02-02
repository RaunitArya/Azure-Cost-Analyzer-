from fastapi import APIRouter
from services.cost_preprocessor import (
    get_current_month_period,
    normalize_cost_response,
    preprocess_daily_costs,
    preprocess_service_costs,
)
from services.cost_service import (
    fetch_last_7_days_cost,
    fetch_month_to_date_cost_by_service,
)

router = APIRouter(prefix="/cost", tags=["cost"])


@router.get("/last-7-days")
async def get_last_7_days_cost():
    """
    Get daily cost breakdown for the last 7 days with preprocessing.
    """
    raw_result = await fetch_last_7_days_cost()
    normalized_data = normalize_cost_response(raw_result)
    billing_start, billing_end = get_current_month_period()
    processed_records = preprocess_daily_costs(
        normalized_data, billing_start, billing_end
    )

    return {
        "status": "success",
        "count": len(processed_records),
        "data": [record.model_dump() for record in processed_records],
    }


@router.get("/month-to-date")
async def get_month_to_date_cost_by_service():
    """
    Get month-to-date costs grouped by Azure service with preprocessing.
    """
    raw_result = await fetch_month_to_date_cost_by_service()
    normalized_data = normalize_cost_response(raw_result)
    billing_start, billing_end = get_current_month_period()
    processed_records = preprocess_service_costs(
        normalized_data, billing_start, billing_end
    )

    return {
        "status": "success",
        "count": len(processed_records),
        "data": [record.model_dump() for record in processed_records],
    }


@router.get("/month-to-date/raw")
async def get_month_to_date_cost_raw():
    """
    Get raw month-to-date costs without preprocessing (for debugging).
    """
    raw_result = await fetch_month_to_date_cost_by_service()
    data = normalize_cost_response(raw_result)
    return {"status": "success", "data": data}

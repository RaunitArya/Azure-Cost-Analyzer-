from fastapi import APIRouter
from db.operations import (
    save_daily_costs,
    save_service_costs,
)
from services.cost_preprocessor import (
    normalize_cost_response,
    preprocess_daily_costs,
    preprocess_service_costs,
)
from services.cost_service import (
    fetch_last_7_days_cost,
    fetch_month_to_date_cost_by_service,
)
from services.cost_tasks import fetch_process_save

router = APIRouter(prefix="/cost", tags=["cost"])


@router.get("/last-7-days")
async def get_last_7_days_cost():
    """
    Get daily cost breakdown for the last 7 days with preprocessing.
    """
    processed_records, billing_period_id, saved_count = await fetch_process_save(
        fetch_last_7_days_cost, preprocess_daily_costs, save_daily_costs
    )

    return {
        "status": "success",
        "billing_period_id": billing_period_id,
        "count": len(processed_records),
        "saved_to_db": saved_count,
        "data": [record.model_dump() for record in processed_records],
    }


@router.get("/month-to-date")
async def get_month_to_date_cost_by_service():
    """
    Get month-to-date costs grouped by Azure service with preprocessing.
    """
    processed_records, billing_period_id, saved_count = await fetch_process_save(
        fetch_month_to_date_cost_by_service,
        preprocess_service_costs,
        save_service_costs,
    )

    return {
        "status": "success",
        "billing_period_id": billing_period_id,
        "count": len(processed_records),
        "saved_to_db": saved_count,
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

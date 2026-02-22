from config import settings
from db.database import get_session_context
from db.operations import get_or_create_billing_period
from exceptions.cost_exceptions import DataProcessingError
from loguru import logger
from services.cost_preprocessor import (
    get_current_month_period,
    normalize_cost_response,
)


async def fetch_process_save(fetch_func, preprocess_func, save_func):
    """
    Generic job to fetch, process, and save cost data.

    Returns:
        tuple: A tuple containing:
            - processed_records: The list or collection of processed cost records.
            - billing_period_id: The ID of the billing period associated with the records.
            - saved_count: The number of records successfully saved.
    """
    try:
        raw_result = await fetch_func()
        normalized_data = normalize_cost_response(raw_result)
        billing_start, billing_end = get_current_month_period()
        processed_records = preprocess_func(normalized_data, billing_start, billing_end)
    except DataProcessingError as e:
        if settings.show_debug_info:
            logger.error(f"Unable to process data: {e}")
        else:
            logger.error("Unable to process data")

    try:
        async with get_session_context() as session:
            billing_period = await get_or_create_billing_period(
                session, billing_start, billing_end
            )
            saved_count = await save_func(session, billing_period.id, processed_records)
    except Exception as e:
        if settings.show_debug_info:
            logger.error(f"Error occured while saving data: {e}")
        else:
            logger.error("Error occured while saving data")

    return processed_records, billing_period.id, saved_count

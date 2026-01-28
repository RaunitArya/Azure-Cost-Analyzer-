from datetime import date, datetime, timedelta
from typing import List

from azure.core.exceptions import (
    AzureError,
    ClientAuthenticationError,
    HttpResponseError,
)
from azure.cost_client import get_cost_client, subscription_scope
from azure.mgmt.costmanagement.models import (
    QueryAggregation,
    QueryDataset,
    QueryDefinition,
    QueryGrouping,
    QueryTimePeriod,
)
from exceptions.cost_exceptions import (
    AzureApiError,
    DataProcessingError,
    DataValidationError,
)
from loguru import logger
from models.cost_models import CostRecord, DailyCostRecord


def fetch_last_7_days_cost():
    """
    Fetches the daily cost data for the last 7 days from Azure Cost Management.

    Returns:
        QueryResult: Azure Cost Management query result containing daily cost breakdown.

    Raises:
        AzureApiError: When Azure API call fails.
    """
    try:
        client = get_cost_client()
        scope: str = subscription_scope()

        # Calculate the date range for the last 7 days
        today: date = date.today()
        last_week: date = today - timedelta(days=7)

        # Build the query definition for actual costs with daily granularity
        query = QueryDefinition(
            type="ActualCost",
            timeframe="Custom",
            time_period=QueryTimePeriod(
                from_property=datetime.combine(last_week, datetime.min.time()),
                to=datetime.combine(today, datetime.min.time()),
            ),
            dataset=QueryDataset(
                granularity="Daily",
                aggregation={
                    "totalCost": QueryAggregation(name="Cost", function="Sum")
                },
            ),
        )

        # Execute the query against Azure Cost Management API
        result = client.query.usage(scope=scope, parameters=query)
        return result

    except ClientAuthenticationError as e:
        logger.error(f"Azure authentication failed: {e}")
        raise AzureApiError("Authentication with Azure failed")
    except HttpResponseError as e:
        logger.error(f"Azure API HTTP error: {e}")
        raise AzureApiError("Failed to retrieve cost data from Azure")
    except AzureError as e:
        logger.error(f"Azure SDK error: {e}")
        raise AzureApiError("Azure service error occurred")


def fetch_month_to_date_cost_by_service():
    """
    Fetches the month-to-date cost data grouped by Azure service name.

    Returns:
        QueryResult: Azure Cost Management query result containing costs per service.

    Raises:
        AzureApiError: When Azure API call fails.
    """
    try:
        client = get_cost_client()
        scope: str = subscription_scope()

        # Build the query definition for month-to-date costs grouped by service
        query = QueryDefinition(
            type="ActualCost",
            timeframe="MonthToDate",
            dataset=QueryDataset(
                granularity="None",  # No time-based breakdown, just totals
                aggregation={
                    "totalCost": QueryAggregation(name="Cost", function="Sum")
                },
                grouping=[QueryGrouping(type="Dimension", name="ServiceName")],
            ),
        )

        # Execute the query against Azure Cost Management API
        result = client.query.usage(scope=scope, parameters=query)
        return result

    except ClientAuthenticationError as e:
        logger.error(f"Azure authentication failed: {e}")
        raise AzureApiError("Authentication with Azure failed")
    except HttpResponseError as e:
        logger.error(f"Azure API HTTP error: {e}")
        raise AzureApiError("Failed to retrieve cost data from Azure")
    except AzureError as e:
        logger.error(f"Azure SDK error: {e}")
        raise AzureApiError("Azure service error occurred")


def normalize_cost_response(result):
    """
    Transforms the Azure Cost Management query result into a list of dictionaries.

    Args:
        result: QueryResult from Azure Cost Management API.

    Returns:
        list[dict]: List of dictionaries where each dict represents a row with column names as keys.

    Raises:
        DataProcessingError: When response normalization fails.
    """
    try:
        # Extract column names from the result metadata
        columns: list[str] = [col.name for col in result.columns]
        data: list[dict[str, int | str]] = []

        # Map each row to a dictionary using column names as keys
        for row in result.rows:
            data.append(dict(zip(columns, row)))

        return data
    except AttributeError as e:
        logger.error(f"Invalid response structure: {e}")
        raise DataProcessingError("Failed to parse cost response")
    except TypeError as e:
        logger.error(f"Type error during normalization: {e}")
        raise DataProcessingError("Failed to process cost data")


def preprocess_service_costs(
    raw_costs: List[dict],
    billing_period_start: datetime,
    billing_period_end: datetime,
) -> List[CostRecord]:
    """
    Preprocess raw Azure cost data into validated CostRecord objects.

    Args:
        raw_costs: List of normalized cost dictionaries from Azure API
        billing_period_start: Start of the billing period
        billing_period_end: End of the billing period

    Returns:
        List[CostRecord]: Validated and preprocessed cost records

    Raises:
        DataValidationError: When all records fail validation.
    """
    processed_records = []
    validation_errors = []

    for raw_cost in raw_costs:
        try:
            record = CostRecord(
                service_name=raw_cost.get("ServiceName", "Unknown"),
                cost=raw_cost.get("Cost", 0),
                currency=raw_cost.get("Currency", "INR"),
                billing_period_start=billing_period_start,
                billing_period_end=billing_period_end,
            )
            processed_records.append(record)
        except (ValueError, TypeError) as e:
            logger.warning(f"Validation error for cost record: {e}")
            validation_errors.append(str(e))
            continue

    if not processed_records and raw_costs:
        logger.error(f"All {len(raw_costs)} records failed validation")
        raise DataValidationError("Failed to validate cost records")

    if validation_errors:
        logger.warning(f"{len(validation_errors)} records failed validation")

    return processed_records


def preprocess_daily_costs(
    raw_costs: List[dict],
    billing_period_start: datetime,
    billing_period_end: datetime,
) -> List[DailyCostRecord]:
    """
    Preprocess raw Azure daily cost data into validated DailyCostRecord objects.

    Args:
        raw_costs: List of normalized cost dictionaries from Azure API
        billing_period_start: Start of the billing period
        billing_period_end: End of the billing period

    Returns:
        List[DailyCostRecord]: Validated and preprocessed daily cost records

    Raises:
        DataValidationError: When all records fail validation.
    """
    processed_records = []
    validation_errors = []

    for raw_cost in raw_costs:
        try:
            # Azure returns UsageDate as integer in format YYYYMMDD
            usage_date_int = raw_cost.get("UsageDate", 0)
            usage_date = datetime.strptime(str(usage_date_int), "%Y%m%d")

            record = DailyCostRecord(
                usage_date=usage_date,
                cost=raw_cost.get("Cost", 0),
                currency=raw_cost.get("Currency", "INR"),
                billing_period_start=billing_period_start,
                billing_period_end=billing_period_end,
            )
            processed_records.append(record)
        except (ValueError, TypeError) as e:
            logger.warning(f"Validation error for daily cost record: {e}")
            validation_errors.append(str(e))
            continue

    if not processed_records and raw_costs:
        logger.error(f"All {len(raw_costs)} daily records failed validation")
        raise DataValidationError("Failed to validate daily cost records")

    if validation_errors:
        logger.warning(f"{len(validation_errors)} daily records failed validation")

    return processed_records


def get_current_month_period() -> tuple[datetime, datetime]:
    """
    Get the start and end datetime for the current month.

    Returns:
        tuple: (billing_period_start, billing_period_end)
    """
    today = date.today()
    start_of_month = datetime(today.year, today.month, 1)

    # End of current month
    if today.month == 12:
        end_of_month = datetime(today.year + 1, 1, 1) - timedelta(days=1)
    else:
        end_of_month = datetime(today.year, today.month + 1, 1) - timedelta(days=1)

    # Set time to end of day
    end_of_month = end_of_month.replace(hour=23, minute=59, second=59)

    return start_of_month, end_of_month

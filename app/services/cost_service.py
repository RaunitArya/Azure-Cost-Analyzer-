import asyncio

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from functools import wraps
from typing import Callable

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
from exceptions.cost_exceptions import AzureApiError
from loguru import logger

_executor = ThreadPoolExecutor(max_workers=4)


def _shutdown_executor() -> None:
    logger.info("Shutting down ThreadPoolExecutor...")
    _executor.shutdown(wait=True, cancel_futures=False)
    logger.info("ThreadPoolExecutor shutdown complete")


def handle_azure_exceptions(func: Callable) -> Callable:
    """Decorator to handle Azure SDK exceptions and convert to AzureApiError."""

    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except ClientAuthenticationError as e:
            logger.error(f"Azure authentication failed: {e}")
            raise AzureApiError("Authentication with Azure failed")
        except HttpResponseError as e:
            logger.error(f"Azure API HTTP error: {e}")
            raise AzureApiError("Failed to retrieve cost data from Azure")
        except AzureError as e:
            logger.error(f"Azure SDK error: {e}")
            raise AzureApiError("Azure service error occurred")

    return wrapper


def _fetch_last_7_days_cost_sync():
    client = get_cost_client()
    scope: str = subscription_scope()

    today: date = date.today()
    last_week: date = today - timedelta(days=7)

    query = QueryDefinition(
        type="ActualCost",
        timeframe="Custom",
        time_period=QueryTimePeriod(
            from_property=datetime.combine(
                last_week, datetime.min.time().replace(tzinfo=timezone.utc)
            ),
            to=datetime.combine(
                today, datetime.min.time().replace(tzinfo=timezone.utc)
            ),
        ),
        dataset=QueryDataset(
            granularity="Daily",
            aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
            grouping=[
                QueryGrouping(type="Dimension", name="ServiceName"),
                QueryGrouping(type="Dimension", name="ServiceFamily"),
            ],
        ),
    )

    return client.query.usage(scope=scope, parameters=query)


@handle_azure_exceptions
async def fetch_last_7_days_cost():
    """
    Asynchronously fetches the daily cost data for the last 7 days from Azure Cost Management.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_executor, _fetch_last_7_days_cost_sync)


def _fetch_month_to_date_cost_by_service_sync():
    client = get_cost_client()
    scope: str = subscription_scope()

    query = QueryDefinition(
        type="ActualCost",
        timeframe="MonthToDate",
        dataset=QueryDataset(
            granularity="None",
            aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
            grouping=[
                QueryGrouping(type="Dimension", name="ServiceName"),
                QueryGrouping(type="Dimension", name="ServiceFamily"),
            ],
        ),
    )

    return client.query.usage(scope=scope, parameters=query)


@handle_azure_exceptions
async def fetch_month_to_date_cost_by_service():
    """
    Asynchronously fetches the month-to-date cost data grouped by Azure service name.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _executor, _fetch_month_to_date_cost_by_service_sync
    )


def shutdown_executor() -> None:
    _shutdown_executor()

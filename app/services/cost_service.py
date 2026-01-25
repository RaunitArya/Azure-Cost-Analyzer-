from datetime import date, datetime, timedelta

from azure.cost_client import get_cost_client, subscription_scope
from azure.mgmt.costmanagement.models import (
    QueryAggregation,
    QueryDataset,
    QueryDefinition,
    QueryGrouping,
    QueryTimePeriod,
)


def fetch_last_7_days_cost():
    """
    Fetches the daily cost data for the last 7 days from Azure Cost Management.

    Returns:
        QueryResult: Azure Cost Management query result containing daily cost breakdown.
    """
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
            aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
        ),
    )

    # Execute the query against Azure Cost Management API
    result = client.query.usage(scope=scope, parameters=query)

    return result


def fetch_month_to_date_cost_by_service():
    """
    Fetches the month-to-date cost data grouped by Azure service name.

    Returns:
        QueryResult: Azure Cost Management query result containing costs per service.
    """
    client = get_cost_client()
    scope: str = subscription_scope()

    # Build the query definition for month-to-date costs grouped by service
    query = QueryDefinition(
        type="ActualCost",
        timeframe="MonthToDate",
        dataset=QueryDataset(
            granularity="None",  # No time-based breakdown, just totals
            aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
            grouping=[QueryGrouping(type="Dimension", name="ServiceName")],
        ),
    )

    # Execute the query against Azure Cost Management API
    result = client.query.usage(scope=scope, parameters=query)

    return result


def normalize_cost_response(result):
    """
    Transforms the Azure Cost Management query result into a list of dictionaries.

    Args:
        result: QueryResult from Azure Cost Management API.

    Returns:
        list[dict]: List of dictionaries where each dict represents a row with column names as keys.
    """
    # Extract column names from the result metadata
    columns: list[str] = [col.name for col in result.columns]
    data: list[dict[str, int | str]] = []

    # Map each row to a dictionary using column names as keys
    for row in result.rows:
        data.append(dict(zip(columns, row)))

    return data

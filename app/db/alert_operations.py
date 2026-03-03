"""Database operations for the alert threshold and alert event tables."""

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import (
    AlertEvent,
    AlertThreshold,
    AnomalyLog,
    AnomalySettings,
    DailyCost,
    PeriodType,
    ServiceCost,
)
from models.alert_models import (
    AlertThresholdCreate,
    AlertThresholdUpdate,
    AnomalySettingsUpdate,
)


# Threshold operations


async def create_threshold(
    session: AsyncSession,
    payload: AlertThresholdCreate,
) -> AlertThreshold:
    """Create a new alert threshold. Raises ValueError if one already exists
    for the (service_id, period_type) pair."""
    existing = await session.exec(
        select(AlertThreshold).where(
            AlertThreshold.service_id == payload.service_id,
            AlertThreshold.period_type == payload.period_type,
        )
    )
    if existing.first() is not None:
        raise ValueError(
            f"A threshold for service_id={payload.service_id} "
            f"period_type='{payload.period_type}' already exists. "
            "Use PATCH to update it."
        )

    threshold = AlertThreshold(
        service_id=payload.service_id,
        period_type=payload.period_type,
        absolute_threshold=payload.absolute_threshold,
        is_active=True,
    )
    session.add(threshold)
    await session.commit()
    await session.refresh(threshold)
    return threshold


async def get_thresholds(
    session: AsyncSession,
    *,
    service_id: int | None = None,
    period_type: PeriodType | None = None,
    active_only: bool = True,
) -> list[AlertThreshold]:
    """Return thresholds, optionally filtered by service, period type, and active status."""
    query = select(AlertThreshold)
    if service_id is not None:
        query = query.where(AlertThreshold.service_id == service_id)
    if period_type is not None:
        query = query.where(AlertThreshold.period_type == period_type)
    if active_only:
        query = query.where(col(AlertThreshold.is_active).is_(True))
    result = await session.exec(query)
    return list(result.all())


async def update_threshold(
    session: AsyncSession,
    threshold_id: int,
    payload: AlertThresholdUpdate,
) -> AlertThreshold:
    """Partially update a threshold. Raises ValueError if not found."""
    threshold = await session.get(AlertThreshold, threshold_id)
    if threshold is None:
        raise ValueError(f"AlertThreshold id={threshold_id} not found.")

    if payload.absolute_threshold is not None or (
        "absolute_threshold" in payload.model_fields_set
    ):
        threshold.absolute_threshold = payload.absolute_threshold
    if payload.is_active is not None:
        threshold.is_active = payload.is_active
    threshold.updated_at = datetime.now(timezone.utc)

    session.add(threshold)
    await session.commit()
    await session.refresh(threshold)
    return threshold


async def deactivate_threshold(
    session: AsyncSession,
    threshold_id: int,
) -> AlertThreshold:
    """Soft-delete a threshold by setting is_active=False. Raises ValueError if not found."""
    threshold = await session.get(AlertThreshold, threshold_id)
    if threshold is None:
        raise ValueError(f"AlertThreshold id={threshold_id} not found.")

    threshold.is_active = False
    threshold.updated_at = datetime.now(timezone.utc)
    session.add(threshold)
    await session.commit()
    await session.refresh(threshold)
    return threshold


# Alert event operations


async def get_open_alert(
    session: AsyncSession,
    service_id: int,
    period_type: PeriodType,
) -> AlertEvent | None:
    """Return the most recent open (unacknowledged) alert for a service+period, or None."""
    result = await session.exec(
        select(AlertEvent)
        .where(
            AlertEvent.service_id == service_id,
            AlertEvent.period_type == period_type,
            AlertEvent.status == "open",
        )
        .order_by(col(AlertEvent.triggered_at).desc())
        .limit(1)
    )
    return result.first()


async def create_alert_event(
    session: AsyncSession,
    *,
    threshold_id: int,
    service_id: int,
    period_type: PeriodType,
    reference_date: date,
    current_cost: Decimal,
    computed_threshold: Decimal,
    absolute_component: Decimal | None,
    statistical_component: Decimal | None,
    percentage_component: Decimal | None,
    winning_component: str,
) -> AlertEvent:
    """Persist a new alert event and return it."""
    event = AlertEvent(
        threshold_id=threshold_id,
        service_id=service_id,
        period_type=period_type,
        reference_date=reference_date,
        current_cost=current_cost,
        computed_threshold=computed_threshold,
        absolute_component=absolute_component,
        statistical_component=statistical_component,
        percentage_component=percentage_component,
        winning_component=winning_component,
        status="open",
        triggered_at=datetime.now(timezone.utc),
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


async def list_alert_events(
    session: AsyncSession,
    *,
    status: str | None = None,
    service_id: int | None = None,
    period_type: PeriodType | None = None,
) -> list[AlertEvent]:
    """Return alert events, optionally filtered."""
    query = select(AlertEvent).order_by(col(AlertEvent.triggered_at).desc())
    if status is not None:
        query = query.where(AlertEvent.status == status)
    if service_id is not None:
        query = query.where(AlertEvent.service_id == service_id)
    if period_type is not None:
        query = query.where(AlertEvent.period_type == period_type)
    result = await session.exec(query)
    return list(result.all())


async def acknowledge_alert(
    session: AsyncSession,
    alert_id: int,
) -> AlertEvent:
    """Acknowledge an open alert event. Raises ValueError if not found or already acknowledged."""
    event = await session.get(AlertEvent, alert_id)
    if event is None:
        raise ValueError(f"AlertEvent id={alert_id} not found.")
    if event.status != "open":
        raise ValueError(
            f"AlertEvent id={alert_id} is already '{event.status}' and cannot be acknowledged again."
        )
    event.status = "acknowledged"
    event.acknowledged_at = datetime.now(timezone.utc)
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


# History queries


async def get_daily_cost_history(
    session: AsyncSession,
    service_id: int,
    since_date: date,
) -> list[Decimal]:
    """Return daily cost amounts for a service from since_date up to yesterday (exclusive today)."""
    today = date.today()
    result = await session.exec(
        select(DailyCost).where(
            DailyCost.service_id == service_id,
            DailyCost.usage_date >= since_date,
            DailyCost.usage_date < today,  # exclude today's partial day
        )
    )
    return [row.cost_amount for row in result.all() if row.cost_amount is not None]


# Anomaly log operations


async def create_anomaly_log(
    session: AsyncSession,
    *,
    service_id: int,
    service_name: str,
    period_type: PeriodType,
    reference_date: date,
    current_cost: Decimal,
    absolute_component: Decimal | None,
    statistical_component: Decimal | None,
    percentage_component: Decimal | None,
    computed_threshold: Decimal,
    winning_component: str,
    is_alert_fired: bool,
    alert_event_id: int | None,
) -> AnomalyLog:
    """Persist an anomaly detection record regardless of whether an alert fired."""
    log = AnomalyLog(
        service_id=service_id,
        service_name=service_name,
        period_type=period_type,
        reference_date=reference_date,
        current_cost=current_cost,
        absolute_component=absolute_component,
        statistical_component=statistical_component,
        percentage_component=percentage_component,
        computed_threshold=computed_threshold,
        winning_component=winning_component,
        is_alert_fired=is_alert_fired,
        alert_event_id=alert_event_id,
    )
    session.add(log)
    await session.commit()
    await session.refresh(log)
    return log


async def list_anomaly_logs(
    session: AsyncSession,
    *,
    service_id: int | None = None,
    period_type: PeriodType | None = None,
    is_alert_fired: bool | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[AnomalyLog]:
    """Return anomaly logs with optional filters, newest first."""
    query = select(AnomalyLog).order_by(col(AnomalyLog.detected_at).desc())
    if service_id is not None:
        query = query.where(AnomalyLog.service_id == service_id)
    if period_type is not None:
        query = query.where(AnomalyLog.period_type == period_type)
    if is_alert_fired is not None:
        query = query.where(AnomalyLog.is_alert_fired == is_alert_fired)
    query = query.offset(offset).limit(limit)
    result = await session.exec(query)
    return list(result.all())


# Anomaly settings operations


async def get_anomaly_settings(session: AsyncSession) -> AnomalySettings:
    """Return the single AnomalySettings row. Raises RuntimeError if not seeded."""
    result = await session.exec(select(AnomalySettings).limit(1))
    row = result.first()
    if row is None:
        raise RuntimeError(
            "AnomalySettings row not found. Ensure seed_anomaly_settings() "
            "was called during application startup."
        )
    return row


async def update_anomaly_settings(
    session: AsyncSession,
    payload: AnomalySettingsUpdate,
) -> AnomalySettings:
    """Partially update the global anomaly settings row."""
    row = await get_anomaly_settings(session)

    if payload.k_value is not None:
        row.k_value = payload.k_value
    if payload.percentage_buffer is not None:
        row.percentage_buffer = payload.percentage_buffer
    if payload.alert_history_days is not None:
        row.alert_history_days = payload.alert_history_days
    if payload.alert_history_months is not None:
        row.alert_history_months = payload.alert_history_months

    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def seed_anomaly_settings(session: AsyncSession) -> None:
    """Insert the default AnomalySettings row (id=1) if it does not exist.
    Uses env-based settings as the initial defaults.
    """
    from config import settings as app_settings

    result = await session.exec(select(AnomalySettings).limit(1))
    if result.first() is not None:
        return  # Already seeded

    row = AnomalySettings(
        id=1,
        k_value=app_settings.ALERT_K_VALUE,
        percentage_buffer=app_settings.ALERT_PERCENTAGE_BUFFER,
        alert_history_days=app_settings.ALERT_HISTORY_DAYS,
        alert_history_months=app_settings.ALERT_HISTORY_MONTHS,
    )
    session.add(row)
    await session.commit()


async def get_monthly_cost_history(
    session: AsyncSession,
    service_id: int,
    exclude_billing_period_id: int,
    limit: int,
) -> list[Decimal]:
    """Return monthly cost amounts for a service from past billing periods,
    excluding the current period (to avoid contaminating stats with MTD data)."""
    result = await session.exec(
        select(ServiceCost)
        .where(
            ServiceCost.service_id == service_id,
            ServiceCost.billing_period_id != exclude_billing_period_id,
        )
        .order_by(col(ServiceCost.billing_period_id).desc())
        .limit(limit)
    )
    return [row.cost_amount for row in result.all() if row.cost_amount is not None]

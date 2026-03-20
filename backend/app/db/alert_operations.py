"""Database operations for the alert threshold and alert event tables."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlmodel import col, func, select
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
        cooldown_minutes=payload.cooldown_minutes,
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
    """Return thresholds, optionally filtered."""
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

    if "absolute_threshold" in payload.model_fields_set:
        threshold.absolute_threshold = payload.absolute_threshold
    if payload.is_active is not None:
        threshold.is_active = payload.is_active
    if "cooldown_minutes" in payload.model_fields_set:
        threshold.cooldown_minutes = payload.cooldown_minutes
    threshold.updated_at = datetime.now(timezone.utc)

    session.add(threshold)
    await session.commit()
    await session.refresh(threshold)
    return threshold


async def deactivate_threshold(
    session: AsyncSession,
    threshold_id: int,
) -> AlertThreshold:
    """Soft-delete a threshold by setting is_active=False."""
    threshold = await session.get(AlertThreshold, threshold_id)
    if threshold is None:
        raise ValueError(f"AlertThreshold id={threshold_id} not found.")

    threshold.is_active = False
    threshold.updated_at = datetime.now(timezone.utc)
    session.add(threshold)
    await session.commit()
    await session.refresh(threshold)
    return threshold


async def get_open_incident(
    session: AsyncSession,
    service_id: int,
    period_type: PeriodType,
) -> AlertEvent | None:
    """Return the current open incident for a service+period, or None."""
    result = await session.exec(
        select(AlertEvent)
        .where(
            AlertEvent.service_id == service_id,
            AlertEvent.period_type == period_type,
            AlertEvent.status == "open",
        )
        .order_by(col(AlertEvent.breach_started_at).desc())
        .limit(1)
    )
    return result.first()


async def open_incident(
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
    cooldown_minutes: int,
) -> AlertEvent:
    """Create a new breach incident and return it."""
    now = datetime.now(timezone.utc)
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
        breach_started_at=now,
        last_notified_at=now,
        notification_count=1,
        cooldown_minutes=cooldown_minutes,
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


async def update_incident_cost(
    session: AsyncSession,
    incident: AlertEvent,
    *,
    current_cost: Decimal,
    computed_threshold: Decimal,
    absolute_component: Decimal | None,
    statistical_component: Decimal | None,
    percentage_component: Decimal | None,
    winning_component: str,
    reference_date: date,
) -> AlertEvent:
    """Update the latest cost fields on an ongoing incident.
    Does NOT update notification tracking — that is handled separately.
    """
    incident.current_cost = current_cost
    incident.computed_threshold = computed_threshold
    incident.absolute_component = absolute_component
    incident.statistical_component = statistical_component
    incident.percentage_component = percentage_component
    incident.winning_component = winning_component
    incident.reference_date = reference_date
    session.add(incident)
    await session.commit()
    await session.refresh(incident)
    return incident


async def record_notification(
    session: AsyncSession,
    incident: AlertEvent,
) -> AlertEvent:
    """Stamp last_notified_at = now and increment notification_count."""
    incident.last_notified_at = datetime.now(timezone.utc)
    incident.notification_count += 1
    session.add(incident)
    await session.commit()
    await session.refresh(incident)
    return incident


async def resolve_incident(
    session: AsyncSession,
    incident: AlertEvent,
) -> AlertEvent:
    """Auto-resolve an incident when cost drops back below threshold."""
    incident.status = "resolved"
    incident.breach_resolved_at = datetime.now(timezone.utc)
    session.add(incident)
    await session.commit()
    await session.refresh(incident)
    return incident


def is_cooldown_elapsed(incident: AlertEvent) -> bool:
    """Return True if enough time has passed since the last notification
    to send another reminder email."""
    elapsed = datetime.now(timezone.utc) - incident.last_notified_at.replace(
        tzinfo=timezone.utc
    )
    return elapsed >= timedelta(minutes=incident.cooldown_minutes)


async def list_alert_events(
    session: AsyncSession,
    *,
    status: str | None = None,
    service_id: int | None = None,
    period_type: PeriodType | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AlertEvent], int]:
    """Return alert events with optional filters and pagination."""
    conditions = []
    if status is not None:
        conditions.append(AlertEvent.status == status)
    if service_id is not None:
        conditions.append(AlertEvent.service_id == service_id)
    if period_type is not None:
        conditions.append(AlertEvent.period_type == period_type)

    count_query = select(func.count()).select_from(AlertEvent)
    if conditions:
        count_query = count_query.where(*conditions)
    total = (await session.exec(count_query)).one()

    data_query = (
        select(AlertEvent)
        .where(*conditions)
        .order_by(col(AlertEvent.breach_started_at).desc())
        .offset(offset)
        .limit(limit)
    )
    result = await session.exec(data_query)
    return list(result.all()), total


async def get_daily_cost_history(
    session: AsyncSession,
    service_id: int,
    since_date: date,
) -> list[Decimal]:
    """Return daily cost amounts for a service from since_date up to yesterday."""
    today = date.today()
    result = await session.exec(
        select(DailyCost).where(
            DailyCost.service_id == service_id,
            DailyCost.usage_date >= since_date,
            DailyCost.usage_date < today,
        )
    )
    return [row.cost_amount for row in result.all() if row.cost_amount is not None]


async def get_monthly_cost_history(
    session: AsyncSession,
    service_id: int,
    exclude_billing_period_id: int,
    limit: int,
) -> list[Decimal]:
    """Return monthly cost amounts for a service from past billing periods,
    excluding the current period."""
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
    """Persist an anomaly detection record."""
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
    if payload.cooldown_minutes is not None:
        row.cooldown_minutes = payload.cooldown_minutes
    if payload.email_enabled is not None:
        row.email_enabled = payload.email_enabled
    if "receiver_email" in payload.model_fields_set:
        row.receiver_email = payload.receiver_email

    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def seed_anomaly_settings(session: AsyncSession) -> None:
    """Insert the default AnomalySettings row (id=1) if it does not exist."""
    from config import settings as app_settings

    result = await session.exec(select(AnomalySettings).limit(1))
    if result.first() is not None:
        return

    row = AnomalySettings(
        id=1,
        k_value=app_settings.ALERT_K_VALUE,
        percentage_buffer=app_settings.ALERT_PERCENTAGE_BUFFER,
        alert_history_days=app_settings.ALERT_HISTORY_DAYS,
        alert_history_months=app_settings.ALERT_HISTORY_MONTHS,
        cooldown_minutes=120,
    )
    session.add(row)
    await session.commit()

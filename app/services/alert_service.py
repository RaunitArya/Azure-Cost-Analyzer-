"""Alert evaluation engine and email notification service."""

import asyncio
import smtplib
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from math import isfinite, sqrt

from loguru import logger
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from config import settings
from db.alert_operations import (
    create_alert_event,
    create_anomaly_log,
    get_anomaly_settings,
    get_daily_cost_history,
    get_monthly_cost_history,
    get_open_alert,
    get_thresholds,
)
from db.models import (
    AlertEvent,
    AzureService,
    BillingPeriod,
    DailyCost,
    PeriodType,
    ServiceCost,
)
from exceptions.cost_exceptions import AlertError
from models.alert_models import AlertEvaluationSummary, AlertEventRead

# Thread pool for blocking SMTP calls
_email_executor = ThreadPoolExecutor(max_workers=1)


# Statistical helpers


def _mean(values: list[Decimal]) -> float:
    """Return arithmetic mean as float, or 0.0 for an empty list."""
    if not values:
        return 0.0
    return float(sum(values)) / len(values)


def _std(values: list[Decimal], mean: float) -> float:
    """Return population std-dev as float. Returns 0.0 if fewer than 2 values."""
    if len(values) < 2:
        return 0.0
    variance = sum((float(v) - mean) ** 2 for v in values) / len(values)
    return sqrt(variance) if isfinite(variance) else 0.0


def _to_decimal2(value: float) -> Decimal:
    """Round a float to a Decimal with 2 decimal places."""
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# Core evaluation logic


async def _get_current_billing_period_id(session: AsyncSession) -> int | None:
    """Return the id of the billing period marked is_current=True, or None."""
    try:
        result = await session.exec(
            select(BillingPeriod)
            .where(col(BillingPeriod.is_current).is_(True))
            .limit(1)
        )
        bp = result.first()
        return bp.id if bp else None
    except Exception as exc:
        msg = f"Failed to query current billing period: {exc}"
        logger.error(
            msg
            if settings.show_debug_info
            else "Failed to query current billing period."
        )
        raise AlertError(
            msg
            if not settings.is_production
            else "Failed to query current billing period."
        ) from exc


async def _get_latest_daily_cost(
    session: AsyncSession, service_id: int
) -> tuple[date, Decimal] | None:
    """Return (usage_date, cost_amount) of the most recent DailyCost row, or None."""
    try:
        result = await session.exec(
            select(DailyCost)
            .where(
                DailyCost.service_id == service_id,
                DailyCost.usage_date < date.today(),
            )
            .order_by(col(DailyCost.usage_date).desc())
            .limit(1)
        )
        row = result.first()
        return (row.usage_date, row.cost_amount) if row else None
    except Exception as exc:
        msg = f"Failed to query latest daily cost for service_id={service_id}: {exc}"
        logger.error(
            msg
            if settings.show_debug_info
            else f"Failed to query daily cost for service_id={service_id}."
        )
        raise AlertError(
            msg if not settings.is_production else "Failed to query daily cost data."
        ) from exc


async def _get_current_monthly_cost(
    session: AsyncSession, service_id: int, billing_period_id: int
) -> Decimal | None:
    """Return the MTD ServiceCost for the current billing period, or None."""
    try:
        result = await session.exec(
            select(ServiceCost).where(
                ServiceCost.service_id == service_id,
                ServiceCost.billing_period_id == billing_period_id,
            )
        )
        row = result.first()
        return row.cost_amount if row else None
    except Exception as exc:
        msg = f"Failed to query monthly cost for service_id={service_id} billing_period_id={billing_period_id}: {exc}"
        logger.error(
            msg
            if settings.show_debug_info
            else f"Failed to query monthly cost for service_id={service_id}."
        )
        raise AlertError(
            msg if not settings.is_production else "Failed to query monthly cost data."
        ) from exc


def _compute_components(
    history: list[Decimal],
    absolute_threshold: Decimal | None,
    k: float,
    pct_buffer: float,
) -> tuple[Decimal | None, Decimal | None, Decimal | None]:
    """Return (absolute_component, statistical_component, percentage_component).
    Statistical and percentage components are None when history is too short (<2 points).
    """
    absolute_component = absolute_threshold  # may be None

    if len(history) < 2:
        return absolute_component, None, None

    mu = _mean(history)
    sigma = _std(history, mu)

    statistical_component = _to_decimal2(mu + k * sigma)
    percentage_component = _to_decimal2(mu * pct_buffer)

    return absolute_component, statistical_component, percentage_component


def _effective_threshold(
    absolute_component: Decimal | None,
    statistical_component: Decimal | None,
    percentage_component: Decimal | None,
) -> tuple[Decimal, str] | None:
    """Return (effective_threshold, winning_component_name) as the maximum of non-None
    components, or None if every component is None (nothing to evaluate against)."""
    candidates: dict[str, Decimal] = {}
    if absolute_component is not None:
        candidates["absolute"] = absolute_component
    if statistical_component is not None:
        candidates["statistical"] = statistical_component
    if percentage_component is not None:
        candidates["percentage"] = percentage_component

    if not candidates:
        return None

    winner = max(candidates, key=lambda k: candidates[k])
    return candidates[winner], winner


# Public evaluation function


async def evaluate_thresholds(
    session: AsyncSession,
    period_type: PeriodType,
) -> AlertEvaluationSummary:
    """Evaluate all active thresholds for the given period type.

    For each threshold:
      1. Fetch current cost (latest daily cost OR current-period monthly cost).
      2. Fetch rolling historical cost values.
      3. Compute the three threshold components.
      4. effective = max(components that are not None).
      5. Skip if an open alert already exists for (service_id, period_type).
      6. If current_cost > effective → create AlertEvent and optionally send email.

    Returns an AlertEvaluationSummary describing what happened.
    """
    anomaly_cfg = await get_anomaly_settings(session)
    k = anomaly_cfg.k_value
    pct_buffer = anomaly_cfg.percentage_buffer

    thresholds = await get_thresholds(
        session, period_type=period_type, active_only=True
    )
    evaluated = 0
    breaches = 0
    skipped_no_cost = 0
    skipped_open_alert = 0
    new_alert_events: list[AlertEvent] = []

    # For monthly evaluation we need the current billing period id once
    current_bp_id: int | None = None
    if period_type == PeriodType.MONTHLY:
        current_bp_id = await _get_current_billing_period_id(session)
        if current_bp_id is None:
            logger.warning(
                "evaluate_thresholds(MONTHLY): no current billing period found, skipping."
            )
            return AlertEvaluationSummary(
                evaluated=0,
                breaches=0,
                skipped_no_cost=len(thresholds),
                skipped_open_alert=0,
                new_alerts=[],
            )

    for threshold in thresholds:
        evaluated += 1
        service_id = threshold.service_id

        try:
            # 1. Fetch current cost
            if period_type == PeriodType.DAILY:
                daily_result = await _get_latest_daily_cost(session, service_id)
                if daily_result is None:
                    logger.debug(
                        f"evaluate_thresholds: no daily cost data for service_id={service_id}, skipping."
                    )
                    skipped_no_cost += 1
                    continue
                ref_date, current_cost = daily_result
            else:
                # current_bp_id is guaranteed non-None here: the early return above guards it
                assert current_bp_id is not None
                current_cost = await _get_current_monthly_cost(
                    session, service_id, current_bp_id
                )
                if current_cost is None:
                    logger.debug(
                        f"evaluate_thresholds: no monthly cost data for service_id={service_id}, skipping."
                    )
                    skipped_no_cost += 1
                    continue
                # reference_date for monthly = first day of current billing month
                bp_result = await session.get(BillingPeriod, current_bp_id)
                ref_date = (
                    bp_result.start_date.date()
                    if bp_result
                    else date.today().replace(day=1)
                )

            # 2. Fetch history
            if period_type == PeriodType.DAILY:
                since_date = date.today() - timedelta(
                    days=anomaly_cfg.alert_history_days
                )
                history = await get_daily_cost_history(session, service_id, since_date)
            else:
                assert current_bp_id is not None
                history = await get_monthly_cost_history(
                    session,
                    service_id,
                    exclude_billing_period_id=current_bp_id,
                    limit=anomaly_cfg.alert_history_months,
                )

            # 3. Compute components
            absolute_component, statistical_component, percentage_component = (
                _compute_components(
                    history, threshold.absolute_threshold, k, pct_buffer
                )
            )

            effective = _effective_threshold(
                absolute_component, statistical_component, percentage_component
            )
            if effective is None:
                logger.debug(
                    f"evaluate_thresholds: service_id={service_id} has no computable "
                    "threshold components (no absolute set and insufficient history), skipping."
                )
                skipped_no_cost += 1
                continue

            computed_threshold, winning_component = effective

            # 4. Resolve service name for anomaly log
            service_obj = await session.get(AzureService, service_id)
            service_name = (
                service_obj.name if service_obj else f"service_id={service_id}"
            )

            # 5. Skip if current cost does not breach — log as non-alert detection
            if current_cost <= computed_threshold:
                await create_anomaly_log(
                    session,
                    service_id=service_id,
                    service_name=service_name,
                    period_type=period_type,
                    reference_date=ref_date,
                    current_cost=current_cost,
                    absolute_component=absolute_component,
                    statistical_component=statistical_component,
                    percentage_component=percentage_component,
                    computed_threshold=computed_threshold,
                    winning_component=winning_component,
                    is_alert_fired=False,
                    alert_event_id=None,
                )
                continue

            # 6. Dedup — skip if an open alert already exists
            existing_open = await get_open_alert(session, service_id, period_type)
            if existing_open is not None:
                logger.debug(
                    f"evaluate_thresholds: open alert id={existing_open.id} already exists "
                    f"for service_id={service_id} period_type={period_type}, skipping."
                )
                skipped_open_alert += 1
                continue

            # 7. Create the alert event
            logger.warning(
                f"ALERT BREACH — service_id={service_id} period_type={period_type.value} "
                f"current_cost={current_cost} > computed_threshold={computed_threshold} "
                f"(winning={winning_component})"
            )
            event = await create_alert_event(
                session,
                threshold_id=threshold.id,  # type: ignore[arg-type]
                service_id=service_id,
                period_type=period_type,
                reference_date=ref_date,
                current_cost=current_cost,
                computed_threshold=computed_threshold,
                absolute_component=absolute_component,
                statistical_component=statistical_component,
                percentage_component=percentage_component,
                winning_component=winning_component,
            )

            # 8. Log the breach
            await create_anomaly_log(
                session,
                service_id=service_id,
                service_name=service_name,
                period_type=period_type,
                reference_date=ref_date,
                current_cost=current_cost,
                absolute_component=absolute_component,
                statistical_component=statistical_component,
                percentage_component=percentage_component,
                computed_threshold=computed_threshold,
                winning_component=winning_component,
                is_alert_fired=True,
                alert_event_id=event.id,
            )
            new_alert_events.append(event)
            breaches += 1

        except AlertError:
            logger.warning(
                f"Skipping threshold_id={threshold.id} service_id={service_id} "
                "due to an alert query error."
            )
            skipped_no_cost += 1
        except Exception as exc:
            err_detail = f": {exc}" if settings.show_debug_info else "."
            logger.error(
                f"Unexpected error evaluating threshold_id={threshold.id} "
                f"service_id={service_id}{err_detail}"
            )
            skipped_no_cost += 1

    #  Email notification
    if new_alert_events and settings.ALERT_EMAIL_ENABLED:
        try:
            await asyncio.get_running_loop().run_in_executor(
                _email_executor,
                _send_alert_email_sync,
                new_alert_events,
            )
        except Exception as exc:
            err_detail = f": {exc}" if settings.show_debug_info else "."
            logger.error(f"Failed to send alert email{err_detail}")

    new_alert_reads = [_event_to_read(e) for e in new_alert_events]

    logger.info(
        f"Alert evaluation complete — period={period_type.value} "
        f"evaluated={evaluated} breaches={len(new_alert_events)} skipped={skipped_no_cost}"
    )

    return AlertEvaluationSummary(
        evaluated=evaluated,
        breaches=breaches,
        skipped_no_cost=skipped_no_cost,
        skipped_open_alert=skipped_open_alert,
        new_alerts=new_alert_reads,
    )


def _event_to_read(event: AlertEvent) -> AlertEventRead:
    """Convert an AlertEvent ORM row to its API read model, resolving service_name
    from the loaded relationship when available, falling back to the service_id."""
    assert event.id is not None  # always set after DB commit
    service_name: str
    try:
        service_name = event.service.name
    except Exception:
        service_name = f"service_id={event.service_id}"

    return AlertEventRead(
        id=event.id,  # asserted non-None above
        threshold_id=event.threshold_id,
        service_id=event.service_id,
        service_name=service_name,
        period_type=event.period_type,
        reference_date=event.reference_date,
        current_cost=event.current_cost,
        computed_threshold=event.computed_threshold,
        absolute_component=event.absolute_component,
        statistical_component=event.statistical_component,
        percentage_component=event.percentage_component,
        winning_component=event.winning_component,
        status=event.status,
        acknowledged_at=event.acknowledged_at,
        triggered_at=event.triggered_at,
    )


# Email helper (sync — runs in executor)


def _send_alert_email_sync(events: list[AlertEvent]) -> None:
    """Synchronous email sender — called via run_in_executor to avoid blocking."""
    if not events:
        return

    subject = f"[Azure Cost Analyzer] {len(events)} cost alert(s) breached"

    lines = [
        "The following Azure service cost thresholds have been breached:\n",
        f"{'Service':<30} {'Period':<10} {'Date':<12} {'Current Cost':>14} "
        f"{'Threshold':>12} {'Winning Rule':<15}",
        "-" * 85,
    ]
    for e in events:
        try:
            service_name = e.service.name
        except Exception:
            service_name = f"service_id={e.service_id}"
        lines.append(
            f"{service_name:<30} {e.period_type.value:<10} {str(e.reference_date):<12} "
            f"{float(e.current_cost):>14.2f} {float(e.computed_threshold):>12.2f} "
            f"{e.winning_component:<15}"
        )
    lines.append("\nLog in to the Azure Cost Analyzer API to acknowledge these alerts.")
    body = "\n".join(lines)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject

    email_from: str = settings.ALERT_EMAIL_FROM or ""
    smtp_host: str = settings.SMTP_HOST or ""
    smtp_user: str = settings.SMTP_USER or ""
    smtp_password: str = settings.SMTP_PASSWORD or ""
    msg["From"] = email_from
    msg["To"] = ", ".join(settings.alert_email_recipients)
    msg.attach(MIMEText(body, "plain"))

    with smtplib.SMTP(smtp_host, settings.SMTP_PORT) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(smtp_user, smtp_password)
        smtp.sendmail(
            email_from,
            settings.alert_email_recipients,
            msg.as_string(),
        )
    logger.info(
        f"Alert email sent to {settings.alert_email_recipients} for {len(events)} event(s)."
    )


def shutdown_email_executor() -> None:
    """Gracefully shut down the email thread pool during app shutdown."""
    _email_executor.shutdown(wait=True)

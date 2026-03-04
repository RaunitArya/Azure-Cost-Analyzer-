"""REST API routes for the alert threshold and alert event resources."""

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from sqlmodel.ext.asyncio.session import AsyncSession

from config import settings

from db.alert_operations import (
    acknowledge_alert,
    create_threshold,
    deactivate_threshold,
    get_anomaly_settings,
    list_alert_events,
    list_anomaly_logs,
    get_thresholds,
    update_anomaly_settings,
    update_threshold,
)
from db.database import get_session
from db.models import AzureService, PeriodType
from exceptions.cost_exceptions import AlertError
from models.alert_models import (
    AlertEventRead,
    AlertThresholdCreate,
    AlertThresholdRead,
    AlertThresholdUpdate,
    AnomalyLogRead,
    AnomalySettingsRead,
    AnomalySettingsUpdate,
)
from services.alert_service import evaluate_thresholds

router = APIRouter(prefix="/alerts", tags=["alerts"])


# Helper functions


async def _enrich_threshold(threshold, session: AsyncSession) -> AlertThresholdRead:
    """Resolve service_name from the DB and return an AlertThresholdRead."""
    service = await session.get(AzureService, threshold.service_id)
    service_name = service.name if service else f"service_id={threshold.service_id}"
    return AlertThresholdRead(
        id=threshold.id,
        service_id=threshold.service_id,
        service_name=service_name,
        period_type=threshold.period_type,
        absolute_threshold=threshold.absolute_threshold,
        is_active=threshold.is_active,
        created_at=threshold.created_at,
        updated_at=threshold.updated_at,
    )


async def _enrich_event(event, session: AsyncSession) -> AlertEventRead:
    """Resolve service_name from the DB and return an AlertEventRead."""
    service = await session.get(AzureService, event.service_id)
    service_name = service.name if service else f"service_id={event.service_id}"
    return AlertEventRead(
        id=event.id,
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


# Threshold endpoints


@router.post("/thresholds", status_code=201)
async def create_alert_threshold(
    payload: AlertThresholdCreate,
    session: AsyncSession = Depends(get_session),
):
    """Create a new alert threshold for a service and period type."""
    # Validate that the service exists
    service = await session.get(AzureService, payload.service_id)
    if service is None:
        raise HTTPException(
            status_code=404,
            detail=f"AzureService id={payload.service_id} not found.",
        )

    try:
        threshold = await create_threshold(session, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc)
            if not settings.is_production
            else "A threshold for this service and period type already exists.",
        )

    threshold_read = await _enrich_threshold(threshold, session)
    return {"status": "success", "data": threshold_read.model_dump()}


@router.get("/thresholds")
async def list_alert_thresholds(
    service_id: int | None = Query(default=None, description="Filter by service ID"),
    period_type: PeriodType | None = Query(
        default=None, description="Filter by period type: daily | monthly"
    ),
    active_only: bool = Query(
        default=True, description="Return only active thresholds"
    ),
    session: AsyncSession = Depends(get_session),
):
    """List alert thresholds with optional filters."""
    thresholds = await get_thresholds(
        session,
        service_id=service_id,
        period_type=period_type,
        active_only=active_only,
    )
    data = [(await _enrich_threshold(t, session)).model_dump() for t in thresholds]
    return {"status": "success", "count": len(data), "data": data}


@router.patch("/thresholds/{threshold_id}")
async def update_alert_threshold(
    threshold_id: int,
    payload: AlertThresholdUpdate,
    session: AsyncSession = Depends(get_session),
):
    """Update the absolute_threshold or is_active flag of an existing threshold."""
    try:
        threshold = await update_threshold(session, threshold_id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc) if not settings.is_production else "Threshold not found.",
        )

    threshold_read = await _enrich_threshold(threshold, session)
    return {"status": "success", "data": threshold_read.model_dump()}


@router.delete("/thresholds/{threshold_id}")
async def deactivate_alert_threshold(
    threshold_id: int,
    session: AsyncSession = Depends(get_session),
):
    """Soft-delete a threshold by marking it inactive."""
    try:
        threshold = await deactivate_threshold(session, threshold_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc) if not settings.is_production else "Threshold not found.",
        )

    threshold_read = await _enrich_threshold(threshold, session)
    return {"status": "success", "data": threshold_read.model_dump()}


# Alert event endpoints


@router.get("/events", summary="List alert events")
async def get_alert_events(
    status: str | None = Query(
        default=None, description="Filter by status: 'open' or 'acknowledged'"
    ),
    service_id: int | None = Query(default=None, description="Filter by service ID"),
    period_type: PeriodType | None = Query(
        default=None, description="Filter by period type"
    ),
    limit: int = Query(
        default=50, ge=1, le=200, description="Number of results per page"
    ),
    offset: int = Query(default=0, ge=0, description="Number of results to skip"),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List alert events with optional filters and pagination."""
    try:
        events, total = await list_alert_events(
            session,
            status=status,
            service_id=service_id,
            period_type=period_type,
            limit=limit,
            offset=offset,
        )
        data = [(await _enrich_event(e, session)).model_dump() for e in events]
        return {
            "status": "success",
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + limit) < total,
            "data": data,
        }
    except Exception as exc:
        err_msg = (
            f"Failed to retrieve alert events: {exc}"
            if settings.show_debug_info
            else "Failed to retrieve alert events."
        )
        logger.error(err_msg)
        raise HTTPException(status_code=500, detail=err_msg)


@router.post("/events/{alert_id}/acknowledge")
async def acknowledge_alert_event(
    alert_id: int,
    session: AsyncSession = Depends(get_session),
):
    """Acknowledge an open alert event, allowing a new alert to be raised for
    the same service and period type in the future."""
    try:
        event = await acknowledge_alert(session, alert_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc)
            if not settings.is_production
            else "Alert event not found or already acknowledged.",
        )

    event_read = await _enrich_event(event, session)
    return {"status": "success", "data": event_read.model_dump()}


# On-demand evaluation endpoint


@router.post("/evaluate")
async def trigger_alert_evaluation(
    period_type: PeriodType = Query(
        ..., description="Period type to evaluate: daily | monthly"
    ),
    session: AsyncSession = Depends(get_session),
):
    """Manually trigger threshold evaluation for all active thresholds of the
    given period type. Useful for testing or ad-hoc checks."""
    logger.info(
        f"Manual alert evaluation triggered for period_type={period_type.value}"
    )
    try:
        summary = await evaluate_thresholds(session, period_type)
    except Exception as exc:
        raise AlertError(
            f"Alert evaluation failed: {exc}"
            if not settings.is_production
            else "Alert evaluation failed."
        ) from exc

    return {
        "status": "success",
        "period_type": period_type.value,
        "data": summary.model_dump(),
    }


# Anomaly settings endpoints


@router.get(
    "/settings",
    summary="Get global anomaly detection settings",
)
async def get_alert_settings(
    session: AsyncSession = Depends(get_session),
):
    """Return the current global anomaly detection settings."""
    try:
        row = await get_anomaly_settings(session)
    except RuntimeError as exc:
        err_msg = (
            f"Failed to retrieve anomaly settings: {exc}"
            if settings.show_debug_info
            else "Failed to retrieve anomaly settings."
        )
        logger.error(err_msg)
        raise HTTPException(status_code=500, detail=err_msg)
    return {
        "status": "success",
        "data": AnomalySettingsRead.model_validate(row).model_dump(),
    }


# Anomaly log endpoint


@router.get("/anomaly-logs")
async def list_anomaly_log_records(
    service_id: int | None = Query(default=None, description="Filter by service ID"),
    period_type: PeriodType | None = Query(
        default=None, description="Filter by period type: daily | monthly"
    ),
    is_alert_fired: bool | None = Query(
        default=None, description="Filter by whether an alert was fired"
    ),
    limit: int = Query(default=100, ge=1, le=500, description="Max records to return"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    session: AsyncSession = Depends(get_session),
):
    """List anomaly detection log entries. Includes both fired and non-fired detections.
    Use is_alert_fired=true to see only breaches, false to see normal evaluations."""
    logs = await list_anomaly_logs(
        session,
        service_id=service_id,
        period_type=period_type,
        is_alert_fired=is_alert_fired,
        limit=limit,
        offset=offset,
    )
    data = [AnomalyLogRead.model_validate(log).model_dump() for log in logs]
    return {"status": "success", "count": len(data), "data": data}


@router.patch(
    "/settings",
    summary="Update global anomaly detection settings",
)
async def update_alert_settings(
    payload: AnomalySettingsUpdate,
    session: AsyncSession = Depends(get_session),
):
    """Partially update global anomaly detection settings (k_value, percentage_buffer,
    alert_history_days, alert_history_months). Only provided fields are updated."""
    try:
        row = await update_anomaly_settings(session, payload)
    except ValueError as exc:
        err_msg = str(exc) if settings.show_debug_info else "Invalid settings value."
        logger.warning(f"Anomaly settings validation error: {exc}")
        raise HTTPException(status_code=422, detail=err_msg)
    except RuntimeError as exc:
        err_msg = (
            str(exc)
            if settings.show_debug_info
            else "Failed to update anomaly settings."
        )
        logger.error(err_msg)
        raise HTTPException(status_code=500, detail=err_msg)
    return {
        "status": "success",
        "data": AnomalySettingsRead.model_validate(row).model_dump(),
    }

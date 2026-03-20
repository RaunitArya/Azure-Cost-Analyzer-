"""REST API routes for the alert threshold and alert event resources."""

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from sqlmodel.ext.asyncio.session import AsyncSession

from config import settings
from db.alert_operations import (
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


async def _enrich_threshold(threshold, session: AsyncSession) -> AlertThresholdRead:
    service = await session.get(AzureService, threshold.service_id)
    service_name = service.name if service else f"service_id={threshold.service_id}"
    return AlertThresholdRead(
        id=threshold.id,
        service_id=threshold.service_id,
        service_name=service_name,
        period_type=threshold.period_type,
        absolute_threshold=threshold.absolute_threshold,
        cooldown_minutes=threshold.cooldown_minutes,
        is_active=threshold.is_active,
        created_at=threshold.created_at,
        updated_at=threshold.updated_at,
    )


async def _enrich_event(event, session: AsyncSession) -> AlertEventRead:
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
        breach_started_at=event.breach_started_at,
        breach_resolved_at=event.breach_resolved_at,
        last_notified_at=event.last_notified_at,
        notification_count=event.notification_count,
        cooldown_minutes=event.cooldown_minutes,
    )


@router.get("/services", summary="List all Azure services")
async def list_azure_services(session: AsyncSession = Depends(get_session)):
    from sqlmodel import select as _select

    result = await session.exec(_select(AzureService).order_by(AzureService.name))
    services = result.all()
    return {
        "status": "success",
        "count": len(services),
        "data": [
            {"id": s.id, "name": s.name, "service_category": s.service_category}
            for s in services
        ],
    }


@router.post("/thresholds", status_code=201)
async def create_alert_threshold(
    payload: AlertThresholdCreate,
    session: AsyncSession = Depends(get_session),
):
    service = await session.get(AzureService, payload.service_id)
    if service is None:
        raise HTTPException(
            status_code=404, detail=f"AzureService id={payload.service_id} not found."
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

    return {
        "status": "success",
        "data": (await _enrich_threshold(threshold, session)).model_dump(),
    }


@router.get("/thresholds")
async def list_alert_thresholds(
    service_id: int | None = Query(default=None),
    period_type: PeriodType | None = Query(default=None),
    active_only: bool = Query(default=True),
    session: AsyncSession = Depends(get_session),
):
    thresholds = await get_thresholds(
        session, service_id=service_id, period_type=period_type, active_only=active_only
    )
    data = [(await _enrich_threshold(t, session)).model_dump() for t in thresholds]
    return {"status": "success", "count": len(data), "data": data}


@router.patch("/thresholds/{threshold_id}")
async def update_alert_threshold(
    threshold_id: int,
    payload: AlertThresholdUpdate,
    session: AsyncSession = Depends(get_session),
):
    try:
        threshold = await update_threshold(session, threshold_id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc) if not settings.is_production else "Threshold not found.",
        )
    return {
        "status": "success",
        "data": (await _enrich_threshold(threshold, session)).model_dump(),
    }


@router.delete("/thresholds/{threshold_id}")
async def deactivate_alert_threshold(
    threshold_id: int,
    session: AsyncSession = Depends(get_session),
):
    try:
        threshold = await deactivate_threshold(session, threshold_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc) if not settings.is_production else "Threshold not found.",
        )
    return {
        "status": "success",
        "data": (await _enrich_threshold(threshold, session)).model_dump(),
    }


@router.get("/events", summary="List alert incidents")
async def get_alert_events(
    status: str | None = Query(default=None, description="open | resolved"),
    service_id: int | None = Query(default=None),
    period_type: PeriodType | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> dict:
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


@router.post("/evaluate")
async def trigger_alert_evaluation(
    period_type: PeriodType = Query(...),
    session: AsyncSession = Depends(get_session),
):
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


@router.get("/settings", summary="Get global anomaly detection settings")
async def get_alert_settings(session: AsyncSession = Depends(get_session)):
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


@router.patch("/settings", summary="Update global anomaly detection settings")
async def update_alert_settings(
    payload: AnomalySettingsUpdate,
    session: AsyncSession = Depends(get_session),
):
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


@router.get("/anomaly-logs")
async def list_anomaly_log_records(
    service_id: int | None = Query(default=None),
    period_type: PeriodType | None = Query(default=None),
    is_alert_fired: bool | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
):
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

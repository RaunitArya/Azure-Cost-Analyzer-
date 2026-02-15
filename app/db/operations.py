from datetime import datetime
from decimal import Decimal

from config import settings
from db.models import AzureService, BillingPeriod, DailyCost, ServiceCost
from loguru import logger
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import col, select, update
from sqlmodel.ext.asyncio.session import AsyncSession

from models.cost_models import CostRecord, DailyCostRecord


async def get_or_create_billing_period(
    session: AsyncSession, start_date: datetime, end_date: datetime
) -> BillingPeriod:
    """
    Get or create a billing period for the given date range.

    This function:
    1. Checks if a billing period exists for the given start/end dates
    2. If found, ensures it's marked as current
    3. If not found, creates a new period and marks it as current
    4. Automatically sets the previous current period to is_current=False
    """
    try:
        # Check if billing period already exists for these dates
        statement = select(BillingPeriod).where(
            BillingPeriod.start_date == start_date, BillingPeriod.end_date == end_date
        )
        result = await session.exec(statement)
        existing_period = result.first()

        if existing_period:
            # Period exists - ensure it's marked as current if it's not already
            if not existing_period.is_current:
                # Unmark the old current period
                update_stmt = (
                    update(BillingPeriod)
                    .where(col(BillingPeriod.is_current).is_(True))
                    .values(is_current=False)
                )
                await session.exec(update_stmt)

                # Mark this period as current
                existing_period.is_current = True
                session.add(existing_period)
                await session.commit()
                await session.refresh(existing_period)

            return existing_period

        else:
            # Period doesn't exist - create new one
            # First, unmark any existing current period
            update_stmt = (
                update(BillingPeriod)
                .where(col(BillingPeriod.is_current).is_(True))
                .values(is_current=False)
            )
            await session.exec(update_stmt)

            # Create new period with is_current=True
            new_period = BillingPeriod(
                start_date=start_date, end_date=end_date, is_current=True
            )
            session.add(new_period)
            await session.commit()
            await session.refresh(new_period)

            return new_period

    except SQLAlchemyError as e:
        await session.rollback()
        if settings.show_debug_info:
            logger.error(f"Database error while managing billing period: {e}")
            raise Exception(f"Database error while managing billing period: {str(e)}")
        else:
            logger.error("Database error while managing billing period")
            raise Exception("Database error while managing billing period")


async def get_or_create_azure_service(
    session: AsyncSession, service_name: str
) -> AzureService:
    """Get an existing AzureService by name, or create it."""
    statement = select(AzureService).where(AzureService.name == service_name)
    result = await session.exec(statement)
    service = result.first()

    if service:
        return service

    service = AzureService(name=service_name)
    session.add(service)
    await session.flush()  # get the id without committing
    return service


async def upsert_service_cost(
    session: AsyncSession,
    service_id: int | None,
    billing_period_id: int | None,
    cost_amount: Decimal,
    currency_code: str,
) -> ServiceCost:
    """Insert or update a service cost record."""
    statement = select(ServiceCost).where(
        ServiceCost.service_id == service_id,
        ServiceCost.billing_period_id == billing_period_id,
    )
    result = await session.exec(statement)
    existing = result.first()

    if existing:
        existing.cost_amount = cost_amount
        existing.currency_code = currency_code
        session.add(existing)
        return existing

    record = ServiceCost(
        service_id=service_id,
        billing_period_id=billing_period_id,
        cost_amount=cost_amount,
        currency_code=currency_code,
    )
    session.add(record)
    return record


async def upsert_daily_cost(
    session: AsyncSession,
    billing_period_id: int | None,
    usage_date: datetime,
    cost_amount: Decimal,
    currency_code: str,
) -> DailyCost:
    """Insert or update a daily cost record."""
    statement = select(DailyCost).where(
        DailyCost.usage_date == usage_date,
        DailyCost.billing_period_id == billing_period_id,
    )
    result = await session.exec(statement)
    existing = result.first()

    if existing:
        existing.cost_amount = cost_amount
        existing.currency_code = currency_code
        session.add(existing)
        return existing

    record = DailyCost(
        billing_period_id=billing_period_id,
        usage_date=usage_date,
        cost_amount=cost_amount,
        currency_code=currency_code,
    )
    session.add(record)
    return record


async def save_service_costs(
    session: AsyncSession,
    billing_period_id: int | None,
    records: list[CostRecord],
) -> int:
    """Save preprocessed CostRecords to the database. Returns count saved."""
    saved = 0
    try:
        for record in records:
            service = await get_or_create_azure_service(session, record.service_name)
            await upsert_service_cost(
                session=session,
                service_id=service.id,
                billing_period_id=billing_period_id,
                cost_amount=record.cost,
                currency_code=record.currency,
            )
            saved += 1

        await session.commit()
        if settings.show_debug_info:
            logger.info(f"Saved {saved} service cost records to database")
        else:
            logger.info("Service cost records saved to database")
        return saved

    except SQLAlchemyError as e:
        await session.rollback()
        if settings.show_debug_info:
            logger.error(f"Failed to save service costs: {e}")
            raise Exception(f"Database error while saving service costs: {str(e)}")
        else:
            logger.error("Failed to save service costs")
            raise Exception("Database error while saving service costs")


async def save_daily_costs(
    session: AsyncSession,
    billing_period_id: int | None,
    records: list[DailyCostRecord],
) -> int:
    """Save preprocessed DailyCostRecords to the database. Returns count saved."""
    saved = 0
    try:
        for record in records:
            await upsert_daily_cost(
                session=session,
                billing_period_id=billing_period_id,
                usage_date=record.usage_date,
                cost_amount=record.cost,
                currency_code=record.currency,
            )
            saved += 1

        await session.commit()
        if settings.show_debug_info:
            logger.info(f"Saved {saved} daily cost records to database")
        else:
            logger.info("Daily cost records saved to database")
        return saved

    except SQLAlchemyError as e:
        await session.rollback()
        if settings.show_debug_info:
            logger.error(f"Failed to save daily costs: {e}")
            raise Exception(f"Database error while saving daily costs: {str(e)}")
        else:
            logger.error("Failed to save daily costs")
            raise Exception("Database error while saving daily costs")

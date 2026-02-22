from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from config import settings
from db.operations import (
    save_daily_costs,
    save_service_costs,
)
from loguru import logger
from services.cost_preprocessor import (
    preprocess_daily_costs,
    preprocess_service_costs,
)
from services.cost_service import (
    fetch_last_7_days_cost,
    fetch_month_to_date_cost_by_service,
)
from services.cost_tasks import fetch_process_save

# Global scheduler instance
scheduler: AsyncIOScheduler | None = None


async def fetch_and_save_daily_costs() -> None:
    """
    Background job to fetch daily costs and save to database.
    """
    job_start = datetime.now()
    logger.info("Starting scheduled job: fetch_and_save_daily_costs")

    try:
        _, _, saved_count = await fetch_process_save(
            fetch_last_7_days_cost, preprocess_daily_costs, save_daily_costs
        )

        duration: int | float = (datetime.now() - job_start).total_seconds()
        logger.info(
            f"Completed scheduled job: fetch_and_save_daily_costs "
            f"({saved_count} records saved in {duration:.2f}s)"
        )

    except Exception as e:
        duration: int | float = (datetime.now() - job_start).total_seconds()
        logger.error(
            f"Failed scheduled job: fetch_and_save_daily_costs "
            f"(duration: {duration:.2f}s, error: {e})"
        )


async def fetch_and_save_service_costs() -> None:
    """
    Background job to fetch month-to-date service costs and save to database.
    """
    job_start = datetime.now()
    logger.info("Starting scheduled job: fetch_and_save_service_costs")

    try:
        _, _, saved_count = await fetch_process_save(
            fetch_month_to_date_cost_by_service,
            preprocess_service_costs,
            save_service_costs,
        )

        duration: int | float = (datetime.now() - job_start).total_seconds()
        logger.info(
            f"Completed scheduled job: fetch_and_save_service_costs "
            f"({saved_count} records saved in {duration:.2f}s)"
        )

    except Exception as e:
        duration: int | float = (datetime.now() - job_start).total_seconds()
        logger.error(
            f"Failed scheduled job: fetch_and_save_service_costs "
            f"(duration: {duration:.2f}s, error: {e})"
        )


def create_scheduler() -> AsyncIOScheduler:
    """
    Create and configure the APScheduler instance.

    Schedule configuration:
    - Daily costs
    - Service costs

    Returns:
        AsyncIOScheduler: Configured scheduler instance
    """
    scheduler = AsyncIOScheduler(timezone="UTC")

    scheduler.add_job(
        fetch_and_save_daily_costs,
        trigger=IntervalTrigger(
            hours=settings.DAILY_COST_HOUR, minutes=settings.DAILY_COST_MINUTE
        ),
        id="fetch_daily_costs",
        name=f"Fetch Daily Costs (Every {settings.DAILY_COST_HOUR} hours and {settings.DAILY_COST_MINUTE} minutes)",
        replace_existing=True,
        max_instances=1,  # Prevent overlapping runs
        misfire_grace_time=900,  # Allow 15 minute delay if missed
    )

    scheduler.add_job(
        fetch_and_save_service_costs,
        trigger=IntervalTrigger(
            hours=settings.SERVICE_COST_HOUR, minutes=settings.SERVICE_COST_MINUTE
        ),
        id="fetch_service_costs",
        name=f"Fetch Service Costs (Every {settings.SERVICE_COST_HOUR} hours and {settings.SERVICE_COST_MINUTE} minutes)",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=1800,  # Allow 30 min delay if missed
    )

    logger.info("Scheduler configured with jobs:")
    logger.info(
        f"  - Daily costs: Every {settings.DAILY_COST_HOUR} hours and {settings.DAILY_COST_MINUTE} minutes"
    )
    logger.info(
        f"  - Service costs: Every {settings.SERVICE_COST_HOUR} hours and {settings.SERVICE_COST_MINUTE} minutes"
    )

    return scheduler


def start_scheduler() -> None:
    """Start the background scheduler."""
    global scheduler

    if scheduler is not None:
        logger.warning("Scheduler already running")
        return

    try:
        scheduler = create_scheduler()
        scheduler.start()
        logger.info("Scheduler started successfully")
    except Exception as e:
        if settings.show_debug_info:
            logger.error(f"Failed to start scheduler: {e}")
        else:
            logger.error("Failed to start scheduler")
        scheduler = None


def shutdown_scheduler() -> None:
    """Shutdown the background scheduler gracefully."""
    global scheduler

    if scheduler is None:
        logger.warning("Scheduler not running")
        return

    logger.info("Shutting down scheduler...")
    try:
        scheduler.shutdown(wait=True)
    except Exception as e:
        if settings.show_debug_info:
            logger.error(f"Failed to shut down scheduler: {e}")
        else:
            logger.error("Failed to shut down scheduler")
        return
    else:
        scheduler = None
        logger.info("Scheduler shut down successfully")


def get_scheduler_status() -> dict:
    """Get current scheduler status and job information."""
    global scheduler

    if scheduler is None:
        return {"status": "stopped", "jobs": []}

    jobs_info = []
    for job in scheduler.get_jobs():
        jobs_info.append(
            {
                "id": job.id,
                "name": job.name,
                "next_run": job.next_run_time.isoformat()
                if (settings.is_development and job.next_run_time)
                else None,
                "trigger": str(job.trigger) if settings.is_development else None,
            }
        )

    return {
        "status": "running" if scheduler.running else "stopped",
        "jobs": jobs_info,
    }

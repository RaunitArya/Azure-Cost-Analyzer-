from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    Column,
    CheckConstraint,
    Index,
    UniqueConstraint,
    DECIMAL,
    String,
    DateTime,
    Boolean,
    Enum as SAEnum,
)
from typing import Optional
from sqlmodel import Field, Relationship, SQLModel


class PeriodType(str, Enum):
    """Whether a threshold or alert event applies to daily or monthly cost."""

    DAILY = "daily"
    MONTHLY = "monthly"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AzureService(SQLModel, table=True):
    __tablename__ = "azure_service"
    __table_args__ = (Index("idx_azure_service_name", "name"),)

    id: int | None = Field(
        default=None, primary_key=True, sa_column_kwargs={"autoincrement": True}
    )
    name: str = Field(
        sa_column=Column(String(255), unique=True, nullable=False),
    )
    service_category: str | None = Field(
        default=None,
        sa_column=Column(String(100), nullable=True),
    )
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True)), default_factory=_utcnow
    )

    # relationships
    service_costs: list["ServiceCost"] = Relationship(
        back_populates="service", cascade_delete=True
    )
    daily_costs: list["DailyCost"] = Relationship(
        back_populates="service", cascade_delete=True
    )
    alert_thresholds: list["AlertThreshold"] = Relationship(
        back_populates="service", cascade_delete=True
    )
    alert_events: list["AlertEvent"] = Relationship(
        back_populates="service", cascade_delete=True
    )
    anomaly_logs: list["AnomalyLog"] = Relationship(
        back_populates="service", cascade_delete=True
    )


class BillingPeriod(SQLModel, table=True):
    __tablename__ = "billing_period"
    __table_args__ = (
        UniqueConstraint("start_date", "end_date", name="uq_billing_period_dates"),
    )

    id: int | None = Field(
        default=None, primary_key=True, sa_column_kwargs={"autoincrement": True}
    )
    start_date: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    end_date: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    is_current: bool = Field(default=False, sa_column=Column(Boolean, default=False))
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True)), default_factory=_utcnow
    )

    # relationships
    service_costs: list["ServiceCost"] = Relationship(
        back_populates="billing_period", cascade_delete=True
    )
    daily_costs: list["DailyCost"] = Relationship(
        back_populates="billing_period", cascade_delete=True
    )


class ServiceCost(SQLModel, table=True):
    __tablename__ = "service_cost"
    __table_args__ = (
        UniqueConstraint(
            "service_id",
            "billing_period_id",
            name="uq_service_cost_natural_key",
        ),
        CheckConstraint("cost_amount >= 0", name="ck_service_cost_amount_positive"),
        CheckConstraint("LENGTH(currency_code) = 3", name="ck_currency_code_length"),
        Index("idx_service_cost_service_period", "service_id", "billing_period_id"),
        Index("idx_service_cost_fetched_at", "fetched_at"),
    )

    id: int | None = Field(
        default=None, primary_key=True, sa_column_kwargs={"autoincrement": True}
    )
    billing_period_id: int = Field(
        foreign_key="billing_period.id",
        ondelete="CASCADE",
        nullable=False,
    )
    service_id: int = Field(
        foreign_key="azure_service.id",
        ondelete="CASCADE",
        nullable=False,
    )
    currency_code: str = Field(
        sa_column=Column(String(3), nullable=False),
        description="ISO 4217 currency code, e.g. USD, INR",
    )
    cost_amount: Decimal = Field(
        sa_column=Column(DECIMAL(15, 2), nullable=False),
    )
    fetched_at: datetime = Field(default_factory=_utcnow)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(
        default_factory=_utcnow, sa_column_kwargs={"onupdate": _utcnow}
    )

    # relationships
    billing_period: BillingPeriod = Relationship(back_populates="service_costs")
    service: AzureService = Relationship(back_populates="service_costs")


class AnomalyLog(SQLModel, table=True):
    """Audit record of every anomaly detection run per service per evaluation.

    Written for every service that has a computable threshold, regardless of
    whether an AlertEvent was fired. Use is_alert_fired to distinguish.
    """

    __tablename__ = "anomaly_log"
    __table_args__ = (
        Index("idx_anomaly_log_service_period", "service_id", "period_type"),
        Index("idx_anomaly_log_detected_at", "detected_at"),
        Index("idx_anomaly_log_is_alert_fired", "is_alert_fired"),
    )

    id: int | None = Field(
        default=None, primary_key=True, sa_column_kwargs={"autoincrement": True}
    )
    service_id: int = Field(
        foreign_key="azure_service.id",
        ondelete="CASCADE",
        nullable=False,
    )
    service_name: str = Field(
        sa_column=Column(String(255), nullable=False),
        description="Denormalized service name for fast querying without joins.",
    )
    period_type: PeriodType = Field(
        sa_column=Column(
            SAEnum(PeriodType, name="periodtype", create_type=False),
            nullable=False,
        )
    )
    reference_date: date = Field(
        nullable=False,
        description="usage_date for daily; first day of billing month for monthly.",
    )
    current_cost: Decimal = Field(
        sa_column=Column(DECIMAL(15, 2), nullable=False),
    )
    absolute_component: Decimal | None = Field(
        default=None,
        sa_column=Column(DECIMAL(15, 2), nullable=True),
    )
    statistical_component: Decimal | None = Field(
        default=None,
        sa_column=Column(DECIMAL(15, 2), nullable=True),
    )
    percentage_component: Decimal | None = Field(
        default=None,
        sa_column=Column(DECIMAL(15, 2), nullable=True),
    )
    computed_threshold: Decimal = Field(
        sa_column=Column(DECIMAL(15, 2), nullable=False),
        description="max() of non-None components.",
    )
    winning_component: str = Field(
        sa_column=Column(String(20), nullable=False),
    )
    is_alert_fired: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, default=False),
        description="True if an AlertEvent was created for this detection.",
    )
    alert_event_id: int | None = Field(
        default=None,
        foreign_key="alert_event.id",
        ondelete="SET NULL",
        nullable=True,
        description="FK to AlertEvent if is_alert_fired=True, else None.",
    )
    detected_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
        default_factory=_utcnow,
    )

    # relationships
    service: AzureService = Relationship(back_populates="anomaly_logs")
    alert_event: Optional["AlertEvent"] = Relationship(back_populates="anomaly_log")


class DailyCost(SQLModel, table=True):
    __tablename__ = "daily_cost"
    __table_args__ = (
        UniqueConstraint(
            "usage_date",
            "service_id",
            "billing_period_id",
            name="uq_daily_cost_date_service_period",
        ),
        CheckConstraint("cost_amount >= 0", name="ck_daily_cost_amount_positive"),
        CheckConstraint("LENGTH(currency_code) = 3", name="ck_currency_code_length"),
        Index("idx_daily_cost_usage_date", "usage_date", postgresql_using="btree"),
        Index("idx_daily_cost_billing_period", "billing_period_id"),
        Index("idx_daily_cost_service_date", "service_id", "usage_date"),
    )

    id: int | None = Field(
        default=None, primary_key=True, sa_column_kwargs={"autoincrement": True}
    )
    currency_code: str = Field(
        sa_column=Column(String(3), nullable=False),
        description="ISO 4217 currency code, e.g. USD, INR",
    )
    service_id: int = Field(
        foreign_key="azure_service.id",
        ondelete="CASCADE",
        nullable=False,
    )
    billing_period_id: int = Field(
        foreign_key="billing_period.id",
        ondelete="CASCADE",
        nullable=False,
    )
    usage_date: date = Field(nullable=False)
    cost_amount: Decimal = Field(
        sa_column=Column(DECIMAL(15, 2), nullable=False),
    )
    fetched_at: datetime = Field(default_factory=_utcnow)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(
        default_factory=_utcnow, sa_column_kwargs={"onupdate": _utcnow}
    )

    # relationships
    billing_period: BillingPeriod = Relationship(back_populates="daily_costs")
    service: AzureService = Relationship(back_populates="daily_costs")


class AlertThreshold(SQLModel, table=True):
    """User-defined cost threshold per service per period type."""

    __tablename__ = "alert_threshold"
    __table_args__ = (
        UniqueConstraint(
            "service_id",
            "period_type",
            name="uq_alert_threshold_service_period",
        ),
    )

    id: int | None = Field(
        default=None, primary_key=True, sa_column_kwargs={"autoincrement": True}
    )
    service_id: int = Field(
        foreign_key="azure_service.id",
        ondelete="CASCADE",
        nullable=False,
    )
    period_type: PeriodType = Field(
        sa_column=Column(
            SAEnum(PeriodType, name="periodtype", create_type=True),
            nullable=False,
        )
    )
    absolute_threshold: Decimal | None = Field(
        default=None,
        sa_column=Column(DECIMAL(15, 2), nullable=True),
        description="Hard budget ceiling (business rule). Null = not configured.",
    )
    is_active: bool = Field(default=True, sa_column=Column(Boolean, default=True))
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True)), default_factory=_utcnow
    )
    updated_at: datetime = Field(
        default_factory=_utcnow, sa_column_kwargs={"onupdate": _utcnow}
    )

    # relationships
    service: AzureService = Relationship(back_populates="alert_thresholds")
    alert_events: list["AlertEvent"] = Relationship(
        back_populates="threshold", cascade_delete=True
    )


class AlertEvent(SQLModel, table=True):
    """A recorded breach of an alert threshold."""

    __tablename__ = "alert_event"
    __table_args__ = (
        Index(
            "idx_alert_event_service_period_status",
            "service_id",
            "period_type",
            "status",
        ),
    )

    id: int | None = Field(
        default=None, primary_key=True, sa_column_kwargs={"autoincrement": True}
    )
    threshold_id: int = Field(
        foreign_key="alert_threshold.id",
        ondelete="CASCADE",
        nullable=False,
    )
    service_id: int = Field(
        foreign_key="azure_service.id",
        ondelete="CASCADE",
        nullable=False,
    )
    period_type: PeriodType = Field(
        sa_column=Column(
            SAEnum(PeriodType, name="periodtype", create_type=False),
            nullable=False,
        )
    )
    reference_date: date = Field(
        nullable=False,
        description="usage_date for daily; first day of billing month for monthly.",
    )
    current_cost: Decimal = Field(
        sa_column=Column(DECIMAL(15, 2), nullable=False),
        description="Cost value that triggered the alert.",
    )
    computed_threshold: Decimal = Field(
        sa_column=Column(DECIMAL(15, 2), nullable=False),
        description="max(...) threshold value that was breached.",
    )
    absolute_component: Decimal | None = Field(
        default=None,
        sa_column=Column(DECIMAL(15, 2), nullable=True),
        description="User-set absolute threshold used in max().",
    )
    statistical_component: Decimal | None = Field(
        default=None,
        sa_column=Column(DECIMAL(15, 2), nullable=True),
        description="mean + k * std component.",
    )
    percentage_component: Decimal | None = Field(
        default=None,
        sa_column=Column(DECIMAL(15, 2), nullable=True),
        description="mean * percentage_buffer component.",
    )
    winning_component: str = Field(
        sa_column=Column(String(20), nullable=False),
        description="Which component produced the highest threshold: absolute | statistical | percentage.",
    )
    status: str = Field(
        default="open",
        sa_column=Column(String(20), nullable=False, default="open"),
        description="open | acknowledged",
    )
    acknowledged_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    triggered_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
        default_factory=_utcnow,
    )

    # relationships
    threshold: AlertThreshold = Relationship(back_populates="alert_events")
    service: AzureService = Relationship(back_populates="alert_events")
    anomaly_log: Optional["AnomalyLog"] = Relationship(back_populates="alert_event")


class AnomalySettings(SQLModel, table=True):
    """Single-row table storing global anomaly detection configuration.

    Only one row (id=1) should ever exist. Use upsert pattern to update.
    """

    __tablename__ = "anomaly_settings"

    id: int | None = Field(default=None, primary_key=True)
    k_value: float = Field(
        default=2.0,
        gt=0,
        description="k multiplier for statistical threshold (mean + k * std)",
    )
    percentage_buffer: float = Field(
        default=1.5,
        gt=1.0,
        description="Multiplier for percentage threshold (mean * pct_buffer)",
    )
    alert_history_days: int = Field(
        default=30,
        gt=0,
        description="Rolling window in days for daily cost statistics",
    )
    alert_history_months: int = Field(
        default=3,
        gt=0,
        description="Number of past billing periods used for monthly statistics",
    )
    updated_at: datetime = Field(
        default_factory=_utcnow, sa_column_kwargs={"onupdate": _utcnow}
    )

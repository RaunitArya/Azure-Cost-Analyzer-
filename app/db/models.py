from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Column,
    CheckConstraint,
    Index,
    UniqueConstraint,
    DECIMAL,
    String,
    DateTime,
    Boolean,
)
from sqlmodel import Field, Relationship, SQLModel


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


class BillingPeriod(SQLModel, table=True):
    __tablename__ = "billing_period"
    __table_args__ = (
        UniqueConstraint("start_date", "end_date", name="uq_billing_period_dates"),
        Index("idx_billing_period_current", "is_current", unique=True),
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


class DailyCost(SQLModel, table=True):
    __tablename__ = "daily_cost"
    __table_args__ = (
        UniqueConstraint(
            "usage_date",
            "billing_period_id",
            name="uq_daily_cost_date_period",
        ),
        CheckConstraint("cost_amount >= 0", name="ck_daily_cost_amount_positive"),
        CheckConstraint("LENGTH(currency_code) = 3", name="ck_currency_code_length"),
        Index("idx_daily_cost_usage_date", "usage_date", postgresql_using="btree"),
        Index("idx_daily_cost_billing_period", "billing_period_id"),
    )

    id: int | None = Field(
        default=None, primary_key=True, sa_column_kwargs={"autoincrement": True}
    )
    currency_code: str = Field(
        sa_column=Column(String(3), nullable=False),
        description="ISO 4217 currency code, e.g. USD, INR",
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

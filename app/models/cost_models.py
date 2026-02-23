from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator


# Shared validators as standalone functions
def validate_cost_amount(v: Any) -> Decimal:
    """Round cost to 2 decimal places"""
    if isinstance(v, (int, float)):
        return Decimal(str(v)).quantize(Decimal("0.01"))
    return Decimal(v).quantize(Decimal("0.01"))


def validate_currency_code(v: str) -> str:
    """Ensure currency is uppercase"""
    return v.upper()


class CostRecord(BaseModel):
    """Validated and preprocessed cost record"""

    model_config = ConfigDict(
        validate_assignment=True,
    )

    service_name: str
    service_category: str | None = Field(default=None)
    cost: Decimal = Field(ge=0, description="Cost amount, must be non-negative")
    currency: str = Field(default="INR")

    # Temporal fields
    billing_period_start: datetime
    billing_period_end: datetime
    fetched_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="When the data was fetched",
    )

    @field_validator("cost", mode="before")
    @classmethod
    def round_cost(cls, v: Any) -> Decimal:
        """Round cost to 2 decimal places"""
        return validate_cost_amount(v)

    @field_validator("service_name")
    @classmethod
    def validate_service_name(cls, v: str) -> str:
        """Store service names as-is from Azure"""
        return v.strip() if v else "Unknown"

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        """Ensure currency is uppercase"""
        return validate_currency_code(v)

    @field_serializer("cost")
    def serialize_cost(self, value: Decimal) -> float:
        """Serialize Decimal to float for JSON"""
        return float(value)


class DailyCostRecord(BaseModel):
    """Cost record with daily granularity"""

    model_config = ConfigDict(
        validate_assignment=True,
    )

    service_name: str
    service_category: str | None = Field(default=None)
    usage_date: datetime
    cost: Decimal = Field(ge=0)
    currency: str = Field(default="INR")
    billing_period_start: datetime
    billing_period_end: datetime
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("cost", mode="before")
    @classmethod
    def round_cost(cls, v: Any) -> Decimal:
        """Round cost to 2 decimal places"""
        return validate_cost_amount(v)

    @field_validator("service_name")
    @classmethod
    def validate_service_name(cls, v: str) -> str:
        """Store service names as-is from Azure"""
        return v.strip() if v else "Unknown"

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        """Ensure currency is uppercase"""
        return validate_currency_code(v)

    @field_serializer("cost")
    def serialize_cost(self, value: Decimal) -> float:
        """Serialize Decimal to float for JSON"""
        return float(value)

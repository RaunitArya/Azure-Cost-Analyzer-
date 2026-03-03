"""Pydantic API models for the alert system."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from db.models import PeriodType


class AlertThresholdCreate(BaseModel):
    """Payload for creating a new alert threshold."""

    model_config = ConfigDict(validate_assignment=True)

    service_id: int = Field(..., gt=0, description="ID of the Azure service")
    period_type: PeriodType = Field(
        ..., description="Whether this threshold applies to daily or monthly cost"
    )
    absolute_threshold: Decimal | None = Field(
        default=None,
        ge=0,
        description="Hard budget ceiling in the service's currency. Null = not configured.",
    )

    @field_validator("absolute_threshold", mode="before")
    @classmethod
    def round_threshold(cls, v):
        if v is None:
            return v
        return round(Decimal(str(v)), 2)


class AlertThresholdUpdate(BaseModel):
    """Partial update payload for an existing alert threshold."""

    model_config = ConfigDict(validate_assignment=True)

    absolute_threshold: Decimal | None = Field(
        default=None,
        ge=0,
        description="New hard budget ceiling. Pass null to clear.",
    )
    is_active: bool | None = Field(
        default=None, description="Enable or disable the threshold."
    )

    @field_validator("absolute_threshold", mode="before")
    @classmethod
    def round_threshold(cls, v):
        if v is None:
            return v
        return round(Decimal(str(v)), 2)


class AlertThresholdRead(BaseModel):
    """Full representation of a threshold, including denormalised service name."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    service_id: int
    service_name: str
    period_type: PeriodType
    absolute_threshold: Decimal | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AlertEventRead(BaseModel):
    """Full representation of a fired alert event."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    threshold_id: int
    service_id: int
    service_name: str
    period_type: PeriodType
    reference_date: date
    current_cost: Decimal
    computed_threshold: Decimal
    absolute_component: Decimal | None
    statistical_component: Decimal | None
    percentage_component: Decimal | None
    winning_component: str
    status: str
    acknowledged_at: datetime | None
    triggered_at: datetime


class AnomalyLogRead(BaseModel):
    """Read model for an anomaly detection log entry."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    service_id: int
    service_name: str
    period_type: PeriodType
    reference_date: date
    current_cost: Decimal
    absolute_component: Decimal | None
    statistical_component: Decimal | None
    percentage_component: Decimal | None
    computed_threshold: Decimal
    winning_component: str
    is_alert_fired: bool
    alert_event_id: int | None
    detected_at: datetime


class AnomalySettingsRead(BaseModel):
    """Full representation of global anomaly detection settings."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    k_value: float
    percentage_buffer: float
    alert_history_days: int
    alert_history_months: int
    updated_at: datetime


class AnomalySettingsUpdate(BaseModel):
    """Partial update payload for anomaly detection settings."""

    model_config = ConfigDict(validate_assignment=True)

    k_value: float | None = Field(
        default=None,
        gt=0,
        description="k multiplier for statistical threshold (mean + k * std)",
    )
    percentage_buffer: float | None = Field(
        default=None,
        gt=1.0,
        description="Multiplier for percentage threshold (mean * pct_buffer)",
    )
    alert_history_days: int | None = Field(
        default=None,
        gt=0,
        description="Rolling window in days for daily cost statistics",
    )
    alert_history_months: int | None = Field(
        default=None,
        gt=0,
        description="Number of past billing periods used for monthly statistics",
    )


class AlertEvaluationSummary(BaseModel):
    """Summary returned by an evaluation run."""

    evaluated: int = Field(description="Number of thresholds evaluated")
    breaches: int = Field(description="Number of new alert events created")
    skipped_no_cost: int = Field(
        description="Thresholds skipped because no current cost data was found"
    )
    skipped_open_alert: int = Field(
        description="Thresholds skipped because an open alert already exists"
    )
    new_alerts: list[AlertEventRead] = Field(
        description="Details of each newly created alert event"
    )

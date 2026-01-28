"""Custom exceptions for cost-related operations."""


class CostServiceError(Exception):
    """Base exception for cost service errors."""

    pass


class AzureApiError(CostServiceError):
    """Exception raised when Azure API calls fail."""

    pass


class DataValidationError(CostServiceError):
    """Exception raised when data validation fails."""

    pass


class DataProcessingError(CostServiceError):
    """Exception raised when data processing fails."""

    pass

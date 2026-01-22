"""
Azure Cost Management client module.

Provides a singleton CostManagementClient instance for interacting with
Azure Cost Management APIs.
"""

from azure.auth import get_azure_credential
from azure.mgmt.costmanagement import CostManagementClient
from config import settings

# Singleton instance of the CostManagementClient
_COST_CLIENT = None


def get_cost_client() -> CostManagementClient:
    """
    Get or create a singleton CostManagementClient instance.

    Returns:
        CostManagementClient: Authenticated client for Azure Cost Management API.

    Raises:
        RuntimeError: If client initialization fails due to authentication
                      or configuration issues.
    """
    global _COST_CLIENT
    try:
        if _COST_CLIENT is None:
            # Obtain Azure credentials from the auth module
            credential = get_azure_credential()
            # Initialize the Cost Management client with credentials and subscription
            _COST_CLIENT = CostManagementClient(
                credential=credential,
                subscription_id=settings.AZURE_SUBSCRIPTION_ID,
            )
        return _COST_CLIENT

    except Exception as exc:
        raise RuntimeError(
            "Failed to initialize Azure CostManagementClient. "
            "Verify Azure authentication configuration and AZURE_SUBSCRIPTION_ID."
        ) from exc


def subscription_scope() -> str:
    """
    Build the Azure Resource Manager scope string for the current subscription.

    Returns:
        str: The subscription scope in ARM format (e.g., "/subscriptions/<id>").
    """
    return f"/subscriptions/{settings.AZURE_SUBSCRIPTION_ID}"

from typing import Optional

from azure.identity import ClientSecretCredential
from azure.core.exceptions import ClientAuthenticationError
from config import settings

# Cached credential instance to avoid creating multiple credential objects
_AZURE_CREDENTIAL: Optional[ClientSecretCredential] = None


def get_azure_credential() -> ClientSecretCredential:
    """
    Returns a cached Azure ClientSecretCredential instance.

    Uses singleton pattern to reuse the same credential object across calls.
    The Azure SDK automatically handles token refresh, so we only need
    to create the credential once.

    Returns:
        ClientSecretCredential: Authenticated Azure credential object

    Raises:
        ValueError: If required Azure credentials are missing
        ClientAuthenticationError: If authentication fails
    """
    global _AZURE_CREDENTIAL

    # Return cached credential if already initialized
    if _AZURE_CREDENTIAL is None:
        try:
            if not all(
                [
                    settings.AZURE_TENANT_ID,
                    settings.AZURE_CLIENT_ID,
                    settings.AZURE_CLIENT_SECRET,
                ]
            ):
                raise ValueError("Missing required Azure credentials in settings")

            _AZURE_CREDENTIAL = ClientSecretCredential(
                tenant_id=settings.AZURE_TENANT_ID,
                client_id=settings.AZURE_CLIENT_ID,
                client_secret=settings.AZURE_CLIENT_SECRET,
            )
        except ClientAuthenticationError as e:
            raise ClientAuthenticationError(f"Failed to authenticate with Azure: {e}")
        except Exception as e:
            raise Exception(f"Failed to create Azure credential: {e}")

    return _AZURE_CREDENTIAL

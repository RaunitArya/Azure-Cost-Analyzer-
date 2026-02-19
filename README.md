# Azure Cloud Cost Analyzer

![Project Status](https://img.shields.io/badge/status-in%20progress-yellow)
![Version](https://img.shields.io/badge/version-1.0.0-brightgreen)

## 📌 Problem Description

Developers often overspend on cloud; this tool: Fetches Azure VM, app service, DB cost Predicts monthly bill Shows per-service breakdown Alerts if budget exceeds a limit Suggests cost-optimization tips

## 🎯 Objectives

- To analyze Azure cloud resource costs
- To provide detailed cost breakdown and visualization
- To implement budget monitoring and alerting
- To integrate AI-based cost intelligence

## 📁 Directory Structure

```
Azure Cost Analyzer/
├── alembic.ini
├── pyproject.toml
├── README.md
├── requirements.txt
└── app/
 ├── config.py
 ├── main.py
 ├── alembic/              # Database migration scripts
 │   ├── env.py
 │   ├── README
 │   ├── script.py.mako
 │   └── versions/
 ├── azure/
 │   ├── auth.py           # Azure authentication logic
 │   └── cost_client.py    # Azure cost API client
 ├── db/
 │   ├── database.py       # DB connection setup
 │   ├── models.py         # DB models/schema
 │   └── operations.py     # DB operations/utilities
 ├── exceptions/           # Custom exception classes
 │   └── cost_exceptions.py
 ├── handlers/             # Exception handler functions
 │   └── exception_handlers.py
 ├── models/               # Data models for cost analysis
 │   └── cost_models.py
 ├── routes/
 │   └── cost_routes.py    # Cost API endpoints
 ├── services/             # Business logic and services
 │   ├── cost_preprocessor.py
 │   └── cost_service.py
 └── utils/
  └── responses.py         # Standardized API responses
```

## 🚀 Setup & Installation

### Prerequisites

- Python 3.11+ recommended
- Git installed
- (Optional) Azure CLI for auth workflows

### Option 1: Fast setup with uv (recommended)

```bash
# Install uv if needed
curl -LsSf https://astral.sh/uv/install.sh | sh
# Create and sync environment
uv venv
uv pip install -r requirements.txt
uv run app/main.py
```

### Option 2: Standard virtualenv + pip

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
python -m app/main.py
```

## 🛡️ Obtaining Azure Credentials

To use this project, you need to register an Azure AD application and gather the following credentials:

1. **Log in to the Azure Portal**

- Go to <https://portal.azure.com/>

1. **Register an Application (App Registration)**

- Navigate to "Azure Active Directory" > "App registrations" > "New registration".
- Enter a name, select supported account types, and register.

1. **Get the Application (client) ID**

- After registration, copy the **Application (client) ID** from the app overview.

1. **Get the Directory (tenant) ID**

- Copy the **Directory (tenant) ID** from the app overview.

1. **Create a Client Secret**

- Go to "Certificates & secrets" > "New client secret".
- Add a description and expiry, then click "Add".
- Copy the generated **Value** (this is your `AZURE_CLIENT_SECRET`).

1. **Get Your Subscription ID**

- In the Azure Portal, search for "Subscriptions".
- Select your subscription and copy the **Subscription ID**.

1. **Get the Object ID**

- In the App Registration overview, copy the **Object ID** (sometimes called Application Object ID).

1. **Assign Required Permissions**

- Go to "API permissions" > "Add a permission" > "APIs my organization uses" > search for and add required Azure APIs (e.g., Cost Management, Resource Management).
- Grant admin consent if needed.

1. **Assign Roles to the App**

- Go to your subscription/resource group/resource > "Access control (IAM)" > "Add role assignment".
- Assign roles like "Reader" or "Cost Management Reader" to your registered app.

Use these values in your `.env` file as shown below.

## ⚙️ Environment variables (.env)

```bash
# Environment: development | production | testing
ENVIRONMENT="development|production|testing"
DEBUG="true|false"

HOST=<host_ip>
PORT=<port_number>

# Azure
AZURE_CLIENT_ID=<azure_client_id>
AZURE_OBJECT_ID=<azure_object_id>
AZURE_TENANT_ID=<azure_tenant_id>
AZURE_CLIENT_SECRET=<azure_client_secret>
AZURE_SUBSCRIPTION_ID=<azure_subscription_id>

# Postgres
DATABASE_URL=<database_url>
```

# Azure Cloud Cost Analyzer

![Project Status](https://img.shields.io/badge/status-in%20progress-yellow)
![Version](https://img.shields.io/badge/version-1.0.0-brightgreen)

![FastAPI](https://img.shields.io/badge/FastAPI-005571?logo=fastapi&logoColor=white)
![Swagger](https://img.shields.io/badge/Swagger-85EA2D?logo=swagger&logoColor=173647)
![Postgres](https://img.shields.io/badge/Postgres-4169E1?logo=postgresql&logoColor=white)
![Azure SDK](https://custom-icon-badges.demolab.com/badge/Microsoft%20Azure-0089D6?logo=msazure&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![Pydantic](https://img.shields.io/badge/Pydantic-E92063?logo=Pydantic&logoColor=white)
![uv](https://img.shields.io/badge/uv-1A1A1A?logo=uv)

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
 │   ├── cost_service.py
 |   └── cost_service.py   # cost data fetching & saving logic
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

To use this project, you must have:

- An Azure Subscription
- Billing Reader or Cost Management Reader role on that subscription
- Owner access (only once, to set things up)

### **Step 1: Log in to the Azure Portal**

- Go to <https://portal.azure.com/>

### **Step 2: Register an Application (App Registration)**

- Navigate to "Microsoft Entra ID (Azure AD)" → "App registrations" → "New registration".
- Enter a name (eg: cost-analyzer)
- Supported account types:
Choose

  ```
  Accounts in this organizational directory only (Single tenant)
  ```

- Click Register.

### Step 3: Copy important IDs

  After registration, you land on **Overview page**.

  Copy and save these safely:

  | Field | What it is |
  | --- | --- |
  | **Application (client) ID** | App’s username |
  | **Directory (tenant) ID** | Your Azure organization |
  | **Object ID** | Internal Azure reference |

  You will use:

  Put them in a `.env` file later.

### **Step 4: Create a Client Secret**

- Go to "Certificates & secrets" → "New client secret".
- Add a description and expiry, then click "Add".
- Copy the generated **Value** (this is your `AZURE_CLIENT_SECRET`).

### **Step 5: Get Your Subscription ID**

- In the Azure Portal, search for "Subscriptions".
- Select your subscription and copy the **Subscription ID**.

### **Step 6: Assign Cost Management Reader Role to the App**

- Go to Subscriptions → "Access control (IAM)" → "Add role assignment".
- You'll see a long list of roles. Search for "Cost Management Reader" role → Click Next.
- Select your app (Service Principal):<br>
  i) search by app name or client id<br>
  ii) select it → click Select → click Next

### **Step 7: Review and Assign**

- Review details:<br>
    i) Role: Cost Management Reader<br>
    ii) Scope: Subscription<br>
    iii) Member: Your app<br>
- Click **Assign**

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

# Scheduler Configuration
ENABLE_SCHEDULER=true|false
DAILY_COST_HOUR=<daily_cost_hour>
DAILY_COST_MINUTE=<daily_cost_minute>
SERVICE_COST_HOUR=<service_cost_hour>
SERVICE_COST_MINUTE=<service_cost_minute>
```

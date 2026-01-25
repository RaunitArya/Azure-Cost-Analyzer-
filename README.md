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
uv run python -m azure_cost_analyzer.main
```

### Option 2: Standard virtualenv + pip

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
python -m azure_cost_analyzer.main
```

## ⚙️ Environment variables (.env)

```bash
HOST=...
PORT=...

AZURE_SUBSCRIPTION_ID=...
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...

POSTGRES_SERVER=...
POSTGRES_PORT=...
POSTGRES_DB=...
POSTGRES_USER=...
POSTGRES_PASSWORD=...
PGADMIN_EMAIL=...
PGADMIN_PASSWORD=...

```

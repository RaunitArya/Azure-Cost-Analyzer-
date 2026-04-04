## 🗄️ Database Setup with Alembic Migrations

This project uses [Alembic](https://alembic.sqlalchemy.org/) for database schema management and migrations. Follow these steps to set up your database:

### **Prerequisites**

- PostgreSQL database running and accessible
- `DATABASE_URL` environment variable configured in `.env`
- Python dependencies installed (`pip install -r requirements.txt`)

### **Step 1: Navigate to Backend Directory**

```bash
cd backend
```

### **Step 2: Verify Alembic Configuration**

Ensure `alembic.ini` is configured with the correct database URL. The file should reference your `DATABASE_URL` environment variable.

### **Step 3: Initialize the Database**

Run all pending migrations to set up the database schema:

```bash
alembic upgrade head
```

This command will:

- Create all required tables (costs, alerts, anomalies, incidents, settings, etc.)
- Set up indexes for performance optimization
- Initialize database constraints and relationships

### **Step 4: Create a New Migration (Optional)**

If you modify the database models in `app/db/models.py`, you need to create a new migration:

```bash
alembic revision --autogenerate -m "description of your changes"
```

Example:

```bash
alembic revision --autogenerate -m "add_new_cost_column"
```

This generates a new migration file in `app/alembic/versions/`.

### **Step 5: Apply the New Migration**

After creating a migration, apply it with:

```bash
alembic upgrade head
```

### **Common Alembic Commands**

| Command | Purpose |
|---------|---------|
| `alembic upgrade head` | Apply all pending migrations |
| `alembic downgrade base` | Rollback all migrations (destructive) |
| `alembic downgrade -1` | Rollback the last migration |
| `alembic current` | Show current migration version |
| `alembic history` | Display migration history |
| `alembic revision --autogenerate -m "message"` | Create a new migration |

### 🐳 **Running with Docker**

If using Docker Compose, migrations run automatically on container startup:

```bash
cd backend
docker-compose up
```

The `entrypoint.sh` script will execute migrations before starting the application.

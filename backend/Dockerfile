FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

ENV PYTHONPATH=/app/app

WORKDIR /app

# System deps for psycopg binary
RUN apt-get update && apt-get install -y \
  libpq5 \
  && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy dependency definitions
COPY pyproject.toml .

# Install dependencies
RUN uv pip install --system --no-cache .

# Copy source code
COPY app/ app/
COPY alembic.ini .
COPY app/alembic/ app/alembic/
COPY entrypoint.sh .

# Strip Windows CRLF line endings so entrypoint.sh works on Linux
# regardless of what OS it was last edited on.
RUN sed -i 's/\r//' entrypoint.sh && chmod +x entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]

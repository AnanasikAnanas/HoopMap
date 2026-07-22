FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gdal-bin libgdal-dev libgeos-dev libpq5 curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --upgrade pip==26.1.2 && pip install -r requirements.txt

FROM base AS development
COPY requirements-dev.txt ./
RUN pip install -r requirements-dev.txt
COPY . .
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

FROM base AS runtime
COPY . .
RUN addgroup --system hoopmap && adduser --system --ingroup hoopmap hoopmap && chown -R hoopmap:hoopmap /app
USER hoopmap
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "--access-logfile", "-"]

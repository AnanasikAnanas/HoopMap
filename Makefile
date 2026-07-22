COMPOSE = docker compose

.PHONY: up down build migrate makemigrations superuser test lint format seed logs
up:
	$(COMPOSE) up -d --build
down:
	$(COMPOSE) down
build:
	$(COMPOSE) build
migrate:
	$(COMPOSE) run --rm backend python manage.py migrate
makemigrations:
	$(COMPOSE) run --rm backend python manage.py makemigrations
superuser:
	$(COMPOSE) run --rm backend python manage.py createsuperuser
test:
	$(COMPOSE) run --rm backend pytest
	$(COMPOSE) run --rm frontend npm test
lint:
	$(COMPOSE) run --rm backend ruff check .
	$(COMPOSE) run --rm backend mypy apps config
	$(COMPOSE) run --rm frontend npm run lint
	$(COMPOSE) run --rm frontend npm run typecheck
format:
	$(COMPOSE) run --rm backend ruff format .
	$(COMPOSE) run --rm frontend npm run format
seed:
	$(COMPOSE) run --rm backend python manage.py seed
logs:
	$(COMPOSE) logs -f --tail=200

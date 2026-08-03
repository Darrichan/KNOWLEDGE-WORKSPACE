PROD_COMPOSE = docker compose --env-file deploy/.env.production -f deploy/compose.prod.yaml

.PHONY: prod-up prod-status prod-logs prod-down prod-migrate

prod-up:
	$(PROD_COMPOSE) up -d --build

prod-status:
	$(PROD_COMPOSE) ps

prod-logs:
	$(PROD_COMPOSE) logs --tail=200 -f

prod-down:
	$(PROD_COMPOSE) down

prod-migrate:
	$(PROD_COMPOSE) exec api alembic upgrade head

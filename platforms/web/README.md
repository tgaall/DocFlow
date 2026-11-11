# Web Edition deployment

Server edition: FastAPI + PostgreSQL, frontend served as static files.

## Run locally (development)

```bash
pip install -r requirements.txt
export DATABASE_URL="postgresql://user:password@host/docflow"
uvicorn src.main:app --host 0.0.0.0 --port 8000
```

## Docker (Linux VPS)

```bash
docker build -f platforms/web/Dockerfile -t docflow .
docker run -d --name docflow \
  -e DATABASE_URL="postgresql://user:password@host/docflow" \
  -e AUTH_COOKIE_SECURE=true \
  -p 8000:8000 docflow
```

Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///:memory:` | PostgreSQL URL (plain `postgres://`/`postgresql://` are auto-converted to asyncpg) |
| `AUTH_COOKIE_SECURE` | `true` | Set `false` only when serving plain HTTP |
| `DOCFLOW_PLATFORM` | `web` | Must stay `web` for the server edition |

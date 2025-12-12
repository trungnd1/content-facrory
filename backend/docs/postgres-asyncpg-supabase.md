# Postgres + asyncpg + Supabase Connection Issues

## Context

- Backend: FastAPI + SQLAlchemy 2 (async) + `asyncpg`
- DB: Supabase Postgres via **transaction pooler**:
  - `postgresql://postgres.<project-id>:<PASSWORD>@aws-1-<region>.pooler.supabase.com:6543/postgres`
- Driver: `postgresql+asyncpg`

This combo has two common classes of problems:

1. Authentication (`InvalidPasswordError`)
2. Prepared statements with pooler (`DuplicatePreparedStatementError`)

---

## 1. `InvalidPasswordError` (auth issues)

### Phenomenon

- Backend log on first query:
  - `asyncpg.exceptions.InvalidPasswordError: password authentication failed for user "postgres"`
- Uvicorn starts fine, error appears only when hitting an endpoint that touches the DB (for example, `POST /projects`).

### Root Causes

- Supabase expects a **specific DB password** for its Postgres role, but:
  - `DATABASE_URL` in `.env.local` uses a different (guessed/old) password; or
  - You copied the **template** connection string literally, leaving `:[YOUR-PASSWORD]` or a placeholder instead of the real password.

- Even though the URL shows user `postgres.<project-id>`, Supabase’s pooler ultimately connects as the internal `postgres` role; if the password is wrong, you see that error.

### How to Debug

#### 1. Log the effective `DATABASE_URL` (masked)

In `db.py`:

```python
from sqlalchemy.engine.url import make_url

raw_url = os.getenv("DATABASE_URL")
url = make_url(raw_url)

if url.drivername.startswith("postgresql") and "+asyncpg" not in url.drivername:
    url = url.set(drivername="postgresql+asyncpg")

masked = url.set(password="***")
print(f"[DB DEBUG] Using DATABASE_URL: {masked}")
```

Confirm host, port, and user match Supabase’s connection string.

#### 2. Verify the URL independently with `asyncpg`

`backend/test_db_connect.py`:

```python
import os
import asyncio
import asyncpg


async def main() -> None:
    url = os.getenv("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set in environment")
        return

    print("[TEST] Using DATABASE_URL:", url)
    conn = await asyncpg.connect(dsn=url)
    print("[TEST] Connected successfully!")
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
```

Run:

```powershell
$env:DATABASE_URL = 'postgresql://postgres.<project-id>:<PASSWORD>@aws-1-<region>.pooler.supabase.com:6543/postgres'
python test_db_connect.py
```

- If this fails with `InvalidPasswordError`, the **URL or password is wrong**, not FastAPI/SQLAlchemy.
- Fix the password until this test connects successfully.

#### 3. Set `DATABASE_URL` from a known-good string

1. In Supabase **Dashboard → Connect**, copy the **transaction pooler** or **direct** URL.
2. Replace `[YOUR-PASSWORD]` with the **database password** from Supabase DB settings.
3. Put that full URL in `backend/.env.local`:

```env
DATABASE_URL=postgresql://postgres.<project-id>:REAL_PASSWORD@aws-1-<region>.pooler.supabase.com:6543/postgres
```

4. Restart backend and re-run `test_db_connect.py` and then your API.

---

## 2. `DuplicatePreparedStatementError` (pooler + prepared statements)

### Phenomenon

- After fixing auth, project creation fails with:

```text
asyncpg.exceptions.DuplicatePreparedStatementError: prepared statement "__asyncpg_stmt_1__" already exists
HINT:
NOTE: pgbouncer with pool_mode set to "transaction" or
"statement" does not support prepared statements properly.
...
* if you have no option of avoiding the use of pgbouncer,
  then you can set statement_cache_size to 0 when creating
  the asyncpg connection object.
```

- Full stack trace shows this coming from `sqlalchemy.dialects.postgresql.asyncpg` during `session.commit()`.

### Root Cause

- Supabase’s transaction pooler behaves like PgBouncer in **transaction mode**.
- `asyncpg` by default uses a prepared-statement cache.
- With a transaction pooler, those cached prepared statements conflict and cause `DuplicatePreparedStatementError`.

### Working Solution

Override SQLAlchemy’s asyncpg connection creator to:

- Use the same DSN as the successful `test_db_connect.py`.
- **Disable the statement cache** (`statement_cache_size=0`).

In `backend/db.py`:

```python
import os
from typing import AsyncGenerator

import asyncpg
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.engine.url import make_url

RAW_DATABASE_URL = os.getenv("DATABASE_URL")


def _build_database_url() -> str | None:
    raw_url = RAW_DATABASE_URL
    if not raw_url:
        print("[DB DEBUG] DATABASE_URL is not set in environment")
        return None

    url = make_url(raw_url)

    if url.drivername.startswith("postgresql") and "+asyncpg" not in url.drivername:
        url = url.set(drivername="postgresql+asyncpg")

    try:
        masked = url.set(password="***")
        print(f"[DB DEBUG] Using DATABASE_URL: {masked}")
    except Exception:
        print("[DB DEBUG] Could not mask DATABASE_URL for debug output")

    return str(url)


DATABASE_URL = _build_database_url()

if DATABASE_URL is not None:
    async def _asyncpg_creator(*args: object, **kwargs: object):  # type: ignore[unused-argument]
        if RAW_DATABASE_URL is None:
            raise RuntimeError(
                "DATABASE_URL is not configured for asyncpg creator; "
                "set it in your environment or .env.local."
            )
        return await asyncpg.connect(
            dsn=RAW_DATABASE_URL,
            statement_cache_size=0,  # critical for Supabase transaction pooler
        )

    engine = create_async_engine(
        DATABASE_URL,
        echo=False,
        future=True,
        connect_args={"async_creator_fn": _asyncpg_creator},
    )
    AsyncSessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
else:
    engine = None
    AsyncSessionLocal = None
```

This mirrors the known-good `asyncpg.connect` behavior and disables prepared statements, as Supabase’s hint suggests.

---

## 3. FastAPI / Pydantic response model gotcha (UUIDs)

Not strictly connection-related, but surfaced immediately after fixing DB issues.

### Phenomenon

- After a successful DB write, FastAPI returns:

```text
fastapi.exceptions.ResponseValidationError: Input should be a valid string, input: UUID('...')
```

### Root Cause

- ORM models use `UUID` primary keys.
- Response models had `id: str`.
- FastAPI/Pydantic v2 enforces type correctness on responses.

### Fix

Change response models to use `UUID` for ID fields (FastAPI will still serialize as strings in JSON):

Example (`backend/api/projects.py`):

```python
from uuid import UUID

class ProjectOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
```

Similarly update `AgentOut`, `WorkflowOut`, `ExecutionOut`, `ExecutionStepOut` to use `UUID` for ID fields.

---

## Checklist for Future Projects

When wiring Postgres + asyncpg + Supabase:

1. **Env loading**
   - Load `.env` and `.env.local` *before* importing `db.py`.
   - Ensure `DATABASE_URL` is present and logged (masked).

2. **Credential verification**
   - Use `test_db_connect.py` with the exact `DATABASE_URL`.
   - Do not proceed until `[TEST] Connected successfully!` works.

3. **Supabase pooler compatibility**
   - If using the **transaction pooler** (port `6543`):
     - Use `asyncpg.connect(..., statement_cache_size=0)` via a custom creator.
   - If using **direct** connection (port `5432`) and IPv6 is OK, the default asyncpg settings usually work without extra tweaks.

4. **ORM + API models**
   - Align Pydantic response models with ORM types (for example, `UUID` vs `str`).

Following this flow should avoid the long debugging loop we just went through and make Supabase + asyncpg integrations predictable.

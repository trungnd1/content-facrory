import os
from typing import AsyncGenerator

import asyncpg
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy import text


RAW_DATABASE_URL = os.getenv("DATABASE_URL")


def _build_database_url() -> str | None:
    raw_url = RAW_DATABASE_URL
    if not raw_url:
        print("[DB DEBUG] DATABASE_URL is not set in environment")
        return None

    url = make_url(raw_url)

    # Ensure we use asyncpg driver for Postgres
    if url.drivername.startswith("postgresql") and "+asyncpg" not in url.drivername:
        url = url.set(drivername="postgresql+asyncpg")

    # Print a masked version so we can verify host/db/user but not password
    try:
        masked = url.set(password="***")
        print(f"[DB DEBUG] Using DATABASE_URL: {masked}")
    except Exception:
        # Best-effort; don't let logging break startup
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
        # Supabase pooler in transaction mode does not support prepared
        # statements; disable asyncpg's statement cache to avoid
        # DuplicatePreparedStatementError.
        return await asyncpg.connect(
            dsn=RAW_DATABASE_URL,
            statement_cache_size=0,
        )

    engine = create_async_engine(
        DATABASE_URL,
        echo=False,
        future=True,
        connect_args={"async_creator_fn": _asyncpg_creator},
    )
    AsyncSessionLocal = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )
else:
    engine = None
    AsyncSessionLocal = None


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    if AsyncSessionLocal is None:
        raise RuntimeError(
            "DATABASE_URL is not configured; cannot create database session. "
            "Set DATABASE_URL to your Supabase/Postgres connection string."
        )

    async with AsyncSessionLocal() as session:  # type: ignore[misc]
        yield session


async def ensure_workflow_wcs_column() -> None:
    """Best-effort schema tweak: ensure `workflows.wcs` exists.

    This project doesn't ship Alembic migrations; in dev environments we
    apply a minimal additive change at startup.
    """

    if engine is None:
        return

    dialect = getattr(engine.dialect, "name", "")

    # Prefer JSONB on Postgres; otherwise fallback to JSON.
    if dialect == "postgresql":
        ddl = "ALTER TABLE workflows ADD COLUMN IF NOT EXISTS wcs JSONB"
    else:
        # Generic fallback (may or may not be supported depending on DB)
        ddl = "ALTER TABLE workflows ADD COLUMN wcs JSON"

    try:
        async with engine.begin() as conn:
            await conn.execute(text(ddl))
    except Exception:
        # Best-effort only; ignore if table/column already exists or DB doesn't support DDL.
        return


async def ensure_workflow_output_config_column() -> None:
    """Best-effort schema tweak: ensure `workflows.output_config` exists.

    This project doesn't ship Alembic migrations; in dev environments we
    apply a minimal additive change at startup.
    """

    if engine is None:
        return

    dialect = getattr(engine.dialect, "name", "")

    # Prefer JSONB on Postgres; otherwise fallback to JSON.
    if dialect == "postgresql":
        ddl = "ALTER TABLE workflows ADD COLUMN IF NOT EXISTS output_config JSONB"
    else:
        ddl = "ALTER TABLE workflows ADD COLUMN output_config JSON"

    try:
        async with engine.begin() as conn:
            await conn.execute(text(ddl))
    except Exception:
        return

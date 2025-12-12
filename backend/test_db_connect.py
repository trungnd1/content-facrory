import os
import asyncio

import asyncpg


async def main() -> None:
    url = os.getenv("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set in environment")
        return

    print("[TEST] Using DATABASE_URL:", url)
    try:
        conn = await asyncpg.connect(dsn=url)
    except Exception as exc:  # noqa: BLE001
        print("[TEST] Connection failed with:", repr(exc))
        raise
    else:
        print("[TEST] Connected successfully!")
        await conn.close()


if __name__ == "__main__":  # pragma: no cover
    asyncio.run(main())

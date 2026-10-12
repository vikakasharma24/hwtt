"""
Export Aiven PostgreSQL Master Data to aiven_db_master.json
============================================================
Fetches latest tables from Aiven PostgreSQL and updates aiven_db_master.json
so GitHub Pages (https://vikakasharma24.github.io/hwtt/) always displays 
real, live data matching the Aiven.io database.
"""

import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in environment or .env")

def export_aiven():
    print("Connecting to Aiven Cloud PostgreSQL...")
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    cur = conn.cursor()

    snapshot = {}
    tables = ["users", "trainings", "attendance", "attempts", "event_logs"]

    for tbl in tables:
        cur.execute(f"SELECT * FROM {tbl};")
        rows = cur.fetchall()
        for r in rows:
            for k, v in r.items():
                if hasattr(v, "isoformat"):
                    r[k] = v.isoformat()
                elif isinstance(v, bytes):
                    r[k] = v.decode("utf-8", errors="ignore")
        snapshot[tbl] = rows
        print(f"  {tbl}: {len(rows)} records")

    cur.close()
    conn.close()

    out_path = os.path.join(os.path.dirname(__file__), "aiven_db_master.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, default=str)

    print(f"Snapshot written to {out_path} successfully.")

if __name__ == "__main__":
    export_aiven()

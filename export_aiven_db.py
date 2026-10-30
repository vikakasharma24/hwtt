"""
Export Aiven PostgreSQL Master Data to aiven_db_master.json
============================================================
Fetches latest tables from Aiven PostgreSQL and updates aiven_db_master.json
so GitHub Pages (https://vikakasharma24.github.io/hwtt/) always displays 
real, live data matching the Aiven.io database.
"""

import os
import sys
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()


import base64

_FALLBACK_AIVEN_URL = base64.b64decode(
    "cG9zdGdyZXM6Ly9hdm5hZG1pbjpBVk5TX24zbTM1UUt4S1RZM2REeTY4RVhAcGctMmM1YzA5ZDMtdmlrYXNoc2hhcm1hZGZ5LWJmNDAuZy5haXZlbmNsb3VkLmNvbToxNDA3MS9kZWZhdWx0ZGI/c3NsbW9kZT1yZXF1aXJl"
).decode("utf-8")


def get_database_url():
    url = (os.getenv("DATABASE_URL") or "").strip()
    if not url:
        pghost = os.getenv("PGHOST")
        if pghost:
            pgport = os.getenv("PGPORT", "14071")
            pguser = os.getenv("PGUSER", "avnadmin")
            pgpass = os.getenv("PGPASSWORD", "")
            pgdb = os.getenv("PGDATABASE", "defaultdb")
            pgssl = os.getenv("PGSSLMODE", "require")
            url = f"postgres://{pguser}:{pgpass}@{pghost}:{pgport}/{pgdb}?sslmode={pgssl}"
        else:
            url = _FALLBACK_AIVEN_URL

    # Detect if user accidentally pasted an encrypted base64 payload or raw token
    if not (url.startswith("postgres://") or url.startswith("postgresql://")):
        print("\n" + "=" * 70, file=sys.stderr)
        print("ERROR: Invalid DATABASE_URL connection string format!", file=sys.stderr)
        print(f"Received value: '{url[:20]}...' (length: {len(url)})", file=sys.stderr)
        print("A PostgreSQL connection string must start with 'postgres://' or 'postgresql://'.", file=sys.stderr)
        print("Note: GitHub Actions secrets are encrypted automatically by GitHub.", file=sys.stderr)
        print("Do NOT paste manually encrypted base64 ciphertext into the workflow file.", file=sys.stderr)
        print("Paste the plaintext PostgreSQL URI directly into the GitHub Actions secret.", file=sys.stderr)
        print("=" * 70 + "\n", file=sys.stderr)
        sys.exit(1)

    return url


def export_aiven():
    db_url = get_database_url()
    print("Connecting to Aiven Cloud PostgreSQL...")

    try:
        conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor)
    except psycopg2.OperationalError as e:
        err_msg = str(e).strip()
        print("\n" + "=" * 70, file=sys.stderr)
        print(f"DATABASE CONNECTION ERROR: {err_msg}", file=sys.stderr)
        if "password authentication failed" in err_msg:
            print("\nHint: The password in DATABASE_URL was rejected by Aiven.", file=sys.stderr)
            print("Please check your Aiven Console (https://console.aiven.io), obtain the active", file=sys.stderr)
            print("password for 'avnadmin', and update the DATABASE_URL repository secret in GitHub.", file=sys.stderr)
        print("=" * 70 + "\n", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\nFailed to connect to database: {e}\n", file=sys.stderr)
        sys.exit(1)

    cur = conn.cursor()

    snapshot = {}
    tables = [
        "users", "trainings", "attendance", "attempts",
        "assessments", "ai_remedial_recommendations", "event_logs"
    ]

    for tbl in tables:
        try:
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
        except Exception as e:
            print(f"  Warning: could not export table '{tbl}': {e}", file=sys.stderr)
            conn.rollback()

    cur.close()
    conn.close()

    out_path = os.path.join(os.path.dirname(__file__), "aiven_db_master.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, default=str)

    print(f"Snapshot written to {out_path} successfully.")


if __name__ == "__main__":
    export_aiven()

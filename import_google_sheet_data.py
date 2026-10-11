"""
==============================================================================
Google Sheet Data Importer to Aiven Cloud PostgreSQL Database
==============================================================================
Populates Aiven.io PostgreSQL defaultdb with initial users from the Google Sheet
and pre-configured training curriculum. Decoupled from desktop MySQL.
==============================================================================
"""

import os
import sys
import uuid
import hashlib
import psycopg2

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

PASSWORD_SALT = os.getenv("PASSWORD_SALT", "JH_HEALTH_PORTAL_SALT_v1")

def hash_password(plain_text: str) -> str:
    data = (plain_text + ":" + PASSWORD_SALT).encode("utf-8")
    return hashlib.sha256(data).hexdigest()

def run():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pghost = os.getenv("PGHOST", "pg-2c5c09d3-vikashsharmadfy-bf40.g.aivencloud.com")
        pgport = os.getenv("PGPORT", "14071")
        pguser = os.getenv("PGUSER", "avnadmin")
        pgpass = os.getenv("PGPASSWORD", "AVNS_yag-iD7BkdGKwWw4jXs")
        pgdb = os.getenv("PGDATABASE", "defaultdb")
        pgssl = os.getenv("PGSSLMODE", "require")
        database_url = f"postgres://{pguser}:{pgpass}@{pghost}:{pgport}/{pgdb}?sslmode={pgssl}"

    print("=================================================================")
    print(">> POPULATING AIVEN CLOUD POSTGRESQL FROM GOOGLE SHEETS")
    safe_url = database_url.split("@")[1] if "@" in database_url else database_url
    print(f"   Connecting to {safe_url}...")
    print("=================================================================")

    conn = psycopg2.connect(database_url)
    conn.autocommit = True

    default_admin_hash = hash_password("Admin@123")
    default_worker_hash = "PASSWORD_RESET_REQUIRED"

    # Frontline Workers from Google Sheet Event_Log & Users tab
    initial_users = [
        {
            "id": "0015fc58-c17d-4155-94ee-9226d9c6696b",
            "worker_unique_id": "ADMIN-000001",
            "phone": "9999999999",
            "password_hash": default_admin_hash,
            "role": "ADMIN",
            "full_name": "State Admin",
            "designation": "State Health Administrator",
            "facility_name": "Department of Health, NHM",
            "facility_type": "State HQ",
            "city_or_village": "Ranchi",
            "district_id": "D-20",
            "district_name": "Ranchi",
            "state": "Jharkhand"
        },
        {
            "id": "88f24edb-0a68-450e-a4fe-d54625b34da5",
            "worker_unique_id": "JH559304",
            "phone": "7004369523",
            "password_hash": default_worker_hash,
            "role": "WORKER",
            "full_name": "Vikash Sharma",
            "designation": "ANM",
            "facility_name": "ratu",
            "facility_type": "Other",
            "city_or_village": "ratu",
            "district_id": "D-20",
            "district_name": "Ranchi",
            "state": "Jharkhand"
        }
    ]

    with conn.cursor() as cur:
        # Insert or update users
        user_insert_sql = """
            INSERT INTO users 
                (id, worker_unique_id, phone, password_hash, role, full_name,
                 designation, facility_name, facility_type, city_or_village,
                 district_id, district_name, state)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                designation = EXCLUDED.designation,
                facility_name = EXCLUDED.facility_name,
                facility_type = EXCLUDED.facility_type,
                city_or_village = EXCLUDED.city_or_village,
                district_name = EXCLUDED.district_name;
        """
        for u in initial_users:
            cur.execute(user_insert_sql, (
                u["id"], u["worker_unique_id"], u["phone"], u["password_hash"],
                u["role"], u["full_name"], u["designation"], u["facility_name"],
                u["facility_type"], u["city_or_village"], u["district_id"],
                u["district_name"], u["state"]
            ))
            print(f"[USER IMPORTED] {u['full_name']} ({u['worker_unique_id']}) - Phone: {u['phone']} [{u['role']}]")

        # Seed core clinical training modules
        sample_trainings = [
            (
                "T-TB-001", "TB", "Published",
                "National Tuberculosis Elimination Program (NTEP) Refresher",
                "hybrid", "State Health Training Centre, Ranchi / Online",
                "2026-03-01 09:00:00", "2026-12-31 18:00:00", 1, 0,
                "2026-03-01 08:00:00", "2026-12-31 19:00:00"
            ),
            (
                "T-MCH-002", "Maternal Health", "Published",
                "Comprehensive Maternal & Newborn Health Care Protocols",
                "physical", "District Hospital Conference Hall",
                "2026-03-01 09:00:00", "2026-12-31 18:00:00", 1, 0,
                "2026-03-01 08:00:00", "2026-12-31 19:00:00"
            ),
            (
                "T-IMNCI-003", "Child Nutrition", "Published",
                "e-IMNCI Protocol: Severe Acute Malnutrition (SAM) Identification",
                "online", "State Tele-Health Training Portal",
                "2026-03-01 09:00:00", "2026-12-31 18:00:00", 1, 0,
                "2026-03-01 08:00:00", "2026-12-31 19:00:00"
            ),
            (
                "T-UIP-004", "Immunization", "Published",
                "Universal Immunization: Vaccine Cold Chain & Anaphylaxis Preparedness",
                "hybrid", "Ranchi Medical College Auditorium",
                "2026-03-01 09:00:00", "2026-12-31 18:00:00", 1, 0,
                "2026-03-01 08:00:00", "2026-12-31 19:00:00"
            )
        ]

        training_sql = """
            INSERT INTO trainings 
                (id, category, status, title, mode, venue, start_at, end_at, 
                 attendance_enabled, gps_required, attendance_open_at, attendance_close_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                venue = EXCLUDED.venue,
                status = EXCLUDED.status;
        """
        for t in sample_trainings:
            cur.execute(training_sql, t)
            print(f"[TRAINING READY] {t[3]} ({t[0]})")

        # Verify summary counts
        cur.execute("SELECT COUNT(*) FROM users;")
        user_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM trainings;")
        training_count = cur.fetchone()[0]

    conn.close()
    print("=================================================================")
    print(f"[SUCCESS] Migration complete: {user_count} Users, {training_count} Trainings active in Aiven PostgreSQL.")
    print("=================================================================")

if __name__ == "__main__":
    run()

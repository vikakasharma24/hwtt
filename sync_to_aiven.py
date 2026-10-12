"""
Offline Sync to Aiven.io PostgreSQL Database (sync_to_aiven.py)
==============================================================
Directly persists offline queued actions into Aiven Cloud PostgreSQL
and updates aiven_db_master.json for GitHub Pages.
"""

import os
import sys
import json
import psycopg2
from dotenv import load_dotenv
from export_aiven_db import export_aiven

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in environment or .env")


def sync_items(items):
    if not items:
        print("No items to sync.")
        return

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    users_synced = 0
    att_synced = 0
    atmps_synced = 0

    print(f"Syncing {len(items)} action(s) directly to Aiven Cloud PostgreSQL...")

    for item in items:
        if not isinstance(item, dict):
            continue
        p = item.get("payload") if "payload" in item else item
        act = str(p.get("action") or p.get("type") or p.get("event") or "").lower()

        # 1. User Registration
        if "regist" in act or act == "user" or (p.get("workerUniqueId") and p.get("phone") and ("regist" in act or act == "user")):
            uid = p.get("id") or p.get("userId") or p.get("workerUniqueId")
            cur.execute("""
                INSERT INTO users (
                    id, worker_unique_id, phone, password_hash, role, full_name,
                    designation, facility_name, facility_type, city_or_village,
                    district_id, district_name, state
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (phone) DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    worker_unique_id = EXCLUDED.worker_unique_id,
                    designation = EXCLUDED.designation,
                    facility_name = EXCLUDED.facility_name,
                    district_name = EXCLUDED.district_name;
            """, (
                uid,
                p.get("workerUniqueId") or p.get("worker_unique_id"),
                p.get("phone"),
                p.get("password") or p.get("password_hash") or "3562e323fc87431e4aecaa006efbaa58fdfc51341f0c2d7539fcf9925c0532fd",
                p.get("role") or "WORKER",
                p.get("fullName") or p.get("full_name"),
                p.get("designation"),
                p.get("facilityName") or p.get("facility_name"),
                p.get("facilityType") or p.get("facility_type"),
                p.get("cityOrVillage") or p.get("city_or_village"),
                p.get("districtId") or p.get("district_id") or "D-20",
                p.get("district") or p.get("district_name") or "Ranchi",
                p.get("state") or "Jharkhand"
            ))
            users_synced += 1
            print(f"  [User] Synced: {p.get('fullName')} ({p.get('workerUniqueId')})")

        # 2. Attendance
        elif act == "attendance" or p.get("attendanceStatus"):
            aid = p.get("id") or f"att-{p.get('trainingId')}-{p.get('workerUniqueId')}"
            cur.execute("""
                INSERT INTO attendance (
                    id, training_id, user_id, worker_unique_id, full_name, phone,
                    designation, facility_name, district_name, status, checked_in_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO NOTHING;
            """, (
                aid,
                p.get("trainingId") or p.get("training_id"),
                p.get("userId") or p.get("user_id"),
                p.get("workerUniqueId") or p.get("worker_unique_id"),
                p.get("fullName") or p.get("full_name"),
                p.get("phone"),
                p.get("designation"),
                p.get("facilityName") or p.get("facility_name"),
                p.get("district") or p.get("district_name") or "Ranchi",
                p.get("attendanceStatus") or p.get("status") or "Present"
            ))
            att_synced += 1
            print(f"  [Attendance] Synced: {p.get('trainingId')} for {p.get('fullName')}")

        # 3. Assessment Attempt
        elif act in ("assessment", "attempt") or p.get("testType") or p.get("test_type"):
            atid = p.get("id") or f"atm-{p.get('trainingId')}-{p.get('workerUniqueId')}-{p.get('type', 'POST')}"
            cur.execute("""
                INSERT INTO attempts (
                    id, training_id, training_title, user_id, worker_unique_id, full_name, phone,
                    test_type, score, total_marks, percent, passed, submitted_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO NOTHING;
            """, (
                atid,
                p.get("trainingId") or p.get("training_id"),
                p.get("trainingTitle") or p.get("training_title") or "",
                p.get("userId") or p.get("user_id"),
                p.get("workerUniqueId") or p.get("worker_unique_id"),
                p.get("fullName") or p.get("full_name"),
                p.get("phone"),
                (p.get("type") or p.get("testType") or p.get("test_type") or "post").lower(),
                float(p.get("score") or 0),
                float(p.get("totalMarks") or p.get("total_marks") or 100),
                float(p.get("percent") or 0),
                bool(p.get("passed", False))
            ))
            atmps_synced += 1
            print(f"  [Attempt] Synced: {p.get('type', 'POST')} for {p.get('fullName')}")

    conn.commit()
    cur.close()
    conn.close()

    print(f"\n[DONE] Successfully synced to Aiven DB: Users={users_synced}, Attendance={att_synced}, Attempts={atmps_synced}")
    print("\nRefreshing aiven_db_master.json...")
    export_aiven()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if os.path.exists(arg):
            with open(arg, "r", encoding="utf-8") as f:
                data = json.load(f)
            items = data if isinstance(data, list) else data.get("items") or data.get("queue") or [data]
            sync_items(items)
        else:
            try:
                items = json.loads(arg)
                sync_items(items if isinstance(items, list) else [items])
            except Exception as e:
                print(f"Error parsing argument: {e}")
    else:
        print("Usage: python sync_to_aiven.py <queue.json or json_string>")

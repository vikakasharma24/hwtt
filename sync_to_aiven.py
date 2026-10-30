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

import base64

_FALLBACK_AIVEN_URL = base64.b64decode(
    "cG9zdGdyZXM6Ly9hdm5hZG1pbjpBVk5TX24zbTM1UUt4S1RZM2REeTY4RVhAcGctMmM1YzA5ZDMtdmlrYXNoc2hhcm1hZGZ5LWJmNDAuZy5haXZlbmNsb3VkLmNvbToxNDA3MS9kZWZhdWx0ZGI/c3NsbW9kZT1yZXF1aXJl"
).decode("utf-8")

DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip().replace("\r", "").replace("\n", "").strip() or _FALLBACK_AIVEN_URL


def sync_items(items):
    if not items:
        print("No items to sync.")
        return

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    users_synced = 0
    att_synced = 0
    atmps_synced = 0
    trainings_synced = 0

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
            tid = p.get("trainingId") or p.get("training_id")
            uid = p.get("userId") or p.get("user_id") or p.get("workerUniqueId")
            cur.execute("""
                INSERT INTO attendance (
                    training_id, user_id, worker_unique_id, full_name, phone,
                    designation, facility_name, district_name, status, checked_in_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (training_id, user_id) DO UPDATE SET
                    status = EXCLUDED.status,
                    checked_in_at = COALESCE(attendance.checked_in_at, EXCLUDED.checked_in_at);
            """, (
                tid,
                uid,
                p.get("workerUniqueId") or p.get("worker_unique_id") or uid,
                p.get("fullName") or p.get("full_name"),
                p.get("phone"),
                p.get("designation"),
                p.get("facilityName") or p.get("facility_name"),
                p.get("district") or p.get("district_name") or "Ranchi",
                p.get("attendanceStatus") or p.get("status") or "Present"
            ))
            att_synced += 1
            print(f"  [Attendance] Synced: {tid} for {p.get('fullName')}")

        # 3. Assessment Attempt
        elif act in ("assessment", "attempt") or p.get("testType") or p.get("test_type"):
            tid = p.get("trainingId") or p.get("training_id")
            uid = p.get("userId") or p.get("user_id") or p.get("workerUniqueId")
            wid = p.get("workerUniqueId") or p.get("worker_unique_id") or uid
            tt = (p.get("type") or p.get("testType") or p.get("test_type") or "post").lower()
            sc = float(p.get("score") or 0)
            tm = float(p.get("totalMarks") or p.get("total_marks") or 2)
            pct = float(p.get("percent") or ((sc / tm * 100) if tm > 0 else 0))
            is_passed = 1 if (p.get("passed") or pct >= 60) else 0

            cur.execute("""
                INSERT INTO attempts (
                    training_id, training_title, user_id, worker_unique_id, full_name, phone,
                    test_type, score, total_marks, percent, passed, submitted_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP);
            """, (
                tid,
                p.get("trainingTitle") or p.get("training_title") or tid,
                uid,
                wid,
                p.get("fullName") or p.get("full_name"),
                p.get("phone"),
                tt,
                sc,
                tm,
                pct,
                is_passed
            ))
            atmps_synced += 1
            print(f"  [Attempt] Synced: {tt.upper()} ({sc}/{tm}) for {p.get('fullName')}")

            # Also ensure post-test writes to assessments table
            if tt == "post":
                try:
                    cur.execute("""
                        INSERT INTO assessments (
                            user_id, module_name, pre_test_score, post_test_score,
                            time_spent_seconds, percent, passed, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP);
                    """, (
                        wid,
                        p.get("trainingTitle") or p.get("training_id") or "Module",
                        float(p.get("pre_test_score") or 0),
                        sc,
                        int(p.get("time_spent_seconds") or 180),
                        pct,
                        is_passed
                    ))
                except Exception as asm_e:
                    print(f"  [Assessment Note] {asm_e}")

        # 4. Training Created or Updated
        elif "train" in act or (p.get("category") and p.get("title") and p.get("startAt")):
            t = p.get("training") if isinstance(p.get("training"), dict) else p
            tid = t.get("id") or t.get("trainingId") or p.get("id") or p.get("trainingId")
            if not tid:
                print(f"  [Warning] Skipping training payload without ID: {p}")
                continue

            status = t.get("status") or p.get("status") or "Published"
            title = t.get("title") or p.get("title") or t.get("trainingTitle") or p.get("trainingTitle") or ""
            category = t.get("category") or p.get("category") or t.get("trainingCategory") or p.get("trainingCategory") or "General"
            mode = t.get("mode") or p.get("mode") or "hybrid"
            venue = t.get("venue") or p.get("venue") or ""
            start_at = t.get("startAt") or t.get("start_at") or p.get("startAt") or p.get("start_at")
            end_at = t.get("endAt") or t.get("end_at") or p.get("endAt") or p.get("end_at")
            attendance_enabled = 1 if (t.get("attendanceEnabled") or p.get("attendanceEnabled")) else 0
            gps_required = 1 if (t.get("gpsRequired") or p.get("gpsRequired")) else 0
            attendance_open_at = t.get("attendanceOpenAt") or t.get("attendance_open_at") or p.get("attendanceOpenAt") or p.get("attendance_open_at")
            attendance_close_at = t.get("attendanceCloseAt") or t.get("attendance_close_at") or p.get("attendanceCloseAt") or p.get("attendance_close_at")

            assessments = t.get("assessments") or p.get("assessments")
            if isinstance(assessments, dict):
                assess_str = json.dumps(assessments)
            elif isinstance(assessments, str):
                assess_str = assessments
            else:
                assess_str = None

            # If it's only a status change or telemetry update without date/schedule payload
            if act in ("training_status_updated", "training_updated") and not (t.get("startAt") or p.get("startAt")):
                cur.execute("""
                    UPDATE trainings
                    SET status = COALESCE(%s, status),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s;
                """, (status, tid))
                if cur.rowcount > 0:
                    trainings_synced += 1
                    print(f"  [Training] Status updated: {title or tid} ({status})")
                    continue

            cur.execute("""
                INSERT INTO trainings (
                    id, category, status, title, mode, venue,
                    start_at, end_at, attendance_enabled, gps_required,
                    attendance_open_at, attendance_close_at, assessments_json, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO UPDATE SET
                    category = COALESCE(NULLIF(EXCLUDED.category, ''), trainings.category),
                    status = EXCLUDED.status,
                    title = COALESCE(NULLIF(EXCLUDED.title, ''), trainings.title),
                    mode = COALESCE(NULLIF(EXCLUDED.mode, ''), trainings.mode),
                    venue = COALESCE(NULLIF(EXCLUDED.venue, ''), trainings.venue),
                    start_at = COALESCE(EXCLUDED.start_at, trainings.start_at),
                    end_at = COALESCE(EXCLUDED.end_at, trainings.end_at),
                    attendance_enabled = EXCLUDED.attendance_enabled,
                    gps_required = EXCLUDED.gps_required,
                    attendance_open_at = COALESCE(EXCLUDED.attendance_open_at, trainings.attendance_open_at),
                    attendance_close_at = COALESCE(EXCLUDED.attendance_close_at, trainings.attendance_close_at),
                    assessments_json = COALESCE(EXCLUDED.assessments_json, trainings.assessments_json),
                    updated_at = CURRENT_TIMESTAMP;
            """, (
                tid,
                category,
                status,
                title,
                mode,
                venue,
                start_at,
                end_at,
                attendance_enabled,
                gps_required,
                attendance_open_at,
                attendance_close_at,
                assess_str
            ))
            trainings_synced += 1
            print(f"  [Training] Synced: {title or tid} ({status})")

    conn.commit()
    cur.close()
    conn.close()

    print(f"\n[DONE] Successfully synced to Aiven DB: Users={users_synced}, Attendance={att_synced}, Attempts={atmps_synced}, Trainings={trainings_synced}")
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

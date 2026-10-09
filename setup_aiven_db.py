"""
==============================================================================
AIVEN.IO POSTGRESQL ENTERPRISE MIGRATION SCRIPT
==============================================================================
Creates enterprise schema in Aiven PostgreSQL and migrates all existing 
records from local MySQL (if available) or seeds default enterprise dataset.
==============================================================================
"""

import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
import pymysql

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

AIVEN_URI = os.getenv("DATABASE_URL")
if not AIVEN_URI:
    pghost = os.getenv("PGHOST")
    if pghost:
        pgport = os.getenv("PGPORT", "14071")
        pguser = os.getenv("PGUSER", "avnadmin")
        pgpass = os.getenv("PGPASSWORD", "")
        pgdb = os.getenv("PGDATABASE", "defaultdb")
        pgssl = os.getenv("PGSSLMODE", "require")
        AIVEN_URI = f"postgres://{pguser}:{pgpass}@{pghost}:{pgport}/{pgdb}?sslmode={pgssl}"
    else:
        AIVEN_URI = ""

MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DB = os.getenv("MYSQL_DB", "jh_health_db")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306))


def create_schema(pg_conn):
    print(">> [1/3] Creating Enterprise Tables on Aiven PostgreSQL...")
    ddl = """
    CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        worker_unique_id VARCHAR(64) NOT NULL UNIQUE,
        phone VARCHAR(15) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'WORKER',
        full_name VARCHAR(128) NOT NULL,
        designation VARCHAR(64),
        facility_name VARCHAR(128),
        facility_type VARCHAR(64),
        city_or_village VARCHAR(128),
        district_id VARCHAR(32),
        district_name VARCHAR(64),
        state VARCHAR(64) DEFAULT 'Jharkhand',
        is_active SMALLINT DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_district ON users(district_name);
    CREATE INDEX IF NOT EXISTS idx_users_worker_id ON users(worker_unique_id);

    CREATE TABLE IF NOT EXISTS trainings (
        id VARCHAR(64) PRIMARY KEY,
        category VARCHAR(64) NOT NULL DEFAULT 'General',
        status VARCHAR(32) NOT NULL DEFAULT 'Published',
        title VARCHAR(255) NOT NULL,
        mode VARCHAR(32) NOT NULL DEFAULT 'hybrid',
        venue VARCHAR(255),
        start_at TIMESTAMP WITH TIME ZONE NOT NULL,
        end_at TIMESTAMP WITH TIME ZONE NOT NULL,
        attendance_enabled SMALLINT DEFAULT 1,
        gps_required SMALLINT DEFAULT 0,
        attendance_open_at TIMESTAMP WITH TIME ZONE,
        attendance_close_at TIMESTAMP WITH TIME ZONE,
        assessments_json TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_trainings_status ON trainings(status);
    CREATE INDEX IF NOT EXISTS idx_trainings_category ON trainings(category);

    CREATE TABLE IF NOT EXISTS attendance (
        id BIGSERIAL PRIMARY KEY,
        training_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        worker_unique_id VARCHAR(64) NOT NULL,
        full_name VARCHAR(128) NOT NULL,
        phone VARCHAR(15) NOT NULL,
        designation VARCHAR(64),
        facility_name VARCHAR(128),
        district_name VARCHAR(64),
        status VARCHAR(32) DEFAULT 'Present',
        checked_in_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_user_training_att UNIQUE (training_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_att_training ON attendance(training_id);
    CREATE INDEX IF NOT EXISTS idx_att_user ON attendance(user_id);

    CREATE TABLE IF NOT EXISTS attempts (
        id BIGSERIAL PRIMARY KEY,
        training_id VARCHAR(64) NOT NULL,
        training_title VARCHAR(255) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        worker_unique_id VARCHAR(64) NOT NULL,
        full_name VARCHAR(128) NOT NULL,
        phone VARCHAR(15) NOT NULL,
        designation VARCHAR(64),
        facility_name VARCHAR(128),
        district_name VARCHAR(64),
        test_type VARCHAR(16) NOT NULL,
        score NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
        total_marks NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
        percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
        passed SMALLINT NOT NULL DEFAULT 0,
        answers_json TEXT,
        submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_training ON attempts(training_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_test_type ON attempts(test_type);

    CREATE TABLE IF NOT EXISTS assessments (
        id BIGSERIAL PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        module_name VARCHAR(128) NOT NULL,
        pre_test_score NUMERIC(5, 2) DEFAULT 0.00,
        post_test_score NUMERIC(5, 2) DEFAULT 0.00,
        time_spent_seconds INT DEFAULT 0,
        percent NUMERIC(5, 2) DEFAULT 0.00,
        passed SMALLINT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_assessment_user ON assessments(user_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_module ON assessments(module_name);

    CREATE TABLE IF NOT EXISTS ai_remedial_recommendations (
        id BIGSERIAL PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        module_name VARCHAR(128) NOT NULL,
        predicted_risk_level VARCHAR(32) NOT NULL DEFAULT 'Low',
        recommended_topic_id VARCHAR(64) NOT NULL,
        remedial_title VARCHAR(255),
        remedial_video_url VARCHAR(512),
        confidence_score NUMERIC(5, 4) DEFAULT 0.0000,
        historical_failure_density NUMERIC(5, 4) DEFAULT 0.0000,
        is_resolved SMALLINT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_user_module UNIQUE (user_id, module_name)
    );
    CREATE INDEX IF NOT EXISTS idx_recom_user_id ON ai_remedial_recommendations(user_id);
    CREATE INDEX IF NOT EXISTS idx_recom_active_risk ON ai_remedial_recommendations(user_id, is_resolved, predicted_risk_level);

    CREATE TABLE IF NOT EXISTS event_logs (
        id BIGSERIAL PRIMARY KEY,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        event_type VARCHAR(64) NOT NULL,
        actor_role VARCHAR(32),
        actor_id VARCHAR(64),
        actor_name VARCHAR(128),
        actor_phone VARCHAR(15),
        worker_unique_id VARCHAR(64),
        full_name VARCHAR(128),
        designation VARCHAR(64),
        facility_name VARCHAR(128),
        facility_type VARCHAR(64),
        city_or_village VARCHAR(128),
        district VARCHAR(64),
        payload_json JSONB,
        synced_to_sheets SMALLINT DEFAULT 1,
        synced_at TIMESTAMP WITH TIME ZONE
    );
    CREATE INDEX IF NOT EXISTS idx_event_type ON event_logs(event_type);
    CREATE INDEX IF NOT EXISTS idx_event_worker ON event_logs(worker_unique_id);
    """
    with pg_conn.cursor() as cur:
        cur.execute(ddl)
    pg_conn.commit()
    print("   [OK] Tables and indexes created successfully.")


def migrate_mysql_data(pg_conn):
    print(">> [2/3] Extracting data from local MySQL for migration to Aiven...")
    try:
        my_conn = pymysql.connect(
            host=MYSQL_HOST,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DB,
            port=MYSQL_PORT,
            cursorclass=pymysql.cursors.DictCursor
        )
    except Exception as e:
        print(f"   [WARN] Could not connect to local MySQL ({e}). Skipping data copy.")
        return

    with my_conn.cursor() as my_cur, pg_conn.cursor() as pg_cur:
        # 1. Users
        my_cur.execute("SELECT * FROM users;")
        users = my_cur.fetchall()
        for u in users:
            pg_cur.execute("""
                INSERT INTO users 
                    (id, worker_unique_id, phone, password_hash, role, full_name,
                     designation, facility_name, facility_type, city_or_village,
                     district_id, district_name, state, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    designation = EXCLUDED.designation,
                    facility_name = EXCLUDED.facility_name,
                    district_name = EXCLUDED.district_name,
                    updated_at = CURRENT_TIMESTAMP;
            """, (
                u["id"], u["worker_unique_id"], u["phone"], u["password_hash"],
                u["role"], u["full_name"], u["designation"], u["facility_name"],
                u["facility_type"], u["city_or_village"], u["district_id"],
                u["district_name"], u["state"], u.get("is_active", 1),
                u.get("created_at"), u.get("updated_at")
            ))
        print(f"   [MIGRATED] {len(users)} users.")

        # 2. Trainings
        my_cur.execute("SELECT * FROM trainings;")
        trainings = my_cur.fetchall()
        for t in trainings:
            assess_json = t["assessments_json"]
            if isinstance(assess_json, (dict, list)):
                assess_json = json.dumps(assess_json)
            pg_cur.execute("""
                INSERT INTO trainings
                    (id, category, status, title, mode, venue, start_at, end_at,
                     attendance_enabled, gps_required, attendance_open_at, attendance_close_at,
                     assessments_json, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    status = EXCLUDED.status,
                    updated_at = CURRENT_TIMESTAMP;
            """, (
                t["id"], t["category"], t["status"], t["title"], t["mode"], t["venue"],
                t["start_at"], t["end_at"], t["attendance_enabled"], t["gps_required"],
                t["attendance_open_at"], t["attendance_close_at"], assess_json,
                t.get("created_at"), t.get("updated_at")
            ))
        print(f"   [MIGRATED] {len(trainings)} trainings.")

        # 3. Attendance
        my_cur.execute("SELECT * FROM attendance;")
        atts = my_cur.fetchall()
        for a in atts:
            pg_cur.execute("""
                INSERT INTO attendance
                    (training_id, user_id, worker_unique_id, full_name, phone,
                     designation, facility_name, district_name, status, checked_in_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (training_id, user_id) DO UPDATE SET
                    status = EXCLUDED.status;
            """, (
                a["training_id"], a["user_id"], a["worker_unique_id"], a["full_name"],
                a["phone"], a["designation"], a["facility_name"], a["district_name"],
                a["status"], a.get("checked_in_at")
            ))
        print(f"   [MIGRATED] {len(atts)} attendance records.")

        # 4. Attempts
        my_cur.execute("SELECT * FROM attempts;")
        attempts = my_cur.fetchall()
        for atmp in attempts:
            pg_cur.execute("""
                INSERT INTO attempts
                    (training_id, training_title, user_id, worker_unique_id, full_name,
                     phone, designation, facility_name, district_name, test_type,
                     score, total_marks, percent, passed, answers_json, submitted_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """, (
                atmp["training_id"], atmp["training_title"], atmp["user_id"],
                atmp["worker_unique_id"], atmp["full_name"], atmp["phone"],
                atmp["designation"], atmp["facility_name"], atmp["district_name"],
                atmp["test_type"], atmp["score"], atmp["total_marks"], atmp["percent"],
                atmp["passed"], atmp["answers_json"], atmp.get("submitted_at")
            ))
        print(f"   [MIGRATED] {len(attempts)} test attempts.")

        # 5. Assessments
        my_cur.execute("SELECT * FROM assessments;")
        assessments = my_cur.fetchall()
        for asm in assessments:
            pg_cur.execute("""
                INSERT INTO assessments
                    (user_id, module_name, pre_test_score, post_test_score, time_spent_seconds, percent, passed, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
            """, (
                asm["user_id"], asm["module_name"], asm["pre_test_score"],
                asm["post_test_score"], asm["time_spent_seconds"], asm["percent"],
                asm["passed"], asm.get("created_at")
            ))
        print(f"   [MIGRATED] {len(assessments)} AI assessment telemetry records.")

        # 6. AI Recommendations
        my_cur.execute("SELECT * FROM ai_remedial_recommendations;")
        recs = my_cur.fetchall()
        for r in recs:
            pg_cur.execute("""
                INSERT INTO ai_remedial_recommendations
                    (user_id, module_name, predicted_risk_level, recommended_topic_id,
                     remedial_title, remedial_video_url, confidence_score, historical_failure_density,
                     is_resolved, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id, module_name) DO UPDATE SET
                    predicted_risk_level = EXCLUDED.predicted_risk_level,
                    is_resolved = EXCLUDED.is_resolved;
            """, (
                r["user_id"], r["module_name"], r["predicted_risk_level"],
                r["recommended_topic_id"], r["remedial_title"], r["remedial_video_url"],
                r["confidence_score"], r["historical_failure_density"],
                r["is_resolved"], r.get("created_at"), r.get("updated_at")
            ))
        print(f"   [MIGRATED] {len(recs)} AI recommendations.")

        # 7. Event logs
        my_cur.execute("SELECT * FROM event_logs;")
        logs = my_cur.fetchall()
        for l in logs:
            p_json = l["payload_json"]
            if isinstance(p_json, str):
                try:
                    p_json = json.loads(p_json)
                except Exception:
                    p_json = {}
            p_json_str = json.dumps(p_json) if p_json else None
            pg_cur.execute("""
                INSERT INTO event_logs
                    (timestamp, event_type, actor_role, actor_id, actor_name, actor_phone,
                     worker_unique_id, full_name, designation, facility_name, facility_type,
                     city_or_village, district, payload_json, synced_to_sheets, synced_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, 1, %s);
            """, (
                l.get("timestamp"), l["event_type"], l["actor_role"], l["actor_id"],
                l["actor_name"], l["actor_phone"], l["worker_unique_id"], l["full_name"],
                l["designation"], l["facility_name"], l["facility_type"],
                l["city_or_village"], l["district"], p_json_str, l.get("synced_at")
            ))
        print(f"   [MIGRATED] {len(logs)} audit event logs.")

    pg_conn.commit()
    my_conn.close()
    print("   [OK] All records committed to Aiven PostgreSQL.")


def verify(pg_conn):
    print(">> [3/3] Verifying Aiven PostgreSQL...")
    with pg_conn.cursor() as cur:
        for t in ["users", "trainings", "attendance", "attempts", "assessments", "ai_remedial_recommendations", "event_logs"]:
            cur.execute(f"SELECT COUNT(*) FROM {t};")
            print(f"   Table '{t}': {cur.fetchone()[0]} rows in Aiven.")


def main():
    print("=================================================================")
    print(" CONNECTING TO AIVEN POSTGRESQL")
    print(f" URI: {AIVEN_URI.split('@')[1] if '@' in AIVEN_URI else AIVEN_URI}")
    print("=================================================================")
    conn = psycopg2.connect(AIVEN_URI)
    try:
        create_schema(conn)
        migrate_mysql_data(conn)
        verify(conn)
        print("\n>> ENTERPRISE MIGRATION TO AIVEN.IO COMPLETE!")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

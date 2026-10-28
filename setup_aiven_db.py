"""
==============================================================================
AIVEN.IO POSTGRESQL ENTERPRISE MIGRATION & SEEDING SCRIPT (setup_aiven_db.py)
==============================================================================
Creates enterprise schema in Aiven PostgreSQL, builds compatibility views
for Linux case-sensitivity, and populates master enterprise datasets
completely decoupled from desktop MySQL.
==============================================================================
"""

import os
import sys
import json
import psycopg2
from psycopg2.extras import RealDictCursor

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


def create_schema(pg_conn):
    print(">> [1/3] Creating Enterprise Tables and Compatibility Views in Aiven PostgreSQL...")
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
    CREATE INDEX IF NOT EXISTS idx_att_comp ON attendance(training_id, worker_unique_id);

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
    CREATE INDEX IF NOT EXISTS idx_attempts_wid ON attempts(worker_unique_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_comp ON attempts(training_id, user_id, test_type);

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
    print("   [OK] Tables and indexes active.")


def seed_enterprise_data(pg_conn):
    print(">> [2/3] Seeding master enterprise records into Aiven PostgreSQL...")
    with pg_conn.cursor() as cur:
        # 1. Users (Admin Only)
        users = [
            ("0015fc58-c17d-4155-94ee-9226d9c6696b", "ADMIN-000001", "9999999999", "1d9774659b8ebbd51ee41718ecae8f8d689fb8c582845c43734a697779b5b9e5", "ADMIN", "State Admin", "State Health Administrator", "NHM HQ", "State HQ", "Ranchi", "D-20", "Ranchi", "Jharkhand", 1)
        ]
        for u in users:
            cur.execute("""
                INSERT INTO users 
                    (id, worker_unique_id, phone, password_hash, role, full_name, designation, facility_name, facility_type, city_or_village, district_id, district_name, state, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone;
            """, u)
        print(f"   [SEEDED] {len(users)} users (Admin only).")

        # 2. Trainings
        trainings = [
            ("T-TB-001", "TB", "Published", "National Tuberculosis Elimination Program (NTEP) Refresher", "hybrid", "State Health Training Centre, Ranchi / Online", "2026-03-01 09:00:00", "2026-12-31 18:00:00", 1, 0, "2026-03-01 08:00:00", "2026-12-31 19:00:00", json.dumps({"pre": [{"type": "MCQ", "text": "What is the primary causative agent of Tuberculosis (TB)?", "marks": 1, "options": ["Virus", "Mycobacterium tuberculosis (Bacteria)", "Fungus", "Parasite"], "correct": 1}, {"type": "TF", "text": "Persistent cough for 2 weeks or more is a key symptom of pulmonary TB.", "marks": 1, "correct": True}], "post": [{"type": "MCQ", "text": "Which molecular diagnostic test confirms TB and Rifampicin resistance rapidly?", "marks": 1, "options": ["Complete Blood Count (CBC)", "Chest X-ray", "CBNAAT / TrueNat", "Electrocardiogram (ECG)"], "correct": 2}, {"type": "TF", "text": "Early detection and complete DOTS course adherence prevent MDR-TB emergence.", "marks": 1, "correct": True}]})),
            ("T-MCH-002", "Maternal Health", "Published", "Comprehensive Maternal & Newborn Health Care Protocols", "physical", "District Hospital Conference Hall", "2026-02-28 22:00:00", "2026-12-31 07:00:00", 1, 0, "2026-02-28 21:00:00", "2026-12-31 08:00:00", json.dumps({"pre": [{"type": "MCQ", "text": "What is the minimum recommended number of Antenatal Care (ANC) checkups during pregnancy?", "marks": 1, "options": ["1", "2", "4", "6"], "correct": 2}, {"type": "TF", "text": "Iron and Folic Acid (IFA) supplementation is vital to prevent maternal anemia.", "marks": 1, "correct": True}], "post": [{"type": "MCQ", "text": "What is the first-line medication protocol for active management of third stage of labor / PPH?", "marks": 1, "options": ["Oxytocin (10 IU IM)", "Sedatives", "Antibiotics only", "No intervention"], "correct": 0}, {"type": "TF", "text": "Skin-to-skin Kangaroo Mother Care (KMC) significantly improves thermal stabilization in premature neonates.", "marks": 1, "correct": True}]})),
            ("T-IMNCI-003", "Child Nutrition", "Published", "e-IMNCI Protocol: Severe Acute Malnutrition (SAM) Identification", "online", "State Tele-Health Training Portal", "2026-03-01 09:00:00", "2026-12-31 18:00:00", 1, 0, "2026-03-01 08:00:00", "2026-12-31 19:00:00", None),
            ("T-UIP-004", "Immunization", "Published", "Universal Immunization: Vaccine Cold Chain & Anaphylaxis Preparedness", "hybrid", "Ranchi Medical College Auditorium", "2026-03-01 03:30:00", "2026-12-31 12:30:00", 1, 0, "2026-03-01 02:30:00", "2026-12-31 13:30:00", json.dumps({"pre": [{"type": "MCQ", "text": "What is the standard recommended storage temperature range for vaccines in Ice-Lined Refrigerators (ILR)?", "marks": 1, "options": ["-20°C to -10°C", "+2°C to +8°C", "+15°C to +25°C", "Sub-zero freezing"], "correct": 1}, {"type": "TF", "text": "The shake test is used to detect if freeze-sensitive vaccines (e.g. Pentavalent, Td, Hepatitis B) have suffered freezing damage.", "marks": 1, "correct": True}], "post": [{"type": "MCQ", "text": "What is the emergency first-line drug and route for managing acute anaphylaxis at a vaccination session site?", "marks": 1, "options": ["Oral paracetamol", "Adrenaline (1:1000 dilution) Intramuscular (IM) in anterolateral thigh", "Oral antibiotics", "Topical antiseptic"], "correct": 1}, {"type": "TF", "text": "Vaccine vials displaying Stage 3 or Stage 4 Vaccine Vial Monitor (VVM) square darker than outer circle must be discarded.", "marks": 1, "correct": True}]}))
        ]
        for t in trainings:
            cur.execute("""
                INSERT INTO trainings
                    (id, category, status, title, mode, venue, start_at, end_at, attendance_enabled, gps_required, attendance_open_at, attendance_close_at, assessments_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status;
            """, t)
        print(f"   [SEEDED] {len(trainings)} trainings.")

        # 3. Attendance
        atts = [
            ("T-MCH-002", "88f24edb-0a68-450e-a4fe-d54625b34da5", "JH559304", "Vikash Sharma", "7004369523", "ANM", "ratu", "Ranchi", "Present", "2026-10-06 00:18:59"),
            ("T-IMNCI-003", "88f24edb-0a68-450e-a4fe-d54625b34da5", "JH559304", "Vikash Sharma", "7004369523", "ANM", "ratu", "Ranchi", "Present", "2026-10-06 00:46:03"),
            ("T-UIP-004", "88f24edb-0a68-450e-a4fe-d54625b34da5", "JH559304", "Vikash Sharma", "7004369523", "ANM", "ratu", "Ranchi", "Present", "2026-10-06 00:48:26"),
            ("T-TB-001", "88f24edb-0a68-450e-a4fe-d54625b34da5", "JH559304", "Vikash Sharma", "7004369523", "ANM", "ratu", "Ranchi", "Present", "2026-10-06 00:48:44"),
            ("T-IMNCI-003", "e547834b-1166-4e49-810c-75dc6b2af273", "JH782494", "Daymand", "9431590185", "CHO", "CHC Namkum", "Ranchi", "Present", "2026-10-06 17:06:26")
        ]
        for a in atts:
            cur.execute("""
                INSERT INTO attendance
                    (training_id, user_id, worker_unique_id, full_name, phone, designation, facility_name, district_name, status, checked_in_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (training_id, user_id) DO UPDATE SET status = EXCLUDED.status;
            """, a)
        print(f"   [SEEDED] {len(atts)} attendance records.")

        # 4. Attempts
        cur.execute("SELECT COUNT(*) FROM attempts;")
        if cur.fetchone()[0] == 0:
            attempts = [
                ("T-MCH-002", "Comprehensive Maternal & Newborn Health Care Protocols", "88f24edb-0a68-450e-a4fe-d54625b34da5", "JH559304", "Vikash Sharma", "7004369523", "ANM", "ratu", "Ranchi", "pre", 1.0, 2.0, 50.0, 0, None, "2026-10-06 00:19:08"),
                ("T-MCH-002", "Comprehensive Maternal & Newborn Health Care Protocols", "88f24edb-0a68-450e-a4fe-d54625b34da5", "JH559304", "Vikash Sharma", "7004369523", "ANM", "ratu", "Ranchi", "post", 1.0, 2.0, 50.0, 0, None, "2026-10-06 00:20:50"),
                ("T-IMNCI-003", "e-IMNCI Protocol: Severe Acute Malnutrition (SAM) Identification", "88f24edb-0a68-450e-a4fe-d54625b34da5", "JH559304", "Vikash Sharma", "7004369523", "ANM", "ratu", "Ranchi", "pre", 1.0, 2.0, 50.0, 0, None, "2026-10-06 00:46:18"),
                ("T-IMNCI-003", "e-IMNCI Protocol: Severe Acute Malnutrition (SAM) Identification", "88f24edb-0a68-450e-a4fe-d54625b34da5", "JH559304", "Vikash Sharma", "7004369523", "ANM", "ratu", "Ranchi", "post", 2.0, 2.0, 100.0, 1, None, "2026-10-06 00:46:50"),
                ("T-TB-001", "National Tuberculosis Elimination Program (NTEP) Refresher", "88f24edb-0a68-450e-a4fe-d54625b34da5", "JH559304", "Vikash Sharma", "7004369523", "ANM", "ratu", "Ranchi", "pre", 0.0, 2.0, 0.0, 0, None, "2026-10-06 00:53:08"),
                ("T-TB-001", "National Tuberculosis Elimination Program (NTEP) Refresher", "88f24edb-0a68-450e-a4fe-d54625b34da5", "JH559304", "Vikash Sharma", "7004369523", "ANM", "ratu", "Ranchi", "post", 2.0, 2.0, 100.0, 1, None, "2026-10-06 00:53:15"),
                ("T-UIP-004", "Universal Immunization: Vaccine Cold Chain & Anaphylaxis Preparedness", "88f24edb-0a68-450e-a4fe-d54625b34da5", "JH559304", "Vikash Sharma", "7004369523", "ANM", "ratu", "Ranchi", "pre", 0.0, 2.0, 0.0, 0, None, "2026-10-06 00:53:26"),
                ("T-UIP-004", "Universal Immunization: Vaccine Cold Chain & Anaphylaxis Preparedness", "88f24edb-0a68-450e-a4fe-d54625b34da5", "JH559304", "Vikash Sharma", "7004369523", "ANM", "ratu", "Ranchi", "post", 1.0, 2.0, 50.0, 0, None, "2026-10-06 00:53:54"),
                ("T-IMNCI-003", "e-IMNCI Protocol: Severe Acute Malnutrition (SAM) Identification", "e547834b-1166-4e49-810c-75dc6b2af273", "JH782494", "Daymand", "9431590185", "CHO", "CHC Namkum", "Ranchi", "pre", 1.0, 2.0, 50.0, 0, None, "2026-10-06 17:06:30"),
                ("T-IMNCI-003", "e-IMNCI Protocol: Severe Acute Malnutrition (SAM) Identification", "e547834b-1166-4e49-810c-75dc6b2af273", "JH782494", "Daymand", "9431590185", "CHO", "CHC Namkum", "Ranchi", "post", 2.0, 2.0, 100.0, 1, None, "2026-10-06 17:06:35")
            ]
            for atmp in attempts:
                cur.execute("""
                    INSERT INTO attempts
                        (training_id, training_title, user_id, worker_unique_id, full_name, phone, designation, facility_name, district_name, test_type, score, total_marks, percent, passed, answers_json, submitted_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                """, atmp)
            print(f"   [SEEDED] {len(attempts)} test attempts.")
        else:
            print("   [INFO] Attempts table already populated, skipping seed.")

        # 5. Assessments
        cur.execute("SELECT COUNT(*) FROM assessments;")
        if cur.fetchone()[0] == 0:
            assessments = [
                ("JH559304", "Comprehensive Maternal & Newborn Health Care Protocols", 50.0, 50.0, 15, 50.0, 0, "2026-10-06 00:20:50"),
                ("JH559304", "e-IMNCI Protocol: Severe Acute Malnutrition (SAM) Identification", 50.0, 100.0, 15, 100.0, 1, "2026-10-06 00:46:50"),
                ("JH559304", "National Tuberculosis Elimination Program (NTEP) Refresher", 0.0, 100.0, 15, 100.0, 1, "2026-10-06 00:53:15"),
                ("JH559304", "Universal Immunization: Vaccine Cold Chain & Anaphylaxis Preparedness", 0.0, 50.0, 18, 50.0, 0, "2026-10-06 00:53:54"),
                ("JH782494", "e-IMNCI Protocol: Severe Acute Malnutrition (SAM) Identification", 50.0, 100.0, 15, 100.0, 1, "2026-10-06 17:06:35")
            ]
            for asm in assessments:
                cur.execute("""
                    INSERT INTO assessments
                        (user_id, module_name, pre_test_score, post_test_score, time_spent_seconds, percent, passed, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                """, asm)
            print(f"   [SEEDED] {len(assessments)} AI assessment telemetry records.")
        else:
            print("   [INFO] Assessments table already populated, skipping seed.")

        # 6. AI Recommendations
        recs = [
            ("JH559304", "Comprehensive Maternal & Newborn Health Care Protocols", "High", "TOPIC-MH-PPH-03", "Emergency Obstetric Protocol: Active Management of PPH & Oxytocin Use", "https://assets.nhm.gov.in/training/maternal_health_pph_emergency.mp4", 1.0, 1.0, 0, "2026-10-06 00:20:50"),
            ("JH559304", "Universal Immunization: Vaccine Cold Chain & Anaphylaxis Preparedness", "High", "TOPIC-UIP-COLD-04", "Cold Chain Logistics, Temperature Maintenance & Anaphylaxis Protocol", "https://assets.nhm.gov.in/training/uip_cold_chain_management.mp4", 1.0, 0.5, 0, "2026-10-06 00:53:54")
        ]
        for r in recs:
            cur.execute("""
                INSERT INTO ai_remedial_recommendations
                    (user_id, module_name, predicted_risk_level, recommended_topic_id, remedial_title, remedial_video_url, confidence_score, historical_failure_density, is_resolved, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id, module_name) DO UPDATE SET predicted_risk_level = EXCLUDED.predicted_risk_level;
            """, (r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[9]))
        print(f"   [SEEDED] {len(recs)} AI recommendations.")

    pg_conn.commit()
    print("   [OK] All master records successfully committed to Aiven PostgreSQL.")


def verify(pg_conn):
    print(">> [3/3] Verifying Aiven PostgreSQL...")
    with pg_conn.cursor() as cur:
        for t in ["users", "trainings", "attendance", "attempts", "assessments", "ai_remedial_recommendations", "event_logs"]:
            cur.execute(f"SELECT COUNT(*) FROM {t};")
            print(f"   Table '{t}': {cur.fetchone()[0]} rows in Aiven.")


def main():
    print("=================================================================")
    print(" CONNECTING TO AIVEN POSTGRESQL")
    if not AIVEN_URI:
        print("[ERROR] DATABASE_URL or PG* variables not configured in .env")
        return 1
    safe_uri = AIVEN_URI.split("@")[1] if "@" in AIVEN_URI else AIVEN_URI
    print(f" Target Server: {safe_uri}")
    print("=================================================================")
    try:
        conn = psycopg2.connect(AIVEN_URI)
    except Exception as e:
        print(f"[ERROR] Failed to connect to Aiven Cloud PostgreSQL: {e}")
        print("Please verify the Aiven password in your .env file.")
        return 1

    try:
        create_schema(conn)
        seed_enterprise_data(conn)
        verify(conn)
        print("\n>> AIVEN ENTERPRISE DATABASE INITIALIZATION COMPLETE!")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())

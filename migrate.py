"""
==============================================================================
MySQL Migration Runner for AI Adaptive Learning Engine
==============================================================================
Executes migrations/001_create_ai_remedial_recommendations.sql into MySQL
without requiring mysql.exe on the system PATH.
==============================================================================
"""

import os
import sys
import getpass
import pymysql
from pymysql.constants import CLIENT

# Configure stdout for Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

def run():
    host = os.getenv("MYSQL_HOST", "localhost")
    user = os.getenv("MYSQL_USER", "root")
    port = int(os.getenv("MYSQL_PORT", 3306))
    db_name = os.getenv("MYSQL_DB", "jh_health_db")
    password = os.getenv("MYSQL_PASSWORD", "Falcon@123")

    print("=================================================================")
    print(">> JHARKHAND HEALTH PORTAL: AI ENGINE DATABASE MIGRATION")
    print(f"   Target Server: {host}:{port} | User: {user} | Database: {db_name}")
    print("=================================================================")

    if len(sys.argv) > 1 and sys.argv[1].startswith("--password="):
        password = sys.argv[1].split("=", 1)[1]
    elif len(sys.argv) > 1 and sys.argv[1] == "-p":
        password = getpass.getpass(f"Enter MySQL password for '{user}': ")

    try:
        # Step 1: Connect to server with multi-statement support
        conn = pymysql.connect(
            host=host, 
            user=user, 
            password=password, 
            port=port, 
            autocommit=True,
            client_flag=CLIENT.MULTI_STATEMENTS
        )
        with conn.cursor() as cursor:
            # Ensure database exists
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            cursor.execute(f"USE `{db_name}`;")
            print(f"[OK] Connected to MySQL. Database '{db_name}' selected/created.")

            # Step 2: Read single unified SQL migration file
            sql_path = os.path.join(os.path.dirname(__file__), "jh_health_db.sql")
            if not os.path.exists(sql_path):
                sql_path = os.path.join(os.path.dirname(__file__), "migrations", "jh_health_db.sql")

            if not os.path.exists(sql_path):
                print(f"[ERROR] Migration file not found: {sql_path}")
                return 1

            with open(sql_path, "r", encoding="utf-8") as f:
                sql_content = f.read()

            # Execute statement
            cursor.execute(sql_content)
            print("[OK] Successfully executed: jh_health_db.sql")

            # Step 3: Verify schema
            cursor.execute("DESCRIBE `ai_remedial_recommendations`;")
            columns = cursor.fetchall()
            print("\n[VERIFIED] Table Schema 'ai_remedial_recommendations':")
            print("-" * 65)
            print(f"{'Field':<28} {'Type':<22} {'Null':<6} {'Key':<6}")
            print("-" * 65)
            for col in columns:
                print(f"{col[0]:<28} {col[1]:<22} {col[2]:<6} {col[3]:<6}")
            print("-" * 65)

            # Verify indexes
            cursor.execute("SHOW INDEX FROM `ai_remedial_recommendations`;")
            indexes = set(row[2] for row in cursor.fetchall())
            print(f"[INDEXES] Active: {', '.join(sorted(indexes))}")

        conn.close()
        print("\n=================================================================")
        print("[SUCCESS] MySQL Migration applied successfully!")
        print("=================================================================\n")
        return 0

    except pymysql.MySQLError as err:
        print(f"\n[ERROR] MySQL Execution Failed: {err}")
        return 1
    except Exception as ex:
        print(f"\n[ERROR] Unexpected Exception: {ex}")
        return 1

if __name__ == "__main__":
    sys.exit(run())

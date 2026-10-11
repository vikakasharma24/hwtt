"""
==============================================================================
Aiven Cloud PostgreSQL Migration Runner (migrate.py)
==============================================================================
Applies schema, compatibility views, and AI engine tables to Aiven.io
Cloud PostgreSQL. Completely decoupled from desktop MySQL.
==============================================================================
"""

import os
import sys

# Configure stdout for Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import setup_aiven_db

def run():
    print("=================================================================")
    print(">> JHARKHAND HEALTH PORTAL: CLOUD DATABASE MIGRATION RUNNER")
    print("   Database Engine: Aiven.io Cloud PostgreSQL (Decoupled from Desktop MySQL)")
    print("=================================================================")
    return setup_aiven_db.main()

if __name__ == "__main__":
    sys.exit(run())

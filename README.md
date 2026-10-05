# Jharkhand Frontline Health Worker AI-Adaptive Training Portal

A high-throughput, AI-adaptive training and monitoring portal designed for frontline healthcare workers (ANMs, GNMs, CHOs, ASHAs) and state health administrators in Jharkhand. Built with a responsive mobile-first frontend, a high-performance Python Flask REST API, and a robust MySQL 8.0 ACID persistence layer.

---

## 🏛 System Architecture

- **Frontend**: HTML5, Vanilla CSS3 (PWA ready, offline caching via `sw.js`, Web Crypto SHA-256 password security), dynamic data binding (`script.js`).
- **Backend**: Python 3.11+ Flask REST API (`app.py`), multithreaded asynchronous logging, and Google Sheets backup worker.
- **AI Adaptive Learning Engine**: Scikit-Learn ML classifier (`ai_engine.py`) assessing worker competency gaps and recommending personalized clinical remedial modules in real time.
- **Database**: MySQL Server 8.0+ (`jh_health_db`) with indexed lookup tables for sub-10ms response times under concurrent frontline load.

---

## 🧼 Database Status: Clean Production State

The MySQL database (`jh_health_db`) is initialized and cleaned for production deployment:

| Table | Status / Count | Description |
|---|---|---|
| `users` | **2 Records** | 1 State Admin (`ADMIN-000001` / `9999999999`) and 1 Worker (`JH559304` / `7004369523`). |
| `trainings` | **4 Records** | 4 official state health clinical modules (TB, Maternal Health, Child Nutrition, UIP). |
| `attendance` | **0 Records** | Cleaned: Ready for new live check-ins. |
| `assessments` | **0 Records** | Cleaned: Ready for new live assessment submissions. |
| `ai_remedial_recommendations` | **0 Records** | Cleaned: Will generate dynamically per worker upon post-assessment completion. |
| `event_logs` | **0 Records** | Cleaned: Ready for live session audit telemetry. |
| `attempts` | **0 Records** | Cleaned: Ready for live test attempts. |

### Default Production Credentials
- **State Admin Portal**:
  - **Phone / ID**: `9999999999` or `ADMIN-000001`
  - **Password**: `Admin@123`
- **Frontline Health Worker**:
  - **Phone / ID**: `7004369523` or `JH559304`
  - **Status**: First-time login requires setting a password via the **"Forgot Password?"** link on the login card. Default `123456` bypass has been removed for strict security.

---

## 🚀 Publishing to GitHub

The repository is pre-configured with a comprehensive `.gitignore` preventing accidental commits of virtual environments (`.venv`), database secrets, and cached files.

### 1. Initialize Git and Commit
```bash
git init
git add .
git commit -m "feat: production-ready Jharkhand Health Training Portal"
```

### 2. Push to your GitHub Repository
```bash
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git
git branch -M main
git push -u origin main
```

---

## 🌐 Web Deployment Options

### Option 1: Cloud PaaS (Render / Railway) — Recommended & Quickest
1. **Database**: Provision a managed MySQL database on [Render](https://render.com), [Railway](https://railway.app), or [Aiven](https://aiven.io).
2. **Import Clean Schema**: Run `jh_health_db.sql` on the managed MySQL instance.
3. **Deploy Web App**:
   - Link your GitHub repository to Render or Railway.
   - Set Build Command: `pip install -r requirements.txt`
   - Set Start Command: `gunicorn --workers 4 --threads 2 --bind 0.0.0.0:$PORT app:app` (already defined in `Procfile`).
   - Configure Environment Variables:
     - `MYSQL_HOST`: Remote MySQL host address
     - `MYSQL_PORT`: `3306` (or provided port)
     - `MYSQL_USER`: Database username
     - `MYSQL_PASSWORD`: Database password
     - `MYSQL_DB`: `jh_health_db`
     - `PASSWORD_SALT`: `JH_HEALTH_PORTAL_SALT_v1`

---

### Option 2: Docker Compose (Single-Command Full Stack)
Run both the Flask application and MySQL database in orchestrated Docker containers:

```bash
docker compose up -d --build
```
- Web Application: `http://localhost:5000`
- MySQL Database: `localhost:3306` (automatically initialized with `jh_health_db.sql`)

---

### Option 3: Linux VPS (Ubuntu / Debian) with Nginx & Gunicorn
1. **Clone repository**:
   ```bash
   git clone https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git /var/www/training-portal
   cd /var/www/training-portal
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. **Configure Systemd Service** (`/etc/systemd/system/training-portal.service`):
   ```ini
   [Unit]
   Description=Jharkhand Health Training Portal Gunicorn Daemon
   After=network.target

   [Service]
   User=www-data
   Group=www-data
   WorkingDirectory=/var/www/training-portal
   EnvironmentFile=/var/www/training-portal/.env
   ExecStart=/var/www/training-portal/.venv/bin/gunicorn --workers 4 --threads 2 --bind 127.0.0.1:5000 app:app

   [Install]
   WantedBy=multi-user.target
   ```
3. **Enable & Start**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now training-portal
   ```
4. **Nginx Reverse Proxy**:
   Point Nginx `proxy_pass http://127.0.0.1:5000;` and enable SSL via Let's Encrypt Certbot.

---

### Option 4: Windows Server with Waitress
To run on a Windows Server using the installed high-performance WSGI server:
```powershell
.\.venv\Scripts\waitress-serve.exe --port=5000 app:app
```

---

## 🧪 Automated Verification Test Suite

To verify system integrity and endpoint response times before or after deployment, execute:
```bash
python scratch/test_suite.py
```
Validates:
- Static assets delivery (`index.html`, `style.css`, `script.js`, `manifest.json`)
- Database connectivity (`/api/health`)
- Primary user registry (`/api/users`)
- Curriculum modules (`/api/trainings`)
- Secure authentication & blocked bypass attempts (`/api/auth/login`)

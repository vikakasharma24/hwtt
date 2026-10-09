# Jharkhand Frontline Health Worker AI-Adaptive Training Portal

A high-throughput, AI-adaptive training and monitoring portal designed for frontline healthcare workers (ANMs, GNMs, CHOs, ASHAs) and state health administrators in Jharkhand. Built with a responsive mobile-first frontend, a high-performance Python Flask REST API, and an enterprise-grade **Aiven.io Cloud PostgreSQL** persistence layer.

---

## 🏛 System Architecture

- **Frontend**: HTML5, Vanilla CSS3 (PWA ready, offline caching via `sw.js`, Web Crypto SHA-256 password security), dynamic data binding (`script.js`).
- **Backend**: Python 3.11+ Flask REST API (`app.py`), multithreaded asynchronous event logging, and AI triage engine.
- **AI Adaptive Learning Engine**: Scikit-Learn ML classifier (`ai_engine.py`) assessing worker competency gaps and recommending personalized clinical remedial modules in real time.
- **Cloud Database**: Managed **Aiven.io PostgreSQL 18.6** (`defaultdb`) with indexed tables for sub-10ms response times and ACID compliance.

---

## 📂 Repository File Structure: What to Upload to GitHub

When publishing this project to GitHub, include the essential source code, assets, and configuration files. Do **NOT** upload local environments (`.venv`), temporary files, or files containing private credentials (`.env`).

### ✅ Files to Upload (Tracked in Git):
| Category | Files | Description |
|---|---|---|
| **Backend & AI** | `app.py`, `ai_engine.py` | Flask REST API controller and AI remedial triage engine |
| **Database Setup** | `setup_aiven_db.py`, `jh_health_db.sql` | Aiven PostgreSQL migration/schema setup and SQL reference |
| **Frontend UI** | `index.html`, `style.css`, `script.js` | Single-page application UI, styles, and client-side logic |
| **Static & PWA** | `static/`, `manifest.json`, `sw.js`, `icon-*.png` | Service worker, PWA manifest, and app icons |
| **Config & Deploy**| `requirements.txt`, `Procfile`, `Dockerfile`, `docker-compose.yml` | Python dependencies and deployment configs |
| **Env Template** | `.env.example` | Safe template showing required environment variables |
| **Documentation** | `README.md`, `.gitignore` | Project documentation and Git ignore rules |

### ❌ Files to NEVER Upload (Automatically Ignored):
- **`.env`**: Contains your live Aiven.io database password. (Protected by `.gitignore`).
- **`.venv/`**: Local Python virtual environment directory. (Protected by `.gitignore`).
- **`__pycache__/`**: Compiled Python bytecode files.

---

## 🚀 How to Publish to GitHub (Step-by-Step)

### Step 1: Create a New Repository on GitHub
1. Go to [github.com/new](https://github.com/new).
2. Enter a repository name (e.g., `jharkhand-health-training-portal`).
3. Set the visibility to **Public** or **Private** based on your preference.
4. **Leave "Add a README file", ".gitignore template", and "License" UNCHECKED** (since this repository already has them).
5. Click **Create repository**.

### Step 2: Push Your Code from the Terminal

Open your terminal in this project folder (`d:\vik_data\Database\Apps\training-tool\training-tool\dist`) and run:

```powershell
# 1. Check your status and stage all tracked files
git status
git add .

# 2. Commit the changes
git commit -m "feat: enterprise release with Aiven Cloud PostgreSQL and AI adaptive learning"

# 3. Rename branch to main (if not already main)
git branch -M main

# 4. Link your remote GitHub repository (replace with your actual GitHub URL)
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git

# 5. Push to GitHub
git push -u origin main
```

> **Note**: If you already have a remote configured, you can update it with:
> `git remote set-url origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git`

---

## ⚙️ Running Locally

1. **Activate the virtual environment**:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```
2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your Aiven database credentials:
   ```bash
   DATABASE_URL=postgres://avnadmin:<YOUR_AIVEN_PASSWORD>@pg-2c5c09d3-vikashsharmadfy-bf40.g.aivencloud.com:14071/defaultdb?sslmode=require
   ```
4. **Start the application**:
   ```bash
   python app.py
   ```
   Open your browser at `http://localhost:5000`.

---

## 🌐 Cloud Production Deployment (e.g., Render / Railway / Heroku)

Because all persistent storage is hosted on **Aiven.io Cloud PostgreSQL**, you can deploy the web service anywhere in minutes:

1. Connect your GitHub repository to [Render](https://render.com) or [Railway](https://railway.app).
2. Set Build Command: `pip install -r requirements.txt`
3. Set Start Command: `gunicorn --workers 4 --threads 2 --bind 0.0.0.0:$PORT app:app` (or use `Procfile`).
4. In the cloud dashboard's **Environment Variables** section, add:
   - `DATABASE_URL`: `postgres://avnadmin:<PASSWORD>@pg-2c5c09d3-vikashsharmadfy-bf40.g.aivencloud.com:14071/defaultdb?sslmode=require`
   - `PASSWORD_SALT`: `JH_HEALTH_PORTAL_SALT_v1`

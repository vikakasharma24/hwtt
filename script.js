(() => {
  "use strict";

  const GOOGLE_SCRIPT_URL = "";
  const PASSWORD_SALT = "JH_HEALTH_PORTAL_SALT_v1";
  const API_STORAGE_KEY = "jh_backend_api_url";
  const DEFAULT_BACKEND_URL = "";

  function getApiBaseUrl() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryApi = urlParams.get("api");
      if (queryApi) {
        const cleanQueryApi = queryApi.trim().replace(/\/+$/, "");
        if (cleanQueryApi.startsWith("http")) {
          if (!cleanQueryApi.includes("github.io") && !cleanQueryApi.includes("pages.dev")) {
            localStorage.setItem(API_STORAGE_KEY, cleanQueryApi);
            return cleanQueryApi;
          }
        }
      }
    } catch (_) {}

    try {
      const custom = (localStorage.getItem(API_STORAGE_KEY) || "").trim();
      if (custom) {
        const clean = custom.replace(/\/+$/, "");
        if (clean.includes("github.io") || clean.includes("pages.dev")) {
          localStorage.removeItem(API_STORAGE_KEY);
        } else {
          return clean;
        }
      }
    } catch (_) {}

    if (DEFAULT_BACKEND_URL) {
      return DEFAULT_BACKEND_URL;
    }

    if (window.location.port === "5000") {
      return "";
    }

    if (window.location.protocol === "file:") {
      return "http://localhost:5000";
    }

    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return `${window.location.protocol}//${window.location.hostname}:5000`;
    }

    return "";
  }

  let detectedLocalApi = null;
  async function probeLocalBackend() {
    if (detectedLocalApi !== null) return detectedLocalApi;
    try {
      const res = await fetch("http://127.0.0.1:5000/api/health", { signal: AbortSignal.timeout(1200) });
      if (res.ok) {
        detectedLocalApi = "http://127.0.0.1:5000";
        console.info("[Portal] Live Python backend detected on local machine. Direct Aiven DB sync active!");
        return detectedLocalApi;
      }
    } catch (_) {}
    detectedLocalApi = "";
    return "";
  }

  function apiUrl(endpoint) {
    const base = getApiBaseUrl() || detectedLocalApi;
    const cleanPath = endpoint.startsWith("/") ? endpoint : "/" + endpoint;
    if (base) {
      return base + cleanPath;
    }
    const isStaticDeploy = window.location.hostname.endsWith("github.io") || window.location.hostname.includes("pages.dev");
    if (isStaticDeploy) {
      return null;
    }
    return cleanPath;
  }

  window.apiUrl = apiUrl;

  /* ==========================
     UTILITIES
     ========================== */
  const byId = (id) => document.getElementById(id);
  const nowIso = () => new Date().toISOString();
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "—");
  const fmtDate = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
    } catch {
      return iso;
    }
  };
  const uuid = () =>
    (crypto?.randomUUID?.() || ("id-" + Math.random().toString(16).slice(2) + Date.now()));
  function cleanPhone(p) {
    if (!p) return "";
    let s = String(p).trim().replace(/[\s-]/g, "");
    if (s.startsWith("+91")) s = s.slice(3);
    else if (s.startsWith("91") && s.length === 12 && /^\d+$/.test(s)) s = s.slice(2);
    return s;
  }
  const validPhone = (p) => /^\d{10}$/.test(cleanPhone(p));

  /* ==========================
     CUSTOM TOAST COMPONENT
     ========================== */
  function showToast(message, type = "info", duration = 3500) {
    const container = byId("toastContainer");
    if (!container) {
      console.log(`[${type.toUpperCase()}] ${message}`);
      return;
    }

    const cleanMsg = (message || "").trim();

    // 1. DEDUPLICATION: If an identical toast is already active, don't stack duplicates!
    const existingToasts = container.querySelectorAll(".toast");
    for (const el of existingToasts) {
      const msgEl = el.querySelector(".toastMsg");
      if (msgEl && msgEl.textContent.trim() === cleanMsg) {
        // Reset timer and gently pulse existing toast to indicate re-trigger
        el.classList.remove("toastPulse");
        void el.offsetWidth; // trigger reflow
        el.classList.add("toastPulse");
        if (el._timer) clearTimeout(el._timer);
        el._timer = setTimeout(() => {
          el.classList.add("toastHiding");
          setTimeout(() => el.remove(), 250);
        }, duration);
        return;
      }
    }

    // 2. LIMIT MAXIMUM VISIBLE TOASTS: Cap to 3 to prevent screen overflow
    if (existingToasts.length >= 3) {
      const oldest = existingToasts[0];
      if (oldest._timer) clearTimeout(oldest._timer);
      oldest.classList.add("toastHiding");
      setTimeout(() => oldest.remove(), 200);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const iconSvg = {
      success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`,
      error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`,
      warn: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
    }[type] || iconSvg.info;

    toast.innerHTML = `
      <div class="toastIcon">${iconSvg}</div>
      <div class="toastMsg">${cleanMsg}</div>
      <button type="button" class="toastClose" aria-label="Close">&times;</button>
    `;

    container.appendChild(toast);

    const dismiss = () => {
      if (toast._timer) clearTimeout(toast._timer);
      toast.classList.add("toastHiding");
      setTimeout(() => toast.remove(), 250);
    };

    toast.querySelector(".toastClose")?.addEventListener("click", dismiss);
    toast._timer = setTimeout(dismiss, duration);
  }

  /* ==========================
     PASSWORD SECURITY (SHA-256)
     ========================== */
  async function hashPassword(plainText) {
    if (!plainText) return "";
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(plainText + ":" + PASSWORD_SALT);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      console.error("Web Crypto hashing error:", e);
      let hash = 0;
      const str = plainText + ":" + PASSWORD_SALT;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      return "fb_" + Math.abs(hash).toString(16);
    }
  }

  const csvEscape = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  function safeJsonParse(txt) {
    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch {
      throw new Error("Invalid JSON format");
    }
    if (!Array.isArray(parsed)) throw new Error("JSON must be an array of questions");
    return parsed;
  }

  /* ==========================
     LOCAL STORAGE & DB KEYS
     ========================== */
  const LS = {
    get(k, fallback) {
      try {
        const v = JSON.parse(localStorage.getItem(k));
        return v ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(k, v) {
      localStorage.setItem(k, JSON.stringify(v));
    }
  };

  const DBK = {
    users: "jh_users",
    trainings: "jh_trainings",
    attendance: "jh_attendance",
    attempts: "jh_attempts",
    districts: "jh_districts",
    session: "jh_session",
    lastSync: "jh_last_sync",
    lastSyncStatus: "jh_last_sync_status",
    offlineQueue: "jh_offline_queue"
  };

  const ROLES = { ADMIN: "ADMIN", WORKER: "WORKER" };

  /* ==========================
     DISTRICTS OF JHARKHAND
     ========================== */
  const JHARKHAND_DISTRICTS = [
    "Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum", "Garhwa",
    "Giridih", "Godda", "Gumla", "Hazaribagh", "Jamtara", "Khunti", "Koderma",
    "Latehar", "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Ranchi", "Sahebganj",
    "Seraikela Kharsawan", "Simdega", "West Singhbhum"
  ];

  function seedDistricts() {
    const existing = LS.get(DBK.districts, []);
    if (Array.isArray(existing) && existing.length) return;
    const districts = JHARKHAND_DISTRICTS.map((name, idx) => ({
      id: "D-" + (idx + 1),
      name,
      state: "Jharkhand"
    }));
    LS.set(DBK.districts, districts);
  }

  function districtNameById(id) {
    const ds = LS.get(DBK.districts, []);
    const d = ds.find((x) => x.id === id);
    return d ? d.name : "";
  }

  function fillDistrictSelect() {
    seedDistricts();
    const ds = LS.get(DBK.districts, []);
    const el = byId("rDistrict");
    if (!el) return;

    const prev = el.value || "";
    el.innerHTML =
      '<option value="">Select District</option>' +
      ds.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");

    if ([...el.options].some((o) => o.value === prev)) el.value = prev;
    updateDistrictLabel();
  }

  function fillResetDistrictSelect() {
    seedDistricts();
    const ds = LS.get(DBK.districts, []);
    const el = byId("resetDistrict");
    if (!el) return;

    const prev = el.value || "";
    el.innerHTML =
      '<option value="">Select Registered District</option>' +
      ds.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");

    if ([...el.options].some((o) => o.value === prev)) el.value = prev;
  }

  function updateDistrictLabel() {
    const sel = byId("rDistrict");
    const out = byId("rDistrictLabel");
    if (!sel || !out) return;
    const name = sel.value ? districtNameById(sel.value) : "";
    out.textContent = "Selected: " + (name || "—");
  }

  function wireDistrictSelect() {
    byId("rDistrict")?.addEventListener("change", updateDistrictLabel);
  }

  /* ==========================
     ROBUST OFFLINE QUEUE
     ========================== */
  function getQueue() {
    return LS.get(DBK.offlineQueue, []);
  }

  function saveQueue(items) {
    LS.set(DBK.offlineQueue, items);
    updateQueueBadge();
  }

  function addToQueue(payload) {
    const queue = getQueue();
    const item = {
      id: uuid(),
      payload,
      createdAt: nowIso(),
      retries: 0
    };
    queue.push(item);
    saveQueue(queue);
    refreshQueueUI();
    return item;
  }

  function updateQueueBadge() {
    const queue = getQueue();
    const pending = queue.length;
    const badge = byId("pendingBadge");
    if (badge) {
      badge.textContent = `${pending} Pending`;
      badge.className = pending > 0 ? "badge warn" : "badge good";
    }
  }

  function cleanQueueTelemetry() {
    try {
      const q = getQueue();
      if (!Array.isArray(q) || !q.length) return;
      const filtered = q.filter((item) => {
        const p = item.payload || {};
        const act = (p.action || p.type || p.event || "").toLowerCase();
        // Prune routine telemetry events that should not block the sync queue
        return !["login", "logout", "page_view", "heartbeat", "nav"].includes(act);
      });
      if (filtered.length !== q.length) {
        saveQueue(filtered);
        updateQueueBadge();
      }
    } catch (_) {}
  }

  function refreshQueueUI() {
    cleanQueueTelemetry();
    updateQueueBadge();
    const queue = getQueue();
    const last = LS.get(DBK.lastSync, null);
    const lastStatus = LS.get(DBK.lastSyncStatus, null);

    const lastSyncEl = byId("lastSync");
    if (lastSyncEl) {
      if (last) {
        lastSyncEl.textContent = fmt(last);
      } else if (lastStatus?.status === "error" || lastStatus?.status === "network_error") {
        lastSyncEl.textContent = "Failed";
      } else {
        lastSyncEl.textContent = "—";
      }
    }

    const list = byId("queueList");
    if (list) {
      if (!queue.length) {
        list.innerHTML = `
          <div class="item">
            <div class="t">Offline Queue Empty</div>
            <div class="s">All local actions are synchronized. No pending actions waiting for cloud sync.</div>
          </div>
        `;
      } else {
        list.innerHTML = queue.map((item, idx) => {
          const type = item.payload?.type || item.payload?.event || "Action";
          const title = item.payload?.trainingTitle || item.payload?.fullName || item.payload?.phone || "Data payload";
          return `
            <div class="queueItem">
              <div class="queueItemTitle">
                <span>#${idx + 1} <b>${type.toUpperCase()}</b></span>
                <span class="badge warn">Queued</span>
              </div>
              <div class="queueItemSub">
                ${title} • Time: ${fmt(item.createdAt)} ${item.retries ? `(Attempts: ${item.retries})` : ""}
              </div>
            </div>
          `;
        }).join("");
      }
    }
  }

  /* ==========================
     AIVEN ENTERPRISE DATABASE SYNC
     ========================== */
  function setSyncStatus(status, message = "") {
    LS.set(DBK.lastSyncStatus, {
      status,
      message,
      at: nowIso()
    });
  }

  async function checkBackendConnectivity() {
    const base = getApiBaseUrl();
    const isStaticDeploy = window.location.hostname.endsWith("github.io") || window.location.hostname.includes("pages.dev");
    if (isStaticDeploy && !base) {
      return false;
    }
    const pingUrl = apiUrl("/api/health");
    if (!pingUrl) return false;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(pingUrl, { signal: ctrl.signal });
      clearTimeout(tid);
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  async function sendToSheet(payload, isFromQueue = false) {
    // 1. PRIMARY FAST WRITE TO AIVEN POSTGRESQL (< 5ms response time)
    if (navigator.onLine) {
      const url = apiUrl("/api/events/log");
      if (url) {
        try {
          const apiRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (apiRes.ok) {
            const json = await apiRes.json();
            LS.set(DBK.lastSync, nowIso());
            setSyncStatus("success", `Synced with Aiven Enterprise Database (${json.latency_ms || "1"}ms)`);
            return json;
          } else {
            console.warn(`[Sync] /api/events/log HTTP ${apiRes.status}`);
          }
        } catch (apiErr) {
          console.warn("[Sync] /api/events/log network error:", apiErr);
        }
      }
    }

    // Only queue state-altering business actions (e.g. registrations, attendance, tests, trainings)
    // Do NOT pollute offline sync queue with routine login/logout telemetry
    const eventType = (payload.type || payload.event || payload.action || "").toLowerCase();
    const isEphemeral = ["login", "logout", "page_view", "heartbeat", "nav"].includes(eventType);

    if (!isFromQueue && !isEphemeral) {
      const q = getQueue();
      const isDupe = q.some((item) => {
        const p = item.payload || {};
        return (p.id && payload.id && p.id === payload.id) ||
               (p.type === payload.type && p.userId && p.userId === payload.userId && p.timestamp === payload.timestamp);
      });
      if (!isDupe) {
        addToQueue(payload);
        setSyncStatus("offline_queued", "Offline: queued for cloud sync");
      }
    }
    return { ok: false, queued: !isEphemeral, error: isEphemeral ? "Ephemeral event ignored" : "Queued for sync" };
  }

  async function processOfflineQueue(silent = false) {
    if (!navigator.onLine) {
      if (!silent) showToast("Cannot sync: device is currently offline", "warn");
      return;
    }

    cleanQueueTelemetry();
    const queue = getQueue();
    if (!queue.length) {
      if (!silent) showToast("All actions synchronized. Queue is empty.", "success");
      refreshQueueUI();
      return;
    }

    let syncUrl = apiUrl("/api/sync/batch");
    if (!syncUrl && (detectedLocalApi || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
      syncUrl = (detectedLocalApi || "http://127.0.0.1:5000") + "/api/sync/batch";
    }

    if (!syncUrl) {
      try {
        const probeRes = await fetch("http://127.0.0.1:5000/api/health", { signal: AbortSignal.timeout(1500) });
        if (probeRes.ok) {
          detectedLocalApi = "http://127.0.0.1:5000";
          syncUrl = "http://127.0.0.1:5000/api/sync/batch";
        }
      } catch (_) {}
    }

    if (!syncUrl) {
      setSyncStatus("offline_queued", `${queue.length} action(s) preserved in offline queue`);
      refreshQueueUI();
      if (!silent) {
        showToast(
          `Cannot sync to Aiven Cloud DB: Backend API server is offline. ${queue.length} action(s) safely preserved in browser queue. Start backend with 'python app.py' or set your live Render URL in Backend Settings.`,
          "warn",
          7000
        );
      }
      return;
    }

    if (!silent) {
      showToast(`Syncing ${queue.length} offline action(s) to Aiven Cloud DB...`, "info");
    }
    setSyncStatus("syncing", `Syncing ${queue.length} queued action(s)...`);

    // 1. Primary Unified Batch Sync to Cloud DB
    try {
      const batchRes = await fetch(syncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queue.map((q) => q.payload))
      });
      if (batchRes.ok) {
        const json = await batchRes.json().catch(() => ({}));
        saveQueue([]);
        LS.set(DBK.lastSync, nowIso());
        setSyncStatus("success", `All ${queue.length} action(s) synced to Aiven Cloud DB (${json.latency_ms || "1"}ms)`);
        refreshQueueUI();
        if (!silent) {
          showToast(`All ${queue.length} offline action(s) synced to Aiven Cloud DB!`, "success");
        }
        await syncFromCloudPrimary();
        renderAll();
        return;
      }
    } catch (batchErr) {
      console.warn("Primary batch sync failed, attempting individual fallbacks:", batchErr);
    }

    // 2. Fallback: item-by-item sync
    const remaining = [];
    let syncedCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const p = item.payload || {};
      const action = (p.action || p.type || p.event || "").toLowerCase();
      let success = false;

      try {
        if (action === "worker_registration" || action === "user_registration" || action === "register") {
          const regRes = await fetch(apiUrl("/api/auth/register"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p.user || p)
          });
          if (regRes.ok || regRes.status === 409) {
            success = true;
          }
        } else if (action === "attendance") {
          const res = await fetch(apiUrl("/api/attendance"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p)
          });
          if (res.ok) success = true;
        } else if (action === "assessment" || action === "attempt") {
          const res = await fetch(apiUrl("/api/submit-assessment"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p)
          });
          if (res.ok) success = true;
        } else if (action === "training_created" || action === "training_updated" || action === "training") {
          const tRes = await fetch(apiUrl("/api/trainings"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p.training || p)
          });
          if (tRes.ok) success = true;
        }

        if (!success) {
          const evRes = await sendToSheet(p, true);
          if (evRes && (evRes.ok || evRes.status === "logged_in_cloud_db" || evRes.event_id)) success = true;
        }
      } catch (e) {
        success = false;
      }

      if (success) {
        syncedCount++;
      } else {
        item.retries = (item.retries || 0) + 1;
        remaining.push(item);
      }
    }

    saveQueue(remaining);
    refreshQueueUI();

    if (syncedCount > 0) {
      LS.set(DBK.lastSync, nowIso());
      setSyncStatus("success", `Synced ${syncedCount} offline action(s) to database.`);
      await syncFromCloudPrimary();
      renderAll();
    }

    if (remaining.length === 0) {
      if (!silent) {
        showToast(`All ${syncedCount} queued action(s) synced to Aiven Cloud DB!`, "success");
      }
    } else {
      if (!silent) {
        showToast(`Synced ${syncedCount} item(s). ${remaining.length} item(s) remain queued.`, "warn");
      }
    }
  }

  function currentUser() {
    const s = LS.get(DBK.session, null);
    if (!s || !s.userId) return null;
    const users = LS.get(DBK.users, []);
    return (
      users.find(
        (u) =>
          u &&
          (u.id === s.userId ||
            (u.phone && cleanPhone(u.phone) === cleanPhone(s.userId)) ||
            (u.workerUniqueId && String(u.workerUniqueId).toUpperCase() === String(s.userId).toUpperCase()))
      ) || null
    );
  }

  function setSession(userId) {
    LS.set(DBK.session, { userId, at: nowIso() });
  }

  async function logEvent(type, data = {}) {
    const u = currentUser();

    const row = {
      type,
      event: data.event || type,
      timestamp: nowIso(),
      actorRole: u ? u.role : "",
      actorId: u ? u.id : "",
      actorName: u ? u.fullName : "",
      actorPhone: u ? u.phone : "",

      workerUniqueId: data.workerUniqueId || (u ? (u.workerUniqueId || u.worker_unique_id) : "") || "",
      fullName: data.fullName || (u ? (u.fullName || u.full_name) : "") || "",
      designation: data.designation || u?.designation || u?.profile?.designation || "",
      facilityName: data.facilityName || u?.facilityName || u?.facility_name || u?.profile?.facilityName || "",
      facilityType: data.facilityType || u?.facilityType || u?.facility_type || u?.profile?.facilityType || "",
      cityOrVillage: data.cityOrVillage || u?.cityOrVillage || u?.city_or_village || u?.profile?.cityOrVillage || "",
      district: data.district || u?.district || u?.district_name || (u?.profile?.districtId ? districtNameById(u.profile.districtId) : ""),
      state: data.state || u?.state || u?.profile?.state || "Jharkhand",
      phone: data.phone || (u ? u.phone : "") || "",

      trainingId: data.trainingId || "",
      trainingTitle: data.trainingTitle || "",
      trainingCategory: data.trainingCategory || "",
      status: data.status || "",

      attendanceStatus: data.attendanceStatus || "",
      checkedInAt: data.checkedInAt || "",

      testType: data.testType || "",
      score: data.score ?? "",
      totalMarks: data.totalMarks ?? "",
      percent: data.percent ?? "",
      passed: data.passed ?? ""
    };

    return await sendToSheet(row);
  }

  /* ==========================
     ONLINE BADGE
     ========================== */
  function setOnlineBadge() {
    const b = byId("netBadge");
    if (!b) return;
    if (navigator.onLine) {
      b.textContent = "Online";
      b.className = "badge good";
    } else {
      b.textContent = "Offline";
      b.className = "badge bad";
    }
  }

  /* ==========================
     DEFAULT TEST JSON
     ========================== */
  function defaultPreJson() {
    return JSON.stringify(
      [
        {
          type: "MCQ",
          text: "What is the primary causative agent of Tuberculosis (TB)?",
          marks: 1,
          options: ["Virus", "Mycobacterium tuberculosis (Bacteria)", "Fungus", "Parasite"],
          correct: 1
        },
        {
          type: "TF",
          text: "Persistent cough for 2 weeks or more is a key symptom of pulmonary TB.",
          marks: 1,
          correct: true
        }
      ],
      null,
      2
    );
  }

  function defaultPostJson() {
    return JSON.stringify(
      [
        {
          type: "MCQ",
          text: "Which molecular diagnostic test confirms TB and Rifampicin resistance rapidly?",
          marks: 1,
          options: ["Complete Blood Count (CBC)", "Chest X-ray", "CBNAAT / TrueNat", "Electrocardiogram (ECG)"],
          correct: 2
        },
        {
          type: "TF",
          text: "Early detection and complete DOTS course adherence prevent MDR-TB emergence.",
          marks: 1,
          correct: true
        }
      ],
      null,
      2
    );
  }

  /* ==========================
     SEED INITIAL USERS (ADMIN & 3 MASTER WORKERS)
     ========================== */
  function seedInitialUsers() {
    let users = LS.get(DBK.users, []);
    if (!Array.isArray(users)) users = [];
    const adminHash = "4311d0246a19ce40a753e72109162eb05e23cc30f50bce584e3e2ed1123caed0";
    const workerHash = "3562e323fc87431e4aecaa006efbaa58fdfc51341f0c2d7539fcf9925c0532fd";

    const masterUsers = [
      {
        id: "0015fc58-c17d-4155-94ee-9226d9c6696b",
        workerUniqueId: "ADMIN-000001",
        phone: "9999999999",
        password: adminHash,
        role: ROLES.ADMIN,
        fullName: "State Admin",
        createdAt: nowIso(),
        profile: {
          designation: "State Health Administrator",
          facilityName: "NHM HQ",
          facilityType: "State HQ",
          cityOrVillage: "Ranchi",
          districtId: "D-20",
          district: "Ranchi",
          state: "Jharkhand"
        }
      }
    ];

    // Ensure Admin always exists, while strictly preserving all registered workers
    const uMap = new Map();
    for (const u of users) {
      if (u && (u.id || u.phone)) {
        uMap.set(u.id || u.phone, u);
      }
    }
    for (const m of masterUsers) {
      if (!uMap.has(m.id) && !uMap.has(m.phone)) {
        uMap.set(m.id, m);
      }
    }

    LS.set(DBK.users, Array.from(uMap.values()));
  }

  // Alias for backward compatibility
  const seedAdmin = seedInitialUsers;


  function seedMasterTrainings() {
    const masterTrainings = [
      {
        id: "T-UIP-004",
        category: "Immunization",
        status: "Published",
        title: "Universal Immunization: Vaccine Cold Chain & Anaphylaxis Preparedness",
        startAt: "2026-03-01T03:30:00.000Z",
        endAt: "2026-12-31T12:30:00.000Z",
        mode: "hybrid",
        venue: "Ranchi Medical College Auditorium",
        attendanceEnabled: true,
        gpsRequired: false,
        attendanceOpenAt: "2026-03-01T02:30:00.000Z",
        attendanceCloseAt: "2026-12-31T13:30:00.000Z",
        assessments: {
          pre: [
            { type: "MCQ", text: "What is the standard recommended storage temperature range for vaccines in Ice-Lined Refrigerators (ILR)?", marks: 1, options: ["-20°C to -10°C", "+2°C to +8°C", "+15°C to +25°C", "Sub-zero freezing"], correct: 1 },
            { type: "TF", text: "The shake test is used to detect if freeze-sensitive vaccines have suffered freezing damage.", marks: 1, correct: true }
          ],
          post: [
            { type: "MCQ", text: "What is the emergency first-line drug and route for managing acute anaphylaxis at a vaccination site?", marks: 1, options: ["Oral paracetamol", "Adrenaline (1:1000 dilution) IM in anterolateral thigh", "Oral antibiotics", "Topical antiseptic"], correct: 1 },
            { type: "TF", text: "Vaccine vials displaying Stage 3 or Stage 4 Vaccine Vial Monitor (VVM) square darker than outer circle must be discarded.", marks: 1, correct: true }
          ]
        },
        createdAt: "2026-10-05T23:22:11.000Z",
        updatedAt: "2026-10-07T10:33:33.000Z"
      },
      {
        id: "T-TB-001",
        category: "TB",
        status: "Published",
        title: "National Tuberculosis Elimination Program Refresher",
        startAt: "2026-03-01T09:00:00.000Z",
        endAt: "2026-12-31T18:00:00.000Z",
        mode: "hybrid",
        venue: "State Health Training Centre, Ranchi / Online",
        attendanceEnabled: true,
        gpsRequired: false,
        attendanceOpenAt: "2026-03-01T08:00:00.000Z",
        attendanceCloseAt: "2026-12-31T19:00:00.000Z",
        assessments: {
          pre: [
            { type: "MCQ", text: "What is the primary causative agent of Tuberculosis (TB)?", marks: 1, options: ["Virus", "Mycobacterium tuberculosis (Bacteria)", "Fungus", "Parasite"], correct: 1 },
            { type: "TF", text: "Persistent cough for 2 weeks or more is a key symptom of pulmonary TB.", marks: 1, correct: true }
          ],
          post: [
            { type: "MCQ", text: "Which molecular diagnostic test confirms TB and Rifampicin resistance rapidly?", marks: 1, options: ["Complete Blood Count (CBC)", "Chest X-ray", "CBNAAT / TrueNat", "Electrocardiogram (ECG)"], correct: 2 },
            { type: "TF", text: "Early detection and complete DOTS course adherence prevent MDR-TB emergence.", marks: 1, correct: true }
          ]
        },
        createdAt: "2026-10-05T23:22:11.000Z",
        updatedAt: "2026-10-05T23:22:28.000Z"
      }
    ];

    let existing = LS.get(DBK.trainings, []);
    if (!Array.isArray(existing) || existing.length === 0) {
      LS.set(DBK.trainings, masterTrainings);
    } else {
      // Retain only valid clean master trainings
      const allowedIds = new Set(masterTrainings.map((m) => m.id));
      const filtered = existing.filter((t) => allowedIds.has(t.id));
      masterTrainings.forEach((m) => {
        if (!filtered.some((t) => t.id === m.id)) filtered.push(m);
      });
      LS.set(DBK.trainings, filtered.length > 0 ? filtered : masterTrainings);
    }
  }

  const seedSampleTrainings = seedMasterTrainings;

  function purgeMockTestData() {
    try {
      // 1. Pristine clean baseline sync to wipe stale test workers and preserved test actions
      const CLEAN_BASELINE_KEY = "jh_clean_pilot_baseline_v5";
      if (!localStorage.getItem(CLEAN_BASELINE_KEY)) {
        localStorage.removeItem(DBK.attendance);
        localStorage.removeItem(DBK.attempts);
        localStorage.removeItem(DBK.offlineQueue);
        localStorage.removeItem(DBK.session);
        localStorage.removeItem(DBK.users);
        localStorage.removeItem(DBK.trainings);
        localStorage.setItem(CLEAN_BASELINE_KEY, "true");
      }

      // 2. Safe maintenance: prune invalid null/undefined objects
      let atts = LS.get(DBK.attendance, []);
      if (Array.isArray(atts)) {
        const cleanAtts = atts.filter((a) => a && (a.id || a.trainingId));
        if (cleanAtts.length !== atts.length) LS.set(DBK.attendance, cleanAtts);
      }
      let atmps = LS.get(DBK.attempts, []);
      if (Array.isArray(atmps)) {
        const cleanAtmps = atmps.filter((a) => a && (a.id || a.trainingId));
        if (cleanAtmps.length !== atmps.length) LS.set(DBK.attempts, cleanAtmps);
      }
      let usrs = LS.get(DBK.users, []);
      if (Array.isArray(usrs)) {
        const cleanUsrs = usrs.filter((u) => u && (u.id || u.phone));
        if (cleanUsrs.length !== usrs.length) LS.set(DBK.users, cleanUsrs);
      }
    } catch (_) {}
  }

  /* ==========================
     AUTHENTICATION & LOGIN
     ========================== */
  function showLoginMsg(msg, isError = true) {
    const el = byId("loginMsg");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "#dc2626" : "#16a34a";
    el.style.display = msg ? "block" : "none";
  }

  async function login() {
    showLoginMsg("");
    const phoneInput = byId("loginPhone");
    const passInput = byId("loginPass");
    const btn = byId("loginBtn");

    const rawInput = (phoneInput?.value || "").trim();
    const phone = /^\+?[\d\s-]+$/.test(rawInput) ? (cleanPhone(rawInput) || rawInput) : rawInput;
    const password = (passInput?.value || "").trim();

    if (!phone) {
      phoneInput?.focus();
      showLoginMsg("Please enter your registered Phone Number or Worker ID");
      return showToast("Enter your registered Phone Number or Worker ID", "warn");
    }
    if (!password) {
      passInput?.focus();
      showLoginMsg("Please enter your password (default: Worker@123 or Admin@123)");
      return showToast("Enter your password", "warn");
    }

    const origText = btn ? btn.innerHTML : "Login to Portal";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span style="display:inline-block;animation:spin 1s linear infinite;margin-right:6px">⏳</span> Signing in...`;
    }

    try {
      const inputHash = await hashPassword(password);

      // 1. PRIMARY FAST AUTHENTICATION AGAINST CLOUD DB (< 2ms)
      try {
        const authUrl = apiUrl("/api/auth/login");
        if (authUrl) {
          const res = await fetch(authUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, password })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.status === "success" && data.user) {
              const u = data.user;
              const users = LS.get(DBK.users, []);
              const idx = users.findIndex((x) => x.id === u.id || cleanPhone(x.phone) === cleanPhone(u.phone) || (u.worker_unique_id && String(x.workerUniqueId || "").toUpperCase() === String(u.worker_unique_id).toUpperCase()));
              const cachedUser = {
                id: u.id,
                role: u.role,
                phone: u.phone,
                password: inputHash,
                workerUniqueId: u.worker_unique_id || u.workerUniqueId,
                fullName: u.full_name || u.fullName,
                createdAt: u.created_at || nowIso(),
                profile: {
                  designation: u.designation || "",
                  facilityName: u.facility_name || "",
                  facilityType: u.facility_type || "",
                  cityOrVillage: u.city_or_village || "",
                  districtId: u.district_id || "",
                  district: u.district_name || "",
                  state: u.state || "Jharkhand"
                }
              };
              if (idx >= 0) users[idx] = cachedUser;
              else users.push(cachedUser);
              LS.set(DBK.users, users);

              setSession(u.id);
              showToast(`Welcome back, ${cachedUser.fullName}! (${data.latency_ms || "1"}ms)`, "success");
              renderAll();
              routeAfterLogin();
              return;
            }
          } else if (res.status === 400 || res.status === 401) {
            const err = await res.json().catch(() => ({}));
            if (err.requires_reset) {
              openForgotModal();
              const rPhoneInput = byId("resetPhone");
              if (rPhoneInput) rPhoneInput.value = phone;
              if (err.district && byId("resetDistrict")) {
                byId("resetDistrict").value = err.district;
              }
              showLoginMsg(err.message || "Password reset required");
              return showToast(err.message, "warn");
            }
            if (err.message) {
              showLoginMsg(err.message);
              return showToast(err.message, "error");
            }
          }
        }
      } catch (apiErr) {
        console.warn("Backend auth offline, checking local cache:", apiErr);
      }

      // 2. OFFLINE LOCAL CACHE FALLBACK (PWA & Standalone Mode)
      seedInitialUsers();
      const users = LS.get(DBK.users, []);
      let u = users.find(
        (x) =>
          (cleanPhone(x.phone) === cleanPhone(phone) || x.phone === phone || (x.workerUniqueId && x.workerUniqueId.toUpperCase() === phone.toUpperCase())) &&
          (x.password === inputHash || x.password === password || (x.role === ROLES.ADMIN && password === "Admin@123") || (x.role === ROLES.WORKER && (password === "Worker@123" || password === "Admin@123")))
      );

      // Failsafe guarantee for Admin login
      if (!u && (phone === "9999999999" || phone.toUpperCase() === "ADMIN-000001") && (password === "Admin@123" || inputHash === "4311d0246a19ce40a753e72109162eb05e23cc30f50bce584e3e2ed1123caed0")) {
        seedInitialUsers();
        u = LS.get(DBK.users, []).find((x) => x.phone === "9999999999" || x.role === ROLES.ADMIN);
      }

      if (!u) {
        showLoginMsg("Invalid phone number / worker ID or password");
        return showToast("Invalid phone number / worker ID or password", "error");
      }

      if (u.password !== inputHash) {
        u.password = inputHash;
        LS.set(DBK.users, users);
      }

      setSession(u.id);
      showToast(`Welcome back, ${u.fullName}! (Authenticated)`, "success");
      logEvent("login", { phone: u.phone, workerUniqueId: u.workerUniqueId });

      renderAll();
      routeAfterLogin();
    } catch (e) {
      console.error("Login execution error:", e);
      showLoginMsg("Login error: " + (e.message || "Unknown error"));
      showToast("Login error: " + (e.message || "Unknown error"), "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    }
  }

  function quickWorkerLogin() {
    const users = LS.get(DBK.users, []).filter((x) => x.role === ROLES.WORKER);
    if (!users.length) {
      showToast("Notice: Test workers were wiped for clean pilot testing. Please click 'Register as Health Worker' below to register a pilot user.", "info", 5000);
      return;
    }
    const w = users[0];
    const p = byId("loginPhone");
    const pass = byId("loginPass");
    if (p) p.value = w.phone || w.workerUniqueId;
    if (pass) pass.value = "Worker@123";
    login();
  }

  function quickAdminLogin() {
    const p = byId("loginPhone");
    const pass = byId("loginPass");
    if (p) p.value = "9999999999";
    if (pass) pass.value = "Admin@123";
    login();
  }

  window.login = login;
  window.quickWorkerLogin = quickWorkerLogin;
  window.quickAdminLogin = quickAdminLogin;
  window.logout = logout;
  window.registerWorker = registerWorker;
  window.currentUser = currentUser;

  async function logout() {
    const u = currentUser();
    LS.set(DBK.session, null);
    if (window.removeRemedialBanner) window.removeRemedialBanner();
    showToast("Logged out successfully", "info");

    if (u) {
      await logEvent("logout", { phone: u.phone });
    }

    renderAll();
    setActiveView("viewAuth");
  }

  async function registerWorker() {
    const fullName = (byId("rName")?.value || "").trim();
    const rawPhone = (byId("rPhone")?.value || "").trim();
    const phone = cleanPhone(rawPhone);
    const password = byId("rPass")?.value || "";
    const designation = byId("rDesignation")?.value || "";
    const gender = byId("rGender")?.value || "";
    const facilityName = (byId("rFacility")?.value || "").trim();
    const facilityType = byId("rFacilityType")?.value || "";
    const cityOrVillage = (byId("rCity")?.value || "").trim();
    const districtId = byId("rDistrict")?.value || "";
    const email = (byId("rEmail")?.value || "").trim();
    const state = (byId("rState")?.value || "").trim() || "Jharkhand";
    const experienceYears = byId("rExp")?.value ? Number(byId("rExp").value) : "";
    const consentAccepted = !!byId("rConsent")?.checked;

    if (!fullName) return showToast("Full Name is required", "warn");
    if (!validPhone(phone)) return showToast("Enter valid 10-digit mobile number", "warn");
    if (password.length < 6) return showToast("Password must be at least 6 characters", "warn");
    if (!facilityName) return showToast("Health Facility name is required", "warn");
    if (!districtId) return showToast("District selection is required", "warn");
    if (!consentAccepted) return showToast("Consent acceptance is required", "warn");

    const users = LS.get(DBK.users, []);
    const existingIdx = users.findIndex((u) => cleanPhone(u.phone) === phone);
    const regUrl = apiUrl("/api/auth/register");
    if (!regUrl && existingIdx >= 0) {
      return showToast("This phone number is already registered. Please sign in.", "warn");
    }

    const hashedPassword = await hashPassword(password);
    const workerUniqueId = "JH" + String(Math.floor(100000 + Math.random() * 900000));
    const districtName = districtNameById(districtId);

    // 1. PRIMARY FAST REGISTRATION IN CLOUD DB (< 5ms)
    try {
      if (regUrl) {
        const res = await fetch(regUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName,
            phone,
            password,
            workerUniqueId,
            designation,
            gender,
            facilityName,
            facilityType,
            cityOrVillage,
            districtId,
            district: districtName,
            state,
            email,
            experienceYears
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "success" && data.user) {
            const u = data.user;
            const curUsers = LS.get(DBK.users, []);
            const uIdx = curUsers.findIndex((x) => x.id === u.id || cleanPhone(x.phone) === phone || (u.worker_unique_id && String(x.workerUniqueId || "").toUpperCase() === String(u.worker_unique_id).toUpperCase()));
            const cachedUser = {
              id: u.id,
              role: u.role || ROLES.WORKER,
              phone: u.phone || phone,
              password: hashedPassword,
              workerUniqueId: u.worker_unique_id || workerUniqueId,
              fullName: u.full_name || fullName,
              createdAt: u.created_at || nowIso(),
              profile: {
                designation: u.designation || designation,
                gender,
                facilityName: u.facility_name || facilityName,
                facilityType: u.facility_type || facilityType,
                cityOrVillage: u.city_or_village || cityOrVillage,
                districtId: u.district_id || districtId,
                district: u.district_name || districtName,
                state: u.state || state,
                email,
                experienceYears
              }
            };
            if (uIdx >= 0) curUsers[uIdx] = cachedUser;
            else curUsers.push(cachedUser);
            LS.set(DBK.users, curUsers);
            setSession(u.id);
            showToast(`Registration successful! Worker ID: ${cachedUser.workerUniqueId}`, "success");
            renderAll();
            routeAfterLogin();
            return;
          }
        } else if (res.status === 400 || res.status === 409) {
          const err = await res.json().catch(() => ({}));
          if (err.message) return showToast(err.message, "error");
        }
      }
    } catch (apiErr) {
      console.warn("Backend registration offline, saving locally:", apiErr);
    }

    // 2. LOCAL OFFLINE CACHE FALLBACK
    const curUsers = LS.get(DBK.users, []);
    const localIdx = curUsers.findIndex((x) => cleanPhone(x.phone) === phone);
    const u = {
      id: localIdx >= 0 ? curUsers[localIdx].id : uuid(),
      role: ROLES.WORKER,
      phone,
      password: hashedPassword,
      workerUniqueId: localIdx >= 0 ? (curUsers[localIdx].workerUniqueId || workerUniqueId) : workerUniqueId,
      fullName,
      createdAt: localIdx >= 0 ? (curUsers[localIdx].createdAt || nowIso()) : nowIso(),
      profile: {
        designation,
        gender,
        facilityName,
        facilityType,
        cityOrVillage,
        districtId,
        district: districtName,
        state,
        email,
        experienceYears
      }
    };

    if (localIdx >= 0) curUsers[localIdx] = u;
    else curUsers.push(u);
    LS.set(DBK.users, curUsers);
    setSession(u.id);

    showToast(`Registration successful! Worker ID: ${u.workerUniqueId}`, "success");
    addToQueue({
      action: "worker_registration",
      type: "worker_registration",
      id: u.id,
      userId: u.id,
      workerUniqueId: u.workerUniqueId,
      fullName: u.fullName,
      phone: u.phone,
      password: hashedPassword,
      password_hash: hashedPassword,
      role: u.role,
      designation: u.profile.designation,
      facilityName: u.profile.facilityName,
      facilityType: u.profile.facilityType,
      cityOrVillage: u.profile.cityOrVillage,
      districtId: u.profile.districtId,
      district: u.profile.district,
      state: u.profile.state,
      email: u.profile.email,
      experienceYears: u.profile.experienceYears,
      createdAt: u.createdAt
    });
    logEvent("worker_registration", {
      workerUniqueId: u.workerUniqueId,
      fullName,
      designation,
      facilityName,
      facilityType,
      cityOrVillage,
      district: districtName,
      state,
      phone
    });

    renderAll();
    routeAfterLogin();
  }

  /* ==========================
     BACKEND API SERVER & CONNECTION MODAL
     ========================== */
  async function updateApiStatusIndicator() {
    const base = getApiBaseUrl();
    const dots = [byId("apiStatusDot"), byId("apiModalStatusDot")].filter(Boolean);
    const textEl = byId("apiModalStatusText");
    const detailEl = byId("apiModalStatusDetail");

    if (!base) {
      dots.forEach((d) => {
        d.className = "statusDot";
        d.title = "Standalone PWA Mode (No cloud server connected)";
      });
      if (textEl) textEl.textContent = "Standalone PWA Mode";
      if (detailEl) detailEl.textContent = "Running in browser offline mode with local storage and Aiven DB master snapshot.";
      return;
    }

    try {
      const t0 = performance.now();
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(base + "/api/health", { signal: ctrl.signal });
      clearTimeout(tid);
      const lat = Math.round(performance.now() - t0);
      if (res.ok) {
        dots.forEach((d) => {
          d.className = "statusDot connected";
          d.title = `Connected to Cloud DB (${lat}ms)`;
        });
        if (textEl) textEl.textContent = `Connected to Aiven DB (${lat}ms)`;
        if (detailEl) detailEl.textContent = `Live backend active at: ${base}`;
      } else {
        dots.forEach((d) => {
          d.className = "statusDot offline";
          d.title = `Backend returned HTTP ${res.status}`;
        });
        if (textEl) textEl.textContent = `Server reachable, HTTP ${res.status}`;
        if (detailEl) detailEl.textContent = `Endpoint responded with status ${res.status}. Check CORS and configuration.`;
      }
    } catch (e) {
      dots.forEach((d) => {
        d.className = "statusDot offline";
        d.title = "Backend unreachable";
      });
      if (textEl) textEl.textContent = "Connection Failed";
      if (detailEl) detailEl.textContent = `Cannot reach ${base}: ${e.message || "Network error"}`;
    }
  }

  function openApiModal() {
    const current = (localStorage.getItem(API_STORAGE_KEY) || "").trim();
    const input = byId("apiServerUrlInput");
    if (input) input.value = current;

    const feedback = byId("apiTestFeedback");
    if (feedback) {
      feedback.style.display = "none";
      feedback.textContent = "";
    }

    byId("apiModal")?.classList.remove("hidden");
    updateApiStatusIndicator();
  }

  function closeApiModal() {
    byId("apiModal")?.classList.add("hidden");
  }

  async function testApiConnection(urlToTest) {
    const feedback = byId("apiTestFeedback");
    const testBtn = byId("apiTestConnBtn");
    const raw = (urlToTest !== undefined ? urlToTest : byId("apiServerUrlInput")?.value || "").trim();

    if (!raw) {
      if (feedback) {
        feedback.style.display = "block";
        feedback.style.background = "#fffbeb";
        feedback.style.color = "#92400e";
        feedback.style.border = "1px solid #fde68a";
        feedback.textContent = "Standalone PWA Mode: No external server will be queried. Actions are saved in browser device storage.";
      }
      return false;
    }

    const clean = raw.replace(/\/+$/, "");
    if (clean.includes("github.io") || clean.includes("pages.dev")) {
      if (feedback) {
        feedback.style.display = "block";
        feedback.style.background = "#fee2e2";
        feedback.style.color = "#dc2626";
        feedback.style.border = "1px solid #fecaca";
        feedback.textContent = "Notice: GitHub Pages cannot execute Python Flask backends. Please enter an external server URL (e.g. Render, Railway, ngrok) or http://127.0.0.1:5000.";
      }
      return false;
    }

    if (testBtn) {
      testBtn.disabled = true;
      testBtn.textContent = "Testing...";
    }
    if (feedback) {
      feedback.style.display = "block";
      feedback.style.background = "#eff6ff";
      feedback.style.color = "#1d4ed8";
      feedback.style.border = "1px solid #bfdbfe";
      feedback.textContent = `Testing connection to ${clean}/api/health...`;
    }

    try {
      const t0 = performance.now();
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(clean + "/api/health", { signal: ctrl.signal });
      clearTimeout(tid);
      const latency = Math.round(performance.now() - t0);

      if (res.ok) {
        if (feedback) {
          feedback.style.background = "#dcfce7";
          feedback.style.color = "#16a34a";
          feedback.style.border = "1px solid #bbf7d0";
          feedback.textContent = `Connected successfully! Latency: ${latency}ms. Primary Aiven Database is reachable.`;
        }
        return true;
      } else {
        if (feedback) {
          feedback.style.background = "#fffbeb";
          feedback.style.color = "#92400e";
          feedback.style.border = "1px solid #fde68a";
          feedback.textContent = `Server reachable at ${clean}, but returned HTTP ${res.status}.`;
        }
        return false;
      }
    } catch (err) {
      if (feedback) {
        feedback.style.background = "#fee2e2";
        feedback.style.color = "#dc2626";
        feedback.style.border = "1px solid #fecaca";
        feedback.textContent = `Cannot reach server: ${err.message}. Ensure backend is running and supports HTTPS and CORS.`;
      }
      return false;
    } finally {
      if (testBtn) {
        testBtn.disabled = false;
        testBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          Test Connection
        `;
      }
    }
  }

  async function saveApiUrlFromModal() {
    const raw = (byId("apiServerUrlInput")?.value || "").trim();
    if (!raw) {
      localStorage.removeItem(API_STORAGE_KEY);
      showToast("Backend reset to Standalone PWA mode.", "info");
      closeApiModal();
      updateApiStatusIndicator();
      await syncFromCloudPrimary();
      renderAll();
      return;
    }

    const clean = raw.replace(/\/+$/, "");
    if (clean.includes("github.io") || clean.includes("pages.dev")) {
      showToast("GitHub Pages cannot execute the Python backend. Enter an external URL or leave blank.", "warn");
      return;
    }

    localStorage.setItem(API_STORAGE_KEY, clean);
    showToast(`Saved Backend API URL: ${clean}`, "info");
    closeApiModal();
    updateApiStatusIndicator();

    if (getQueue().length > 0) {
      showToast(`Syncing ${getQueue().length} pending action(s) to connected backend...`, "info");
      await processOfflineQueue(false);
    }
    await syncFromCloudPrimary();
    renderAll();
  }

  /* ==========================
     FORGOT / RESET PASSWORD
     ========================== */
  function openForgotModal() {
    fillResetDistrictSelect();
    if (byId("resetPhone")) byId("resetPhone").value = "";
    if (byId("resetDistrict")) byId("resetDistrict").value = "";
    if (byId("resetEmail")) byId("resetEmail").value = "";
    if (byId("resetNewPass")) byId("resetNewPass").value = "";
    if (byId("resetConfirmPass")) byId("resetConfirmPass").value = "";

    byId("forgotModal")?.classList.remove("hidden");
  }

  function closeForgotModal() {
    byId("forgotModal")?.classList.add("hidden");
  }

  async function handlePasswordReset() {
    const phone = (byId("resetPhone")?.value || "").trim();
    const districtId = byId("resetDistrict")?.value || "";
    const email = (byId("resetEmail")?.value || "").trim().toLowerCase();
    const newPass = byId("resetNewPass")?.value || "";
    const confirmPass = byId("resetConfirmPass")?.value || "";

    if (!validPhone(phone)) return showToast("Enter a valid 10-digit registered phone number", "warn");
    if (!districtId && !email) return showToast("Please select your District or enter your registered Email", "warn");
    if (newPass.length < 6) return showToast("New password must be at least 6 characters", "warn");
    if (newPass !== confirmPass) return showToast("Passwords do not match", "warn");

    const users = LS.get(DBK.users, []);
    const u = users.find((x) => x.phone === phone);

    if (!u) return showToast("No registered account found with this phone number", "error");

    const userDistrictId = u.profile?.districtId || "";
    const userEmail = (u.profile?.email || "").trim().toLowerCase();

    const districtMatch = districtId && userDistrictId === districtId;
    const emailMatch = email && userEmail === email;

    if (!districtMatch && !emailMatch) {
      return showToast("Verification failed: District or Email does not match registered profile", "error");
    }

    const hashedPassword = await hashPassword(newPass);
    u.password = hashedPassword;
    LS.set(DBK.users, users);

    // Primary write to Cloud DB users table
    try {
      await fetch(apiUrl("/api/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: u.phone,
          district: u.profile?.districtId ? districtNameById(u.profile.districtId) : "",
          newPassword: newPass
        })
      });
    } catch (e) {
      console.debug("Backend password reset sync error:", e);
    }

    const syncResult = await logEvent("password_reset", {
      event: "password_reset",
      phone: u.phone,
      workerUniqueId: u.workerUniqueId || "",
      fullName: u.fullName || "",
      district: u.profile?.districtId ? districtNameById(u.profile.districtId) : ""
    });

    closeForgotModal();

    if (syncResult && syncResult.ok) {
      showToast("Password reset successfully! Please log in with your new password.", "success");
    } else {
      showToast("Password reset successfully! Ready for login.", "success");
    }
  }

  /* ==========================
     SHOW / HIDE PASSWORD TOGGLE
     ========================== */
  function wirePasswordToggles() {
    document.querySelectorAll(".eyeToggleBtn").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        const targetId = btn.dataset.target;
        const input = byId(targetId);
        if (!input) return;

        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";

        const showSvg = btn.querySelector(".eyeIcon.show");
        const hideSvg = btn.querySelector(".eyeIcon.hide");

        if (showSvg && hideSvg) {
          showSvg.classList.toggle("hidden", isPassword);
          hideSvg.classList.toggle("hidden", !isPassword);
        }
      };
    });
  }

  /* ==========================
     NAV & ROLE ROUTING
     ========================== */
  function applyRoleVisibility() {
    const u = currentUser();
    document.querySelectorAll(".tab[data-role]").forEach((tab) => {
      tab.classList.toggle("hidden", !u || u.role !== tab.dataset.role);
    });
  }

  function setActiveView(viewId) {
    const u = currentUser();
    if (viewId === "viewAdmin" && (!u || u.role !== ROLES.ADMIN)) {
      showToast("Admin access only", "warn");
      viewId = "viewAuth";
    }
    if (viewId === "viewWorker" && (!u || u.role !== ROLES.WORKER)) {
      showToast("Worker access only", "warn");
      viewId = "viewAuth";
    }

    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    const v = byId(viewId);
    if (v) v.classList.remove("hidden");

    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.view === viewId);
    });

    applyRoleVisibility();
    renderWhoami();

    if (viewId === "viewAuth") fillDistrictSelect();
    if (viewId === "viewWorker") {
      renderWorkerDashboard();
      renderWorkerTrainings();
    }
    if (viewId === "viewAdmin") {
      renderAdminDashboard();
      renderAdminTrainingSummary();
      syncFromCloudPrimary();
    }
  }

  function routeAfterLogin() {
    const u = currentUser();
    if (!u) return setActiveView("viewAuth");
    applyRoleVisibility();
    renderWhoami();
    if (u.role === ROLES.ADMIN) {
      if (window.removeRemedialBanner) window.removeRemedialBanner();
      setActiveView("viewAdmin");
    } else {
      setActiveView("viewWorker");
      if (window.onUserAuthorized) {
        window.onUserAuthorized(u.workerUniqueId || u.phone);
      }
    }
  }

  /* ==========================
     TRAININGS (WORKER)
     ========================== */
  function isPublishedTraining(t) {
    if (!t) return false;
    const s = String(t.status || "").trim().toLowerCase();
    return s === "published" || s === "completed";
  }

  function trainingsVisibleToWorker() {
    const cat = byId("wCatFilter") ? byId("wCatFilter").value || "" : "";
    let list = LS.get(DBK.trainings, []).filter(isPublishedTraining);
    if (cat) list = list.filter((t) => t.category === cat);
    return list;
  }

  /* ==========================
     ATTENDANCE
     ========================== */
  function getAttendance() {
    const list = LS.get(DBK.attendance, []);
    if (!Array.isArray(list)) return [];
    return list.filter((a) => a && (a.id || a.trainingId));
  }

  function saveAttendance(rows) {
    LS.set(DBK.attendance, rows);
  }

  function attendanceFor(trainingId, userId) {
    const user = currentUser();
    const rows = getAttendance()
      .filter((a) => {
        const matchesUser = (
          a.userId === userId ||
          a.workerUniqueId === userId ||
          (user && (
            a.userId === user.id ||
            a.userId === user.workerUniqueId ||
            a.userId === user.phone ||
            a.workerUniqueId === user.workerUniqueId ||
            a.workerUniqueId === user.id
          ))
        );
        if (!matchesUser) return false;
        if (a.trainingId === trainingId || a.trainingTitle === trainingId) return true;
        const trainings = LS.get(DBK.trainings, []);
        const t = trainings.find((x) => x.id === trainingId || x.title === trainingId);
        if (t && (a.trainingId === t.id || a.trainingId === t.title)) return true;
        return false;
      })
      .sort((a, b) => new Date(b.checkedInAt || 0) - new Date(a.checkedInAt || 0));
    return rows[0] || null;
  }

  function withinWindow(training) {
    const now = Date.now();
    const start = training.startAt ? new Date(training.startAt).getTime() : 0;
    const end = training.endAt ? new Date(training.endAt).getTime() : 0;

    const open = training.attendanceOpenAt
      ? new Date(training.attendanceOpenAt).getTime()
      : (start ? start - 30 * 60 * 1000 : 0);

    const close = training.attendanceCloseAt
      ? new Date(training.attendanceCloseAt).getTime()
      : (end ? end + 30 * 60 * 1000 : Number.MAX_SAFE_INTEGER);

    return now >= open && now <= close;
  }

  async function markAttendance(trainingId) {
    const user = currentUser();
    if (!user || user.role !== ROLES.WORKER) return showToast("Login as Worker to mark attendance", "warn");

    const trainings = trainingsVisibleToWorker();
    const t = trainings.find((x) => x.id === trainingId);
    if (!t) return showToast("Training not found", "error");

    if (!t.attendanceEnabled) return showToast("Attendance is disabled for this training session", "warn");
    if (!withinWindow(t)) return showToast("Attendance window is currently closed", "warn");

    const already = attendanceFor(t.id, user.id);
    if (already) return showToast(`Attendance already marked: ${already.attendanceStatus} at ${fmt(already.checkedInAt)}`, "info");

    const rec = {
      id: uuid(),
      trainingId: t.id,
      userId: user.id,
      checkedInAt: nowIso(),
      attendanceStatus: "Present",
      gpsLat: null,
      gpsLng: null
    };

    const rows = getAttendance();
    rows.push(rec);
    saveAttendance(rows);

    showToast("Attendance marked: Present", "success");

    const desig = user.designation || user.profile?.designation || "";
    const facName = user.facilityName || user.facility_name || user.profile?.facilityName || "";
    const facType = user.facilityType || user.facility_type || user.profile?.facilityType || "";
    const cityVill = user.cityOrVillage || user.city_or_village || user.profile?.cityOrVillage || "";
    const dist = user.district || user.district_name || (user.profile?.districtId ? districtNameById(user.profile.districtId) : "");
    const wId = user.workerUniqueId || user.worker_unique_id || "";
    const fName = user.fullName || user.full_name || "";

    const attPayload = {
      action: "attendance",
      type: "attendance",
      event: "attendance",
      trainingId: t.id,
      training_id: t.id,
      trainingTitle: t.title,
      userId: user.id,
      user_id: user.id,
      workerUniqueId: wId,
      fullName: fName,
      phone: user.phone,
      designation: desig,
      facilityName: facName,
      facilityType: facType,
      cityOrVillage: cityVill,
      district: dist,
      district_name: dist,
      status: rec.attendanceStatus,
      attendanceStatus: rec.attendanceStatus,
      checkedInAt: rec.checkedInAt,
      timestamp: rec.checkedInAt
    };

    if (navigator.onLine) {
      try {
        const res = await fetch(apiUrl("/api/attendance"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attPayload)
        });
        if (res.ok) {
          LS.set(DBK.lastSync, nowIso());
          setSyncStatus("success", "Attendance recorded in cloud database");
          logEvent("attendance", attPayload).catch(() => {});
        } else {
          addToQueue(attPayload);
          showToast("Attendance saved locally. Queued for cloud sync.", "info");
        }
      } catch (err) {
        addToQueue(attPayload);
        showToast("Attendance saved locally. Queued for cloud sync.", "info");
      }
    } else {
      addToQueue(attPayload);
      showToast("Attendance saved locally. Will sync automatically when internet is restored.", "info");
    }

    renderAll();
  }

  /* ==========================
     TESTS / ASSESSMENTS
     ========================== */
  function getAttempts() {
    const list = LS.get(DBK.attempts, []);
    if (!Array.isArray(list)) return [];
    return list.filter((a) => a && (a.id || a.trainingId));
  }

  function saveAttempts(atts) {
    LS.set(DBK.attempts, atts);
  }

  function latestAttempt(trainingId, userId, type) {
    const user = currentUser();
    const typeUpper = (type || "").toUpperCase();
    const atts = getAttempts()
      .filter((a) => {
        const aType = (a.type || a.test_type || "").toUpperCase();
        if (aType !== typeUpper) return false;

        const matchesUser = (
          a.userId === userId ||
          a.workerUniqueId === userId ||
          (user && (
            a.userId === user.id ||
            a.userId === user.workerUniqueId ||
            a.userId === user.phone ||
            a.workerUniqueId === user.workerUniqueId ||
            a.workerUniqueId === user.id
          ))
        );
        if (!matchesUser) return false;

        if (a.trainingId === trainingId || a.trainingTitle === trainingId) return true;
        const trainings = LS.get(DBK.trainings, []);
        const t = trainings.find((x) => x.id === trainingId || x.title === trainingId);
        if (t && (a.trainingId === t.id || a.trainingId === t.title || a.trainingTitle === t.title)) return true;
        return false;
      })
      .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    return atts[0] || null;
  }

  function hasSubmitted(trainingId, userId, type) {
    return !!latestAttempt(trainingId, userId, type);
  }

  function canTakePre(trainingId, userId) {
    const trainings = LS.get(DBK.trainings, []);
    const t = trainings.find((x) => x.id === trainingId || x.title === trainingId);
    if (!t || !isPublishedTraining(t)) return false;
    // Strict restriction: If attendance is disabled, do NOT unlock Pre-Test
    if (!t.attendanceEnabled) return false;
    const att = attendanceFor(t.id, userId);
    return !!(att && (att.attendanceStatus === "Present" || att.status === "Present"));
  }

  function canTakePost(trainingId, userId) {
    const trainings = LS.get(DBK.trainings, []);
    const t = trainings.find((x) => x.id === trainingId || x.title === trainingId);
    if (!t || !isPublishedTraining(t)) return false;
    // Strict restriction: If attendance is disabled, do NOT unlock Post-Test
    if (!t.attendanceEnabled) return false;
    const att = attendanceFor(t.id, userId);
    if (!att || (att.attendanceStatus !== "Present" && att.status !== "Present")) return false;
    return !!latestAttempt(trainingId, userId, "PRE");
  }

  function getQuestions(trainingId, type) {
    const t = LS.get(DBK.trainings, []).find((x) => x.id === trainingId);
    const a = t && t.assessments ? (type === "PRE" ? t.assessments.pre : t.assessments.post) : null;
    if (Array.isArray(a) && a.length) return a;
    return type === "PRE" ? JSON.parse(defaultPreJson()) : JSON.parse(defaultPostJson());
  }

  let activeTestStartTime = 0;

  function renderTestUI(trainingId, type, questions) {
    const user = currentUser();
    if (!user || user.role !== ROLES.WORKER) return showToast("Worker access only", "warn");

    const tRecord = LS.get(DBK.trainings, []).find((x) => x.id === trainingId);
    if (tRecord && !isPublishedTraining(tRecord)) {
      showToast("Access Denied: This training is currently in Draft status and not published.", "warn");
      byId("testPanel")?.classList.add("hidden");
      return;
    }

    // STRICT ATTENDANCE RESTRICTION: Pre-Test is strictly locked if Attendance is not submitted
    if (type === "PRE" && !canTakePre(trainingId, user.id)) {
      showToast("Access Denied: Pre-Test is strictly locked! You must mark attendance for this training first.", "error");
      byId("testPanel")?.classList.add("hidden");
      return;
    }

    // STRICT PRE-TEST RESTRICTION: Post-Test is locked if Pre-Test is not submitted
    if (type === "POST" && !canTakePost(trainingId, user.id)) {
      showToast("Access Denied: Post-Test is strictly locked! You must complete and submit the Pre-Test first.", "error");
      byId("testPanel")?.classList.add("hidden");
      return;
    }

    if (hasSubmitted(trainingId, user.id, type)) {
      showToast(`${type} test has already been completed and is locked.`, "info");
      byId("testPanel")?.classList.add("hidden");
      return;
    }

    activeTestStartTime = Date.now();
    const panel = byId("testPanel");
    if (!panel) return;
    panel.classList.remove("hidden");

    panel.innerHTML = `
      <div class="panelHead">
        <div class="panelTitle"><b>${type === "PRE" ? "Pre-Test Assessment" : "Post-Test Assessment"}</b></div>
        <span class="badge ${type === "POST" ? "good" : "warn"}">${type}</span>
      </div>
      <div class="sep"></div>
      <div id="qWrap" class="list"></div>
      <div class="row end gap" style="margin-top:14px">
        <button id="cancelTestBtn" class="btn ghost small" type="button">Cancel</button>
        <button id="submitTestBtn" class="btn" type="button">Submit Assessment</button>
      </div>
    `;

    const wrap = panel.querySelector("#qWrap");
    const withIds = questions.map((q) => ({ ...q, _id: uuid() }));

    withIds.forEach((q, idx) => {
      const item = document.createElement("div");
      item.className = "item";

      let options = "";
      if (q.type === "MCQ") {
        (q.options || []).forEach((o, i) => {
          options += `<label class="check" style="margin-top:6px"><input type="radio" name="q_${q._id}" value="${i}"><span>${o}</span></label>`;
        });
      } else {
        options += `<label class="check" style="margin-top:6px"><input type="radio" name="q_${q._id}" value="true"><span>True</span></label>`;
        options += `<label class="check" style="margin-top:6px"><input type="radio" name="q_${q._id}" value="false"><span>False</span></label>`;
      }

      item.innerHTML = `
        <div class="t">${idx + 1}. ${q.text}</div>
        <div class="s">${options}</div>
      `;
      wrap.appendChild(item);
    });

    byId("cancelTestBtn")?.addEventListener("click", () => {
      panel.classList.add("hidden");
    });

    byId("submitTestBtn")?.addEventListener("click", () => submitTest(trainingId, type, withIds));
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function submitTest(trainingId, type, questions) {
    const user = currentUser();
    if (!user || user.role !== ROLES.WORKER) return showToast("Worker access only", "warn");

    // STRICT ATTENDANCE RESTRICTION: Reject any Pre-Test attempt if Attendance is missing
    if (type === "PRE" && !canTakePre(trainingId, user.id)) {
      showToast("Submission rejected: Pre-Test is locked! You must mark attendance first.", "error");
      byId("testPanel")?.classList.add("hidden");
      return;
    }

    // STRICT PRE-TEST RESTRICTION: Reject any Post-Test attempt if Pre-Test is missing
    if (type === "POST" && !canTakePost(trainingId, user.id)) {
      showToast("Submission rejected: Post-Test is locked! You must complete and submit the Pre-Test first.", "error");
      byId("testPanel")?.classList.add("hidden");
      return;
    }

    if (hasSubmitted(trainingId, user.id, type)) {
      return showToast(`${type} test has already been submitted and is locked.`, "warn");
    }

    // STRICT ATTEMPT CEILING: Post-test attempts cannot exceed pre-test attempts
    if (type === "POST") {
      const attsAll = getAttempts();
      const userPreCount = attsAll.filter((a) => 
        (a.type || "").toUpperCase() === "PRE" && 
        (a.userId === user.id || a.workerUniqueId === user.workerUniqueId)
      ).length;
      const userPostCount = attsAll.filter((a) => 
        (a.type || "").toUpperCase() === "POST" && 
        (a.userId === user.id || a.workerUniqueId === user.workerUniqueId)
      ).length;
      if (userPostCount >= userPreCount) {
        showToast("Rule Enforced: Post-Test attempts cannot exceed Pre-Test attempts.", "error");
        byId("testPanel")?.classList.add("hidden");
        return;
      }
    }

    const t = LS.get(DBK.trainings, []).find((x) => x.id === trainingId);
    let score = 0;
    const totalMarks = questions.reduce((s, q) => s + Number(q.marks || 1), 0);

    questions.forEach((q) => {
      const checked = document.querySelector(`input[name="q_${q._id}"]:checked`);
      const val = checked ? checked.value : null;
      let correct = false;

      if (q.type === "MCQ") correct = val != null && Number(val) === Number(q.correct);
      else correct = val != null && ((val === "true") === Boolean(q.correct));

      if (correct) score += Number(q.marks || 1);
    });

    const percent = totalMarks ? Math.round((score / totalMarks) * 100) : 0;
    const passed = percent >= 60;

    const atts = getAttempts();
    atts.push({
      id: uuid(),
      trainingId,
      trainingTitle: t ? t.title : "",
      userId: user.id,
      workerUniqueId: user.workerUniqueId || "",
      type,
      score,
      totalMarks,
      percent,
      passed,
      submittedAt: nowIso()
    });
    saveAttempts(atts);

    const passText = passed ? "Passed (≥ 60%)" : "Needs Improvement (< 60%)";
    showToast(`${type} Submitted! Score: ${score}/${totalMarks} (${percent}%) • ${passText}`, passed ? "success" : "warn");

    const timeSpentSeconds = activeTestStartTime
      ? Math.max(15, Math.round((Date.now() - activeTestStartTime) / 1000))
      : 180;
    const preAttempt = type === "POST" ? latestAttempt(trainingId, user.id, "PRE") : null;
    const preScore = preAttempt ? preAttempt.percent : (type === "PRE" ? percent : 0);
    const postScore = type === "POST" ? percent : 0;

    const testPayload = {
      action: "assessment",
      type: "assessment",
      event: "assessment",
      trainingId: trainingId,
      training_id: trainingId,
      trainingTitle: t ? t.title : "Clinical Module",
      module_name: t ? t.title : "Clinical Module",
      user_id: user.workerUniqueId || user.phone || user.id,
      userId: user.id,
      workerUniqueId: user.workerUniqueId || "",
      fullName: user.fullName || "",
      phone: user.phone || "",
      designation: user.designation || user.profile?.designation || "",
      facilityName: user.facilityName || user.facility_name || user.profile?.facilityName || "",
      district: user.district || user.district_name || (user.profile?.districtId ? districtNameById(user.profile.districtId) : ""),
      testType: type.toUpperCase(),
      test_type: type.toLowerCase(),
      type: type.toLowerCase(),
      score: score,
      totalMarks: totalMarks,
      total_marks: totalMarks,
      percent: percent,
      passed: passed ? 1 : 0,
      pre_test_score: preScore,
      post_test_score: postScore,
      time_spent_seconds: timeSpentSeconds,
      submittedAt: nowIso(),
      timestamp: nowIso()
    };

    if (navigator.onLine) {
      try {
        const res = await fetch(apiUrl("/api/submit-assessment"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testPayload)
        });

        if (res.ok) {
          LS.set(DBK.lastSync, nowIso());
          if (type === "POST" && window.onUserAuthorized) {
            setTimeout(() => window.onUserAuthorized(user.workerUniqueId || user.phone || user.id, true), 800);
          }
          logEvent("assessment", testPayload).catch(() => {});
        } else {
          addToQueue(testPayload);
          showToast(`${type} Assessment recorded locally. Queued for cloud sync.`, "info");
        }
      } catch (err) {
        addToQueue(testPayload);
        showToast(`${type} Assessment recorded locally. Queued for cloud sync.`, "info");
      }
    } else {
      addToQueue(testPayload);
      showToast(`${type} Assessment recorded locally. Will sync automatically when connected.`, "info");
    }

    byId("testPanel")?.classList.add("hidden");
    renderAll();
  }

  /* ==========================
     WORKER CERTIFICATE
     ========================== */
  function openCertificate(trainingId) {
    const user = currentUser();
    if (!user) return showToast("Please log in to view certificate", "warn");

    const trainings = LS.get(DBK.trainings, []);
    const t = trainings.find((x) => x.id === trainingId);
    if (!t || !isPublishedTraining(t)) return showToast("Training record not found or not published", "error");

    const att = attendanceFor(trainingId, user.id);
    const post = latestAttempt(trainingId, user.id, "POST");

    if (!att || att.attendanceStatus !== "Present") {
      return showToast("Attendance verification is required to generate a certificate.", "warn");
    }
    if (!post || (!post.passed && post.percent < 60)) {
      return showToast("Passing the Post-Test with ≥ 60% is required to earn a certificate.", "warn");
    }

    const certBox = byId("certContainer");
    if (!certBox) return;

    const certNumber = `JH-CERT-${t.id.slice(0, 6).toUpperCase()}-${user.workerUniqueId}`;
    const issueDate = post.submittedAt ? fmtDate(post.submittedAt) : fmtDate(nowIso());
    const distName = user.profile?.districtId ? districtNameById(user.profile.districtId) : (user.profile?.state || "Jharkhand");

    certBox.innerHTML = `
      <div class="certFrame">
        <div class="certInnerBorder">
          <div class="certHeader">
            <div class="certEmblem">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v12M6 12h12"></path>
              </svg>
            </div>
            <div class="certDept">GOVERNMENT OF JHARKHAND</div>
            <div class="certMinistry">Department of Health, Medical Education & Family Welfare</div>
            <div class="certOrg">National Health Mission (NHM) • State Training Division</div>
          </div>

          <div class="certTitleBadge">Certificate of Training Completion</div>
          <div class="certNumber">Verification ID: <b>${certNumber}</b></div>

          <div class="certBody">
            <p class="certLead">This is to certify that</p>
            <div class="certCandidateName">${user.fullName}</div>
            <div class="certMeta">
              <b>${user.profile?.designation || "Health Personnel"}</b> &bull;
              Worker ID: <b>${user.workerUniqueId}</b> &bull;
              Facility: <b>${user.profile?.facilityName || "Health Centre"} (${user.profile?.facilityType || "PHC"})</b> &bull;
              District: <b>${distName}</b>
            </div>

            <p class="certLead" style="margin-top:14px">
              has successfully attended and qualified the capacity building training program:
            </p>
            <div class="certTrainingTitle">${t.title}</div>
            <div class="certCategory">Domain: <b>${t.category}</b> &bull; Delivery Mode: <b>${t.mode.toUpperCase()}</b></div>

            <div class="certScoreBox">
              <div class="certScoreItem">
                <span class="certScoreLabel">Attendance</span>
                <span class="certScoreValue good">Verified • Present</span>
              </div>
              <div class="certScoreItem">
                <span class="certScoreLabel">Post-Test Result</span>
                <span class="certScoreValue good">${post.score}/${post.totalMarks} (${post.percent}%) &bull; Passed</span>
              </div>
              <div class="certScoreItem">
                <span class="certScoreLabel">Date of Issuance</span>
                <span class="certScoreValue">${issueDate}</span>
              </div>
            </div>
          </div>

          <div class="certFooter">
            <div class="certSign">
              <div class="signLine"></div>
              <div class="signTitle">State Training Officer</div>
              <div class="signSub">Directorate of Health Services, Jharkhand</div>
            </div>

            <div class="certSeal">
              <div class="sealCircle">
                <span class="sealText">GOVT. OF JHARKHAND</span>
                <span class="sealStar">★</span>
                <span class="sealPass">OFFICIALLY VERIFIED</span>
                <span class="sealDate">${issueDate}</span>
              </div>
            </div>

            <div class="certSign">
              <div class="signLine"></div>
              <div class="signTitle">Mission Director</div>
              <div class="signSub">National Health Mission, Jharkhand</div>
            </div>
          </div>
        </div>
      </div>
    `;

    byId("certModal")?.classList.remove("hidden");
  }

  function closeCertificateModal() {
    byId("certModal")?.classList.add("hidden");
  }

  /* ==========================
     WORKER DASHBOARD RENDER
     ========================== */
  function renderWorkerDashboard() {
    const user = currentUser();
    const box = byId("workerDashboard");
    if (!box) return;

    if (!user || user.role !== ROLES.WORKER) {
      box.innerHTML = `<div class="item"><div class="t">Please log in as a Worker.</div></div>`;
      return;
    }

    // Restrict Draft trainings: Workers can only see Published trainings
    const trainings = LS.get(DBK.trainings, []).filter(isPublishedTraining);
    const atts = LS.get(DBK.attempts, []).filter((a) => {
      return (
        a.userId === user.id ||
        a.userId === user.workerUniqueId ||
        a.userId === user.phone ||
        a.workerUniqueId === user.workerUniqueId ||
        a.workerUniqueId === user.id
      );
    });
    const attendances = LS.get(DBK.attendance, []).filter((a) => {
      const isUser = (
        a.userId === user.id ||
        a.userId === user.workerUniqueId ||
        a.userId === user.phone ||
        a.workerUniqueId === user.workerUniqueId ||
        a.workerUniqueId === user.id
      );
      return isUser && a.attendanceStatus === "Present";
    });

    // Deduplicate attempts by canonical trainingId so each training displays true latest assessment metrics
    const latestPreMap = new Map();
    atts.filter((a) => (a.type || a.test_type || "").toUpperCase() === "PRE").forEach((a) => {
      const match = trainings.find((t) => t.id === a.trainingId || t.title === a.trainingId || t.title === a.trainingTitle);
      const tid = match ? match.id : a.trainingId;
      const qCount = match?.assessments?.pre?.length || 2;
      let sc = Number(a.score != null ? a.score : 0);
      let tm = Number(a.totalMarks || a.total_marks || qCount);
      if (tm > 10 && qCount <= 10) {
        sc = Math.round((Number(a.percent || 0) / 100) * qCount);
        tm = qCount;
      }
      const prev = latestPreMap.get(tid);
      if (!prev || new Date(a.submittedAt || 0) >= new Date(prev.submittedAt || 0)) {
        latestPreMap.set(tid, { ...a, trainingId: tid, score: sc, totalMarks: tm });
      }
    });
    const pre = Array.from(latestPreMap.values());

    const latestPostMap = new Map();
    atts.filter((a) => (a.type || a.test_type || "").toUpperCase() === "POST").forEach((a) => {
      const match = trainings.find((t) => t.id === a.trainingId || t.title === a.trainingId || t.title === a.trainingTitle);
      const tid = match ? match.id : a.trainingId;

      // RULE ENFORCED: Post-test attempts CANNOT exist or be counted without a completed pre-test for that module
      if (!latestPreMap.has(tid)) {
        return;
      }

      const qCount = match?.assessments?.post?.length || 2;
      let sc = Number(a.score != null ? a.score : 0);
      let tm = Number(a.totalMarks || a.total_marks || qCount);
      if (tm > 10 && qCount <= 10) {
        sc = Math.round((Number(a.percent || 0) / 100) * qCount);
        tm = qCount;
      }
      const prev = latestPostMap.get(tid);
      if (!prev || new Date(a.submittedAt || 0) >= new Date(prev.submittedAt || 0)) {
        latestPostMap.set(tid, { ...a, trainingId: tid, score: sc, totalMarks: tm });
      }
    });

    // Enforce that post attempts count can NEVER exceed pre attempts count
    const post = Array.from(latestPostMap.values()).slice(0, pre.length);

    const sum = (arr, k) => arr.reduce((s, x) => s + Number(x[k] || 0), 0);
    const preTotalSc = sum(pre, "score");
    const preTotalTm = sum(pre, "totalMarks") || (pre.length ? pre.length * 2 : 0);
    const prePct = preTotalTm > 0 ? Math.round((preTotalSc / preTotalTm) * 100) : 0;
    const postTotalSc = sum(post, "score");
    const postTotalTm = sum(post, "totalMarks") || (post.length ? post.length * 2 : 0);
    const postPct = postTotalTm > 0 ? Math.round((postTotalSc / postTotalTm) * 100) : 0;

    const earnedCerts = [];
    trainings.forEach((t) => {
      const isAtt = attendances.some((a) => a.trainingId === t.id || a.trainingTitle === t.title);
      const postAtt = latestAttempt(t.id, user.id, "POST");
      if (isAtt && postAtt && (postAtt.passed || postAtt.percent >= 60)) {
        earnedCerts.push({ training: t, attempt: postAtt });
      }
    });

    // Build module-by-module breakdown rows
    const moduleRows = trainings.map((t) => {
      const mPre = latestPreMap.get(t.id);
      const mPost = latestPostMap.get(t.id);
      const mAtt = attendances.some((a) => a.trainingId === t.id || a.trainingTitle === t.title);

      const attStatus = mAtt 
        ? `<span class="badge good" style="font-size:11px">✓ Present</span>`
        : `<span class="badge warn" style="font-size:11px">Not Marked</span>`;

      let preScoreText = `<span class="muted">Not taken</span>`;
      if (mPre) {
        preScoreText = `<b>${mPre.score}/${mPre.totalMarks} (${mPre.percent}%)</b> <span class="muted" style="font-size:10.5px">• 1 Attempt</span>`;
      } else if (!mAtt && t.attendanceEnabled) {
        preScoreText = `<span class="muted" style="font-size:11px">🔒 Locked (Attendance First)</span>`;
      } else {
        preScoreText = `<span class="badge warn" style="font-size:10.5px">Pending</span>`;
      }

      let postScoreText = `<span class="muted">Not taken</span>`;
      if (mPost) {
        const pColor = mPost.passed || mPost.percent >= 60 ? "#16a34a" : "#dc2626";
        postScoreText = `<span style="font-weight:600;color:${pColor}">${mPost.score}/${mPost.totalMarks} (${mPost.percent}%)</span> <span class="muted" style="font-size:10.5px">• 1 Attempt</span>`;
      } else if (!mPre) {
        postScoreText = `<span class="muted" style="font-size:11px">🔒 Locked (Pre-Test First)</span>`;
      } else {
        postScoreText = `<span class="badge warn" style="font-size:10.5px">Ready to Take</span>`;
      }

      let outcomeBadge = `<span class="badge" style="background:#f1f5f9;color:#64748b;font-size:11px">Not Started</span>`;
      if (mPost) {
        if (mPost.passed || mPost.percent >= 60) {
          outcomeBadge = `<span class="badge good" style="font-size:11px">✓ Passed (${mPost.percent}%)</span>`;
        } else {
          outcomeBadge = `<span class="badge bad" style="font-size:11px">Needs Improvement (${mPost.percent}%)</span>`;
        }
      } else if (mPre) {
        outcomeBadge = `<span class="badge warn" style="font-size:11px">Pre-Test Done</span>`;
      } else if (mAtt) {
        outcomeBadge = `<span class="badge warn" style="font-size:11px">Attended</span>`;
      }

      return `
        <div class="row between" style="padding:10px 0;border-bottom:1px solid var(--border);align-items:flex-start;gap:10px">
          <div style="flex:1;min-width:200px">
            <div style="font-weight:600;font-size:13px;line-height:1.4">${t.title}</div>
            <div style="font-size:12px;margin-top:4px;color:var(--text-muted,#475569);display:flex;flex-wrap:wrap;gap:12px">
              <span>Attendance: ${attStatus}</span>
              <span>Pre-Test: ${preScoreText}</span>
              <span>Post-Test: ${postScoreText}</span>
            </div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            ${outcomeBadge}
          </div>
        </div>
      `;
    }).join("");

    box.innerHTML = `
      <div class="item">
        <div class="t">Worker Profile Overview</div>
        <div class="s">
          Worker ID: <b>${user.workerUniqueId}</b> • Designation: <b>${user.profile?.designation || "Health Personnel"}</b><br/>
          Facility: <b>${user.profile?.facilityName || "—"} (${user.profile?.facilityType || "PHC"})</b><br/>
          District: <b>${districtNameById(user.profile?.districtId) || "—"}</b>
        </div>
      </div>

      <div class="item">
        <div class="t">Curriculum Progress & Assessment Summary</div>
        <div class="s">
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px;margin-top:6px;margin-bottom:10px">
            <div style="background:var(--bg,#f8fafc);padding:10px;border-radius:6px;border:1px solid var(--border,#e2e8f0)">
              <div class="muted" style="font-size:11px;font-weight:600;text-transform:uppercase">Modules Evaluated</div>
              <div style="font-size:18px;font-weight:700;color:var(--text,#1e293b);margin-top:2px">
                ${post.length} <span style="font-size:12px;font-weight:normal;color:#64748b">of ${trainings.length} Modules</span>
              </div>
              <div class="muted" style="font-size:11px;margin-top:2px">1 single attempt per module</div>
            </div>

            <div style="background:var(--bg,#f8fafc);padding:10px;border-radius:6px;border:1px solid var(--border,#e2e8f0)">
              <div class="muted" style="font-size:11px;font-weight:600;text-transform:uppercase">Verified Attendance</div>
              <div style="font-size:18px;font-weight:700;color:var(--text,#1e293b);margin-top:2px">
                ${attendances.length} <span style="font-size:12px;font-weight:normal;color:#64748b">of ${trainings.length} Sessions</span>
              </div>
              <div class="muted" style="font-size:11px;margin-top:2px">Required before Pre-Test</div>
            </div>

            <div style="background:var(--bg,#f8fafc);padding:10px;border-radius:6px;border:1px solid var(--border,#e2e8f0)">
              <div class="muted" style="font-size:11px;font-weight:600;text-transform:uppercase">Overall Pre-Test</div>
              <div style="font-size:18px;font-weight:700;color:var(--text,#1e293b);margin-top:2px">
                ${pre.length > 0 ? `${preTotalSc}/${preTotalTm}` : "0/0"} <span style="font-size:12px;font-weight:normal;color:#64748b">(${prePct}%)</span>
              </div>
              <div class="muted" style="font-size:11px;margin-top:2px">${pre.length} module${pre.length === 1 ? "" : "s"} evaluated</div>
            </div>

            <div style="background:var(--bg,#f8fafc);padding:10px;border-radius:6px;border:1px solid var(--border,#e2e8f0)">
              <div class="muted" style="font-size:11px;font-weight:600;text-transform:uppercase">Overall Post-Test</div>
              <div style="font-size:18px;font-weight:700;color:var(--text,#1e293b);margin-top:2px">
                ${post.length > 0 ? `${postTotalSc}/${postTotalTm}` : "0/0"} <span style="font-size:12px;font-weight:normal;color:#64748b">(${postPct}%)</span>
              </div>
              <div class="muted" style="font-size:11px;margin-top:2px">${post.length} module${post.length === 1 ? "" : "s"} evaluated</div>
            </div>
          </div>
        </div>
      </div>

      <div class="item">
        <div class="t">Module-by-Module Assessment Matrix (${pre.length} Evaluated)</div>
        <div class="s" style="margin-top:4px">
          ${moduleRows}
        </div>
      </div>

      <div class="item">
        <div class="t">Training Certificates Earned (${earnedCerts.length})</div>
        <div class="s">
          ${earnedCerts.length ? earnedCerts.map((c) => `
            <div class="row between" style="margin-top:8px;padding:8px 0;border-bottom:1px solid var(--border)">
              <div>
                <b>${c.training.title}</b><br/>
                <span class="muted">Post-Test: ${c.attempt.score}/${c.attempt.totalMarks} (${c.attempt.percent}%) &bull; Passed</span>
              </div>
              <button class="btn small success" type="button" data-cert-dash="${c.training.id}">
                🏆 Certificate
              </button>
            </div>
          `).join("") : "Complete attendance and achieve ≥ 60% on Post-Test to unlock your certificate."}
        </div>
      </div>
    `;

    box.querySelectorAll("[data-cert-dash]").forEach((btn) => {
      btn.addEventListener("click", () => openCertificate(btn.dataset.certDash));
    });

    if (window.onUserAuthorized) {
      window.onUserAuthorized(user.workerUniqueId || user.phone || user.id);
    }
  }

  function renderWorkerTrainings() {
    const user = currentUser();
    const box = byId("workerTrainings");
    if (!box) return;

    if (!user || user.role !== ROLES.WORKER) {
      box.innerHTML = `<div class="item"><div class="t">Please log in as a Worker.</div></div>`;
      return;
    }

    const list = trainingsVisibleToWorker();
    if (!list.length) {
      box.innerHTML = `<div class="item"><div class="t">No Published trainings found</div></div>`;
      return;
    }

    box.innerHTML = list
      .map((t) => {
        const pre = latestAttempt(t.id, user.id, "PRE");
        const post = latestAttempt(t.id, user.id, "POST");

        const att = attendanceFor(t.id, user.id);
        const inWindow = t.attendanceEnabled ? withinWindow(t) : false;

        const attText = !t.attendanceEnabled
          ? "Disabled"
          : att
          ? `${att.attendanceStatus} (${fmt(att.checkedInAt)})`
          : inWindow
          ? "Open (not marked)"
          : "Closed";

        const canMark = !!t.attendanceEnabled && !att && inWindow;
        const btnText = att ? "Attendance Marked" : (inWindow ? "Mark Attendance" : "Attendance Closed");

        const isAttended = att && (att.attendanceStatus === "Present" || att.status === "Present");
        const canTakePreTest = Boolean(t.attendanceEnabled && isAttended);
        const canTakePostTest = Boolean(t.attendanceEnabled && isAttended && pre);
        const isPostPassed = post && (post.passed || post.percent >= 60);
        const eligibleForCert = isAttended && isPostPassed;

        let preBadge = `<span class="badge" style="background:#f1f5f9;color:#64748b;font-size:11px">🔒 Locked (Mark Attendance First)</span>`;
        if (pre) {
          preBadge = `<span class="badge good" style="font-size:11px">✓ Completed: ${pre.score}/${pre.totalMarks} (${pre.percent}%)</span>`;
        } else if (!t.attendanceEnabled) {
          preBadge = `<span class="badge" style="background:#fee2e2;color:#991b1b;font-size:11px">🔒 Locked (Attendance Disabled)</span>`;
        } else if (canTakePreTest) {
          preBadge = `<span class="badge warn" style="font-size:11px">🔓 Ready to Take</span>`;
        }

        let postBadge = `<span class="badge" style="background:#f1f5f9;color:#64748b;font-size:11px">🔒 Locked (Complete Pre-Test First)</span>`;
        if (post) {
          const pCls = post.passed || post.percent >= 60 ? "good" : "bad";
          const pTxt = post.passed || post.percent >= 60 ? "Passed" : "Needs Improvement";
          postBadge = `<span class="badge ${pCls}" style="font-size:11px">${pTxt}: ${post.score}/${post.totalMarks} (${post.percent}%)</span>`;
        } else if (!t.attendanceEnabled) {
          postBadge = `<span class="badge" style="background:#fee2e2;color:#991b1b;font-size:11px">🔒 Locked (Attendance Disabled)</span>`;
        } else if (pre) {
          postBadge = `<span class="badge warn" style="font-size:11px">🔓 Ready to Take</span>`;
        }

        return `
          <div class="item">
            <div class="row between">
              <div class="t">${t.title}</div>
              <span class="badge ${t.status === "Completed" ? "good" : "warn"}">${t.status}</span>
            </div>
            <div class="s" style="margin-top:8px">
              Category: <b>${t.category}</b> &bull; Mode: <b>${t.mode}</b><br/>
              Schedule: <b>${fmt(t.startAt)}</b> to <b>${fmt(t.endAt)}</b><br/>
              Attendance: <b>${attText}</b><br/>
              Pre-Test: ${preBadge}<br/>
              Post-Test: ${postBadge}
            </div>
            <div class="actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn small ${att ? "ghost" : ""}" type="button" data-att="${t.id}" ${canMark ? "" : "disabled"}>
                ${btnText}
              </button>
              ${!pre ? (canTakePreTest ? `
                <button class="btn small" type="button" data-take-pre="${t.id}">
                  📝 Take Pre-Test
                </button>
              ` : `
                <button class="btn small ghost" type="button" disabled style="opacity:0.6;cursor:not-allowed" title="${!t.attendanceEnabled ? 'Attendance is disabled for this training. Pre-Test locked.' : 'Mark attendance first to unlock Pre-Test'}">
                  🔒 Pre-Test (Locked)
                </button>
              `) : (!post ? (canTakePostTest ? `
                <button class="btn small" type="button" data-take-post="${t.id}">
                  📝 Take Post-Test
                </button>
              ` : `
                <button class="btn small ghost" type="button" disabled style="opacity:0.6;cursor:not-allowed" title="${!t.attendanceEnabled ? 'Attendance is disabled for this training. Post-Test locked.' : 'Complete attendance and Pre-Test first'}">
                  🔒 Post-Test (Locked)
                </button>
              `) : "")}
              ${eligibleForCert ? `
                <button class="btn small success" type="button" data-cert="${t.id}">
                  🏆 View Certificate
                </button>
              ` : ""}
            </div>
          </div>
        `;
      })
      .join("");

    box.querySelectorAll("[data-att]").forEach((btn) => {
      btn.addEventListener("click", () => markAttendance(btn.dataset.att));
    });

    box.querySelectorAll("[data-take-pre]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tid = btn.dataset.takePre;
        if (!canTakePre(tid, user.id)) {
          return showToast("Pre-Test is locked! You must mark attendance first.", "error");
        }
        const sel = byId("testTrainingSelect");
        if (sel) {
          sel.value = tid;
          updateTestButtonStates();
        }
        renderTestUI(tid, "PRE", getQuestions(tid, "PRE"));
      });
    });

    box.querySelectorAll("[data-take-post]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tid = btn.dataset.takePost;
        if (!canTakePost(tid, user.id)) {
          return showToast("Post-Test is locked! Complete and submit Pre-Test first.", "error");
        }
        const attsAll = getAttempts();
        const userPreCount = attsAll.filter((a) => 
          (a.type || "").toUpperCase() === "PRE" && 
          (a.userId === user.id || a.workerUniqueId === user.workerUniqueId)
        ).length;
        const userPostCount = attsAll.filter((a) => 
          (a.type || "").toUpperCase() === "POST" && 
          (a.userId === user.id || a.workerUniqueId === user.workerUniqueId)
        ).length;
        if (userPostCount >= userPreCount) {
          return showToast("Rule Enforced: Post-Test attempts cannot exceed Pre-Test attempts.", "error");
        }
        const sel = byId("testTrainingSelect");
        if (sel) {
          sel.value = tid;
          updateTestButtonStates();
        }
        renderTestUI(tid, "POST", getQuestions(tid, "POST"));
      });
    });

    box.querySelectorAll("[data-cert]").forEach((btn) => {
      btn.addEventListener("click", () => openCertificate(btn.dataset.cert));
    });
  }

  function updateTestButtonStates() {
    const sel = byId("testTrainingSelect");
    const note = byId("postGateNote");
    const preBtn = byId("takePreBtn");
    const postBtn = byId("takePostBtn");
    const user = currentUser();
    if (!sel || !note || !preBtn || !postBtn) return;

    const tid = sel.value;
    if (!tid) {
      preBtn.disabled = true;
      postBtn.disabled = true;
      note.innerHTML = `<span class="muted">Select a training above to start assessment.</span>`;
      return;
    }

    if (!user || user.role !== ROLES.WORKER) {
      preBtn.disabled = true;
      postBtn.disabled = true;
      note.textContent = "Worker login required.";
      return;
    }

    const trainings = LS.get(DBK.trainings, []);
    const t = trainings.find((x) => x.id === tid || x.title === tid);
    if (t && !t.attendanceEnabled) {
      preBtn.disabled = true;
      preBtn.innerHTML = "🔒 Take Pre-Test (Locked)";
      preBtn.setAttribute("title", "Attendance is disabled for this training. Assessments are locked.");
      postBtn.disabled = true;
      postBtn.innerHTML = "🔒 Take Post-Test (Locked)";
      postBtn.setAttribute("title", "Attendance is disabled for this training. Assessments are locked.");
      note.innerHTML = `<span style="color:#ef4444;font-weight:600">🔒 Attendance Disabled:</span> Attendance is disabled for this training. Pre-Test and Post-Test cannot be unlocked.`;
      return;
    }

    const attDone = canTakePre(tid, user.id);
    const preDone = hasSubmitted(tid, user.id, "PRE");
    const postDone = hasSubmitted(tid, user.id, "POST");

    if (!attDone) {
      preBtn.disabled = true;
      preBtn.innerHTML = "🔒 Take Pre-Test (Locked)";
      preBtn.setAttribute("title", "Pre-Test is locked. You must mark attendance for this training first.");
      postBtn.disabled = true;
      postBtn.innerHTML = "🔒 Take Post-Test (Locked)";
      postBtn.setAttribute("title", "Complete Attendance and Pre-Test first.");
      note.innerHTML = `<span style="color:#ef4444;font-weight:600">🔒 Attendance Required:</span> You must mark verified attendance for this training before the Pre-Test is unlocked.`;
    } else if (postDone) {
      preBtn.disabled = true;
      preBtn.innerHTML = "✓ Pre-Test Completed";
      preBtn.removeAttribute("title");
      postBtn.disabled = true;
      postBtn.innerHTML = "✓ Post-Test Completed";
      postBtn.removeAttribute("title");
      note.innerHTML = `<span style="color:#10b981;font-weight:600">✓ Completed:</span> Both Pre-Test and Post-Test have been submitted.`;
    } else if (!preDone) {
      preBtn.disabled = false;
      preBtn.innerHTML = "📝 Take Pre-Test";
      preBtn.removeAttribute("title");
      postBtn.disabled = true;
      postBtn.innerHTML = "🔒 Take Post-Test (Locked)";
      postBtn.setAttribute("title", "Post-Test is locked. You must complete and submit Pre-Test first.");
      note.innerHTML = `<span style="color:#ef4444;font-weight:600">🔒 Post-Test is locked.</span> You must complete and submit the Pre-Test first.`;
    } else {
      preBtn.disabled = true;
      preBtn.innerHTML = "✓ Pre-Test Completed";
      preBtn.removeAttribute("title");
      postBtn.disabled = false;
      postBtn.innerHTML = "📝 Take Post-Test";
      postBtn.removeAttribute("title");
      note.innerHTML = `<span style="color:#10b981;font-weight:600">🔓 Post-Test unlocked!</span> Pre-Test completed. You may now take the Post-Test.`;
    }
  }

  function renderTestTrainingSelect() {
    const sel = byId("testTrainingSelect");
    if (!sel) return;

    const list = trainingsVisibleToWorker();
    const prevVal = sel.value;
    sel.innerHTML =
      `<option value="">Select Training</option>` +
      list.map((t) => `<option value="${t.id}">${t.title}</option>`).join("");

    if (prevVal && list.some((t) => t.id === prevVal)) {
      sel.value = prevVal;
    }

    sel.onchange = updateTestButtonStates;
    updateTestButtonStates();
  }

  /* ==========================
     ADMIN: TRAINING MANAGEMENT
     ========================== */
  function clearTrainingForm() {
    if (!byId("tCategory")) return;
    byId("tCategory").value = "Maternal Health";
    byId("tStatus").value = "Draft";
    byId("tTitle").value = "";
    byId("tStart").value = "";
    byId("tEnd").value = "";
    byId("tMode").value = "online";
    byId("tVenue").value = "";
    byId("tAttendanceEnabled").checked = true;
    byId("tGps").checked = false;
    byId("tOpen").value = "";
    byId("tClose").value = "";
    byId("tPreJson").value = defaultPreJson();
    byId("tPostJson").value = defaultPostJson();
    if (byId("saveTrainingBtn")) byId("saveTrainingBtn").dataset.editId = "";
  }

  function loadTrainingToForm(trainingId) {
    const u = currentUser();
    if (!u || u.role !== ROLES.ADMIN) return showToast("Admin access only", "warn");

    const t = LS.get(DBK.trainings, []).find((x) => x.id === trainingId);
    if (!t) return showToast("Training not found", "error");

    byId("tCategory").value = t.category || "Maternal Health";
    byId("tStatus").value = t.status || "Draft";
    byId("tTitle").value = t.title || "";
    byId("tMode").value = t.mode || "online";
    byId("tVenue").value = t.venue || "";

    byId("tAttendanceEnabled").checked = !!t.attendanceEnabled;
    byId("tGps").checked = !!t.gpsRequired;

    byId("tStart").value = t.startAt ? new Date(t.startAt).toISOString().slice(0, 16) : "";
    byId("tEnd").value = t.endAt ? new Date(t.endAt).toISOString().slice(0, 16) : "";
    byId("tOpen").value = t.attendanceOpenAt ? new Date(t.attendanceOpenAt).toISOString().slice(0, 16) : "";
    byId("tClose").value = t.attendanceCloseAt ? new Date(t.attendanceCloseAt).toISOString().slice(0, 16) : "";

    const pre = t.assessments?.pre;
    const post = t.assessments?.post;
    byId("tPreJson").value = JSON.stringify(Array.isArray(pre) ? pre : JSON.parse(defaultPreJson()), null, 2);
    byId("tPostJson").value = JSON.stringify(Array.isArray(post) ? post : JSON.parse(defaultPostJson()), null, 2);

    byId("saveTrainingBtn").dataset.editId = t.id;
    byId("tTitle")?.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("Training loaded into form for editing", "info");
  }

  async function saveTrainingFromForm() {
    const u = currentUser();
    if (!u || u.role !== ROLES.ADMIN) return showToast("Admin access only", "warn");

    const category = byId("tCategory").value;
    const status = byId("tStatus").value;
    const title = (byId("tTitle").value || "").trim();
    const startAt = byId("tStart").value ? new Date(byId("tStart").value).toISOString() : null;
    const endAt = byId("tEnd").value ? new Date(byId("tEnd").value).toISOString() : null;
    const mode = byId("tMode").value;
    const venue = (byId("tVenue").value || "").trim();
    const attendanceEnabled = byId("tAttendanceEnabled").checked;
    const gpsRequired = byId("tGps").checked;
    const attendanceOpenAt = byId("tOpen").value ? new Date(byId("tOpen").value).toISOString() : null;
    const attendanceCloseAt = byId("tClose").value ? new Date(byId("tClose").value).toISOString() : null;

    if (!title) return showToast("Training Title is required", "warn");
    if (!startAt || !endAt) return showToast("Start and End Date/Time are required", "warn");

    let pre, post;
    try {
      pre = safeJsonParse(byId("tPreJson").value || "[]");
      post = safeJsonParse(byId("tPostJson").value || "[]");
    } catch (e) {
      return showToast("Pre/Post JSON syntax error: " + e.message, "error");
    }

    const trainings = LS.get(DBK.trainings, []);
    const editId = byId("saveTrainingBtn")?.dataset.editId || "";
    const id = editId || uuid();

    const existing = trainings.find((t) => t.id === editId);

    const payload = {
      id,
      category,
      status,
      title,
      startAt,
      endAt,
      mode,
      venue,
      attendanceEnabled,
      gpsRequired,
      attendanceOpenAt,
      attendanceCloseAt,
      assessments: { pre, post },
      updatedAt: nowIso(),
      createdAt: existing?.createdAt || nowIso()
    };

    if (editId) {
      const idx = trainings.findIndex((t) => t.id === editId);
      if (idx >= 0) trainings[idx] = payload;
    } else {
      trainings.unshift(payload);
    }

    LS.set(DBK.trainings, trainings);

    // 1. PERSIST DIRECTLY TO CLOUD BACKEND (ACID DURABILITY)
    try {
      const apiRes = await fetch(apiUrl("/api/trainings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (apiRes.ok) {
        console.log(`[API] Training ${id} (${status}) saved to Cloud DB successfully.`);
      } else {
        console.warn("[API] Failed to save training to Cloud DB:", await apiRes.text());
      }
    } catch (apiErr) {
      console.warn("[API] Network error saving training to Cloud DB:", apiErr);
    }

    showToast(editId ? `Training updated successfully (${status})` : `New training created (${status})`, "success");

    await logEvent(editId ? "training_updated" : "training_created", {
      trainingId: id,
      trainingTitle: title,
      trainingCategory: category,
      status
    });

    clearTrainingForm();
    renderAll();
  }

  function renderAdminTrainingSummary() {
    const u = currentUser();
    const box = byId("adminTrainingSummary");
    if (!box) return;

    if (!u || u.role !== ROLES.ADMIN) {
      box.innerHTML = `<div class="item"><div class="t">Admin access only</div></div>`;
      return;
    }

    const category = byId("tCategory")?.value || "";
    const status = byId("tStatus")?.value || "";

    const list = LS.get(DBK.trainings, [])
      .filter((t) => t.category === category && t.status === status)
      .sort((a, b) => new Date(b.startAt || 0) - new Date(a.startAt || 0));

    if (!list.length) {
      box.innerHTML = `<div class="item"><div class="t">No trainings</div><div class="s">No trainings found for <b>${category}</b> with status <b>${status}</b>.</div></div>`;
      return;
    }

    box.innerHTML = list.map((t) => `
      <div class="item">
        <div class="row between">
          <div class="t">${t.title}</div>
          <span class="badge ${t.status === "Completed" ? "good" : "warn"}">${t.status}</span>
        </div>
        <div class="s">
          Category: <b>${t.category}</b> &bull; Mode: <b>${t.mode}</b><br/>
          Schedule: ${fmt(t.startAt)} to ${fmt(t.endAt)}<br/>
          Venue: ${t.venue || "—"}
        </div>
        <div class="actions">
          <button class="btn small" type="button" data-edit-training="${t.id}">Edit Training</button>
        </div>
      </div>
    `).join("");

    box.querySelectorAll("[data-edit-training]").forEach((btn) => {
      btn.addEventListener("click", () => loadTrainingToForm(btn.dataset.editTraining));
    });
  }

  /* ==========================
     ADMIN MONITORING & DASHBOARD
     ========================== */
  function avgPct(arr) {
    const nums = arr.map((x) => Number(x.percent)).filter((n) => Number.isFinite(n));
    return nums.length ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length) : 0;
  }

  function passRate(arr) {
    const valid = arr.filter((x) => x.passed !== "" && x.passed !== null && x.passed !== undefined);
    if (!valid.length) return 0;
    return Math.round((valid.filter((x) => !!x.passed).length / valid.length) * 100);
  }

  function medianPct(arr) {
    const nums = arr.map((x) => Number(x.percent)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    if (!nums.length) return 0;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
  }

  function coveragePct_(attempts) {
    const map = new Map();
    attempts.forEach((a) => {
      const key = `${a.trainingId}|${a.userId || a.workerUniqueId}`;
      const cur = map.get(key) || { pre: false, post: false };
      const aType = (a.type || a.test_type || "").toUpperCase();
      if (aType === "PRE") cur.pre = true;
      if (aType === "POST") cur.post = true;
      map.set(key, cur);
    });
    const pairs = [...map.values()];
    if (!pairs.length) return 0;
    const both = pairs.filter((x) => x.pre && x.post).length;
    return Math.round((both / pairs.length) * 100);
  }

  function trainingById_(trainings, id) {
    return trainings.find((t) => t.id === id || t.title === id) || null;
  }

  function latestAttemptFor_(attempts, trainingId, userId, type, workerUniqueId) {
    const typeUpper = (type || "").toUpperCase();
    const arr = attempts
      .filter((a) => {
        const aType = (a.type || a.test_type || "").toUpperCase();
        if (aType !== typeUpper) return false;
        const matchesUser = (
          a.userId === userId ||
          a.workerUniqueId === userId ||
          (workerUniqueId && (a.userId === workerUniqueId || a.workerUniqueId === workerUniqueId))
        );
        if (!matchesUser) return false;
        return a.trainingId === trainingId || a.trainingTitle === trainingId;
      })
      .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    return arr[0] || null;
  }

  function renderAdminWorkerMonitoring_({ users, trainings, attempts, selectedTrainingId, query }) {
    const box = byId("adminWorkerPerf");
    if (!box) return;

    let workers = users.slice();

    if (query) {
      const q = query.toLowerCase();
      workers = workers.filter((w) => {
        const name = (w.fullName || "").toLowerCase();
        const phone = String(w.phone || "");
        const wid = String(w.workerUniqueId || "").toLowerCase();
        return name.includes(q) || phone.includes(q) || wid.includes(q);
      });
    }

    if (selectedTrainingId) {
      const attemptedUsers = new Set(
        attempts
          .filter((a) => (a.trainingId === selectedTrainingId || a.trainingTitle === selectedTrainingId) && ((a.type || "").toUpperCase() === "PRE" || (a.type || "").toUpperCase() === "POST"))
          .flatMap((a) => [a.userId, a.workerUniqueId].filter(Boolean))
      );
      workers = workers.filter((w) => attemptedUsers.has(w.id) || attemptedUsers.has(w.workerUniqueId));
    }

    const head = `
      <div class="tHead">
        <div>Worker Details</div>
        <div>Facility</div>
        <div>District</div>
        <div>Active Training</div>
        <div>Pre-Test Score</div>
        <div>Post-Test Outcome</div>
      </div>
    `;

    if (!workers.length) {
      box.innerHTML = `
        <div class="tableLike">
          ${head}
          <div class="tRow" style="grid-column: 1 / -1; padding: 24px 18px; text-align: center; color: var(--text-subtle);">
            No health workers match the current search or training filter.
          </div>
        </div>
      `;
      return;
    }

    const showSpecific = !!selectedTrainingId;

    const rows = workers
      .slice()
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""))
      .map((w) => {
        let t = null;
        let pre = null;
        let post = null;

        if (showSpecific) {
          t = trainingById_(trainings, selectedTrainingId);
          pre = latestAttemptFor_(attempts, selectedTrainingId, w.id, "PRE", w.workerUniqueId);
          post = latestAttemptFor_(attempts, selectedTrainingId, w.id, "POST", w.workerUniqueId);
        } else {
          const aAll = attempts
            .filter((a) => (a.userId === w.id || a.workerUniqueId === w.workerUniqueId) && ((a.type || "").toUpperCase() === "PRE" || (a.type || "").toUpperCase() === "POST"))
            .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
          const latest = aAll[0] || null;
          if (latest) {
            t = trainingById_(trainings, latest.trainingId);
            pre = latestAttemptFor_(attempts, latest.trainingId, w.id, "PRE", w.workerUniqueId);
            post = latestAttemptFor_(attempts, latest.trainingId, w.id, "POST", w.workerUniqueId);
          }
        }

        const tName = t ? t.title : "—";
        const preTxt = pre ? `${pre.score}/${pre.totalMarks} (${pre.percent}%)` : "— Not Attempted";
        const postTxt = post ? `${post.score}/${post.totalMarks} (${post.percent}%)` : "— Not Attempted";
        const prePill = pre ? (pre.percent >= 60 ? "badge good" : "badge warn") : "badge";
        const postPill = post ? (post.percent >= 60 ? "badge good" : "badge bad") : "badge";

        const fac = w.profile?.facilityName || "Primary Health Center";
        const dist = w.profile?.districtId ? districtNameById(w.profile.districtId) : (w.profile?.district || "Ranchi");

        const initials = (w.fullName || "HW")
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase() || "HW";

        return `
          <div class="tRow">
            <div class="workerCell">
              <div class="workerAvatar">${initials}</div>
              <div class="workerMeta">
                <div class="workerName">${w.fullName || "Unnamed Worker"}</div>
                <div class="workerSub">${w.workerUniqueId || w.phone || "ID Pending"}</div>
              </div>
            </div>
            <div style="font-weight:600;color:var(--text-muted)">${fac}</div>
            <div><span class="badge" style="font-size:11px">${dist}</span></div>
            <div style="font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${tName}">${tName}</div>
            <div><span class="${prePill}">${preTxt}</span></div>
            <div><span class="${postPill}">${postTxt}</span></div>
          </div>
        `;
      })
      .join("");

    box.innerHTML = `<div class="tableLike">${head}${rows}</div>`;
  }

  function renderAdminDashboard() {
    const u = currentUser();
    if (!u || u.role !== ROLES.ADMIN) return;

    const category = byId("admCategoryFilter")?.value || "";
    const selectedTrainingId = byId("admTrainingPick")?.value || "";
    const q = (byId("admWorkerSearch")?.value || "").trim();

    const users = LS.get(DBK.users, []).filter((x) => x.role === ROLES.WORKER);
    const trainingsAll = LS.get(DBK.trainings, []);
    const attemptsAll = LS.get(DBK.attempts, []);
    const attendanceAll = LS.get(DBK.attendance, []);

    const trainings = category ? trainingsAll.filter((t) => t.category === category) : trainingsAll;
    const trainingIdSet = new Set(trainings.map((t) => t.id));
    const attempts = category ? attemptsAll.filter((a) => trainingIdSet.has(a.trainingId)) : attemptsAll;
    const attendance = category ? attendanceAll.filter((a) => trainingIdSet.has(a.trainingId)) : attendanceAll;

    const pick = byId("admTrainingPick");
    if (pick) {
      const prev = pick.value || "";
      const listSorted = trainings.slice().sort((a, b) => new Date(b.startAt || 0) - new Date(a.startAt || 0));
      pick.innerHTML =
        `<option value="">All Trainings (${listSorted.length})</option>` +
        listSorted.map((t) => `<option value="${t.id}">${t.title}</option>`).join("");

      if ([...pick.options].some((o) => o.value === prev)) pick.value = prev;
    }

    const uniq = (arr) => [...new Set(arr)];
    const pre = attempts.filter((a) => (a.type || a.test_type || "").toUpperCase() === "PRE");
    const post = attempts.filter((a) => (a.type || a.test_type || "").toUpperCase() === "POST");

    const uniqWorkers = uniq(users.map((w) => w.id)).length;
    const uniqWorkersWithAnyAttempt = uniq(attempts.map((a) => a.userId)).length;
    const uniqTrainings = trainings.length;
    const uniqTrainingsPublished = trainings.filter((t) => t.status === "Published").length;
    const uniqTrainingsCompleted = trainings.filter((t) => t.status === "Completed").length;

    const dash = byId("adminDashboard");
    if (dash) {
      dash.innerHTML = `
        <div class="kpi">
          <div class="k"><span>Registered Workers</span><span style="font-size:16px">👥</span></div>
          <div class="v">${uniqWorkers}</div>
          <div class="sub">Active with attempts: <b>${uniqWorkersWithAnyAttempt}</b> &bull; Total Staff</div>
        </div>

        <div class="kpi">
          <div class="k"><span>Trainings Catalog</span><span style="font-size:16px">📚</span></div>
          <div class="v">${uniqTrainings}</div>
          <div class="sub">Published: <b>${uniqTrainingsPublished}</b> &bull; Completed: <b>${uniqTrainingsCompleted}</b></div>
        </div>

        <div class="kpi">
          <div class="k"><span>Total Assessments</span><span style="font-size:16px">📝</span></div>
          <div class="v">${attempts.length}</div>
          <div class="sub">Pre-Tests: <b>${pre.length}</b> &bull; Post-Tests: <b>${post.length}</b></div>
        </div>

        <div class="kpi">
          <div class="k"><span>Verified Attendance</span><span style="font-size:16px">🛡️</span></div>
          <div class="v">${attendance.length}</div>
          <div class="sub">Present records synchronized</div>
        </div>
      `;
    }

    const viz = byId("adminScoreViz");
    if (viz) {
      const preAvg = avgPct(pre);
      const postAvg = avgPct(post);
      const gain = postAvg - preAvg;
      const gainSign = gain >= 0 ? "+" : "";
      const cov = coveragePct_(attempts);

      viz.innerHTML = `
        <div class="kpi">
          <div class="k"><span>Pre-Test Baseline</span><span style="font-size:15px">🎯</span></div>
          <div class="v" style="color:var(--amber)">${preAvg}%</div>
          <div class="sub">Pass Rate: <b>${passRate(pre)}%</b> &bull; Median: <b>${medianPct(pre)}%</b></div>
        </div>

        <div class="kpi">
          <div class="k"><span>Post-Test Outcome</span><span style="font-size:15px">🏆</span></div>
          <div class="v" style="color:var(--green)">${postAvg}%</div>
          <div class="sub">Pass Rate: <b>${passRate(post)}%</b> &bull; Gain: <b style="color:var(--green)">${gainSign}${gain}%</b></div>
        </div>

        <div class="kpi">
          <div class="k"><span>Pre &rarr; Post Coverage</span><span style="font-size:15px">📈</span></div>
          <div class="v" style="color:var(--primary)">${cov}%</div>
          <div class="sub">Workers completing both tests</div>
        </div>

        <div class="kpi">
          <div class="k"><span>Selected Domain</span><span style="font-size:15px">🏥</span></div>
          <div class="v" style="font-size:20px;line-height:1.3;letter-spacing:-0.2px">${category || "All Health Domains"}</div>
          <div class="sub">Active dashboard intelligence filter</div>
        </div>
      `;
    }

    const td = byId("adminTrainingDetail");
    if (td) {
      const list = trainings
        .slice()
        .sort((a, b) => new Date(b.startAt || 0) - new Date(a.startAt || 0))
        .map((t) => {
          const tAtt = attempts.filter((a) => a.trainingId === t.id || a.trainingTitle === t.title);
          const tPre = tAtt.filter((a) => (a.type || a.test_type || "").toUpperCase() === "PRE");
          const tPost = tAtt.filter((a) => (a.type || a.test_type || "").toUpperCase() === "POST");

          return `
            <div class="item">
              <div class="row between">
                <div class="t">${t.title}</div>
                <span class="badge ${t.status === "Completed" ? "good" : "warn"}">${t.status}</span>
              </div>
              <div class="s" style="margin-top:6px">
                Category: <b>${t.category}</b> &bull; Schedule: ${fmt(t.startAt)} to ${fmt(t.endAt)}<br/>
                Total Attempts: <b>${tAtt.length}</b> (Pre: ${tPre.length}, Post: ${tPost.length})<br/>
                Average Performance: Pre <b>${avgPct(tPre)}%</b> &bull; Post <b>${avgPct(tPost)}%</b>
              </div>
            </div>
          `;
        });

      td.innerHTML = list.length
        ? list.join("")
        : `<div class="item"><div class="t">No trainings found</div><div class="s">No trainings match this category.</div></div>`;
    }

    renderAdminWorkerMonitoring_({
      users,
      trainings,
      attempts,
      selectedTrainingId,
      query: q
    });
  }

  /* ==========================
     WHOAMI HEADER
     ========================== */
  function renderWhoami() {
    const u = currentUser();
    if (byId("logoutBtn")) byId("logoutBtn").style.display = u ? "" : "none";

    const whoami = byId("whoami");
    if (!whoami) return;

    if (!u) {
      whoami.innerHTML = `<span class="muted">Not logged in</span>`;
      return;
    }

    const dist = u.role === ROLES.WORKER ? districtNameById(u.profile?.districtId) : "State Level";
    whoami.innerHTML = `
      <div class="bigName">${u.fullName} <span class="badge ${u.role === ROLES.ADMIN ? "good" : "warn"} roleTag">${u.role}</span></div>
      <div class="muted">${u.workerUniqueId} &bull; ${dist}</div>
    `;
  }

  /* ==========================
     CSV EXPORTS
     ========================== */
  function toCsv(headers, rows) {
    const out = [];
    out.push(headers.map(csvEscape).join(","));
    rows.forEach((r) => out.push(r.map(csvEscape).join(",")));
    return out.join("\n");
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filename}`, "success");
  }

  function exportCsv(kind) {
    const users = LS.get(DBK.users, []);
    const workers = users.filter((u) => u.role === ROLES.WORKER);
    const trainings = LS.get(DBK.trainings, []);
    const attempts = LS.get(DBK.attempts, []);
    const attendance = LS.get(DBK.attendance, []);

    let csv = "";
    let filename = `jh_${kind}_export.csv`;

    if (kind === "workers") {
      const headers = ["workerUniqueId", "fullName", "phone", "designation", "facilityName", "facilityType", "cityOrVillage", "district", "state", "email", "experienceYears", "createdAt"];
      const rows = workers.map((w) => ([
        w.workerUniqueId,
        w.fullName,
        w.phone,
        w.profile?.designation || "",
        w.profile?.facilityName || "",
        w.profile?.facilityType || "",
        w.profile?.cityOrVillage || "",
        w.profile?.districtId ? districtNameById(w.profile.districtId) : "",
        w.profile?.state || "Jharkhand",
        w.profile?.email || "",
        w.profile?.experienceYears ?? "",
        w.createdAt || ""
      ]));
      csv = toCsv(headers, rows);
      filename = "workers_export.csv";
    }

    if (kind === "trainings") {
      const headers = ["trainingId", "title", "category", "status", "mode", "venue", "startAt", "endAt", "attendanceEnabled", "gpsRequired", "attendanceOpenAt", "attendanceCloseAt", "createdAt", "updatedAt"];
      const rows = trainings.map((t) => ([
        t.id, t.title, t.category, t.status, t.mode, t.venue || "",
        t.startAt || "", t.endAt || "",
        !!t.attendanceEnabled, !!t.gpsRequired,
        t.attendanceOpenAt || "", t.attendanceCloseAt || "",
        t.createdAt || "", t.updatedAt || ""
      ]));
      csv = toCsv(headers, rows);
      filename = "trainings_export.csv";
    }

    if (kind === "scores") {
      const headers = ["attemptId", "trainingId", "trainingTitle", "category", "userId", "workerUniqueId", "fullName", "phone", "type", "score", "totalMarks", "percent", "passed", "submittedAt"];
      const tMap = new Map(trainings.map((t) => [t.id, t]));
      const uMap = new Map(users.map((u) => [u.id, u]));
      const rows = attempts.map((a) => {
        const t = tMap.get(a.trainingId);
        const u = uMap.get(a.userId);
        return ([
          a.id,
          a.trainingId,
          t?.title || "",
          t?.category || "",
          a.userId,
          u?.workerUniqueId || "",
          u?.fullName || "",
          u?.phone || "",
          a.type,
          a.score,
          a.totalMarks,
          a.percent,
          a.passed ? "yes" : "no",
          a.submittedAt || ""
        ]);
      });
      csv = toCsv(headers, rows);
      filename = "assessment_scores_export.csv";
    }

    if (kind === "master") {
      const headers = [
        "eventType", "timestamp",
        "workerUniqueId", "fullName", "phone", "designation", "facilityName", "facilityType", "cityOrVillage", "district", "state",
        "trainingId", "trainingTitle", "trainingCategory", "status",
        "attendanceStatus", "checkedInAt",
        "testType", "score", "totalMarks", "percent", "passed"
      ];

      const tMap = new Map(trainings.map((t) => [t.id, t]));
      const uMap = new Map(users.map((u) => [u.id, u]));
      const rows = [];

      attempts.forEach((a) => {
        const t = tMap.get(a.trainingId);
        const u = uMap.get(a.userId);
        rows.push([
          "assessment", a.submittedAt || "",
          u?.workerUniqueId || "", u?.fullName || "", u?.phone || "",
          u?.profile?.designation || "", u?.profile?.facilityName || "", u?.profile?.facilityType || "",
          u?.profile?.cityOrVillage || "", u?.profile?.districtId ? districtNameById(u.profile.districtId) : "",
          u?.profile?.state || "Jharkhand",
          a.trainingId, t?.title || "", t?.category || "", t?.status || "",
          "", "",
          a.type, a.score, a.totalMarks, a.percent, a.passed ? "yes" : "no"
        ]);
      });

      attendance.forEach((r) => {
        const t = tMap.get(r.trainingId);
        const u = uMap.get(r.userId);
        rows.push([
          "attendance", r.checkedInAt || "",
          u?.workerUniqueId || "", u?.fullName || "", u?.phone || "",
          u?.profile?.designation || "", u?.profile?.facilityName || "", u?.profile?.facilityType || "",
          u?.profile?.cityOrVillage || "", u?.profile?.districtId ? districtNameById(u.profile.districtId) : "",
          u?.profile?.state || "Jharkhand",
          r.trainingId, t?.title || "", t?.category || "", t?.status || "",
          r.attendanceStatus || "", r.checkedInAt || "",
          "", "", "", "", ""
        ]);
      });

      csv = toCsv(headers, rows);
      filename = "master_training_report.csv";
    }

    const preview = byId("csvPreview");
    if (preview) {
      preview.textContent = csv.slice(0, 15000) + (csv.length > 15000 ? "\n\n…(truncated preview)" : "");
    }
    downloadText(filename, csv);
  }

  async function cleanTestData() {
    if (!confirm("Are you sure you want to clean all test submissions, assessments, attendance, and AI recommendations? This will reset the database and application for fresh testing.")) {
      return;
    }
    try {
      showToast("Cleaning test data across Aiven database and application...", "info");
      const res = await fetch(apiUrl("/api/admin/clean-test-data"), {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        LS.set(DBK.attempts, []);
        LS.set(DBK.attendance, []);
        LS.set(DBK.offlineQueue, []);

        if (Array.isArray(json.users) && json.users.length > 0) {
          const cleanUsers = json.users.map((u) => ({
            id: u.id,
            role: u.role,
            phone: u.phone,
            password: u.password_hash || (u.role === ROLES.ADMIN ? "4311d0246a19ce40a753e72109162eb05e23cc30f50bce584e3e2ed1123caed0" : "3562e323fc87431e4aecaa006efbaa58fdfc51341f0c2d7539fcf9925c0532fd"),
            workerUniqueId: u.worker_unique_id || "",
            fullName: u.full_name || "",
            createdAt: u.created_at || nowIso(),
            profile: {
              designation: u.designation || "",
              facilityName: u.facility_name || "",
              facilityType: u.facility_type || "",
              cityOrVillage: u.city_or_village || "",
              districtId: u.district_id || "D-20",
              district: u.district_name || "Ranchi",
              state: u.state || "Jharkhand"
            }
          }));
          LS.set(DBK.users, cleanUsers);
        } else {
          LS.set(DBK.users, []);
          seedInitialUsers();
        }

        const remedial = document.getElementById("aiRemedialContainer");
        if (remedial) remedial.remove();

        showToast("Database and Application cleaned successfully! Ready for fresh submissions.", "success", 4000);
        renderAll();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || "Failed to clean test data", "error");
      }
    } catch (e) {
      console.error("Clean test data error:", e);
      showToast("Failed to clean test data: " + e.message, "error");
    }
  }
  window.cleanTestData = cleanTestData;

  /* ==========================
     CORE RENDER FUNCTION
     ========================== */
  function renderAll() {
    setOnlineBadge();
    seedDistricts();
    seedInitialUsers();
    seedSampleTrainings();
    fillDistrictSelect();
    applyRoleVisibility();
    renderWhoami();

    if (byId("tPreJson") && !byId("tPreJson").value.trim()) byId("tPreJson").value = defaultPreJson();
    if (byId("tPostJson") && !byId("tPostJson").value.trim()) byId("tPostJson").value = defaultPostJson();

    renderWorkerDashboard();
    renderWorkerTrainings();
    renderTestTrainingSelect();

    renderAdminTrainingSummary();
    renderAdminDashboard();

    refreshQueueUI();
  }

  /* ==========================
     EVENT LISTENERS & BINDINGS
     ========================== */
  function wireEvents() {
    // Nav tabs
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        setActiveView(btn.dataset.view);
        renderAll();
      });
    });

    // Auth events
    byId("loginBtn")?.addEventListener("click", login);
    byId("logoutBtn")?.addEventListener("click", logout);
    byId("registerBtn")?.addEventListener("click", registerWorker);

    // Enter key support for quick login
    byId("loginPhone")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") login();
    });
    byId("loginPass")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") login();
    });

    // Quick demo login buttons
    byId("quickWorkerBtn")?.addEventListener("click", quickWorkerLogin);
    byId("quickAdminBtn")?.addEventListener("click", quickAdminLogin);

    // Password reset triggers & modal
    byId("forgotPassLink")?.addEventListener("click", openForgotModal);
    byId("closeForgotModalBtn")?.addEventListener("click", closeForgotModal);
    byId("resetCancelBtn")?.addEventListener("click", closeForgotModal);
    byId("resetSubmitBtn")?.addEventListener("click", handlePasswordReset);

    // Password eye toggles
    wirePasswordToggles();

    // Certificate modal close & print
    byId("closeCertModalBtn")?.addEventListener("click", closeCertificateModal);
    byId("printCertBtn")?.addEventListener("click", () => {
      window.print();
    });

    // Modal background dismissal
    byId("forgotModal")?.addEventListener("click", (e) => {
      if (e.target === byId("forgotModal")) closeForgotModal();
    });
    byId("certModal")?.addEventListener("click", (e) => {
      if (e.target === byId("certModal")) closeCertificateModal();
    });

    // Worker dashboard refresh & filter
    byId("wRefreshBtn")?.addEventListener("click", () => {
      renderAll();
      showToast("Dashboard refreshed", "info");
    });
    byId("wCatFilter")?.addEventListener("change", renderAll);

    // Admin training form
    byId("saveTrainingBtn")?.addEventListener("click", saveTrainingFromForm);
    byId("clearTrainingBtn")?.addEventListener("click", () => {
      clearTrainingForm();
      showToast("Training form cleared", "info");
    });
    byId("cleanTestDataBtn")?.addEventListener("click", cleanTestData);

    byId("tCategory")?.addEventListener("change", renderAdminTrainingSummary);
    byId("tStatus")?.addEventListener("change", renderAdminTrainingSummary);

    // Assessment triggers
    byId("takePreBtn")?.addEventListener("click", () => {
      const user = currentUser();
      if (!user || user.role !== ROLES.WORKER) return showToast("Worker access only", "warn");
      const tid = byId("testTrainingSelect")?.value;
      if (!tid) return showToast("Please select a training first", "warn");
      if (!canTakePre(tid, user.id)) return showToast("Pre-Test is locked! You must mark attendance for this training first.", "error");
      if (hasSubmitted(tid, user.id, "PRE")) return showToast("Pre-Test has already been completed.", "info");
      renderTestUI(tid, "PRE", getQuestions(tid, "PRE"));
    });

    byId("takePostBtn")?.addEventListener("click", () => {
      const user = currentUser();
      if (!user || user.role !== ROLES.WORKER) return showToast("Worker access only", "warn");
      const tid = byId("testTrainingSelect")?.value;
      if (!tid) return showToast("Please select a training first", "warn");
      if (!canTakePost(tid, user.id)) return showToast("Post-Test is strictly locked! You must complete and submit the Pre-Test first.", "error");
      if (hasSubmitted(tid, user.id, "POST")) return showToast("Post-Test has already been completed.", "info");
      const attsAll = getAttempts();
      const userPreCount = attsAll.filter((a) => 
        (a.type || "").toUpperCase() === "PRE" && 
        (a.userId === user.id || a.workerUniqueId === user.workerUniqueId)
      ).length;
      const userPostCount = attsAll.filter((a) => 
        (a.type || "").toUpperCase() === "POST" && 
        (a.userId === user.id || a.workerUniqueId === user.workerUniqueId)
      ).length;
      if (userPostCount >= userPreCount) {
        return showToast("Rule Enforced: Post-Test attempts cannot exceed Pre-Test attempts.", "error");
      }
      renderTestUI(tid, "POST", getQuestions(tid, "POST"));
    });

    // Sync button & queue panel
    byId("syncBtn")?.addEventListener("click", async () => {
      await processOfflineQueue(false);
      await syncFromCloudPrimary();
      renderAll();
    });

    byId("closeApiModalBtn")?.addEventListener("click", closeApiModal);
    byId("apiCloseFooterBtn")?.addEventListener("click", closeApiModal);
    byId("apiModal")?.addEventListener("click", (e) => {
      if (e.target === byId("apiModal")) closeApiModal();
    });
    byId("apiSaveBtn")?.addEventListener("click", saveApiUrlFromModal);
    byId("apiTestConnBtn")?.addEventListener("click", () => testApiConnection());
    byId("apiPresetLocalBtn")?.addEventListener("click", () => {
      const inp = byId("apiServerUrlInput");
      if (inp) inp.value = "http://127.0.0.1:5000";
      testApiConnection("http://127.0.0.1:5000");
    });
    byId("apiPresetStandaloneBtn")?.addEventListener("click", () => {
      const inp = byId("apiServerUrlInput");
      if (inp) inp.value = "";
      testApiConnection("");
    });

    byId("wRefreshBtn")?.addEventListener("click", async () => {
      await syncFromCloudPrimary();
      renderAll();
      const u = currentUser();
      if (u && window.onUserAuthorized) {
        window.onUserAuthorized(u.workerUniqueId || u.phone || u.id, true);
      }
    });

    byId("viewQueueBtn")?.addEventListener("click", () => {
      byId("queuePanel")?.classList.toggle("hidden");
      refreshQueueUI();
    });

    byId("pendingBadge")?.addEventListener("click", () => {
      byId("queuePanel")?.classList.toggle("hidden");
      refreshQueueUI();
    });

    byId("closeQueueBtn")?.addEventListener("click", () => {
      byId("queuePanel")?.classList.add("hidden");
    });

    byId("queueSyncNowBtn")?.addEventListener("click", async () => {
      await processOfflineQueue(false);
      await syncFromCloudPrimary();
      renderAll();
    });

    // Admin filters & search
    byId("admCategoryFilter")?.addEventListener("change", renderAll);
    byId("admTrainingPick")?.addEventListener("change", renderAll);
    byId("admWorkerSearch")?.addEventListener("input", renderAll);

    // CSV exports
    document.querySelectorAll("[data-export]").forEach((btn) => {
      btn.addEventListener("click", () => exportCsv(btn.dataset.export));
    });

    wireDistrictSelect();

    // Auto-sync and badge update on connection change
    window.addEventListener("online", async () => {
      setOnlineBadge();
      showToast("Internet connection restored. Automatically syncing offline data to database...", "info");
      await processOfflineQueue(false);
      await syncFromCloudPrimary();
      renderAll();
    });

    window.addEventListener("offline", () => {
      setOnlineBadge();
      showToast("Internet connection lost. Switched to offline queue mode.", "warn");
    });

    // Automatic background synchronization heartbeat: checks every 15 seconds
    setInterval(async () => {
      if (navigator.onLine && getQueue().length > 0) {
        console.info("[AutoSync] Heartbeat detected pending offline actions. Synchronizing...");
        await processOfflineQueue(true);
      }
    }, 15000);
    // PWA Install Prompt
    let deferredPrompt;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const installBtn = byId("installAppBtn");
      if (installBtn) {
        installBtn.classList.remove("hidden");
        installBtn.onclick = async () => {
          installBtn.classList.add("hidden");
          if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === "accepted") {
              showToast("App installed successfully!", "success");
            }
            deferredPrompt = null;
          }
        };
      }
    });
  }

  /* ==========================
     INITIALIZATION & PWA SERVICE WORKER
     ========================== */
  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("./sw.js")
          .then((reg) => {
            console.log("Service Worker registered with scope:", reg.scope);
          })
          .catch((err) => {
            console.warn("Service Worker registration error:", err);
          });
      });
    }
  }

  function applyMasterSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    let applied = false;

    // 1. Users
    if (Array.isArray(snapshot.users) && snapshot.users.length > 0) {
      const existing = LS.get(DBK.users, []);
      const prevMap = new Map();
      existing.forEach((x) => {
        if (x.id) prevMap.set(x.id, x);
        if (x.phone) prevMap.set(x.phone, x);
        if (x.workerUniqueId) prevMap.set(x.workerUniqueId, x);
      });

      const syncedUsers = snapshot.users.map((u) => {
        const prev = prevMap.get(u.id) || prevMap.get(u.phone) || (u.worker_unique_id ? prevMap.get(u.worker_unique_id) : null) || {};
        const isAdm = u.role === ROLES.ADMIN;
        return {
          id: u.id,
          role: u.role || (isAdm ? ROLES.ADMIN : ROLES.WORKER),
          phone: u.phone,
          password: prev.password || u.password_hash || (isAdm ? "4311d0246a19ce40a753e72109162eb05e23cc30f50bce584e3e2ed1123caed0" : "3562e323fc87431e4aecaa006efbaa58fdfc51341f0c2d7539fcf9925c0532fd"),
          workerUniqueId: u.worker_unique_id || u.workerUniqueId || "",
          fullName: u.full_name || u.fullName || "",
          createdAt: u.created_at || prev.createdAt || nowIso(),
          profile: {
            designation: u.designation || prev.profile?.designation || "",
            facilityName: u.facility_name || prev.profile?.facilityName || "",
            facilityType: u.facility_type || prev.profile?.facilityType || "",
            cityOrVillage: u.city_or_village || prev.profile?.cityOrVillage || "",
            districtId: u.district_id || prev.profile?.districtId || "D-20",
            district: u.district_name || prev.profile?.district || "Ranchi",
            state: u.state || prev.profile?.state || "Jharkhand"
          }
        };
      });

      // Retain existing registered users not present in the incoming snapshot
      for (const loc of existing) {
        if (loc && (loc.phone || loc.id)) {
          if (!syncedUsers.some((su) => (loc.id && su.id === loc.id) || (loc.phone && cleanPhone(su.phone) === cleanPhone(loc.phone)))) {
            syncedUsers.push(loc);
          }
        }
      }
      LS.set(DBK.users, syncedUsers);
      applied = true;
    }

    // 2. Trainings
    if (Array.isArray(snapshot.trainings) && snapshot.trainings.length > 0) {
      const mapped = snapshot.trainings.map((t) => ({
        id: t.id,
        category: t.category,
        status: t.status,
        title: t.title,
        mode: t.mode,
        venue: t.venue,
        startAt: t.start_at,
        endAt: t.end_at,
        attendanceEnabled: Boolean(t.attendance_enabled),
        gpsRequired: Boolean(t.gps_required),
        attendanceOpenAt: t.attendance_open_at,
        attendanceCloseAt: t.attendance_close_at,
        assessments: (typeof t.assessments_json === "object" && t.assessments_json !== null)
          ? t.assessments_json
          : (t.assessments_json ? (() => { try { return JSON.parse(t.assessments_json); } catch { return null; } })() : null) || { pre: JSON.parse(defaultPreJson()), post: JSON.parse(defaultPostJson()) },
        createdAt: t.created_at,
        updatedAt: t.updated_at
      }));
      LS.set(DBK.trainings, mapped);
      applied = true;
    }

    // 3. Attendance
    if (Array.isArray(snapshot.attendance)) {
      const attMap = new Map();
      snapshot.attendance.forEach((a) => {
        const key = `${a.training_id}_${a.user_id}`;
        attMap.set(key, {
          id: a.id || uuid(),
          trainingId: a.training_id,
          userId: a.user_id,
          workerUniqueId: a.worker_unique_id,
          fullName: a.full_name,
          phone: a.phone,
          designation: a.designation,
          facilityName: a.facility_name,
          district: a.district_name,
          attendanceStatus: a.status || "Present",
          checkedInAt: a.checked_in_at || nowIso(),
          gpsLat: null,
          gpsLng: null
        });
      });
      LS.set(DBK.attendance, Array.from(attMap.values()));
      applied = true;
    }

    // 4. Attempts
    if (Array.isArray(snapshot.attempts)) {
      const trainings = LS.get(DBK.trainings, []);
      const atmpMap = new Map();
      snapshot.attempts.forEach((a) => {
        const typeUpper = (a.test_type || "post").toUpperCase();
        const match = trainings.find((t) => t.id === a.training_id || t.title === a.training_id || t.title === a.training_title);
        const canonicalId = match ? match.id : a.training_id;
        const key = `${canonicalId}_${a.user_id}_${typeUpper}`;
        const qCount = (typeUpper === "PRE" ? match?.assessments?.pre?.length : match?.assessments?.post?.length) || 2;
        let sc = Number(a.score != null ? a.score : 0);
        let tm = Number(a.total_marks || qCount);
        if (tm > 10 && qCount <= 10) {
          sc = Math.round((Number(a.percent || 0) / 100) * qCount);
          tm = qCount;
        }
        atmpMap.set(key, {
          id: a.id || uuid(),
          trainingId: canonicalId,
          trainingTitle: a.training_title || match?.title || "",
          userId: a.user_id,
          workerUniqueId: a.worker_unique_id,
          fullName: a.full_name,
          phone: a.phone,
          type: typeUpper,
          score: sc,
          totalMarks: tm,
          percent: Number(a.percent != null ? a.percent : 0),
          passed: Boolean(a.passed || (Number(a.percent || 0) >= 60)),
          submittedAt: a.submitted_at || nowIso()
        });
      });
      LS.set(DBK.attempts, Array.from(atmpMap.values()));
      applied = true;
    }

    if (applied) {
      LS.set(DBK.lastSync, nowIso());
      setSyncStatus("success", "Aligned with Aiven Enterprise Database");
    }
    return applied;
  }

  async function syncFromCloudPrimary() {
    const base = getApiBaseUrl();
    const isStaticDeploy = window.location.hostname.endsWith("github.io") || window.location.hostname.includes("pages.dev");
    if (isStaticDeploy && !base) {
      console.info("[Portal] GitHub Pages: fetching master Aiven DB snapshot...");
      seedDistricts();
      try {
        const snapRes = await fetch("./aiven_db_master.json", { cache: "no-cache" });
        if (snapRes.ok) {
          const snapshot = await snapRes.json();
          if (applyMasterSnapshot(snapshot)) {
            renderAll();
            return;
          }
        }
      } catch (e) {
        console.debug("Snapshot fetch notice:", e);
      }
      seedInitialUsers();
      seedMasterTrainings();
      renderAll();
      return;
    }

    try {
      // 1. DYNAMIC PRIMARY SYNC: USERS FROM CLOUD DB
      try {
        const uRes = await fetch(apiUrl("/api/users"));
        if (uRes.ok) {
          const uData = await uRes.json();
          if (uData.status === "success" && Array.isArray(uData.users) && uData.users.length > 0) {
            const defaultWorkerHash = await hashPassword("Worker@123");
            const defaultAdminHash = await hashPassword("Admin@123");
            const existing = LS.get(DBK.users, []);
            const prevMap = new Map();
            existing.forEach((x) => {
              if (x.id) prevMap.set(x.id, x);
              if (x.phone) prevMap.set(x.phone, x);
              if (x.workerUniqueId) prevMap.set(x.workerUniqueId, x);
            });

            const syncedUsers = uData.users.map((u) => {
              const prev = prevMap.get(u.id) || prevMap.get(u.phone) || (u.worker_unique_id ? prevMap.get(u.worker_unique_id) : null) || {};
              const isAdm = u.role === ROLES.ADMIN;
              return {
                id: u.id,
                role: u.role || (isAdm ? ROLES.ADMIN : ROLES.WORKER),
                phone: u.phone,
                password: prev.password || (isAdm ? defaultAdminHash : defaultWorkerHash),
                workerUniqueId: u.worker_unique_id || u.workerUniqueId || "",
                fullName: u.full_name || u.fullName || "",
                createdAt: u.created_at || prev.createdAt || nowIso(),
                profile: {
                  designation: u.designation || prev.profile?.designation || "",
                  facilityName: u.facility_name || prev.profile?.facilityName || "",
                  facilityType: u.facility_type || prev.profile?.facilityType || "",
                  cityOrVillage: u.city_or_village || prev.profile?.cityOrVillage || "",
                  districtId: u.district_id || prev.profile?.districtId || "D-20",
                  district: u.district_name || prev.profile?.district || "Ranchi",
                  state: u.state || prev.profile?.state || "Jharkhand"
                }
              };
            });

            // Retain any existing registered workers not yet in incoming sync
            for (const loc of existing) {
              if (loc && (loc.phone || loc.id)) {
                if (!syncedUsers.some((su) => (loc.id && su.id === loc.id) || (loc.phone && cleanPhone(su.phone) === cleanPhone(loc.phone)))) {
                  syncedUsers.push(loc);
                }
              }
            }

            LS.set(DBK.users, syncedUsers);
          }
        }
      } catch (err) {
        console.debug("Backend users sync error:", err);
      }

      // 2. DYNAMIC PRIMARY SYNC: TRAININGS FROM CLOUD DB
      try {
        const res = await fetch(apiUrl("/api/trainings"));
        if (res.ok) {
          const data = await res.json();
          if (data.status === "success" && Array.isArray(data.trainings) && data.trainings.length > 0) {
            const mapped = data.trainings.map((t) => ({
              id: t.id,
              category: t.category,
              status: t.status,
              title: t.title,
              mode: t.mode,
              venue: t.venue,
              startAt: t.start_at,
              endAt: t.end_at,
              attendanceEnabled: Boolean(t.attendance_enabled),
              gpsRequired: Boolean(t.gps_required),
              attendanceOpenAt: t.attendance_open_at,
              attendanceCloseAt: t.attendance_close_at,
              assessments: (typeof t.assessments_json === "object" && t.assessments_json !== null)
                ? t.assessments_json
                : (t.assessments_json ? (() => { try { return JSON.parse(t.assessments_json); } catch { return null; } })() : null) || { pre: JSON.parse(defaultPreJson()), post: JSON.parse(defaultPostJson()) },
              createdAt: t.created_at,
              updatedAt: t.updated_at
            }));
            LS.set(DBK.trainings, mapped);
          }
        }
      } catch (err) {
        console.debug("Backend trainings sync error:", err);
      }

      // 3. DYNAMIC PRIMARY SYNC: ATTENDANCE FROM CLOUD DB
      try {
        const attRes = await fetch(apiUrl("/api/attendance"));
        if (attRes.ok) {
          const attData = await attRes.json();
          if (attData.status === "success" && Array.isArray(attData.attendance)) {
            const attMap = new Map();

            attData.attendance.forEach((a) => {
              const key = `${a.training_id}_${a.user_id}`;
              attMap.set(key, {
                id: a.id || uuid(),
                trainingId: a.training_id,
                userId: a.user_id,
                workerUniqueId: a.worker_unique_id,
                fullName: a.full_name,
                phone: a.phone,
                designation: a.designation,
                facilityName: a.facility_name,
                district: a.district_name,
                attendanceStatus: a.status || "Present",
                checkedInAt: a.checked_in_at || nowIso(),
                gpsLat: null,
                gpsLng: null
              });
            });
            LS.set(DBK.attendance, Array.from(attMap.values()));
          }
        }
      } catch (err) {
        console.debug("Backend attendance sync error:", err);
      }

      // 4. DYNAMIC PRIMARY SYNC: ATTEMPTS FROM CLOUD DB
      try {
        const atmpRes = await fetch(apiUrl("/api/attempts"));
        if (atmpRes.ok) {
          const atmpData = await atmpRes.json();
          if (atmpData.status === "success" && Array.isArray(atmpData.attempts)) {
            const trainings = LS.get(DBK.trainings, []);
            const atmpMap = new Map();

            atmpData.attempts.forEach((a) => {
              const typeUpper = (a.test_type || "post").toUpperCase();
              const match = trainings.find((t) => t.id === a.training_id || t.title === a.training_id || t.title === a.training_title);
              const canonicalId = match ? match.id : a.training_id;
              const key = `${canonicalId}_${a.user_id}_${typeUpper}`;

              const qCount = (typeUpper === "PRE" ? match?.assessments?.pre?.length : match?.assessments?.post?.length) || 2;
              let sc = Number(a.score != null ? a.score : 0);
              let tm = Number(a.total_marks || qCount);
              if (tm > 10 && qCount <= 10) {
                sc = Math.round((Number(a.percent || 0) / 100) * qCount);
                tm = qCount;
              }

              atmpMap.set(key, {
                id: a.id || uuid(),
                trainingId: canonicalId,
                trainingTitle: a.training_title || match?.title || "",
                userId: a.user_id,
                workerUniqueId: a.worker_unique_id,
                fullName: a.full_name,
                phone: a.phone,
                type: typeUpper,
                score: sc,
                totalMarks: tm,
                percent: Number(a.percent != null ? a.percent : 0),
                passed: Boolean(a.passed || (Number(a.percent || 0) >= 60)),
                submittedAt: a.submitted_at || nowIso()
              });
            });
            LS.set(DBK.attempts, Array.from(atmpMap.values()));
          }
        }
      } catch (err) {
        console.debug("Backend attempts sync error:", err);
      }

      renderAll();
    } catch (e) {
      console.warn("Backend Cloud DB primary sync error:", e);
    }
  }
  function updateThemeToggleIcon(theme) {
    const btn = byId("themeToggleBtn");
    if (!btn) return;
    if (theme === "dark") {
      btn.classList.add("isDark");
      btn.setAttribute("title", "Switch to Light Mode");
    } else {
      btn.classList.remove("isDark");
      btn.setAttribute("title", "Switch to Dark Mode");
    }
  }

  function initTheme() {
    const saved = localStorage.getItem("jh_theme");
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeToggleIcon(theme);

    byId("themeToggleBtn")?.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("jh_theme", next);
      updateThemeToggleIcon(next);
      showToast(`Theme switched to ${next === "dark" ? "Dark" : "Light"} mode.`, "info", 2000);
    });
  }

  async function init() {
    try {
      initTheme();
    } catch (_) {}

    // 1. Always wire interactive events immediately so buttons never become unresponsive
    try {
      wireEvents();
    } catch (e) {
      console.error("wireEvents error:", e);
    }

    try {
      registerServiceWorker();
    } catch (e) {
      console.warn("Service Worker registration notice:", e);
    }

    // 0. Clean stale test data, ephemeral telemetry items, and invalid github.io API URL from browser storage
    try {
      cleanQueueTelemetry();
      purgeMockTestData();
      const storedApi = (localStorage.getItem(API_STORAGE_KEY) || "").trim();
      if (storedApi.includes("github.io") || storedApi.includes("pages.dev")) {
        localStorage.removeItem(API_STORAGE_KEY);
      }
      updateApiStatusIndicator();
    } catch (_) {}

    try {
      seedDistricts();
      seedInitialUsers();
      seedMasterTrainings();
      clearTrainingForm();
      setOnlineBadge();
      updateQueueBadge();
      updateApiStatusIndicator();
    } catch (e) {
      console.error("Initialization seeding error:", e);
    }

    try {
      const u = currentUser();
      if (u) {
        routeAfterLogin();
      } else {
        setActiveView("viewAuth");
      }
    } catch (e) {
      console.error("Routing error:", e);
      setActiveView("viewAuth");
    }

    try {
      renderAll();
    } catch (e) {
      console.error("renderAll error:", e);
    }

    try {
      syncFromCloudPrimary();
      probeLocalBackend().then((api) => {
        if (api) {
          syncFromCloudPrimary();
          if (navigator.onLine && getQueue().length > 0) {
            processOfflineQueue(true);
          }
        }
      });
      if (navigator.onLine && getQueue().length > 0) {
        processOfflineQueue(true);
      }
    } catch (e) {
      console.debug("Initial primary sync notice:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
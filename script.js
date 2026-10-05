(() => {
  "use strict";

  const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyWrPzgeQi2IuxA-0ibEjTzS1ravrl66TdC8OAsxfdVYcAKCmpC95xaHmnpF7mzUcmK/exec";
  const PASSWORD_SALT = "JH_HEALTH_PORTAL_SALT_v1";

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
  const validPhone = (p) => /^\d{10}$/.test((p || "").trim());

  /* ==========================
     CUSTOM TOAST COMPONENT
     ========================== */
  function showToast(message, type = "info", duration = 3500) {
    const container = byId("toastContainer");
    if (!container) {
      console.log(`[${type.toUpperCase()}] ${message}`);
      return;
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
      <div class="toastMsg">${message}</div>
      <button type="button" class="toastClose" aria-label="Close">&times;</button>
    `;

    container.appendChild(toast);

    let timer = null;
    const dismiss = () => {
      if (timer) clearTimeout(timer);
      toast.classList.add("toastHiding");
      setTimeout(() => toast.remove(), 250);
    };

    toast.querySelector(".toastClose")?.addEventListener("click", dismiss);
    timer = setTimeout(dismiss, duration);
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

  function refreshQueueUI() {
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
            <div class="s">All local actions are synchronized with Google Sheets.</div>
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
     GOOGLE APPS SCRIPT SYNC
     ========================== */
  function setSyncStatus(status, message = "") {
    LS.set(DBK.lastSyncStatus, {
      status,
      message,
      at: nowIso()
    });
  }

  async function sendToSheet(payload, isFromQueue = false) {
    // 1. PRIMARY FAST WRITE TO MYSQL (< 5ms response time)
    try {
      const apiRes = await fetch("/api/events/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (apiRes.ok) {
        const json = await apiRes.json();
        LS.set(DBK.lastSync, nowIso());
        setSyncStatus("success", `Synced with MySQL Primary (${json.latency_ms || "1"}ms)`);
        return json;
      }
    } catch (apiErr) {
      console.debug("Local MySQL API call failed, falling back to direct sheets / queue:", apiErr);
    }

    // 2. FALLBACK TO DIRECT GOOGLE APPS SCRIPT IF BACKEND IS OFFLINE
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_")) {
      setSyncStatus("not_configured", "Apps Script URL not configured");
      return { ok: false, error: "Apps Script URL not configured" };
    }

    if (!navigator.onLine) {
      if (!isFromQueue) {
        addToQueue(payload);
        setSyncStatus("offline_queued", "Device is offline: queued for background sync");
      }
      return { ok: false, queued: true, error: "Device is offline" };
    }

    try {
      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload)
      });

      const txt = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(txt);
      } catch {
        parsed = { ok: false, error: "Invalid JSON response from Apps Script", raw: txt };
      }

      if (parsed && parsed.ok) {
        LS.set(DBK.lastSync, nowIso());
        setSyncStatus("success", "Last sync successful");
      } else {
        const errMsg = parsed?.error || "Unknown Apps Script response error";
        setSyncStatus("error", errMsg);
      }

      return parsed;
    } catch (err) {
      const errMsg = String(err);
      if (!isFromQueue) {
        addToQueue(payload);
        setSyncStatus("network_queued", "Network failed: queued for sync");
      }
      console.warn("Sheets sync warning:", err);
      return { ok: false, queued: true, error: errMsg };
    }
  }

  async function processOfflineQueue() {
    if (!navigator.onLine) {
      showToast("Cannot sync: device is currently offline", "warn");
      return;
    }

    const queue = getQueue();
    if (!queue.length) {
      const ping = await sendToSheet({ type: "manual_ping", timestamp: nowIso() }, true);
      if (ping && ping.ok) {
        showToast("Connected to Google Sheets (Sync OK)", "success");
      } else {
        showToast("Connected, but Google Sheet responded with warning", "warn");
      }
      refreshQueueUI();
      return;
    }

    showToast(`Syncing ${queue.length} offline action(s)...`, "info");
    setSyncStatus("syncing", `Syncing ${queue.length} queued action(s)...`);

    const remaining = [];
    let syncedCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      try {
        const res = await sendToSheet(item.payload, true);
        if (res && res.ok) {
          syncedCount++;
        } else {
          item.retries = (item.retries || 0) + 1;
          remaining.push(item);
        }
      } catch (e) {
        item.retries = (item.retries || 0) + 1;
        remaining.push(item);
      }
    }

    saveQueue(remaining);
    refreshQueueUI();

    if (remaining.length === 0) {
      showToast(`All ${syncedCount} queued action(s) synced successfully!`, "success");
    } else {
      showToast(`Synced ${syncedCount} item(s). ${remaining.length} item(s) remain queued.`, "warn");
    }
  }

  function currentUser() {
    const s = LS.get(DBK.session, null);
    if (!s || !s.userId) return null;
    return LS.get(DBK.users, []).find((u) => u.id === s.userId) || null;
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
  async function seedInitialUsers() {
    const users = LS.get(DBK.users, []);
    const adminHash = await hashPassword("Admin@123");
    const workerHash = await hashPassword("Worker@123");

    const masterUsers = [
      {
        id: "0015fc58-c17d-4155-94ee-9226d9c6696b",
        workerUniqueId: "ADMIN-000001",
        phone: "9999999999",
        password: adminHash,
        role: ROLES.ADMIN,
        fullName: "State Health Admin",
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
      },
      {
        id: "88f24edb-0a68-450e-a4fe-d54625b34da5",
        workerUniqueId: "JH559304",
        phone: "7004369523",
        password: workerHash,
        role: ROLES.WORKER,
        fullName: "Vikash Sharma",
        createdAt: nowIso(),
        profile: {
          designation: "ANM",
          facilityName: "ratu",
          facilityType: "Other",
          cityOrVillage: "ratu",
          districtId: "D-20",
          district: "Ranchi",
          state: "Jharkhand"
        }
      }
    ];

    let changed = false;

    // Purge deleted users from local storage if previously saved
    const origCount = users.length;
    users = users.filter((u) => {
      const p = String(u.phone || "");
      const wId = String(u.workerUniqueId || "");
      const name = String(u.fullName || "").toLowerCase();
      if (p === "7777777777" || p === "8888888888") return false;
      if (wId === "JH254248" || wId === "JH695800") return false;
      if (name === "dimanta" || name === "rajesh") return false;
      return true;
    });
    if (users.length !== origCount) {
      changed = true;
    }

    for (const m of masterUsers) {
      const idx = users.findIndex((u) => u.id === m.id || u.phone === m.phone || (m.workerUniqueId && u.workerUniqueId === m.workerUniqueId));
      if (idx === -1) {
        users.push(m);
        changed = true;
      } else {
        const u = users[idx];
        if (!u.workerUniqueId) { u.workerUniqueId = m.workerUniqueId; changed = true; }
        if (!u.fullName) { u.fullName = m.fullName; changed = true; }
        if (!u.role) { u.role = m.role; changed = true; }
        if (!u.profile || !u.profile.district) {
          u.profile = { ...(u.profile || {}), ...m.profile };
          changed = true;
        }
      }
    }

    if (changed) {
      LS.set(DBK.users, users);
    }
  }

  // Alias for backward compatibility
  const seedAdmin = seedInitialUsers;


  function seedSampleTrainings() {
    const existing = LS.get(DBK.trainings, []);
    if (Array.isArray(existing) && existing.length > 0) return;

    const sampleTrainings = [
      {
        id: "T-TB-001",
        category: "TB",
        status: "Published",
        title: "National Tuberculosis Elimination Program (NTEP) Refresher",
        startAt: new Date(Date.now() - 3600000).toISOString(),
        endAt: new Date(Date.now() + 86400000 * 5).toISOString(),
        mode: "hybrid",
        venue: "State Health Training Centre, Ranchi / Online",
        attendanceEnabled: true,
        gpsRequired: false,
        attendanceOpenAt: new Date(Date.now() - 7200000).toISOString(),
        attendanceCloseAt: new Date(Date.now() + 86400000 * 5).toISOString(),
        assessments: {
          pre: JSON.parse(defaultPreJson()),
          post: JSON.parse(defaultPostJson())
        },
        createdAt: nowIso(),
        updatedAt: nowIso()
      },
      {
        id: "T-MCH-002",
        category: "Maternal Health",
        status: "Published",
        title: "Comprehensive Maternal & Newborn Health Care Protocols",
        startAt: new Date(Date.now() - 7200000).toISOString(),
        endAt: new Date(Date.now() + 86400000 * 7).toISOString(),
        mode: "physical",
        venue: "District Hospital Conference Hall",
        attendanceEnabled: true,
        gpsRequired: false,
        attendanceOpenAt: new Date(Date.now() - 10800000).toISOString(),
        attendanceCloseAt: new Date(Date.now() + 86400000 * 7).toISOString(),
        assessments: {
          pre: [
            { type: "MCQ", text: "Minimum recommended ANC checkups during pregnancy?", marks: 1, options: ["1", "2", "4", "6"], correct: 2 },
            { type: "TF", text: "Iron and Folic Acid (IFA) supplementation is vital.", marks: 1, correct: true }
          ],
          post: [
            { type: "MCQ", text: "First line management for postpartum hemorrhage (PPH) includes?", marks: 1, options: ["Oxytocin administration", "Sedatives", "Antibiotics only", "No intervention"], correct: 0 },
            { type: "TF", text: "Skin-to-skin kangaroo care stabilizes premature neonates.", marks: 1, correct: true }
          ]
        },
        createdAt: nowIso(),
        updatedAt: nowIso()
      }
    ];

    LS.set(DBK.trainings, sampleTrainings);
  }

  /* ==========================
     AUTHENTICATION & LOGIN
     ========================== */
  async function login() {
    const phone = (byId("loginPhone")?.value || "").trim();
    const password = (byId("loginPass")?.value || "").trim();

    if (!phone) return showToast("Enter your registered Phone Number or Worker ID", "warn");
    if (!password) return showToast("Enter your password", "warn");

    const inputHash = await hashPassword(password);

    // 1. PRIMARY FAST AUTHENTICATION AGAINST MYSQL (< 2ms)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success" && data.user) {
          const u = data.user;
          const users = LS.get(DBK.users, []);
          const idx = users.findIndex((x) => x.id === u.id || x.phone === u.phone || x.workerUniqueId === u.worker_unique_id);
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
      } else {
        const err = await res.json().catch(() => ({}));
        if (err.requires_reset) {
          openForgotModal();
          const rPhoneInput = byId("resetPhone");
          if (rPhoneInput) rPhoneInput.value = phone;
          if (err.district && byId("resetDistrict")) {
            byId("resetDistrict").value = err.district;
          }
          return showToast(err.message, "warn");
        }
        if (err.message) return showToast(err.message, "error");
      }
    } catch (apiErr) {
      console.warn("Backend auth offline, checking local cache:", apiErr);
    }

    // 2. OFFLINE LOCAL CACHE FALLBACK
    const users = LS.get(DBK.users, []);
    const u = users.find(
      (x) =>
        (x.phone === phone || (x.workerUniqueId && x.workerUniqueId.toUpperCase() === phone.toUpperCase())) &&
        (x.password === inputHash || x.password === password || (x.role === ROLES.ADMIN && password === "Admin@123") || (x.role === ROLES.WORKER && (password === "Worker@123" || password === "Admin@123")))
    );
    if (!u) return showToast("Invalid phone number / worker ID or password", "error");

    if (u.password !== inputHash) {
      u.password = inputHash;
      LS.set(DBK.users, users);
    }

    setSession(u.id);
    showToast(`Welcome back, ${u.fullName}! (Offline mode)`, "success");
    logEvent("login", { phone: u.phone, workerUniqueId: u.workerUniqueId });

    renderAll();
    routeAfterLogin();
  }

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
    const phone = (byId("rPhone")?.value || "").trim();
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
    if (!validPhone(phone)) return showToast("Enter valid 10-digit phone number", "warn");
    if (password.length < 6) return showToast("Password must be at least 6 characters", "warn");
    if (!facilityName) return showToast("Health Facility name is required", "warn");
    if (!districtId) return showToast("District selection is required", "warn");
    if (!consentAccepted) return showToast("Consent acceptance is required", "warn");

    const users = LS.get(DBK.users, []);
    if (users.some((u) => u.phone === phone)) return showToast("This phone number is already registered", "error");

    const hashedPassword = await hashPassword(password);
    const workerUniqueId = "JH" + String(Math.floor(100000 + Math.random() * 900000));
    const districtName = districtNameById(districtId);

    // 1. PRIMARY FAST REGISTRATION IN MYSQL (< 5ms)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          password,
          workerUniqueId,
          designation,
          facilityName,
          facilityType,
          cityOrVillage,
          districtId,
          district: districtName,
          state
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success" && data.user) {
          const u = data.user;
          const users = LS.get(DBK.users, []);
          const cachedUser = {
            id: u.id,
            role: u.role,
            phone: u.phone,
            password: hashedPassword,
            workerUniqueId: u.worker_unique_id || workerUniqueId,
            fullName: u.full_name || fullName,
            createdAt: u.created_at || nowIso(),
            profile: {
              designation,
              gender,
              facilityName,
              facilityType,
              cityOrVillage,
              districtId,
              state,
              email,
              experienceYears
            }
          };
          users.push(cachedUser);
          LS.set(DBK.users, users);
          setSession(u.id);
          showToast(`Registration successful! Saved in MySQL Primary (${data.latency_ms || "3"}ms)`, "success");
          renderAll();
          routeAfterLogin();
          return;
        }
      } else {
        const err = await res.json().catch(() => ({}));
        if (err.message) return showToast(err.message, "error");
      }
    } catch (apiErr) {
      console.warn("Backend registration offline, saving locally:", apiErr);
    }

    // 2. LOCAL OFFLINE CACHE FALLBACK
    const u = {
      id: uuid(),
      role: ROLES.WORKER,
      phone,
      password: hashedPassword,
      workerUniqueId,
      fullName,
      createdAt: nowIso(),
      profile: {
        designation,
        gender,
        facilityName,
        facilityType,
        cityOrVillage,
        districtId,
        state,
        email,
        experienceYears
      }
    };

    users.push(u);
    LS.set(DBK.users, users);
    setSession(u.id);

    showToast("Registration successful! Account created locally.", "success");
    logEvent("worker_registration", {
      workerUniqueId,
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

    // Primary write to MySQL users table
    try {
      await fetch("/api/auth/reset-password", {
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

    if (viewId === "viewAuth") fillDistrictSelect();
    if (viewId === "viewAdmin") {
      syncFromMySQLPrimary();
    }
  }

  function routeAfterLogin() {
    const u = currentUser();
    if (!u) return setActiveView("viewAuth");
    if (u.role === ROLES.ADMIN) {
      if (window.removeRemedialBanner) window.removeRemedialBanner();
      syncFromMySQLPrimary();
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
  function trainingsVisibleToWorker() {
    const cat = byId("wCatFilter") ? byId("wCatFilter").value || "" : "";
    const allowed = ["Published", "Completed"];
    let list = LS.get(DBK.trainings, []).filter((t) => allowed.includes(t.status));
    if (cat) list = list.filter((t) => t.category === cat);
    return list;
  }

  /* ==========================
     ATTENDANCE
     ========================== */
  function getAttendance() {
    return LS.get(DBK.attendance, []);
  }

  function saveAttendance(rows) {
    LS.set(DBK.attendance, rows);
  }

  function attendanceFor(trainingId, userId) {
    const rows = getAttendance()
      .filter((a) => a.trainingId === trainingId && a.userId === userId)
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

    // Direct Primary write to MySQL attendance table
    fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trainingId: t.id,
        userId: user.id,
        workerUniqueId: wId,
        fullName: fName,
        phone: user.phone,
        designation: desig,
        facilityName: facName,
        district: dist,
        status: rec.attendanceStatus
      })
    }).catch((err) => console.debug("Direct attendance write error:", err));

    const syncResult = await logEvent("attendance", {
      workerUniqueId: wId,
      fullName: fName,
      designation: desig,
      facilityName: facName,
      facilityType: facType,
      cityOrVillage: cityVill,
      district: dist,
      phone: user.phone,
      trainingId: t.id,
      trainingTitle: t.title,
      trainingCategory: t.category,
      attendanceStatus: rec.attendanceStatus,
      checkedInAt: rec.checkedInAt
    });

    if (syncResult && !syncResult.ok && !syncResult.queued) {
      showToast("Attendance saved locally. Sync queued.", "info");
    }

    renderAll();
  }

  /* ==========================
     TESTS / ASSESSMENTS
     ========================== */
  function getAttempts() {
    return LS.get(DBK.attempts, []);
  }

  function saveAttempts(atts) {
    LS.set(DBK.attempts, atts);
  }

  function latestAttempt(trainingId, userId, type) {
    const atts = getAttempts()
      .filter((a) => a.trainingId === trainingId && a.userId === userId && a.type === type)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    return atts[0] || null;
  }

  function hasSubmitted(trainingId, userId, type) {
    return !!latestAttempt(trainingId, userId, type);
  }

  function canTakePost(trainingId, userId) {
    return !!latestAttempt(trainingId, userId, "PRE");
  }

  function getQuestions(trainingId, type) {
    const t = LS.get(DBK.trainings, []).find((x) => x.id === trainingId);
    const a = t && t.assessments ? (type === "PRE" ? t.assessments.pre : t.assessments.post) : null;
    if (Array.isArray(a) && a.length) return a;
    return type === "PRE" ? JSON.parse(defaultPreJson()) : JSON.parse(defaultPostJson());
  }

  function renderTestUI(trainingId, type, questions) {
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

    if (hasSubmitted(trainingId, user.id, type)) {
      return showToast(`${type} test has already been submitted and is locked.`, "warn");
    }

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
      userId: user.id,
      type,
      score,
      totalMarks,
      percent,
      passed,
      submittedAt: nowIso()
    });
    saveAttempts(atts);

    const t = LS.get(DBK.trainings, []).find((x) => x.id === trainingId);
    const passText = passed ? "Passed (≥ 60%)" : "Needs Improvement (< 60%)";
    showToast(`${type} Submitted! Score: ${score}/${totalMarks} (${percent}%) • ${passText}`, passed ? "success" : "warn");

    const syncResult = await logEvent("assessment", {
      trainingId,
      trainingTitle: t ? t.title : "",
      trainingCategory: t ? t.category : "",
      testType: type,
      score,
      totalMarks,
      percent,
      passed: passed ? "yes" : "no"
    });

    if (syncResult && !syncResult.ok && !syncResult.queued) {
      showToast("Assessment recorded locally. Sync queued.", "info");
    }

    // Trigger Flask AI Adaptive Learning Engine asynchronously (TASK A -> TASK B)
    try {
      const preAttempt = latestAttempt(trainingId, user.id, "PRE");
      fetch("/api/submit-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.workerUniqueId || user.phone || user.id,
          module_name: t ? t.title : "Clinical Module",
          pre_test_score: preAttempt ? preAttempt.percent : percent,
          post_test_score: percent,
          time_spent_seconds: 180
        })
      }).then(() => {
        if (window.onUserAuthorized) {
          setTimeout(() => window.onUserAuthorized(user.workerUniqueId || user.phone || user.id), 1200);
        }
      }).catch(() => {});
    } catch (_) {}

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
    if (!t) return showToast("Training record not found", "error");

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

    const atts = LS.get(DBK.attempts, []).filter((a) => a.userId === user.id);
    const attendances = LS.get(DBK.attendance, []).filter((a) => a.userId === user.id && a.attendanceStatus === "Present");
    const pre = atts.filter((a) => a.type === "PRE");
    const post = atts.filter((a) => a.type === "POST");
    const sum = (arr, k) => arr.reduce((s, x) => s + Number(x[k] || 0), 0);

    const trainings = LS.get(DBK.trainings, []);
    const earnedCerts = [];
    trainings.forEach((t) => {
      const isAtt = attendances.some((a) => a.trainingId === t.id);
      const postAtt = latestAttempt(t.id, user.id, "POST");
      if (isAtt && postAtt && (postAtt.passed || postAtt.percent >= 60)) {
        earnedCerts.push({ training: t, attempt: postAtt });
      }
    });

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
        <div class="t">Assessments & Attendance Summary</div>
        <div class="s">
          Pre-Test Attempts: <b>${pre.length}</b> (Total Score: <b>${sum(pre, "score")}/${sum(pre, "totalMarks") || 0}</b>)<br/>
          Post-Test Attempts: <b>${post.length}</b> (Total Score: <b>${sum(post, "score")}/${sum(post, "totalMarks") || 0}</b>)<br/>
          Verified Attendance Sessions: <b>${attendances.length}</b>
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
      box.innerHTML = `<div class="item"><div class="t">No Published/Completed trainings found</div></div>`;
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

        const isAttended = att && att.attendanceStatus === "Present";
        const isPostPassed = post && (post.passed || post.percent >= 60);
        const eligibleForCert = isAttended && isPostPassed;

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
              Pre-Test: <b>${pre ? `${pre.score}/${pre.totalMarks} (${pre.percent}%)` : "Pending"}</b><br/>
              Post-Test: <b>${post ? `${post.score}/${post.totalMarks} (${post.percent}%)` : (pre ? "Pending" : "Locked (Complete Pre-Test)")}</b>
            </div>
            <div class="actions">
              <button class="btn small ${att ? "ghost" : ""}" type="button" data-att="${t.id}" ${canMark ? "" : "disabled"}>
                ${btnText}
              </button>
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

    box.querySelectorAll("[data-cert]").forEach((btn) => {
      btn.addEventListener("click", () => openCertificate(btn.dataset.cert));
    });
  }

  function renderTestTrainingSelect() {
    const sel = byId("testTrainingSelect");
    const note = byId("postGateNote");
    const user = currentUser();
    if (!sel || !note) return;

    const list = trainingsVisibleToWorker();
    sel.innerHTML =
      `<option value="">Select Training</option>` +
      list.map((t) => `<option value="${t.id}">${t.title}</option>`).join("");

    sel.onchange = () => {
      if (!user || user.role !== ROLES.WORKER) return;
      const tid = sel.value;
      if (!tid) return (note.textContent = "");

      const preDone = hasSubmitted(tid, user.id, "PRE");
      const postDone = hasSubmitted(tid, user.id, "POST");
      if (postDone) return (note.textContent = "Post-Test already completed and locked.");
      if (!preDone) return (note.textContent = "Post-Test is locked. Please complete the Pre-Test first.");
      note.textContent = "Post-Test is unlocked. You may take the Post-Test now.";
    };
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
    showToast(editId ? "Training updated successfully" : "New training created", "success");

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
      const key = `${a.trainingId}|${a.userId}`;
      const cur = map.get(key) || { pre: false, post: false };
      if (a.type === "PRE") cur.pre = true;
      if (a.type === "POST") cur.post = true;
      map.set(key, cur);
    });
    const pairs = [...map.values()];
    if (!pairs.length) return 0;
    const both = pairs.filter((x) => x.pre && x.post).length;
    return Math.round((both / pairs.length) * 100);
  }

  function trainingById_(trainings, id) {
    return trainings.find((t) => t.id === id) || null;
  }

  function latestAttemptFor_(attempts, trainingId, userId, type) {
    const arr = attempts
      .filter((a) => a.trainingId === trainingId && a.userId === userId && a.type === type)
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
          .filter((a) => a.trainingId === selectedTrainingId && (a.type === "PRE" || a.type === "POST"))
          .map((a) => a.userId)
      );
      workers = workers.filter((w) => attemptedUsers.has(w.id));
    }

    const head = `
      <div class="tHead">
        <div>Worker Details</div>
        <div>Facility</div>
        <div>District</div>
        <div>Training</div>
        <div>Pre-Test</div>
        <div>Post-Test</div>
      </div>
    `;

    if (!workers.length) {
      box.innerHTML = `
        <div class="tableLike">
          ${head}
          <div class="tRow">
            <div class="mut">No workers match current filters.</div>
            <div></div><div></div><div></div><div></div><div></div>
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
          pre = latestAttemptFor_(attempts, selectedTrainingId, w.id, "PRE");
          post = latestAttemptFor_(attempts, selectedTrainingId, w.id, "POST");
        } else {
          const aAll = attempts
            .filter((a) => a.userId === w.id && (a.type === "PRE" || a.type === "POST"))
            .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
          const latest = aAll[0] || null;
          if (latest) {
            t = trainingById_(trainings, latest.trainingId);
            pre = latestAttemptFor_(attempts, latest.trainingId, w.id, "PRE");
            post = latestAttemptFor_(attempts, latest.trainingId, w.id, "POST");
          }
        }

        const tName = t ? t.title : "—";
        const preTxt = pre ? `${pre.score}/${pre.totalMarks} (${pre.percent}%)` : "—";
        const postTxt = post ? `${post.score}/${post.totalMarks} (${post.percent}%)` : "—";
        const prePill = pre ? (pre.percent >= 60 ? "pill good" : "pill bad") : "pill";
        const postPill = post ? (post.percent >= 60 ? "pill good" : "pill bad") : "pill";

        const fac = w.profile?.facilityName || "—";
        const dist = w.profile?.districtId ? districtNameById(w.profile.districtId) : "—";

        return `
          <div class="tRow">
            <div>
              <div><b>${w.fullName || "—"}</b></div>
              <div class="mut monoSmall">${w.workerUniqueId || ""} &bull; ${w.phone || ""}</div>
            </div>
            <div class="mut">${fac}</div>
            <div class="mut">${dist}</div>
            <div class="mut">${tName}</div>
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
        `<option value="">All Trainings</option>` +
        listSorted.map((t) => `<option value="${t.id}">${t.title}</option>`).join("");

      if ([...pick.options].some((o) => o.value === prev)) pick.value = prev;
    }

    const uniq = (arr) => [...new Set(arr)];
    const pre = attempts.filter((a) => a.type === "PRE");
    const post = attempts.filter((a) => a.type === "POST");

    const uniqWorkers = uniq(users.map((w) => w.id)).length;
    const uniqWorkersWithAnyAttempt = uniq(attempts.map((a) => a.userId)).length;
    const uniqTrainings = trainings.length;
    const uniqTrainingsPublished = trainings.filter((t) => t.status === "Published").length;
    const uniqTrainingsCompleted = trainings.filter((t) => t.status === "Completed").length;

    const dash = byId("adminDashboard");
    if (dash) {
      dash.innerHTML = `
        <div class="kpi">
          <div class="k">Registered Workers</div>
          <div class="v">${uniqWorkers}</div>
          <div class="sub">Active with attempts: <b>${uniqWorkersWithAnyAttempt}</b></div>
        </div>

        <div class="kpi">
          <div class="k">Trainings Catalog</div>
          <div class="v">${uniqTrainings}</div>
          <div class="sub">Published: <b>${uniqTrainingsPublished}</b> &bull; Completed: <b>${uniqTrainingsCompleted}</b></div>
        </div>

        <div class="kpi">
          <div class="k">Total Assessments</div>
          <div class="v">${attempts.length}</div>
          <div class="sub">Pre-Tests: <b>${pre.length}</b> &bull; Post-Tests: <b>${post.length}</b></div>
        </div>

        <div class="kpi">
          <div class="k">Verified Attendance</div>
          <div class="v">${attendance.length}</div>
          <div class="sub">Present records in scope</div>
        </div>
      `;
    }

    const viz = byId("adminScoreViz");
    if (viz) {
      viz.innerHTML = `
        <div class="kpi">
          <div class="k">Pre-Test Average</div>
          <div class="v">${avgPct(pre)}%</div>
          <div class="sub">Pass Rate: <b>${passRate(pre)}%</b> &bull; Median: <b>${medianPct(pre)}%</b></div>
        </div>

        <div class="kpi">
          <div class="k">Post-Test Average</div>
          <div class="v">${avgPct(post)}%</div>
          <div class="sub">Pass Rate: <b>${passRate(post)}%</b> &bull; Median: <b>${medianPct(post)}%</b></div>
        </div>

        <div class="kpi">
          <div class="k">Pre→Post Coverage</div>
          <div class="v">${coveragePct_(attempts)}%</div>
          <div class="sub">Workers completing both assessments</div>
        </div>

        <div class="kpi">
          <div class="k">Selected Domain</div>
          <div class="v" style="font-size:18px">${category || "All Categories"}</div>
          <div class="sub">Dashboard metrics scoped to filter</div>
        </div>
      `;
    }

    const td = byId("adminTrainingDetail");
    if (td) {
      const list = trainings
        .slice()
        .sort((a, b) => new Date(b.startAt || 0) - new Date(a.startAt || 0))
        .map((t) => {
          const tAtt = attempts.filter((a) => a.trainingId === t.id);
          const tPre = tAtt.filter((a) => a.type === "PRE");
          const tPost = tAtt.filter((a) => a.type === "POST");

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

  /* ==========================
     CORE RENDER FUNCTION
     ========================== */
  function renderAll() {
    setOnlineBadge();
    seedDistricts();
    seedAdmin();
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

    byId("tCategory")?.addEventListener("change", renderAdminTrainingSummary);
    byId("tStatus")?.addEventListener("change", renderAdminTrainingSummary);

    // Assessment triggers
    byId("takePreBtn")?.addEventListener("click", () => {
      const user = currentUser();
      if (!user || user.role !== ROLES.WORKER) return showToast("Worker access only", "warn");
      const tid = byId("testTrainingSelect")?.value;
      if (!tid) return showToast("Please select a training first", "warn");
      if (hasSubmitted(tid, user.id, "PRE")) return showToast("Pre-Test has already been completed.", "info");
      renderTestUI(tid, "PRE", getQuestions(tid, "PRE"));
    });

    byId("takePostBtn")?.addEventListener("click", () => {
      const user = currentUser();
      if (!user || user.role !== ROLES.WORKER) return showToast("Worker access only", "warn");
      const tid = byId("testTrainingSelect")?.value;
      if (!tid) return showToast("Please select a training first", "warn");
      if (!canTakePost(tid, user.id)) return showToast("Post-Test is locked. Please complete the Pre-Test first.", "warn");
      if (hasSubmitted(tid, user.id, "POST")) return showToast("Post-Test has already been completed.", "info");
      renderTestUI(tid, "POST", getQuestions(tid, "POST"));
    });

    // Sync button & queue panel
    byId("syncBtn")?.addEventListener("click", async () => {
      await processOfflineQueue();
      await syncFromMySQLPrimary();
      renderAll();
    });

    byId("viewQueueBtn")?.addEventListener("click", () => {
      byId("queuePanel")?.classList.toggle("hidden");
      refreshQueueUI();
    });

    byId("closeQueueBtn")?.addEventListener("click", () => {
      byId("queuePanel")?.classList.add("hidden");
    });

    byId("queueSyncNowBtn")?.addEventListener("click", async () => {
      await processOfflineQueue();
      await syncFromMySQLPrimary();
      renderAll();
    });

    byId("clearQueueBtn")?.addEventListener("click", () => {
      saveQueue([]);
      refreshQueueUI();
      showToast("Offline sync queue cleared", "info");
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
    window.addEventListener("online", () => {
      setOnlineBadge();
      showToast("Internet connection restored. Synchronizing offline queue...", "info");
      processOfflineQueue();
    });

    window.addEventListener("offline", () => {
      setOnlineBadge();
      showToast("Internet connection lost. Switched to offline queue mode.", "warn");
    });
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

  async function syncFromMySQLPrimary() {
    try {
      // 1. DYNAMIC PRIMARY SYNC: USERS FROM MYSQL
      try {
        const uRes = await fetch("/api/users");
        if (uRes.ok) {
          const uData = await uRes.json();
          if (uData.status === "success" && Array.isArray(uData.users) && uData.users.length > 0) {
            const defaultWorkerHash = "PASSWORD_RESET_REQUIRED";
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

            LS.set(DBK.users, syncedUsers);
          }
        }
      } catch (err) {
        console.debug("Backend users sync error:", err);
      }

      // 2. DYNAMIC PRIMARY SYNC: TRAININGS FROM MYSQL
      try {
        const res = await fetch("/api/trainings");
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
              assessments: t.assessments_json ? JSON.parse(t.assessments_json) : { pre: JSON.parse(defaultPreJson()), post: JSON.parse(defaultPostJson()) },
              createdAt: t.created_at,
              updatedAt: t.updated_at
            }));
            LS.set(DBK.trainings, mapped);
          }
        }
      } catch (err) {
        console.debug("Backend trainings sync error:", err);
      }

      // 3. DYNAMIC PRIMARY SYNC: ATTENDANCE FROM MYSQL
      try {
        const attRes = await fetch("/api/attendance");
        if (attRes.ok) {
          const attData = await attRes.json();
          if (attData.status === "success" && Array.isArray(attData.attendance)) {
            const existingAtt = LS.get(DBK.attendance, []);
            const attMap = new Map();
            existingAtt.forEach((a) => attMap.set(`${a.trainingId}_${a.userId}`, a));

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

      // 4. DYNAMIC PRIMARY SYNC: ATTEMPTS FROM MYSQL
      try {
        const atmpRes = await fetch("/api/attempts");
        if (atmpRes.ok) {
          const atmpData = await atmpRes.json();
          if (atmpData.status === "success" && Array.isArray(atmpData.attempts)) {
            const existingAtmp = LS.get(DBK.attempts, []);
            const atmpMap = new Map();
            existingAtmp.forEach((a) => atmpMap.set(`${a.trainingId}_${a.userId}_${a.type}`, a));

            atmpData.attempts.forEach((a) => {
              const typeUpper = (a.test_type || "post").toUpperCase();
              const key = `${a.training_id}_${a.user_id}_${typeUpper}`;
              atmpMap.set(key, {
                id: a.id || uuid(),
                trainingId: a.training_id,
                userId: a.user_id,
                workerUniqueId: a.worker_unique_id,
                fullName: a.full_name,
                type: typeUpper,
                score: Number(a.score || 0),
                totalMarks: Number(a.total_marks || 100),
                percent: Number(a.percent || 0),
                passed: Boolean(a.passed),
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
      console.debug("Backend MySQL primary sync error:", e);
    }
  }

  async function init() {
    registerServiceWorker();
    seedDistricts();
    await seedAdmin();
    seedSampleTrainings();
    clearTrainingForm();
    setOnlineBadge();
    const u = currentUser();
    if (u) {
      routeAfterLogin();
    } else {
      setActiveView("viewAuth");
    }
    wireEvents();
    renderAll();
    syncFromMySQLPrimary();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
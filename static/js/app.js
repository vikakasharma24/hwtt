/**
 * ==============================================================================
 * Frontend Dynamic Dashboard Adaptation (static/js/app.js)
 * ------------------------------------------------------------------------------
 * Hook that executes immediately after frontline health worker authorization.
 * Queries /api/get-recommendations/<user_id> and dynamically renders
 * prioritized AI remedial learning alerts with direct video links.
 * ==============================================================================
 */

(function (window, document) {
  "use strict";

  let lastFetchedUser = null;
  let lastFetchTime = 0;

  /**
   * Main authorization hook. Call this immediately upon worker login or token verification.
   * @param {string} userId - Frontline worker unique identifier (e.g., "JH102938")
   * @param {boolean} [force=false] - Whether to bypass throttle cache
   */
  async function onUserAuthorized(userId, force = false) {
    if (!userId) {
      console.warn("[AI_HOOK] onUserAuthorized called without valid userId.");
      return;
    }

    const now = Date.now();
    if (!force && lastFetchedUser === userId && (now - lastFetchTime < 2000)) {
      return;
    }
    lastFetchedUser = userId;
    lastFetchTime = now;

    try {
      const recUrl = window.apiUrl ? window.apiUrl(`/api/get-recommendations/${encodeURIComponent(userId)}`) : `/api/get-recommendations/${encodeURIComponent(userId)}`;
      const response = await fetch(recUrl, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        console.warn(`[AI_HOOK] API returned status ${response.status}`);
        return;
      }

      const data = await response.json();
      if (!data || !Array.isArray(data.recommendations) || data.recommendations.length === 0) {
        removeRemedialBanner();
        return;
      }

      // Filter only active unresolved recommendations
      const activeRecs = data.recommendations.filter(r => r.predicted_risk_level === "High" || r.predicted_risk_level === "Medium");

      if (activeRecs.length > 0) {
        renderRemedialBanner(activeRecs, data.has_high_risk);
      } else {
        removeRemedialBanner();
      }

    } catch (error) {
      console.error("[AI_HOOK] Failed to load AI recommendations:", error);
    }
  }

  /**
   * Injects the dynamic AI alert cards at the top of the worker dashboard.
   */
  function renderRemedialBanner(recommendations, hasHighRisk) {
    let container = document.getElementById("aiRemedialContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "aiRemedialContainer";
      container.className = "ai-remedial-section";

      // Target insertion point: Top of main content area or worker dashboard card
      const targetMount = document.querySelector("#viewWorker .grid2") || 
                          document.querySelector("#workerDashboard") || 
                          document.querySelector(".content") || 
                          document.body;

      if (targetMount.id === "workerDashboard") {
        targetMount.parentNode.insertBefore(container, targetMount);
      } else {
        targetMount.insertBefore(container, targetMount.firstChild);
      }
    }

    const primaryColor = hasHighRisk ? "#dc2626" : "#d97706";
    const bgColor = hasHighRisk ? "#fef2f2" : "#fffbeb";
    const headerTitle = hasHighRisk 
      ? "AI Adaptive Learning: Critical Knowledge Gap Detected" 
      : "AI Adaptive Learning: Recommended Clinical Refresher";

    container.innerHTML = `
      <div class="card" style="border-left: 5px solid ${primaryColor}; background: ${bgColor}; margin-bottom: 18px; padding: 16px 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.06); grid-column: 1 / -1;">
        <div class="row between" style="margin-bottom: 8px;">
          <div class="row gap" style="align-items: center;">
            <span style="font-size: 22px;">⚠️</span>
            <div>
              <div style="font-size: 15px; font-weight: 800; color: #0f172a;">${headerTitle}</div>
              <div style="font-size: 12px; color: #64748b;">
                Our machine learning engine analyzed your assessment telemetry and flagged specific clinical topics for mandatory refresher:
              </div>
            </div>
          </div>
          <span class="badge ${hasHighRisk ? "bad" : "warn"}" style="padding: 6px 12px; font-size: 12px;">
            ${hasHighRisk ? "Priority: High Risk" : "Priority: Medium Risk"}
          </span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 12px;">
          ${recommendations.map(rec => `
            <div class="item" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="badge ${rec.predicted_risk_level === 'High' ? 'bad' : 'warn'}" style="font-size: 11px;">
                    ${rec.predicted_risk_level} Risk
                  </span>
                  <span style="font-weight: 700; color: #0f172a; font-size: 14px;">${escapeHtml(rec.module_name)}</span>
                  <span class="monoSmall" style="color: #64748b;">(${escapeHtml(rec.recommended_topic_id)})</span>
                </div>
                <div style="font-size: 12.5px; color: #475569; margin-top: 4px;">
                  ${escapeHtml(rec.remedial_title || "Clinical Protocol Refresher")}
                </div>
              </div>

              <div class="row gap">
                ${rec.remedial_video_url ? `
                  <a href="${escapeHtml(rec.remedial_video_url)}" target="_blank" rel="noopener noreferrer" 
                     class="btn small" style="background: #2563eb; color: #ffffff; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                    <span>▶</span> Watch 5-Min Remedial Video
                  </a>
                ` : ""}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function removeRemedialBanner() {
    const el = document.getElementById("aiRemedialContainer");
    if (el) el.remove();
  }

  function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Export to global scope for module / script integration
  window.onUserAuthorized = onUserAuthorized;
  window.removeRemedialBanner = removeRemedialBanner;

})(window, document);

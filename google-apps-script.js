/**
 * GOOGLE APPS SCRIPT FOR JHARKHAND HEALTH TRAINING PORTAL
 * ========================================================
 * Paste this entire script into your Google Sheets Apps Script editor:
 * Open Google Sheet -> Extensions -> Apps Script -> Paste -> Deploy as Web App.
 *
 * Web App Settings:
 * - Execute as: "Me"
 * - Who has access: "Anyone"
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var raw = e.postData ? e.postData.contents : "{}";
    var payload = JSON.parse(raw);
    var eventType = payload.type || payload.event || "unknown";

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Audit Log / Master Events Sheet
    var logSheet = getOrCreateSheet(ss, "Audit_Log", [
      "Timestamp", "Event_Type", "Worker_ID", "Full_Name", "Phone",
      "Designation", "Facility", "District", "Training_ID", "Training_Title",
      "Status", "Score", "Total_Marks", "Percent", "Passed"
    ]);

    logSheet.appendRow([
      payload.timestamp || new Date().toISOString(),
      eventType,
      payload.workerUniqueId || "",
      payload.fullName || "",
      payload.phone || payload.actorPhone || "",
      payload.designation || "",
      payload.facilityName || "",
      payload.district || "",
      payload.trainingId || "",
      payload.trainingTitle || "",
      payload.attendanceStatus || payload.status || "",
      payload.score !== undefined ? payload.score : "",
      payload.totalMarks !== undefined ? payload.totalMarks : "",
      payload.percent !== undefined ? payload.percent : "",
      payload.passed || ""
    ]);

    // 2. Specific Event Sheets
    if (eventType === "worker_registration") {
      var workerSheet = getOrCreateSheet(ss, "Workers", [
        "Worker_ID", "Full_Name", "Phone", "Designation", "Facility_Name",
        "Facility_Type", "City_Village", "District", "State", "Registered_At"
      ]);
      workerSheet.appendRow([
        payload.workerUniqueId || "",
        payload.fullName || "",
        payload.phone || "",
        payload.designation || "",
        payload.facilityName || "",
        payload.facilityType || "",
        payload.cityOrVillage || "",
        payload.district || "",
        payload.state || "Jharkhand",
        payload.timestamp || new Date().toISOString()
      ]);
    } else if (eventType === "password_reset") {
      var resetSheet = getOrCreateSheet(ss, "Password_Resets", [
        "Timestamp", "Phone", "Worker_ID", "Full_Name", "District"
      ]);
      resetSheet.appendRow([
        payload.timestamp || new Date().toISOString(),
        payload.phone || "",
        payload.workerUniqueId || "",
        payload.fullName || "",
        payload.district || ""
      ]);
    } else if (eventType === "assessment") {
      var assessSheet = getOrCreateSheet(ss, "Assessments", [
        "Timestamp", "Worker_ID", "Full_Name", "Training_ID", "Training_Title",
        "Test_Type", "Score", "Total_Marks", "Percent", "Passed"
      ]);
      assessSheet.appendRow([
        payload.timestamp || new Date().toISOString(),
        payload.workerUniqueId || "",
        payload.fullName || "",
        payload.trainingId || "",
        payload.trainingTitle || "",
        payload.testType || "",
        payload.score !== undefined ? payload.score : "",
        payload.totalMarks !== undefined ? payload.totalMarks : "",
        payload.percent !== undefined ? payload.percent : "",
        payload.passed || ""
      ]);
    } else if (eventType === "attendance") {
      var attSheet = getOrCreateSheet(ss, "Attendance", [
        "Timestamp", "Worker_ID", "Full_Name", "Training_ID", "Training_Title", "Status"
      ]);
      attSheet.appendRow([
        payload.checkedInAt || payload.timestamp || new Date().toISOString(),
        payload.workerUniqueId || "",
        payload.fullName || "",
        payload.trainingId || "",
        payload.trainingTitle || "",
        payload.attendanceStatus || "Present"
      ]);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, status: "logged", event: eventType }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, message: "Jharkhand Health Portal Webhook is active." }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight("bold")
        .setBackground("#e2e8f0");
    }
  }
  return sheet;
}

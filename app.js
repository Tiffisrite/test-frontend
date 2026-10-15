/**
 * Generations Covered — Multi-step frontend
 * 1. Eligibility → 2. Complete missing info → 3. Generate PDF + next steps
 */
const API_BASE = "https://generations-covered-api.onrender.com";

const PDF_FILES = {
  piedmont: "Piedmont_Financial_Assistance_Application_Fillable.pdf",
  emory: "Emory_Financial_Assistance_Application_Fillable.pdf",
  grady: "Grady_Financial_Assistance_Application_Fillable.pdf",
};

const HOSPITAL_DISPLAY = {
  piedmont: "Piedmont Healthcare",
  emory: "Emory Healthcare",
  grady: "Grady Health System",
};

// Shared state
var state = {
  formData: null,
  eligibility: null,
  docsData: null,
  completeData: null,
};

// ---------- Utils ----------
function $(id) { return document.getElementById(id); }

function money(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function todayStr() {
  var d = new Date();
  return String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0") + "/" + d.getFullYear();
}

async function apiGet(path) {
  var res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

async function apiPost(path, body) {
  var res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    var err = await res.json().catch(function () { return {}; });
    throw new Error(err.error || ("API error " + res.status));
  }
  return res.json();
}

function setProgress(step) {
  document.querySelectorAll(".progress-step").forEach(function (el) {
    var s = Number(el.getAttribute("data-step"));
    el.classList.remove("active", "done");
    if (s < step) el.classList.add("done");
    if (s === step) el.classList.add("active");
  });
}

function showPanel(id) {
  ["panel-eligibility", "panel-result", "panel-complete", "panel-done"].forEach(function (p) {
    var el = $(p);
    if (el) el.classList.add("hidden");
  });
  var panel = $(id);
  if (panel) {
    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ---------- PDF field mapping ----------
function buildPdfFields(hospitalId, data) {
  var fullName = data.patient_name || "";
  var income = String(data.annual_income || "");
  var phone = data.phone || "";
  var addr = data.address || "";
  var city = data.city || "";
  var state = data.state || "";
  var zip = data.zip || "";
  var ssn = data.patient_ssn || "";
  var dob = data.dob || "";
  var appDate = todayStr();
  var facility = data.facility || "";
  var text = {};
  var checks = {};

  if (hospitalId === "piedmont") {
    text = {
      patient_full_name: fullName,
      physical_address: addr,
      city: city,
      state: state,
      zip: zip,
      phone: phone,
      mailing_address: addr,
      patient_ssn: ssn,
      dob: dob,
      facility: facility || "Piedmont Atlanta Hospital",
      date_of_service: appDate,
      completing_name: fullName,
      relationship: "Self",
      income: income,
      total_income: income,
      applicant_name_print: fullName,
      applicant_date: appDate,
      hh_0_0: fullName,
      hh_0_3: "Self",
      hh_0_6: income,
    };
    if (data.uninsured) checks.has_insurance_no = true;
    else checks.has_insurance_yes = true;
  } else if (hospitalId === "emory") {
    text = {
      patient_name: fullName,
      patient_ssn: ssn,
      street_address: addr,
      city: city,
      state: state,
      zip: zip,
      phone: phone,
      salary_patient: income,
      num_dependents: String(data.household_size || 1),
      patient_print_name: fullName,
      patient_date: appDate,
    };
    checks.salary_yearly = true;
  } else {
    var addrNum = "", addrStreet = addr;
    var m = addr.match(/^(\d+)\s+(.+)$/);
    if (m) { addrNum = m[1]; addrStreet = m[2]; }
    text = {
      full_name: fullName,
      ssn: ssn,
      dob: dob,
      addr_number: addrNum,
      addr_street: addrStreet,
      city: city,
      state: state,
      zip: zip,
      home_phone: phone,
      gross_self: income,
      date: appDate,
      num_dependents: String(Math.max(0, (data.household_size || 1) - 1)),
    };
    checks.self_monthly = true;
  }
  return { text: text, checks: checks };
}

async function generateFilledPdf(hospitalId, data) {
  if (typeof PDFLib === "undefined") {
    throw new Error("PDF library failed to load. Check your network connection.");
  }
  var pdfPath = PDF_FILES[hospitalId];
  if (!pdfPath) throw new Error("No application PDF for this hospital.");

  var existing = await fetch(pdfPath).then(function (r) {
    if (!r.ok) throw new Error("Could not load application PDF (" + r.status + ")");
    return r.arrayBuffer();
  });

  var pdfDoc = await PDFLib.PDFDocument.load(existing);
  var form = pdfDoc.getForm();
  var mapped = buildPdfFields(hospitalId, data);

  Object.keys(mapped.text).forEach(function (name) {
    try {
      form.getTextField(name).setText(String(mapped.text[name] == null ? "" : mapped.text[name]));
    } catch (e) { /* skip missing fields */ }
  });

  Object.keys(mapped.checks).forEach(function (name) {
    if (!mapped.checks[name]) return;
    try { form.getCheckBox(name).check(); }
    catch (e) {
      try { form.getRadioGroup(name).select(name); } catch (e2) { /* skip */ }
    }
  });

  var bytes = await pdfDoc.save();
  var blob = new Blob([bytes], { type: "application/pdf" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  var safeName = (data.patient_name || "patient").replace(/[^\w\-]+/g, "_");
  a.href = url;
  a.download = (HOSPITAL_DISPLAY[hospitalId] || hospitalId) + "_Application_" + safeName + ".pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  return a.download;
}

// ---------- Documents ----------
async function fetchDocuments(hospitalId) {
  try {
    return await apiGet("/api/v1/hospitals/" + hospitalId + "/documents");
  } catch (e1) {
    try {
      return await apiGet("/api/v1/required-documents/" + hospitalId);
    } catch (e2) {
      return null;
    }
  }
}

function renderDocumentsList(docsData) {
  if (!docsData) {
    return '<p class="contact-box">Contact the hospital financial counseling office for the current document checklist.</p>';
  }
  var list = docsData.required_documents || docsData.documents || [];
  if (!list.length) {
    return '<p class="contact-box">See the hospital application for the current document checklist.</p>';
  }
  return (
    '<ul class="doc-list">' +
    list.map(function (d) {
      var name = d.name || d;
      var required = d.required !== false;
      var examples = d.examples
        ? '<br><small style="color:var(--muted)">' + escapeHtml(d.examples) + "</small>"
        : "";
      return (
        '<li><span class="badge ' + (required ? "" : "optional") + '">' +
        (required ? "Required" : "Optional") +
        "</span><span>" + escapeHtml(name) + examples + "</span></li>"
      );
    }).join("") +
    "</ul>"
  );
}

// ---------- Step 1: Eligibility ----------
function collectEligibilityForm(form) {
  return {
    patient_name: form.patient_name.value.trim(),
    phone: form.phone.value.trim(),
    address: form.address.value.trim(),
    city: form.city.value.trim(),
    state: form.state.value.trim().toUpperCase(),
    zip: form.zip.value.trim(),
    hospital_id: form.hospital_id.value,
    bill_amount: Number(form.bill_amount.value),
    household_size: Number(form.household_size.value),
    annual_income: Number(form.annual_income.value),
    uninsured: form.uninsured.checked,
    georgia_resident: form.georgia_resident.checked,
    fulton_or_dekalb: form.fulton_or_dekalb.checked,
    patient_ssn: "",
    dob: "",
    email: "",
    facility: "",
  };
}

function renderEligibilityResult(result, formData, docsData) {
  var hospitalName = HOSPITAL_DISPLAY[formData.hospital_id] || result.hospital_name || formData.hospital_id;
  var eligible = !!result.eligible || (result.discount_pct && result.discount_pct > 0);
  var cls = "ineligible";
  var title = "Does not meet published FAP criteria";
  if (result.eligible && result.discount_pct === 100) {
    cls = "eligible";
    title = "You appear eligible for 100% assistance";
  } else if (result.eligible && result.discount_pct === null) {
    cls = "eligible";
    title = "You appear eligible — counselor will set the amount";
  } else if (result.discount_pct && result.discount_pct > 0) {
    cls = "partial";
    title = "Possible " + result.discount_pct + "% discount available";
  }

  var responsibility =
    result.patient_responsibility === null || result.patient_responsibility === undefined
      ? "Determined by counselor"
      : money(result.patient_responsibility);

  var discountDisplay =
    result.discount_pct === null || result.discount_pct === undefined
      ? "Sliding scale"
      : result.discount_pct + "%";

  var notes = (result.special_notes || []).map(function (n) {
    return "<li>" + escapeHtml(n) + "</li>";
  }).join("");

  var contact = result.contact || {};

  var html =
    '<div class="result-card">' +
    '<div class="result-banner ' + cls + '"><div><h3>' + escapeHtml(title) + "</h3>" +
    "<p>" + escapeHtml(formData.patient_name) + " · " + escapeHtml(hospitalName) +
    " · Policy " + escapeHtml(result.policy_date || "—") + "</p></div></div>" +
    '<div class="result-body">' +
    '<div class="metric-row">' +
    '<div class="metric"><p class="label">Your FPL %</p><p class="value">' +
    (result.fpl && result.fpl.fpl_pct != null ? result.fpl.fpl_pct : "—") + "%</p></div>" +
    '<div class="metric"><p class="label">Bill amount</p><p class="value">' + money(result.bill_amount) + "</p></div>" +
    '<div class="metric"><p class="label">Discount / assistance</p><p class="value">' + discountDisplay + "</p></div>" +
    '<div class="metric"><p class="label">Est. patient responsibility</p><p class="value ' +
    (result.patient_responsibility === 0 ? "zero" : "") + '">' + responsibility + "</p></div>" +
    "</div>" +
    '<div class="message-box">' + escapeHtml(result.message || "") + "</div>" +
    (notes ? '<ul class="notes-list">' + notes + "</ul>" : "") +
    (contact.phone
      ? '<div class="contact-box"><strong>Hospital contact:</strong> ' +
        escapeHtml(contact.phone) +
        (contact.email ? " · " + escapeHtml(contact.email) : "") +
        "</div>"
      : "");

  if (eligible) {
    html +=
      '<div class="form-actions" style="margin-top:1.25rem">' +
      '<button type="button" class="btn btn-primary btn-lg" id="btn-continue-complete">Continue — complete application</button>' +
      '<button type="button" class="btn btn-ghost" id="btn-start-over">Start over</button>' +
      "</div>" +
      "<p style=\"margin:0.75rem 0 0;font-size:0.9rem;color:var(--muted)\">Next you will fill any missing details (SSN, date of birth, etc.), then we will generate your complete application PDF.</p>";
  } else {
    html +=
      '<div class="form-actions" style="margin-top:1.25rem">' +
      '<button type="button" class="btn btn-ghost" id="btn-start-over">Start over</button>' +
      "</div>" +
      "<p style=\"margin:0.75rem 0 0;font-size:0.9rem;color:var(--muted)\">You may still contact the hospital financial counseling office — final decisions rest with them.</p>";
  }

  html += "</div></div>";
  $("result-content").innerHTML = html;

  if ($("btn-continue-complete")) {
    $("btn-continue-complete").addEventListener("click", function () {
      openCompleteForm();
    });
  }
  if ($("btn-start-over")) {
    $("btn-start-over").addEventListener("click", function () {
      setProgress(1);
      showPanel("panel-eligibility");
    });
  }
}

function openCompleteForm() {
  var d = state.formData;
  $("c_patient_name").value = d.patient_name || "";
  $("c_phone").value = d.phone || "";
  $("c_address").value = d.address || "";
  $("c_city").value = d.city || "";
  $("c_state").value = d.state || "GA";
  $("c_zip").value = d.zip || "";
  $("c_income").value = d.annual_income || "";
  $("c_household").value = d.household_size || 1;
  $("c_dob").value = d.dob || "";
  $("c_ssn").value = d.patient_ssn || "";
  $("c_email").value = d.email || "";
  $("c_facility").value = d.facility || (
    d.hospital_id === "piedmont" ? "Piedmont Atlanta Hospital" :
    d.hospital_id === "emory" ? "Emory University Hospital" :
    d.hospital_id === "grady" ? "Grady Memorial Hospital" : ""
  );
  $("c_notes").value = "";

  setProgress(2);
  showPanel("panel-complete");
}

// ---------- Step 2 → Generate PDF ----------
$("complete-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  var btn = $("btn-generate");
  var original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Generating PDF…";

  var completeData = {
    patient_name: $("c_patient_name").value.trim(),
    dob: $("c_dob").value.trim(),
    patient_ssn: $("c_ssn").value.trim(),
    phone: $("c_phone").value.trim(),
    email: $("c_email").value.trim(),
    facility: $("c_facility").value.trim(),
    address: $("c_address").value.trim(),
    city: $("c_city").value.trim(),
    state: $("c_state").value.trim().toUpperCase(),
    zip: $("c_zip").value.trim(),
    annual_income: Number($("c_income").value),
    household_size: Number($("c_household").value),
    notes: $("c_notes").value.trim(),
    hospital_id: state.formData.hospital_id,
    uninsured: state.formData.uninsured,
    bill_amount: state.formData.bill_amount,
  };
  state.completeData = completeData;

  try {
    var filename = await generateFilledPdf(completeData.hospital_id, completeData);
    showDonePanel(filename, completeData);
  } catch (err) {
    console.error(err);
    alert("Could not generate PDF: " + err.message + "\n\nMake sure you are running the site over http:// (not file://) so the application PDFs can load.");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

$("btn-back-result").addEventListener("click", function () {
  setProgress(1);
  showPanel("panel-result");
});

// ---------- Step 3: Done + next steps ----------
function showDonePanel(filename, data) {
  var hospitalId = data.hospital_id;
  var hospitalName = HOSPITAL_DISPLAY[hospitalId] || hospitalId;
  var result = state.eligibility || {};
  var contact = result.contact || {};
  var docsHtml = renderDocumentsList(state.docsData);

  var responsibility =
    result.patient_responsibility === null || result.patient_responsibility === undefined
      ? "Determined by counselor after verification"
      : money(result.patient_responsibility);

  var html =
    '<div class="success-banner">' +
    "<h3>Your application PDF is ready</h3>" +
    "<p>Downloaded as <strong>" + escapeHtml(filename) + "</strong>. Review it, complete any remaining signatures, then follow the next steps below.</p>" +
    "</div>" +
    '<div class="result-card"><div class="result-body">' +
    '<div class="metric-row">' +
    '<div class="metric"><p class="label">Hospital</p><p class="value" style="font-size:1.05rem">' + escapeHtml(hospitalName) + "</p></div>" +
    '<div class="metric"><p class="label">Patient</p><p class="value" style="font-size:1.05rem">' + escapeHtml(data.patient_name) + "</p></div>" +
    '<div class="metric"><p class="label">Bill</p><p class="value">' + money(data.bill_amount) + "</p></div>" +
    '<div class="metric"><p class="label">Est. responsibility</p><p class="value ' +
    (result.patient_responsibility === 0 ? "zero" : "") + '">' + responsibility + "</p></div>" +
    "</div>" +
    '<div class="docs-block"><h4>Attach these documents with your application</h4>' +
    docsHtml +
    "</div>" +
    '<div class="next-steps-box">' +
    "<h4>Your next steps</h4>" +
    "<ol>" +
    "<li><strong>Open the PDF</strong> you just downloaded and review every page. Sign and date where required.</li>" +
    "<li><strong>Gather the required documents</strong> listed above (pay stubs, ID, proof of residency, tax return, etc.).</li>" +
    "<li><strong>Print</strong> the application and documents, <em>or</em> email them to the hospital financial counseling office.</li>" +
    "<li><strong>Submit</strong> using the contact below. Keep copies for your records.</li>" +
    "<li><strong>Follow up</strong> if you do not hear back within the hospital’s stated response window.</li>" +
    "</ol>" +
    "</div>" +
    (contact.phone
      ? '<div class="contact-box" style="margin-top:1rem"><strong>Submit to:</strong> ' +
        escapeHtml(hospitalName) + " · " + escapeHtml(contact.phone) +
        (contact.email ? " · " + escapeHtml(contact.email) : "") +
        (contact.mail ? "<br>" + escapeHtml(contact.mail) : "") +
        "</div>"
      : "") +
    '<div class="action-row" style="margin-top:1.25rem">' +
    '<button type="button" class="btn btn-primary" id="btn-download-again">Download PDF again</button>' +
    '<button type="button" class="btn btn-amber" id="btn-print-summary">Print this page</button>' +
    '<button type="button" class="btn btn-ghost" id="btn-email-draft">Prepare email draft</button>' +
    '<button type="button" class="btn btn-ghost" id="btn-start-over-final">Start over</button>' +
    "</div>" +
    "</div></div>";

  $("done-content").innerHTML = html;
  setProgress(3);
  showPanel("panel-done");

  $("btn-download-again") &&
    $("btn-download-again").addEventListener("click", async function () {
      try {
        await generateFilledPdf(hospitalId, data);
      } catch (err) {
        alert("Could not regenerate PDF: " + err.message);
      }
    });

  $("btn-print-summary") &&
    $("btn-print-summary").addEventListener("click", function () {
      window.print();
    });

  $("btn-email-draft") &&
    $("btn-email-draft").addEventListener("click", function () {
      var subject = encodeURIComponent(
        "Financial Assistance Application — " + data.patient_name + " — " + hospitalName
      );
      var body = encodeURIComponent(
        "Hello,\n\nPlease find attached my completed financial assistance application and supporting documents for a bill of " +
          money(data.bill_amount) +
          ".\n\nPatient: " +
          data.patient_name +
          "\nHospital: " +
          hospitalName +
          "\n\n" +
          (result.message || "") +
          "\n\nThank you,\n" +
          data.patient_name
      );
      window.location.href =
        "mailto:" + (contact.email || "") + "?subject=" + subject + "&body=" + body;
    });

  $("btn-start-over-final") &&
    $("btn-start-over-final").addEventListener("click", function () {
      state = { formData: null, eligibility: null, docsData: null, completeData: null };
      $("eligibility-form").reset();
      $("state").value = "GA";
      setProgress(1);
      showPanel("panel-eligibility");
    });
}

// ---------- Eligibility form submit ----------
$("eligibility-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  var btn = $("submit-btn");
  var original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Checking…";

  var formData = collectEligibilityForm(e.target);
  state.formData = formData;

  var payload = {
    hospital_id: formData.hospital_id,
    household_size: formData.household_size,
    annual_income: formData.annual_income,
    uninsured: formData.uninsured,
    georgia_resident: formData.georgia_resident,
    fulton_or_dekalb: formData.fulton_or_dekalb,
    bill_amount: formData.bill_amount,
  };

  try {
    var result = await apiPost("/api/v1/eligibility", payload);
    var docsData = await fetchDocuments(formData.hospital_id);
    state.eligibility = result;
    state.docsData = docsData;
    renderEligibilityResult(result, formData, docsData);
    setProgress(1);
    showPanel("panel-result");
  } catch (err) {
    $("result-content").innerHTML =
      '<div class="result-card"><div class="result-banner ineligible"><div><h3>Unable to complete the check</h3><p>' +
      escapeHtml(err.message) +
      '</p></div></div><div class="result-body"><p>Please try again shortly, or contact the hospital financial counseling office directly.</p>' +
      '<button type="button" class="btn btn-ghost" id="btn-start-over">Back</button></div></div>';
    showPanel("panel-result");
    $("btn-start-over") &&
      $("btn-start-over").addEventListener("click", function () {
        showPanel("panel-eligibility");
      });
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

// ---------- Hospital cards ----------
async function loadHospitalCards() {
  var container = $("hospital-cards");
  try {
    var data = await apiGet("/api/v1/hospitals");
    container.innerHTML = (data.hospitals || [])
      .map(function (h) {
        return (
          '<article class="hospital-card"><h3>' +
          escapeHtml(h.display_name) +
          '</h3><span class="ceiling">Up to ' +
          h.eligibility_ceiling_fpl_pct +
          "% of FPL</span><p>" +
          escapeHtml(h.residency_rule || "") +
          "</p>" +
          (h.contact && h.contact.phone
            ? '<p class="contact">' + escapeHtml(h.contact.phone) + "</p>"
            : "") +
          "</article>"
        );
      })
      .join("");
  } catch (e) {
    container.innerHTML =
      '<p style="color:var(--muted)">Hospital list temporarily unavailable.</p>';
  }
}

loadHospitalCards();

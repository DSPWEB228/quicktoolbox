import { auth, db } from "/js/firebase-init.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, collection, addDoc, getDocs, deleteDoc,
  query, orderBy, limit, where, startAfter, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

// NOTE: this project deliberately does not use Firebase/Cloud Storage. Since
// Feb 3, 2026 a Storage bucket always requires a linked billing account (Blaze),
// even at zero usage. Custom ad images are instead read as base64 and stored
// directly on the Firestore document — see uploadImageAsDataUrl() below. Firestore
// documents are capped at 1 MiB, so we keep raw files well under that.
const MAX_IMAGE_BYTES = 600 * 1024; // ~700KB raw, safely under Firestore's 1MiB doc cap after base64 (+33%) + other fields

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/* ============================= Slot definitions ============================= */
const SLOT_META = [
  { id: "top_banner",    label: "Top banner",     width: 728, height: 90,  cssClass: "ad-slot--leaderboard" },
  { id: "in_content",    label: "In-content",      width: 336, height: 280, cssClass: "ad-slot--rectangle" },
  { id: "bottom_banner", label: "Bottom banner",   width: 728, height: 90,  cssClass: "ad-slot--leaderboard" },
];

const CHECKLIST_ITEMS = [
  { id: "contact_email", label: "Replaced the placeholder email in contact.html" },
  { id: "privacy_policy", label: "Filled in the real date and finished the wording in privacy-policy.html" },
  { id: "custom_domain", label: "Connected a custom domain in the Firebase console" },
  { id: "real_content", label: "Added a handful of real content pages (a short blog/guide section)" },
  { id: "admin_user_created", label: "Created my admin login in Firebase Authentication + added an /admins doc for it" },
  { id: "rules_deployed", label: "Deployed firestore.rules" },
  { id: "adsense_units_created", label: "Created matching fixed-size ad units in the AdSense console (728x90 / 336x280 / 320x50 / 300x250 / 160x600)" },
  { id: "waited_for_traffic", label: "Site has been live with organic traffic for a couple of weeks before applying to AdSense" },
];

let currentUser = null;

/* ============================= Auth ============================= */
const loginScreen = document.getElementById("login-screen");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");
  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in…";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = "Sign-in failed — check the email and password.";
    loginError.classList.remove("hidden");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign in";
  }
});

document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    dashboard.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    return;
  }
  // Confirm this user is an allowlisted admin (a doc at admins/{uid}).
  let isAdmin = false;
  try {
    const snap = await getDoc(doc(db, "admins", user.uid));
    isAdmin = snap.exists();
  } catch (e) {
    isAdmin = false;
  }
  if (!isAdmin) {
    loginError.textContent = "This account isn't set up as an admin yet. Add a doc at admins/" + user.uid + " in Firestore (see README).";
    loginError.classList.remove("hidden");
    await signOut(auth);
    return;
  }
  currentUser = user;
  loginScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");
  document.getElementById("dash-user-email").textContent = user.email;
  document.getElementById("settings-email").textContent = user.email;
  logAdminAction("login", {});
  initDashboardData();
});

async function logAdminAction(action, detail) {
  try {
    await addDoc(collection(db, "adminActions"), {
      action, ...detail, admin: currentUser ? currentUser.email : "unknown", ts: serverTimestamp()
    });
  } catch (e) { console.warn("Could not log admin action", e); }
}

/* ============================= Tabs ============================= */
const TAB_TITLES = { overview: "Overview", slots: "Ad Slots", images: "Ad Image Library", activity: "Activity Log", settings: "Settings" };
document.querySelectorAll(".dash-nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".dash-nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.querySelectorAll(".dash-panel").forEach((p) => p.classList.add("hidden"));
    document.getElementById("tab-" + tab).classList.remove("hidden");
    document.getElementById("dash-tab-title").textContent = TAB_TITLES[tab];
  });
});

function initDashboardData() {
  loadOverview();
  buildSlotCards();
  loadImages();
  initActivityLog();
  buildChecklist();
}

/* ============================= Overview ============================= */
async function loadOverview() {
  const since30 = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let events = [];
  try {
    const q = query(collection(db, "events"), where("ts", ">=", since30), orderBy("ts", "desc"), limit(5000));
    const snap = await getDocs(q);
    snap.forEach((d) => events.push({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("Overview query failed (rules deployed yet? index building?)", e);
  }

  const now = Date.now();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const views = events.filter((e) => e.type === "page_view");
  const viewsToday = views.filter((e) => e.ts && e.ts.toMillis() >= startOfToday.getTime()).length;
  const views7d = views.filter((e) => e.ts && e.ts.toMillis() >= now - 7 * 86400000).length;
  const views30d = views.length;
  const adImpressionEvents = events.filter((e) => e.type === "ad_impression");
  const adClickEvents = events.filter((e) => e.type === "ad_click");
  const impressions = adImpressionEvents.length;
  const clicks = adClickEvents.length;
  const ctr = impressions ? ((clicks / impressions) * 100).toFixed(1) + "%" : "—";
  const adblockHits = events.filter((e) => e.type === "adblock_detected").length;
  const adblockRate = views30d ? ((adblockHits / views30d) * 100).toFixed(1) + "%" : "—";

  document.getElementById("stat-views-today").textContent = viewsToday;
  document.getElementById("stat-views-7d").textContent = views7d;
  document.getElementById("stat-views-30d").textContent = views30d;
  document.getElementById("stat-ad-impr").textContent = impressions;
  document.getElementById("stat-ad-clicks").textContent = clicks;
  document.getElementById("stat-ctr").textContent = ctr;
  const adblockEl = document.getElementById("stat-adblock-rate");
  if (adblockEl) adblockEl.textContent = adblockRate;

  // Per-slot breakdown — which placement (top/in-content/bottom/anchor) is actually
  // earning impressions and clicks. Click tracking here only ever fires for "custom"
  // (self-served image) slots — Google's own AdSense clicks aren't exposed to
  // publisher-side JS by policy, so an AdSense slot will always show "—" for clicks.
  const slotBreakdownEl = document.getElementById("slot-breakdown");
  if (slotBreakdownEl) {
    const bySlot = {};
    SLOT_META.forEach((m) => { bySlot[m.id] = { label: m.label, impr: 0, clicks: 0, custom: false }; });
    adImpressionEvents.forEach((e) => {
      if (bySlot[e.slotId]) { bySlot[e.slotId].impr++; if (e.mode === "custom") bySlot[e.slotId].custom = true; }
    });
    adClickEvents.forEach((e) => { if (bySlot[e.slotId]) bySlot[e.slotId].clicks++; });

    const rows = Object.values(bySlot).map((s) => {
      const slotCtr = s.impr ? ((s.clicks / s.impr) * 100).toFixed(1) + "%" : "—";
      const clicksDisplay = s.custom || s.clicks ? s.clicks : "—";
      return `<tr><td>${escapeHtml(s.label)}</td><td>${s.impr}</td><td>${clicksDisplay}</td><td>${slotCtr}</td></tr>`;
    }).join("");
    slotBreakdownEl.innerHTML =
      `<table><thead><tr><th>Slot</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // Daily bar chart, last 14 days
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    days.push(d);
  }
  const counts = days.map((d) => {
    const next = new Date(d); next.setDate(next.getDate() + 1);
    return views.filter((e) => e.ts && e.ts.toMillis() >= d.getTime() && e.ts.toMillis() < next.getTime()).length;
  });
  const max = Math.max(1, ...counts);
  const chart = document.getElementById("daily-chart");
  chart.innerHTML = "";
  days.forEach((d, i) => {
    const col = document.createElement("div");
    col.className = "bar-col";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = Math.max(2, Math.round((counts[i] / max) * 120)) + "px";
    bar.title = counts[i] + " views";
    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = d.getDate() + "/" + (d.getMonth() + 1);
    col.appendChild(bar); col.appendChild(label);
    chart.appendChild(col);
  });

  // Top pages
  const byPage = {};
  views.forEach((e) => { byPage[e.page] = (byPage[e.page] || 0) + 1; });
  const topPages = Object.entries(byPage).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topPagesEl = document.getElementById("top-pages");
  if (!topPages.length) {
    topPagesEl.innerHTML = '<p class="muted small">No page views recorded yet.</p>';
  } else {
    const rows = topPages.map(([page, count]) => `<tr><td>${escapeHtml(page)}</td><td>${count}</td></tr>`).join("");
    topPagesEl.innerHTML = `<table>${rows}</table>`;
  }
}

/* ============================= Ad Slots ============================= */
async function buildSlotCards() {
  const container = document.getElementById("slots-container");
  container.innerHTML = "";
  for (const meta of SLOT_META) {
    let current = { mode: "off", adUnitId: "", imageUrl: "", linkUrl: "" };
    try {
      const snap = await getDoc(doc(db, "adSlots", meta.id));
      if (snap.exists()) current = { ...current, ...snap.data() };
    } catch (e) { /* use defaults */ }
    container.appendChild(buildSlotCard(meta, current));
  }
}

function buildSlotCard(meta, current) {
  const card = document.createElement("div");
  card.className = "slot-card";
  card.innerHTML = `
    <div class="slot-card__head">
      <div>
        <div class="slot-card__title">${meta.label}</div>
        <div class="slot-card__meta">Fixed size: ${meta.width}×${meta.height}px · id: ${meta.id}</div>
      </div>
    </div>
    <div class="slot-card__body">
      <div>
        <div class="slot-mode-row">
          <button type="button" class="slot-mode-btn" data-mode="off">Off</button>
          <button type="button" class="slot-mode-btn" data-mode="adsense">AdSense</button>
          <button type="button" class="slot-mode-btn" data-mode="custom">Custom image</button>
        </div>
        <div class="slot-subfields" data-fields="adsense">
          <label class="field-label">AdSense ad unit slot ID</label>
          <input class="field-input" type="text" placeholder="e.g. 1234567890" data-field="adUnitId">
        </div>
        <div class="slot-subfields" data-fields="custom">
          <label class="field-label">Ad image</label>
          <div class="slot-dropzone" data-role="dropzone">Click to choose an image (${meta.width}×${meta.height} recommended)</div>
          <input type="file" accept="image/*" style="display:none" data-role="file-input">
          <label class="field-label">Click-through link</label>
          <input class="field-input" type="url" placeholder="https://example.com" data-field="linkUrl">
        </div>
        <div class="slot-status" data-role="status"></div>
        <div class="slot-save-row">
          <button type="button" class="btn btn-primary" data-role="save" style="width:auto;">Save slot</button>
        </div>
      </div>
      <div>
        <div class="slot-preview-label">Live preview (exact size)</div>
        <div class="slot-preview-box" data-role="preview" style="width:${meta.width}px;height:${meta.height}px;max-width:100%;"></div>
      </div>
    </div>
  `;

  const state = { mode: current.mode || "off", adUnitId: current.adUnitId || "", imageUrl: current.imageUrl || "", linkUrl: current.linkUrl || "", pendingFile: null };

  const modeBtns = card.querySelectorAll(".slot-mode-btn");
  const adsenseFields = card.querySelector('[data-fields="adsense"]');
  const customFields = card.querySelector('[data-fields="custom"]');
  const adUnitInput = card.querySelector('[data-field="adUnitId"]');
  const linkInput = card.querySelector('[data-field="linkUrl"]');
  const dropzone = card.querySelector('[data-role="dropzone"]');
  const fileInput = card.querySelector('[data-role="file-input"]');
  const statusEl = card.querySelector('[data-role="status"]');
  const previewBox = card.querySelector('[data-role="preview"]');
  const saveBtn = card.querySelector('[data-role="save"]');

  adUnitInput.value = state.adUnitId;
  linkInput.value = state.linkUrl;

  function refreshUI() {
    modeBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === state.mode));
    adsenseFields.style.display = state.mode === "adsense" ? "block" : "none";
    customFields.style.display = state.mode === "custom" ? "block" : "none";
    renderPreview();
  }

  function renderPreview() {
    previewBox.innerHTML = "";
    if (state.mode === "custom" && state.imageUrl) {
      const img = document.createElement("img");
      img.src = state.imageUrl;
      previewBox.appendChild(img);
    } else if (state.mode === "adsense") {
      const p = document.createElement("div");
      p.className = "slot-preview-empty";
      p.textContent = "AdSense unit will render here on the live site" + (state.adUnitId ? " (slot " + state.adUnitId + ")" : "");
      previewBox.appendChild(p);
    } else {
      const p = document.createElement("div");
      p.className = "slot-preview-empty";
      p.textContent = state.mode === "off" ? "This placement is switched off." : "No image uploaded yet.";
      previewBox.appendChild(p);
    }
  }

  modeBtns.forEach((btn) => btn.addEventListener("click", () => { state.mode = btn.dataset.mode; refreshUI(); }));
  adUnitInput.addEventListener("input", () => { state.adUnitId = adUnitInput.value.trim(); });
  linkInput.addEventListener("input", () => { state.linkUrl = linkInput.value.trim(); });
  fileInput.addEventListener("click", (e) => e.stopPropagation());
  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    if (file.size > MAX_IMAGE_BYTES) {
      statusEl.textContent = "Image is over " + Math.round(MAX_IMAGE_BYTES / 1024) + "KB — pick a smaller/more compressed file (images are stored in Firestore, which caps documents at 1MB, not Cloud Storage).";
      statusEl.className = "slot-status err";
      return;
    }
    state.pendingFile = file;
    state.imageUrl = URL.createObjectURL(file); // instant local preview, before upload
    dropzone.textContent = "Selected: " + file.name + " (click to change)";
    renderPreview();
  });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    statusEl.textContent = "Saving…";
    statusEl.className = "slot-status";
    try {
      let imageUrl = current.imageUrl || "";
      if (state.mode === "custom" && state.pendingFile) {
        // Stored as a base64 data URL directly on the Firestore doc — no Cloud
        // Storage bucket involved, so this stays on the free Spark plan.
        imageUrl = await fileToDataUrl(state.pendingFile);
        await addDoc(collection(db, "adImages"), {
          url: imageUrl, filename: state.pendingFile.name,
          size: state.pendingFile.size, slotId: meta.id,
          uploadedBy: currentUser.email, uploadedAt: serverTimestamp()
        });
        await logAdminAction("upload_image", { slotId: meta.id, filename: state.pendingFile.name });
        state.pendingFile = null;
      }
      const payload = {
        mode: state.mode,
        adUnitId: state.mode === "adsense" ? state.adUnitId : "",
        imageUrl: state.mode === "custom" ? imageUrl : "",
        linkUrl: state.mode === "custom" ? state.linkUrl : "",
        width: meta.width, height: meta.height,
        updatedAt: serverTimestamp(), updatedBy: currentUser.email
      };
      await setDoc(doc(db, "adSlots", meta.id), payload, { merge: true });
      current = { ...current, ...payload };
      state.imageUrl = payload.imageUrl;
      await logAdminAction("update_slot", { slotId: meta.id, mode: state.mode });
      statusEl.textContent = "Saved.";
      statusEl.className = "slot-status ok";
      renderPreview();
      loadImages(); // refresh library in case a new image was added
    } catch (e) {
      console.error(e);
      statusEl.textContent = "Save failed (" + (e.code || e.message) + ") — check Firestore rules are deployed and your UID is in the admins collection.";
      statusEl.className = "slot-status err";
    } finally {
      saveBtn.disabled = false;
    }
  });

  refreshUI();
  return card;
}

/* ============================= Ad Image Library ============================= */
async function loadImages() {
  const grid = document.getElementById("images-grid");
  const empty = document.getElementById("images-empty");
  grid.innerHTML = "";
  let docs = [];
  try {
    const q = query(collection(db, "adImages"), orderBy("uploadedAt", "desc"), limit(200));
    const snap = await getDocs(q);
    snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
  } catch (e) { console.warn("Could not load image library", e); }

  window.__qtbImages = docs; // for CSV export
  empty.classList.toggle("hidden", docs.length > 0);

  docs.forEach((img) => {
    const card = document.createElement("div");
    card.className = "image-card";
    const sizeKb = img.size ? Math.round(img.size / 1024) + " KB" : "—";
    const uploaded = img.uploadedAt && img.uploadedAt.toDate ? img.uploadedAt.toDate().toLocaleDateString() : "—";
    card.innerHTML = `
      <div class="image-card__thumb"><img src="${img.url}" alt=""></div>
      <div class="image-card__body">
        <div class="image-card__name">${escapeHtml(img.filename || "untitled")}</div>
        <div class="image-card__meta">
          ${sizeKb} · uploaded ${uploaded}<br>
          slot: ${escapeHtml(img.slotId || "unassigned")}
        </div>
        <div class="image-card__actions">
          <a href="${img.url}" target="_blank" class="btn btn-ghost" style="padding:6px 10px;font-size:0.78rem;">View</a>
          <button class="btn btn-danger" style="padding:6px 10px;font-size:0.78rem;" data-role="delete">Delete</button>
        </div>
      </div>
    `;
    card.querySelector('[data-role="delete"]').addEventListener("click", async () => {
      if (!confirm("Delete this ad image? If it's currently assigned to a slot, that slot will show a broken image until you upload a replacement.")) return;
      try {
        await deleteDoc(doc(db, "adImages", img.id));
        await logAdminAction("delete_image", { filename: img.filename, slotId: img.slotId || "" });
        loadImages();
      } catch (e) {
        alert("Couldn't delete this image — check Firestore rules are deployed.");
      }
    });
    grid.appendChild(card);
  });
}

document.getElementById("images-export").addEventListener("click", () => {
  const rows = (window.__qtbImages || []).map((img) => ({
    filename: img.filename, size_bytes: img.size, slotId: img.slotId,
    uploadedBy: img.uploadedBy,
    uploadedAt: img.uploadedAt && img.uploadedAt.toDate ? img.uploadedAt.toDate().toISOString() : "",
    url: img.url
  }));
  downloadCsv(rows, "ad-images.csv");
});

/* ============================= Activity Log ============================= */
let activityState = { collectionName: "adminActions", lastDocSnap: null, rows: [], typeFilter: "" };

const ADMIN_ACTION_TYPES = ["login", "update_slot", "upload_image", "delete_image"];
const VISITOR_EVENT_TYPES = ["page_view", "tool_used", "ad_impression", "ad_click", "adblock_detected"];

function initActivityLog() {
  document.querySelectorAll(".activity-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".activity-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activityState.collectionName = btn.dataset.log === "admin" ? "adminActions" : "events";
      activityState.lastDocSnap = null;
      activityState.rows = [];
      populateFilterOptions();
      renderActivityTable(true);
    });
  });
  document.getElementById("activity-filter").addEventListener("change", (e) => {
    activityState.typeFilter = e.target.value;
    activityState.lastDocSnap = null;
    activityState.rows = [];
    renderActivityTable(true);
  });
  document.getElementById("activity-load-more").addEventListener("click", () => renderActivityTable(false));
  document.getElementById("activity-export").addEventListener("click", () => {
    const rows = activityState.rows.map((r) => {
      const copy = { ...r };
      delete copy.id;
      if (copy.ts && copy.ts.toDate) copy.ts = copy.ts.toDate().toISOString();
      return copy;
    });
    downloadCsv(rows, activityState.collectionName + ".csv");
  });
  populateFilterOptions();
  renderActivityTable(true);
}

function populateFilterOptions() {
  const select = document.getElementById("activity-filter");
  const types = activityState.collectionName === "adminActions" ? ADMIN_ACTION_TYPES : VISITOR_EVENT_TYPES;
  select.innerHTML = '<option value="">All types</option>' + types.map((t) => `<option value="${t}">${t}</option>`).join("");
  activityState.typeFilter = "";
}

async function renderActivityTable(reset) {
  const table = document.getElementById("activity-table");
  const empty = document.getElementById("activity-empty");
  const isAdmin = activityState.collectionName === "adminActions";

  if (reset) activityState.lastDocSnap = null;

  let constraints = [orderBy("ts", "desc"), limit(50)];
  if (activityState.typeFilter) {
    const filterField = isAdmin ? "action" : "type";
    constraints = [where(filterField, "==", activityState.typeFilter), orderBy("ts", "desc"), limit(50)];
  }
  if (!reset && activityState.lastDocSnap) constraints.push(startAfter(activityState.lastDocSnap));

  try {
    const q = query(collection(db, activityState.collectionName), ...constraints);
    const snap = await getDocs(q);
    const newRows = [];
    snap.forEach((d) => newRows.push({ id: d.id, ...d.data() }));
    if (snap.docs.length) activityState.lastDocSnap = snap.docs[snap.docs.length - 1];
    if (reset) activityState.rows = newRows;
    else activityState.rows = activityState.rows.concat(newRows);
  } catch (e) {
    console.warn("Activity query failed", e);
    if (reset) activityState.rows = [];
  }

  empty.classList.toggle("hidden", activityState.rows.length > 0);

  const thead = table.querySelector("thead tr");
  const tbody = table.querySelector("tbody");
  if (isAdmin) {
    thead.innerHTML = "<th>Action</th><th>Detail</th><th>Admin</th><th>When</th>";
    tbody.innerHTML = activityState.rows.map((r) => `
      <tr>
        <td>${escapeHtml(r.action || "")}</td>
        <td>${escapeHtml(r.slotId || r.filename || "")}</td>
        <td>${escapeHtml(r.admin || "")}</td>
        <td>${fmtTs(r.ts)}</td>
      </tr>`).join("");
  } else {
    thead.innerHTML = "<th>Type</th><th>Page</th><th>Detail</th><th>When</th>";
    tbody.innerHTML = activityState.rows.map((r) => `
      <tr>
        <td>${escapeHtml(r.type || "")}</td>
        <td>${escapeHtml(r.page || "")}</td>
        <td>${escapeHtml(r.tool || r.slotId || "")}</td>
        <td>${fmtTs(r.ts)}</td>
      </tr>`).join("");
  }
}

function fmtTs(ts) {
  if (ts && ts.toDate) return ts.toDate().toLocaleString();
  return "—";
}

/* ============================= Settings / Checklist ============================= */
async function buildChecklist() {
  const el = document.getElementById("checklist");
  el.innerHTML = "";
  let saved = {};
  try {
    const snap = await getDoc(doc(db, "config", "checklist"));
    if (snap.exists()) saved = snap.data();
  } catch (e) { /* default to unchecked */ }

  CHECKLIST_ITEMS.forEach((item) => {
    const row = document.createElement("label");
    row.className = "checklist-item";
    row.innerHTML = `<input type="checkbox" ${saved[item.id] ? "checked" : ""}> ${item.label}`;
    row.querySelector("input").addEventListener("change", async (e) => {
      try {
        await setDoc(doc(db, "config", "checklist"), { [item.id]: e.target.checked }, { merge: true });
      } catch (err) { alert("Couldn't save — check Firestore rules are deployed."); }
    });
    el.appendChild(row);
  });
}

/* ============================= Helpers ============================= */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function downloadCsv(rows, filename) {
  if (!rows || !rows.length) { alert("Nothing to export yet."); return; }
  const headers = Object.keys(rows[0]);
  const escapeCell = (v) => `"${String(v === undefined || v === null ? "" : v).replace(/"/g, '""')}"`;
  const csv = [headers.join(",")].concat(rows.map((r) => headers.map((h) => escapeCell(r[h])).join(","))).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

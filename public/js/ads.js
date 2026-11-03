// Site-wide ad slot renderer + lightweight visitor analytics.
// Loaded as <script type="module" src="/js/ads.js"> on every public page.
//
// How it works:
//   - Pages contain <div class="ad-slot" data-ad-slot="SLOT_ID"> containers inside an
//     .ad-slot-wrap. The wrap is hidden by CSS until this script decides to show it.
//   - This script reads /adSlots/{SLOT_ID} from Firestore to find out whether that slot
//     should show a real AdSense unit, a custom uploaded image ad, or nothing.
//   - If Firestore is not reachable, or a slot is "off", or an AdSense slot has no ad unit
//     ID, or Google returns no ad, the whole slot stays hidden. No empty boxes, no
//     placeholder labels.
//   - It also writes minimal, anonymous usage events (page_view, tool_used, ad_impression,
//     ad_click) to Firestore for the admin dashboard. No file content, no uploaded
//     images/text and no personal data is ever sent.
//
// AdSense-policy notes (why this file is deliberately simple):
//   - Only three static, in-page placements are supported: top_banner, in_content and
//     bottom_banner. Pop-up/interstitial modals, sticky/floating bars, side rails and
//     ads styled to look like site content were removed, because Google's publisher
//     policies restrict them. If you want anchor or interstitial formats, turn on
//     Google's own Auto ads formats in the AdSense console instead.
//   - Ads are never shown on About, Contact or Privacy pages (those pages have no slots).

import { db } from "/js/firebase-init.js";
import {
  collection, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

const ADSENSE_CLIENT = "ca-pub-5271137719829070";

// Fixed pixel sizes per slot. Keep in sync with .ad-slot--* CSS classes and with the ad
// units you create in AdSense, so nothing shifts the layout.
const DEFAULT_SLOTS = {
  top_banner:    { mode: "off", adUnitId: "", imageUrl: "", linkUrl: "", width: 728, height: 90 },
  in_content:    { mode: "off", adUnitId: "", imageUrl: "", linkUrl: "", width: 336, height: 280 },
  bottom_banner: { mode: "off", adUnitId: "", imageUrl: "", linkUrl: "", width: 728, height: 90 }
};

function sessionId() {
  try {
    let id = sessionStorage.getItem("qtb_sid");
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      sessionStorage.setItem("qtb_sid", id);
    }
    return id;
  } catch (e) {
    return "no-storage";
  }
}

async function logEvent(type, extra) {
  try {
    await addDoc(collection(db, "events"), {
      type,
      page: location.pathname,
      sessionId: sessionId(),
      ts: serverTimestamp(),
      ...extra
    });
  } catch (e) {
    // Analytics must never break the page.
  }
}
// Can be called from a tool page: qtbLogToolUse('image-compressor')
window.qtbLogToolUse = (toolName) => logEvent("tool_used", { tool: toolName });

function showWrap(wrap) { wrap.classList.add("is-live"); }
function hideWrap(wrap) { wrap.classList.remove("is-live"); }

function renderAdSense(box, wrap, slot) {
  // An AdSense slot without an ad unit ID cannot serve a manual ad — keep it hidden.
  if (!slot.adUnitId) { hideWrap(wrap); return false; }

  box.innerHTML = "";
  const ins = document.createElement("ins");
  ins.className = "adsbygoogle";
  ins.style.display = "inline-block";
  ins.style.width = slot.width + "px";
  ins.style.height = slot.height + "px";
  ins.setAttribute("data-ad-client", ADSENSE_CLIENT);
  ins.setAttribute("data-ad-slot", slot.adUnitId);
  box.appendChild(ins);

  // Show the "Advertisement" label and box only if Google actually fills the slot.
  showWrap(wrap);
  const mo = new MutationObserver(() => {
    if (ins.getAttribute("data-ad-status") === "unfilled") {
      hideWrap(wrap);
      mo.disconnect();
    }
  });
  mo.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });

  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (e) {
    hideWrap(wrap); // adsbygoogle.js blocked or not loaded
    return false;
  }
  return true;
}

function renderCustom(box, wrap, slotId, slot) {
  box.innerHTML = "";
  if (!slot.imageUrl) { hideWrap(wrap); return false; }

  const a = document.createElement("a");
  a.href = slot.linkUrl || "#";
  a.target = "_blank";
  a.rel = "sponsored noopener noreferrer";
  a.style.display = "block";
  a.style.width = "100%";
  a.style.height = "100%";
  a.addEventListener("click", () => logEvent("ad_click", { slotId }));

  const img = document.createElement("img");
  img.src = slot.imageUrl;
  img.alt = "Advertisement";
  img.loading = "lazy";
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "contain";

  a.appendChild(img);
  box.appendChild(a);
  showWrap(wrap);
  return true;
}

async function loadSlotConfig() {
  const merged = JSON.parse(JSON.stringify(DEFAULT_SLOTS));
  try {
    const snap = await getDocs(collection(db, "adSlots"));
    snap.forEach((d) => {
      if (merged[d.id]) merged[d.id] = { ...merged[d.id], ...d.data() };
    });
  } catch (e) {
    // Firestore not reachable — every slot stays hidden.
  }
  return merged;
}

function observeImpression(box, slotId, slot) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        logEvent("ad_impression", { slotId, mode: slot.mode });
        io.disconnect();
      }
    });
  }, { threshold: 0.5 });
  io.observe(box);
}

async function initAds() {
  const config = await loadSlotConfig();

  document.querySelectorAll(".ad-slot[data-ad-slot]").forEach((box) => {
    const slotId = box.getAttribute("data-ad-slot");
    const slot = config[slotId];
    const wrap = box.closest(".ad-slot-wrap");
    if (!wrap || !slot || slot.mode === "off") return; // stays hidden

    let rendered = false;
    if (slot.mode === "adsense") rendered = renderAdSense(box, wrap, slot);
    else if (slot.mode === "custom") rendered = renderCustom(box, wrap, slotId, slot);

    if (rendered) observeImpression(box, slotId, slot);
  });

  initToolActionTracking();
}

// Logs tool_used whenever a primary action button (class="btn") is clicked on a /tools/* page.
function initToolActionTracking() {
  if (!location.pathname.startsWith("/tools/")) return;
  const toolName = location.pathname.replace(/^\/tools\//, "").replace(/\.html$/, "");
  document.addEventListener("click", (e) => {
    if (e.target.closest(".btn")) logEvent("tool_used", { tool: toolName });
  });
}

logEvent("page_view");
initAds();

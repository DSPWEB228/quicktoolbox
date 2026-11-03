// Cookie / ad-personalisation notice for QuickToolBox.
// Loaded BEFORE the AdSense script on every page.
//  - Until the visitor accepts, ads are requested as NON-personalised
//    (adsbygoogle.requestNonPersonalizedAds = 1), which is the safe default.
//  - "Accept" allows personalised ads; "Decline" keeps them non-personalised.
//  - The choice is remembered in localStorage (wrapped in try/catch).
// For full EEA/UK/Swiss compliance, also enable Google's free "Privacy & messaging"
// (Funding Choices) consent message in your AdSense account.
(function () {
  var KEY = "qtb_ad_consent";
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function apply(v) {
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.requestNonPersonalizedAds = v === "granted" ? 0 : 1;
  }
  var saved = read();
  apply(saved);

  function show() {
    var bar = document.createElement("div");
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Cookie notice");
    bar.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:640px;margin:0 auto;background:#fff;color:#1f2937;border:1px solid #d1d5db;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:14px 16px;font:14px/1.5 Inter,system-ui,sans-serif";
    bar.innerHTML =
      '<p style="margin:0 0 10px">This site uses Google AdSense, which may use cookies to show ads. ' +
      'Choose whether ads may be personalised. See our <a href="/privacy-policy.html">privacy policy</a>.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" data-v="granted" style="padding:8px 14px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer">Accept</button>' +
      '<button type="button" data-v="denied" style="padding:8px 14px;border:1px solid #9ca3af;border-radius:8px;background:#fff;color:#1f2937;font-weight:600;cursor:pointer">Decline</button></div>';
    bar.addEventListener("click", function (e) {
      var v = e.target && e.target.getAttribute && e.target.getAttribute("data-v");
      if (!v) return;
      write(v); apply(v); bar.remove();
    });
    document.body.appendChild(bar);
  }
  if (!saved) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
    else show();
  }
})();

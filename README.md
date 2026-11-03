# QuickToolBox

A small multi-tool utility website: image compressor, PDF/Word converter, text summarizer, QR code generator, word counter, and unit/currency converter. Built with plain HTML/CSS/JS — **every tool runs entirely in the browser, no backend, no paid Firebase plan needed.**

## What works out of the box

All six tools run fully client-side on the free Firebase Spark plan:
- Word & Character Counter
- QR Code Generator
- Unit & Currency Converter (currency rates are static placeholders — see note below)
- Image Compressor
- Text Summarizer (basic extractive summarizer, runs in-browser, no API key needed)
- PDF ⇄ Word Converter (uses pdf.js and Mammoth.js in-browser — carries over text and paragraph breaks; complex layouts, images, and precise formatting won't survive the conversion)

## Run locally

Simplest option: just open `public/index.html` directly in your browser. Everything works with no server.

For a closer-to-production preview using Firebase Hosting locally:
1. Install the Firebase CLI if you don't have it:
   ```
   npm install -g firebase-tools
   ```
2. Log in: `firebase login`
3. Make sure `.firebaserc` has your project ID.
4. Run:
   ```
   firebase emulators:start --only hosting
   ```
   Then open `http://localhost:5000`.

## Deploy (free Spark plan, no billing)

```
firebase deploy --only hosting
```

Your live site will be at `https://YOUR-PROJECT-ID.web.app`. No Blaze upgrade, no Cloud Functions needed — `firebase.json` in this folder is already hosting-only.

## Optional: upgrading the summarizer later

The built-in summarizer is a simple word-frequency algorithm — good enough to ship, not as sharp as an AI model. If you later want AI-quality summaries, `firebase-with-functions.json.bak` and the `functions/` folder contain a Cloud Functions version wired up for that (requires the paid Blaze plan). Rename the `.bak` file to `firebase.json` to switch back to it.

## Before you go live / apply for AdSense

- [ ] Replace the placeholder email in `public/contact.html`
- [ ] Fill in the real date and finish the wording in `public/privacy-policy.html`
- [ ] Buy/connect a custom domain (Firebase Hosting supports this for free in the console)
- [ ] Wire up a real conversion API in `functions/index.js` → `convertFile` (e.g. CloudConvert or ConvertAPI) if you want PDF/Word conversion to actually work
- [ ] Consider a live currency-rate API (e.g. exchangerate.host) instead of the static rates in `unit-converter.html`
- [ ] Add a handful of real pages of content (a short blog/guide section) — AdSense reviewers want to see the site is more than just bare tools
- [ ] Don't apply for AdSense until the site has been live with some organic traffic for a couple of weeks — brand new domains with zero history get rejected more often regardless of niche

## Adding more tools later

Copy any file in `public/tools/` as a template, add a new tile to `public/index.html`, and (if it needs a backend) add a new function in `functions/index.js` plus a matching rewrite in `firebase.json`.

## AdSense + admin panel setup

The site now ships with AdSense integration, three fixed-size ad placements on every page, and an admin panel at `/admin` for managing them. This still runs on the free Spark plan — it uses only Firestore + Authentication, neither of which needs the paid Blaze plan for a small site.

**Why no Cloud Storage:** since Feb 3, 2026, creating a Firebase/Cloud Storage bucket always requires a linked billing account (the Blaze plan), even if you never exceed the free usage tier. So this project doesn't use Storage at all — custom ad images are instead saved as base64 directly on their Firestore document, capped at ~700KB per image so the document stays under Firestore's 1MB limit. If you deploy with `firebase deploy --only storage` or try to turn on Storage in the console, you'll be asked to add a billing account; you don't need to do that for anything in this repo.

**Important scope note:** every tool still runs entirely in the visitor's browser — nothing they upload or type is ever sent to a server, and the privacy policy still says so. The admin panel's "image library" and "activity log" are about *your own* ad creatives and *anonymous* page/tool usage counts (page path, timestamp, which tool) — never the actual files or text a visitor puts into a tool. Don't wire it up to do otherwise; that would contradict what the site tells visitors.

### 1. Turn on the Firebase services you need
In the [Firebase console](https://console.firebase.google.com) for this project:
- **Firestore Database** → Create database (production/native mode is fine).
- **Authentication** → Sign-in method → enable **Email/Password**. There's no public sign-up form anywhere on the site — you create your own login here.
- You do **not** need to turn on Storage — this project doesn't use it (see above).

### 2. Create your admin login
- Authentication → Users → Add user → enter the email/password you'll use to log into `/admin`.
- Copy that user's **UID**.
- Firestore → Start collection `admins` → document ID = that UID → any field (e.g. `role: "admin"`) → Save.
  This doc is what `firestore.rules` checks — no doc, no admin access, even if the login/password is correct.

### 3. Deploy the security rules
```
firebase deploy --only firestore:rules,firestore:indexes
```
Do this before you rely on the admin panel — without deployed rules, Firestore rejects all reads and writes by default, and slots quietly stay off.

### 4. Deploy hosting as usual
```
firebase deploy --only hosting
```

### 5. Log into `/admin` and configure your ad slots
There are three fixed placements, reused on every page:
| Slot | Size | Where it appears |
|---|---|---|
| `top_banner` | 728×90 (320×50 on mobile) | Right below the header |
| `in_content` | 336×280 (300×250 on mobile) | Mid-page, inside the content |
| `bottom_banner` | 728×90 (320×50 on mobile) | Right above the footer |

For each slot you can pick: **Off**, **AdSense** (paste the ad unit's slot ID from your AdSense console — create a fixed-size display ad unit matching the dimensions above), or **Custom image** (drag/drop or click to upload an image under ~700KB, plus a click-through link — the image is stored as base64 in Firestore, no Cloud Storage bucket needed, and is automatically scaled to fit the box without distorting, via `object-fit: contain`).

### 6. Before you submit to AdSense
- The AdSense script tag (`ca-pub-5271137719829070`) is already on every page, and `/ads.txt` already has the matching line — both are required for approval and are already in place.
- Go through the checklist under Settings in `/admin` (mirrors the list below) — Google reviews manually and rejects thin/placeholder content and brand-new domains with no traffic history.
- [ ] Replace the placeholder email in `public/contact.html`
- [ ] Fill in the real date and finish the wording in `public/privacy-policy.html`
- [ ] Buy/connect a custom domain (Firebase Hosting supports this for free in the console)
- [ ] Add a handful of real pages of content (a short blog/guide section) — AdSense reviewers want to see the site is more than just bare tools
- [ ] Don't apply for AdSense until the site has been live with some organic traffic for a couple of weeks

### What the admin panel logs
- **Ad Slots** — the current mode/image/link per placement.
- **Ad Image Library** — every custom ad image you've uploaded, with size, upload date, and which slot it's assigned to; delete removes it from this list (and Firestore).
- **Activity Log → Admin actions** — logins, slot changes, uploads, deletes, each with who and when.
- **Activity Log → Visitor activity** — anonymous `page_view` / `tool_used` / `ad_impression` / `ad_click` events (page path + timestamp + a random per-tab session id — no names, no IPs stored, no uploaded content). Both logs support a type filter and a **Download CSV** button.

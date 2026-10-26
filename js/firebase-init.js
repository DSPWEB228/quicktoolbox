// Shared Firebase initializer (Firebase JS SDK v10, modular, loaded from CDN — no npm build step needed).
// Used by /js/ads.js (site-wide ad rendering + event logging) and /admin (dashboard).
//
// Requires, on the free Spark plan, that you've turned on in the Firebase console:
//   - Firestore Database (Native mode)
//   - Authentication → Email/Password provider (for the admin login)
// That's it. This project deliberately does NOT use Firebase/Cloud Storage: since
// Feb 3, 2026, creating a Storage bucket requires a linked billing account (the paid
// Blaze plan) even at zero usage. Custom ad images are instead stored as compressed
// base64 strings directly in Firestore (see /admin/admin.js), so the whole site,
// including the admin panel, stays on the free Spark plan with no card required.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBVB2Ouh-71Gxylal4-Wi6vfV6b8ED7xz4",
  authDomain: "quicktoolbox-292da.firebaseapp.com",
  projectId: "quicktoolbox-292da",
  storageBucket: "quicktoolbox-292da.firebasestorage.app",
  messagingSenderId: "563835016406",
  appId: "1:563835016406:web:99572517a41196b7a7a577"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

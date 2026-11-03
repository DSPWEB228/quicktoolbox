// Firebase JS SDK config — only needed if you add client-side Firebase
// features like Analytics, Auth, or Firestore to a tool page later.
// This is NOT required for `firebase deploy` (Hosting + Functions use
// the project ID in .firebaserc instead).
//
// To use this, add to a page's <head>:
//   <script type="module" src="/firebase-config.js"></script>
// and make sure the Firebase SDK script tags are included first, per
// https://firebase.google.com/docs/web/setup#available-libraries

import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyBVB2Ouh-71Gxylal4-Wi6vfV6b8ED7xz4",
  authDomain: "quicktoolbox-292da.firebaseapp.com",
  projectId: "quicktoolbox-292da",
  storageBucket: "quicktoolbox-292da.firebasestorage.app",
  messagingSenderId: "563835016406",
  appId: "1:563835016406:web:99572517a41196b7a7a577"
};

const app = initializeApp(firebaseConfig);

export default app;

//Firebase config file, I'll handle security rules before going live
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCdt0IF2zydGQIE21rGxm2WkyoyJHYed6s",
  authDomain: "threedailywins-401df.firebaseapp.com",
  projectId: "threedailywins-401df",
  storageBucket: "threedailywins-401df.firebasestorage.app",
  messagingSenderId: "734565733098",
  appId: "1:734565733098:web:fbf23a27096fd9a85e7d93"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
// Firebase configuration — remplacez les placeholders par les valeurs
// de votre projet (Console Firebase > Paramètres du projet > Vos applications).
const firebaseConfig = {
   apiKey: "AIzaSyCHvJBTqRLMG-JtDZkMWBM5iISRuF7BMHs",
  authDomain: "pet-feed3r.firebaseapp.com",
  databaseURL: "https://pet-feed3r-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "pet-feed3r",
  storageBucket: "pet-feed3r.firebasestorage.app",
  messagingSenderId: "870057909648",
  appId: "1:870057909648:web:0ae95bc85cbf3449f96715",
};

// Initialisation de Firebase (SDK v8 compat).
firebase.initializeApp(firebaseConfig);

// Services exposés globalement pour le reste de l'application.
const auth = firebase.auth();
const db = firebase.database();

// Firebase configuration — remplacez les placeholders par les valeurs
// de votre projet (Console Firebase > Paramètres du projet > Vos applications).
var firebaseConfig = {
   apiKey: "AIzaSyCHvJBTqRLMG-JtDZkMWBM5iISRuF7BMHs",
  authDomain: "pet-feed3r.firebaseapp.com",
  databaseURL: "https://pet-feed3r-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "pet-feed3r",
  storageBucket: "pet-feed3r.firebasestorage.app",
  messagingSenderId: "870057909648",
  appId: "1:870057909648:web:0ae95bc85cbf3449f96715",
};

// Initialisation de Firebase (SDK v8 compat).
// Garde anti double-init : si firebase-config.js est évalué deux fois,
// on ne réinitialise pas l'app (sinon « Firebase App already exists »).
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Services exposés globalement (var et non const pour tolérer une éventuelle
// double évaluation du script sans SyntaxError « already declared »).
var auth = firebase.auth();
var db = firebase.database();

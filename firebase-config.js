// Firebase configuration — remplacez les placeholders par les valeurs
// de votre projet (Console Firebase > Paramètres du projet > Vos applications).
const firebaseConfig = {
  apiKey: "VOTRE_API_KEY",
  authDomain: "VOTRE_PROJET.firebaseapp.com",
  databaseURL: "https://VOTRE_PROJET-default-rtdb.firebaseio.com",
  projectId: "VOTRE_PROJET",
  storageBucket: "VOTRE_PROJET.appspot.com",
  messagingSenderId: "VOTRE_SENDER_ID",
  appId: "VOTRE_APP_ID"
};

// Initialisation de Firebase (SDK v8 compat).
firebase.initializeApp(firebaseConfig);

// Services exposés globalement pour le reste de l'application.
const auth = firebase.auth();
const db = firebase.database();

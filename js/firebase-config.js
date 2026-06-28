// Firebase configuration — remplacez les placeholders par les valeurs
// de votre projet (Console Firebase > Paramètres du projet > Vos applications).
var firebaseConfig = {
  apiKey: "AIzaSyD7R9KlqbLPw6cFwVJmdeDdQiRc9JZN9gU",
  authDomain: "pet-feeder-e8541.firebaseapp.com",
  databaseURL: "METS_ICI_TON_DATABASE_URL",
  projectId: "pet-feeder-e8541",
  storageBucket: "pet-feeder-e8541.firebasestorage.app",
  messagingSenderId: "297618316482",
  appId: "1:297618316482:web:32e700e0004c9864d5ef5b"
};

// Initialisation de Firebase (SDK v8 compat).
firebase.initializeApp(firebaseConfig);

// Services exposés globalement pour le reste de l'application.
const auth = firebase.auth();
const db = firebase.database();

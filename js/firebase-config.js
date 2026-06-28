// Configuration Firebase — initialisation robuste.
// Remarque : support.js (le runtime du design) ne charge PAS Firebase ; ce sont
// les scripts CDN firebase-*.js (chargés juste avant ce fichier) qui fournissent
// `window.firebase`. On attend qu'il soit disponible, puis on initialise l'app
// UNE seule fois (le try/catch évite « Firebase App already exists »).

function initFirebase() {
  if (typeof firebase === 'undefined') {
    setTimeout(initFirebase, 100);
    return;
  }
  try {
    firebase.app(); // vérifie si déjà initialisé
  } catch (e) {
    firebase.initializeApp({
      apiKey: "AIzaSyD7R9KlqbLPw6cFwVJmdeDdQiRc9JZN9gU",
      authDomain: "pet-feeder-e8541.firebaseapp.com",
      databaseURL: "https://pet-feeder-e8541-default-rtdb.europe-west1.firebasedatabase.app/",
      projectId: "pet-feeder-e8541",
      storageBucket: "pet-feeder-e8541.firebasestorage.app",
      messagingSenderId: "297618316482",
      appId: "1:297618316482:web:32e700e0004c9864d5ef5b"
    });
  }
}
initFirebase();

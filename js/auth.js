(function() {
  "use strict";

  function initAuth() {
    var buttons = document.querySelectorAll('button.scp4');
    if (buttons.length < 2) {
      setTimeout(initAuth, 200);
      return;
    }
    console.log("[auth] Boutons trouvés:", buttons.length);

    // Bouton Google
    buttons[0].addEventListener('click', function() {
      console.log("[auth] Clic Google");
      var provider = new firebase.auth.GoogleAuthProvider();
      firebase.auth().signInWithPopup(provider)
        .then(function() { window.location.href = 'Dashboard.dc.html'; })
        .catch(function(e) { console.error("[auth] Erreur Google:", e); alert(e.message); });
    });

    // Bouton Se connecter (email/password)
    var loginBtn = document.querySelector('button.scp2');
    if (loginBtn) {
      loginBtn.addEventListener('click', function() {
        console.log("[auth] Clic email");
        var inputs = document.querySelectorAll('input');
        var email = inputs[0] ? inputs[0].value : '';
        var pass = inputs[1] ? inputs[1].value : '';
        firebase.auth().signInWithEmailAndPassword(email, pass)
          .then(function() { window.location.href = 'Dashboard.dc.html'; })
          .catch(function(e) { console.error("[auth] Erreur email:", e); alert(e.message); });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(initAuth, 500); });
  } else {
    setTimeout(initAuth, 500);
  }
})();

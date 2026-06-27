// Authentification Firebase (email / mot de passe) pour Pet Feeder.
// Ce fichier branche la logique d'auth sur le design existant SANS le modifier :
// - il attend que le runtime (support.js) ait rendu le DOM, puis attache les
//   gestionnaires sur les éléments réels ;
// - les éléments ajoutés (message d'erreur, bouton de déconnexion) sont stylés
//   pour rester fidèles à la charte (DM Sans, accent or #C9A96E).

(function () {
  "use strict";

  if (typeof firebase === "undefined" || !firebase.auth) {
    console.error("[auth] Firebase n'est pas chargé — vérifiez l'ordre des scripts.");
    return;
  }

  var auth = firebase.auth();

  // --- Détection de la page courante --------------------------------------
  var path = decodeURIComponent(location.pathname);
  var isLoginPage = /Login\.dc\.html$/i.test(path);
  // Toute page nécessitant une session : dashboards + historique.
  var isProtectedPage = /(Dashboard|Historique)[^/]*\.dc\.html$/i.test(path);

  var LOGIN_URL = "Login.dc.html";
  var DASHBOARD_URL = "Dashboard.dc.html";

  // --- Petit utilitaire : attendre qu'un élément apparaisse dans le DOM ----
  function waitFor(test, cb, timeoutMs) {
    var found = test();
    if (found) { cb(found); return; }
    var obs = new MutationObserver(function () {
      var el = test();
      if (el) { obs.disconnect(); cb(el); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    if (timeoutMs) {
      setTimeout(function () { obs.disconnect(); }, timeoutMs);
    }
  }

  // --- Garde d'authentification (routing automatique) ---------------------
  auth.onAuthStateChanged(function (user) {
    if (isLoginPage && user) {
      // Déjà connecté → on file vers le dashboard.
      location.replace(DASHBOARD_URL);
    } else if (isProtectedPage && !user) {
      // Session absente → retour au login.
      location.replace(LOGIN_URL);
    }
  });

  // ========================================================================
  //  PAGE DE LOGIN
  // ========================================================================
  if (isLoginPage) {
    waitFor(function () {
      return document.querySelector('input[type="email"]');
    }, setupLogin);
  }

  function setupLogin() {
    var emailInput = document.querySelector('input[type="email"]');
    var passwordInput = document.querySelector('input[type="password"]');

    // Repérer le bouton « Se connecter » par son texte.
    var loginBtn = null;
    var buttons = document.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      if (/se connecter/i.test(buttons[i].textContent || "")) {
        loginBtn = buttons[i];
        break;
      }
    }
    if (!emailInput || !passwordInput || !loginBtn) {
      console.error("[auth] Champs de login introuvables.");
      return;
    }

    var defaultBtnText = loginBtn.textContent.trim();

    // Élément de message d'erreur, inséré au-dessus du bouton, dans le style
    // existant (rouge doux déjà utilisé ailleurs : #EF6B6B).
    var errorEl = document.createElement("div");
    errorEl.setAttribute("role", "alert");
    errorEl.style.cssText =
      "display:none;margin-bottom:18px;padding:12px 16px;" +
      "font-family:'DM Sans',sans-serif;font-size:13px;font-weight:400;line-height:1.4;" +
      "color:#EF6B6B;text-align:center;background:rgba(239,107,107,0.08);" +
      "border:1px solid rgba(239,107,107,0.22);border-radius:12px;" +
      "transition:opacity 0.25s ease";
    loginBtn.parentNode.insertBefore(errorEl, loginBtn);

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.style.display = "block";
    }
    function clearError() {
      errorEl.style.display = "none";
    }

    function mapError(code) {
      switch (code) {
        case "auth/invalid-email":
          return "Adresse e-mail invalide.";
        case "auth/user-disabled":
          return "Ce compte a été désactivé.";
        case "auth/user-not-found":
          return "Aucun compte associé à cet e-mail.";
        case "auth/wrong-password":
        case "auth/invalid-credential":
        case "auth/invalid-login-credentials":
          return "E-mail ou mot de passe incorrect.";
        case "auth/too-many-requests":
          return "Trop de tentatives. Réessayez dans quelques instants.";
        case "auth/network-request-failed":
          return "Problème de connexion réseau. Vérifiez votre connexion.";
        default:
          return "Connexion impossible. Réessayez.";
      }
    }

    function submit() {
      var email = (emailInput.value || "").trim();
      var password = passwordInput.value || "";

      if (!email || !password) {
        showError("Veuillez renseigner votre e-mail et votre mot de passe.");
        return;
      }

      clearError();
      loginBtn.disabled = true;
      loginBtn.textContent = "Connexion…";

      auth
        .signInWithEmailAndPassword(email, password)
        .then(function () {
          // Succès : onAuthStateChanged redirige vers le dashboard.
          location.replace(DASHBOARD_URL);
        })
        .catch(function (err) {
          showError(mapError(err && err.code));
          loginBtn.disabled = false;
          loginBtn.textContent = defaultBtnText;
        });
    }

    loginBtn.addEventListener("click", function (e) {
      e.preventDefault();
      submit();
    });

    // Soumission via la touche Entrée dans les champs.
    function onEnter(e) {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    }
    emailInput.addEventListener("keydown", onEnter);
    passwordInput.addEventListener("keydown", onEnter);

    // Effacer l'erreur dès que l'utilisateur recommence à taper.
    emailInput.addEventListener("input", clearError);
    passwordInput.addEventListener("input", clearError);
  }

  // ========================================================================
  //  PAGES PROTÉGÉES — bouton de déconnexion
  // ========================================================================
  if (isProtectedPage) {
    // Le bouton est ajouté à <body>, donc HORS du conteneur React (#dc-root) :
    // il survit aux re-rendus du dashboard et ne perturbe pas le design.
    waitFor(function () {
      return document.body ? document.body : null;
    }, addLogoutButton);
  }

  function addLogoutButton() {
    if (document.getElementById("pf-logout-btn")) return;

    var btn = document.createElement("button");
    btn.id = "pf-logout-btn";
    btn.type = "button";
    btn.title = "Déconnexion";
    btn.style.cssText =
      "position:fixed;top:16px;right:16px;z-index:2147483000;" +
      "display:flex;align-items:center;gap:7px;padding:8px 13px;" +
      "font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;" +
      "letter-spacing:0.3px;color:rgba(242,237,231,0.65);cursor:pointer;" +
      "background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);" +
      "border-radius:12px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);" +
      "transition:background 0.2s ease,color 0.2s ease,border-color 0.2s ease";

    btn.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
      'stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
      '<polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>' +
      "</svg><span>Déconnexion</span>";

    btn.addEventListener("mouseenter", function () {
      btn.style.background = "rgba(201,169,110,0.12)";
      btn.style.borderColor = "rgba(201,169,110,0.25)";
      btn.style.color = "#C9A96E";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.background = "rgba(255,255,255,0.05)";
      btn.style.borderColor = "rgba(255,255,255,0.08)";
      btn.style.color = "rgba(242,237,231,0.65)";
    });

    btn.addEventListener("click", function () {
      btn.disabled = true;
      auth.signOut().then(function () {
        location.replace(LOGIN_URL);
      }).catch(function (err) {
        console.error("[auth] Échec de la déconnexion :", err);
        btn.disabled = false;
      });
    });

    document.body.appendChild(btn);
  }
})();

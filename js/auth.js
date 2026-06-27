// Authentification Firebase (email / mot de passe + Google) pour Pet Feeder.
// Le design est rendu par React (support.js) APRÈS DOMContentLoaded : on ne peut
// donc pas brancher les listeners au chargement. On utilise un MutationObserver
// (waitForElement) pour attendre que chaque bouton soit réellement présent dans
// le DOM avant d'y attacher son gestionnaire. Le design n'est pas modifié.

(function () {
  "use strict";
  console.log("[auth] script démarré, body:", document.body, "html:", document.documentElement);

  if (typeof firebase === "undefined" || !firebase.auth) {
    console.error("[auth] Firebase n'est pas chargé — vérifiez l'ordre des scripts.");
    return;
  }

  var auth = firebase.auth();

  // --- Détection de la page courante --------------------------------------
  var path = decodeURIComponent(location.pathname);
  var isLoginPage = /Login\.dc\.html$/i.test(path);
  var isProtectedPage = /(Dashboard|Historique)[^/]*\.dc\.html$/i.test(path);

  var LOGIN_URL = "Login.dc.html";
  var DASHBOARD_URL = "Dashboard.dc.html";

  // --- Attend qu'un élément existe avant d'exécuter le callback -----------
  // `selector` peut être un sélecteur CSS OU une fonction-prédicat renvoyant
  // l'élément (utile pour le bouton « Se connecter » qui n'a ni id ni classe
  // et ne peut pas être ciblé par texte en CSS).
  function waitForElement(selector, callback) {
    function find() {
      try {
        return typeof selector === "function" ? selector() : document.querySelector(selector);
      } catch (e) {
        return null; // sélecteur non supporté par le navigateur
      }
    }
    var el = find();
    if (el) { callback(el); return; }
    var observer = new MutationObserver(function () {
      var found = find();
      if (found) { observer.disconnect(); callback(found); }
    });
    // auth.js est chargé dans <head> : document.body peut être null ici.
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // --- Garde d'authentification (routing automatique) ---------------------
  auth.onAuthStateChanged(function (user) {
    if (isLoginPage && user) {
      location.replace(DASHBOARD_URL);        // déjà connecté → dashboard
    } else if (isProtectedPage && !user) {
      location.replace(LOGIN_URL);            // session absente → login
    }
  });

  // ========================================================================
  //  PAGE DE LOGIN
  // ========================================================================
  if (isLoginPage) {
    // Bouton « Se connecter » : repéré par son texte (pas de sélecteur CSS).
    waitForElement(findLoginButton, setupLogin);
  }

  function findLoginButton() {
    var buttons = document.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      if (/se connecter/i.test(buttons[i].textContent || "")) return buttons[i];
    }
    return null;
  }

  function setupLogin(loginBtn) {
    var emailInput = document.querySelector('input[type="email"]');
    var passwordInput = document.querySelector('input[type="password"]');
    if (!emailInput || !passwordInput) {
      console.error("[auth] Champs e-mail/mot de passe introuvables.");
      return;
    }

    var defaultBtnText = loginBtn.textContent.trim();

    // Message d'erreur inséré au-dessus du bouton, dans la charte (#EF6B6B).
    var errorEl = document.createElement("div");
    errorEl.setAttribute("role", "alert");
    errorEl.style.cssText =
      "display:none;margin-bottom:18px;padding:12px 16px;" +
      "font-family:'DM Sans',sans-serif;font-size:13px;font-weight:400;line-height:1.4;" +
      "color:#EF6B6B;text-align:center;background:rgba(239,107,107,0.08);" +
      "border:1px solid rgba(239,107,107,0.22);border-radius:12px;" +
      "transition:opacity 0.25s ease";
    loginBtn.parentNode.insertBefore(errorEl, loginBtn);

    function showError(msg) { errorEl.textContent = msg; errorEl.style.display = "block"; }
    function clearError() { errorEl.style.display = "none"; }

    function mapError(code) {
      switch (code) {
        case "auth/invalid-email": return "Adresse e-mail invalide.";
        case "auth/user-disabled": return "Ce compte a été désactivé.";
        case "auth/user-not-found": return "Aucun compte associé à cet e-mail.";
        case "auth/wrong-password":
        case "auth/invalid-credential":
        case "auth/invalid-login-credentials": return "E-mail ou mot de passe incorrect.";
        case "auth/too-many-requests": return "Trop de tentatives. Réessayez dans quelques instants.";
        case "auth/network-request-failed": return "Problème de connexion réseau. Vérifiez votre connexion.";
        case "auth/popup-blocked": return "Veuillez autoriser les pop-ups pour vous connecter.";
        case "auth/account-exists-with-different-credential":
          return "Un compte existe déjà avec cette adresse via une autre méthode.";
        case "auth/unauthorized-domain": return "Ce domaine n'est pas autorisé dans la console Firebase.";
        case "auth/operation-not-allowed": return "Cette méthode de connexion n'est pas activée dans Firebase.";
        default: return "Connexion impossible. Réessayez.";
      }
    }

    // --- Connexion e-mail / mot de passe --------------------------------
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
        .then(function () { location.replace(DASHBOARD_URL); })
        .catch(function (err) {
          showError(mapError(err && err.code));
          loginBtn.disabled = false;
          loginBtn.textContent = defaultBtnText;
        });
    }

    loginBtn.addEventListener("click", function (e) { e.preventDefault(); submit(); });

    function onEnter(e) { if (e.key === "Enter") { e.preventDefault(); submit(); } }
    emailInput.addEventListener("keydown", onEnter);
    passwordInput.addEventListener("keydown", onEnter);
    emailInput.addEventListener("input", clearError);
    passwordInput.addEventListener("input", clearError);

    // --- Connexion Google (bouton ciblé par son logo SVG) ---------------
    waitForElement('button:has(path[fill="#4285F4"])', function (googleBtn) {
      googleBtn.addEventListener("click", function (e) {
        e.preventDefault();
        if (googleBtn.disabled) return;
        clearError();
        googleBtn.disabled = true;
        auth
          .signInWithPopup(new firebase.auth.GoogleAuthProvider())
          .then(function () { location.replace(DASHBOARD_URL); })
          .catch(function (err) {
            var code = err && err.code;
            // Pop-up fermée/annulée par l'utilisateur : pas d'erreur affichée.
            if (code !== "auth/popup-closed-by-user" &&
                code !== "auth/cancelled-popup-request") {
              showError(mapError(code));
            }
            googleBtn.disabled = false;
          });
      });
    });

    // --- Bouton Apple : non disponible (Sign-In Apple = config serveur) -
    waitForElement('button:has(path[d^="M18.71 19.5"])', function (appleBtn) {
      appleBtn.addEventListener("click", function (e) {
        e.preventDefault();
        showError("Connexion Apple non disponible pour le moment.");
      });
    });
  }

  // ========================================================================
  //  PAGES PROTÉGÉES — bouton de déconnexion
  // ========================================================================
  if (isProtectedPage) {
    // On attend que <body> existe, puis on injecte le bouton HORS de #dc-root
    // (il survit aux re-rendus React et ne perturbe pas le design).
    waitForElement(function () { return document.body; }, addLogoutButton);
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

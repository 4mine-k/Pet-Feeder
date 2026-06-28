// Interactions utilisateur qui ÉCRIVENT dans Firebase (côté app → ESP32).
// Branché sur les dashboards live (mobile + desktop). Aucun style du design
// n'est modifié : les éléments ajoutés (modale, lignes d'horaires, bouton de
// suppression) réutilisent les tokens de la charte et vivent soit hors du
// conteneur React (modale), soit dans une section statique que React ne
// réécrit pas (liste d'horaires).
//
//  - Bouton "Nourrir maintenant" → confirmation puis /feedNow = 1, anti-spam 10s
//  - Horaires → charge /schedule, ajout (validation HH:MM + anti-doublon),
//    suppression, tri chronologique, réécriture du CSV
//  - Sync temps → /currentTime = minutes depuis minuit, immédiat + toutes les 60s

(function () {
  "use strict";

  if (typeof firebase === "undefined" || !firebase.database) {
    console.error("[controls] Firebase Database n'est pas chargé.");
    return;
  }

  var base = decodeURIComponent(location.pathname).split("/").pop();
  var isDashboard = base === "Dashboard.dc.html" || base === "Dashboard Desktop.dc.html";
  var isHistorique = base === "Historique.dc.html";
  if (!isDashboard && !isHistorique) {
    return;
  }

  var db = firebase.database();
  var HM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

  // ======================================================================
  //  Synchronisation du temps (dashboards uniquement, indépendant du DOM)
  // ======================================================================
  function nowMinutes() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
  function pushTime() {
    db.ref("/currentTime").set(nowMinutes()).catch(function (e) {
      console.warn("[controls] écriture /currentTime échouée :", e);
    });
  }
  if (isDashboard) {
    pushTime();                       // immédiat au chargement
    setInterval(pushTime, 60 * 1000); // puis toutes les 60 secondes
  }

  // ======================================================================
  //  Helpers DOM
  // ======================================================================
  function root() { return document.getElementById("dc-root") || document.body || document.documentElement; }
  function findInScope(scope, pred) {
    if (!scope) return null;
    var els = scope.querySelectorAll("*");
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (e.children.length === 0 && pred((e.textContent || "").trim(), e)) return e;
    }
    return null;
  }
  function findLeafText(str) {
    return findInScope(root(), function (t) { return t === str; });
  }
  function timeLeafIn(scope) {
    return findInScope(scope, function (t) { return /^\d{1,2}:\d{2}$/.test(t); });
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function parseHM(s) {
    var m = HM_RE.exec((s || "").trim());
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }
  function normHM(s) {
    var m = HM_RE.exec((s || "").trim());
    return m ? pad2(parseInt(m[1], 10)) + ":" + m[2] : null;
  }
  function byTime(a, b) { return parseHM(a) - parseHM(b); }

  // ======================================================================
  //  Modale réutilisable (confirmation + saisie), hors du root React
  // ======================================================================
  function openModal(opts) {
    var overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;" +
      "justify-content:center;padding:24px;box-sizing:border-box;" +
      "background:rgba(15,15,24,0.62);backdrop-filter:blur(6px);" +
      "-webkit-backdrop-filter:blur(6px);font-family:'DM Sans',sans-serif";

    var card = document.createElement("div");
    card.style.cssText =
      "width:100%;max-width:360px;box-sizing:border-box;padding:28px 26px;" +
      "background:linear-gradient(175deg,rgba(42,42,62,0.98) 0%,rgba(30,30,46,0.98) 100%);" +
      "border:1px solid rgba(255,255,255,0.08);border-radius:20px;" +
      "box-shadow:0 20px 60px rgba(0,0,0,0.5)";

    var title = document.createElement("div");
    title.textContent = opts.title || "";
    title.style.cssText =
      "font-family:'Playfair Display',serif;font-size:20px;font-weight:600;" +
      "color:#F2EDE7;margin-bottom:10px";
    card.appendChild(title);

    if (opts.message) {
      var msg = document.createElement("div");
      msg.textContent = opts.message;
      msg.style.cssText =
        "font-size:14px;font-weight:300;line-height:1.5;color:rgba(242,237,231,0.5);" +
        "margin-bottom:22px";
      card.appendChild(msg);
    }

    var input = null, errEl = null;
    if (opts.input) {
      input = document.createElement("input");
      input.type = "text";
      input.inputMode = "numeric";
      input.maxLength = 5;
      input.placeholder = opts.input.placeholder || "HH:MM";
      input.style.cssText =
        "width:100%;box-sizing:border-box;margin-bottom:8px;padding:14px 16px;" +
        "background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);" +
        "border-radius:12px;font-family:'DM Sans',sans-serif;font-size:16px;" +
        "color:#F2EDE7;outline:none;letter-spacing:1px;text-align:center";
      card.appendChild(input);

      errEl = document.createElement("div");
      errEl.style.cssText =
        "min-height:18px;font-size:12.5px;color:#EF6B6B;text-align:center;margin-bottom:14px";
      card.appendChild(errEl);
    }

    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:12px;margin-top:6px";

    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = opts.cancelText || "Annuler";
    cancel.style.cssText =
      "flex:1;padding:14px;background:rgba(255,255,255,0.04);" +
      "border:1px solid rgba(255,255,255,0.08);border-radius:12px;cursor:pointer;" +
      "font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;" +
      "color:rgba(242,237,231,0.6)";

    var confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = opts.confirmText || "Confirmer";
    confirm.style.cssText =
      "flex:1;padding:14px;border:none;border-radius:12px;cursor:pointer;" +
      "font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;color:#1B1B28;" +
      "background:linear-gradient(135deg,#C9A96E 0%,#B8935A 60%,#D4B87A 100%);" +
      "box-shadow:0 4px 16px rgba(201,169,110,0.25)";

    row.appendChild(cancel);
    row.appendChild(confirm);
    card.appendChild(row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    if (input) setTimeout(function () { input.focus(); }, 30);

    function close() {
      document.removeEventListener("keydown", onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function doConfirm() {
      var ok = opts.onConfirm
        ? opts.onConfirm(input ? input.value : null, {
            error: function (m) { if (errEl) errEl.textContent = m; }
          })
        : true;
      if (ok !== false) close();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
      else if (e.key === "Enter" && input) { e.preventDefault(); doConfirm(); }
    }

    confirm.addEventListener("click", doConfirm);
    cancel.addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", onKey);
  }

  // ======================================================================
  //  Bouton "Nourrir maintenant" → /feedNow = 1 (+ confirmation + anti-spam)
  // ======================================================================
  function setupFeed() {
    var btn = null;
    var buttons = root().querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      if (/nourrir maintenant/i.test(buttons[i].textContent || "")) { btn = buttons[i]; break; }
    }
    if (!btn) return;

    btn.addEventListener("click", function () {
      if (btn.__feedLocked) return;
      openModal({
        title: "Nourrir maintenant",
        message: "Distribuer une portion à Milo immédiatement ?",
        confirmText: "Distribuer",
        onConfirm: function () { sendFeed(btn); }
      });
    });
  }

  function sendFeed(btn) {
    db.ref("/feedNow").set(1).catch(function (e) {
      console.warn("[controls] écriture /feedNow échouée :", e);
    });
    lockFeed(btn);
  }

  function lockFeed(btn) {
    if (btn.__feedLocked) return;
    btn.__feedLocked = true;
    var prev = {
      opacity: btn.style.opacity,
      pointerEvents: btn.style.pointerEvents,
      cursor: btn.style.cursor
    };
    btn.style.opacity = "0.5";
    btn.style.pointerEvents = "none";
    btn.style.cursor = "default";
    setTimeout(function () {
      btn.style.opacity = prev.opacity;
      btn.style.pointerEvents = prev.pointerEvents;
      btn.style.cursor = prev.cursor;
      btn.__feedLocked = false;
    }, 10000); // anti-spam : 10 secondes
  }

  // ======================================================================
  //  Gestion des horaires (/schedule)
  // ======================================================================
  var scheduleListEl = null;   // conteneur des lignes (mémorisé)
  var currentTimes = [];       // horaires courants (HH:MM normalisés)

  function findScheduleSection() {
    var label = findLeafText("Horaires programmés") || findLeafText("Programmation");
    if (!label) return null;
    var node = label;
    for (var d = 0; d < 6 && node; d++) {
      node = node.parentElement;
      if (!node) break;
      var list = findRowsContainer(node);
      if (list) return { section: node, list: list };
    }
    return null;
  }
  // Conteneur dont CHAQUE enfant direct contient une heure HH:MM.
  function findRowsContainer(scope) {
    var cand = scope.querySelectorAll("div");
    for (var i = 0; i < cand.length; i++) {
      var c = cand[i];
      if (c.children.length < 1) continue;
      var allTimes = true;
      for (var j = 0; j < c.children.length; j++) {
        if (!timeLeafIn(c.children[j])) { allTimes = false; break; }
      }
      if (allTimes) return c;
    }
    return null;
  }
  function findAddButton(section) {
    var els = section.querySelectorAll("div");
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (e.offsetWidth <= 40 && e.innerHTML.indexOf("M12 5v14") !== -1) return e;
    }
    return null;
  }

  function mealLabel(min) {
    var h = Math.floor(min / 60);
    if (h < 11) return "Matin";
    if (h < 14) return "Midi";
    if (h < 18) return "Après-midi";
    return "Soir";
  }

  // Construit une ligne fidèle à la charte (mêmes couleurs / police / rayons).
  function buildRow(t) {
    var min = parseHM(t);
    var row = document.createElement("div");
    row.style.cssText =
      "padding:16px 18px;background:rgba(255,255,255,0.035);" +
      "border:1px solid rgba(255,255,255,0.06);border-radius:14px;" +
      "display:flex;align-items:center;gap:14px";

    var icon = document.createElement("div");
    icon.style.cssText =
      "width:42px;height:42px;border-radius:12px;flex-shrink:0;display:flex;" +
      "align-items:center;justify-content:center;" +
      "background:linear-gradient(135deg,rgba(201,169,110,0.12),rgba(201,169,110,0.05))";
    icon.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A96E" ' +
      'stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/>' +
      '<path d="M12 6v6l4 2"/></svg>';

    var textCol = document.createElement("div");
    textCol.style.cssText = "flex:1;display:flex;flex-direction:column;gap:2px";
    var lbl = document.createElement("div");
    lbl.textContent = mealLabel(min);
    lbl.style.cssText = "font-size:14px;font-weight:500;color:#F2EDE7";
    var sub = document.createElement("div");
    sub.textContent = "Repas programmé";
    sub.style.cssText = "font-size:12px;font-weight:400;color:rgba(242,237,231,0.35)";
    textCol.appendChild(lbl);
    textCol.appendChild(sub);

    var time = document.createElement("div");
    time.textContent = t;
    time.style.cssText =
      "font-family:'Playfair Display',serif;font-size:17px;font-weight:600;color:#F2EDE7";

    var del = document.createElement("div");
    del.title = "Supprimer";
    del.style.cssText =
      "width:32px;height:32px;border-radius:10px;flex-shrink:0;cursor:pointer;" +
      "display:flex;align-items:center;justify-content:center;" +
      "background:rgba(239,107,107,0.08);border:1px solid rgba(239,107,107,0.12);" +
      "transition:background 0.2s ease";
    del.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF6B6B" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
      '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
    del.addEventListener("mouseenter", function () { del.style.background = "rgba(239,107,107,0.16)"; });
    del.addEventListener("mouseleave", function () { del.style.background = "rgba(239,107,107,0.08)"; });
    del.addEventListener("click", function () { removeTime(t); });

    row.appendChild(icon);
    row.appendChild(textCol);
    row.appendChild(time);
    row.appendChild(del);
    return row;
  }

  function buildEmptyRow() {
    var row = document.createElement("div");
    row.style.cssText =
      "padding:16px 18px;background:rgba(255,255,255,0.02);" +
      "border:1px dashed rgba(255,255,255,0.08);border-radius:14px;text-align:center;" +
      "font-size:12.5px;color:rgba(242,237,231,0.3)";
    row.textContent = "Aucun horaire programmé";
    return row;
  }

  function renderSchedule(csv) {
    if (!scheduleListEl) return;
    var times = String(csv || "")
      .split(",")
      .map(normHM)
      .filter(Boolean);
    times.sort(byTime);
    currentTimes = times;

    scheduleListEl.innerHTML = "";
    if (!times.length) {
      scheduleListEl.appendChild(buildEmptyRow());
      return;
    }
    times.forEach(function (t) { scheduleListEl.appendChild(buildRow(t)); });
  }

  // Écrit la liste triée + dédoublonnée dans /schedule.
  function writeSchedule(times) {
    var seen = {}, uniq = [];
    times.forEach(function (t) {
      var n = normHM(t);
      if (n && !seen[n]) { seen[n] = 1; uniq.push(n); }
    });
    uniq.sort(byTime);
    db.ref("/schedule").set(uniq.join(",")).catch(function (e) {
      console.warn("[controls] écriture /schedule échouée :", e);
    });
  }

  function removeTime(t) {
    writeSchedule(currentTimes.filter(function (x) { return x !== t; }));
  }

  function openAddSchedule() {
    openModal({
      title: "Ajouter un horaire",
      message: "Indiquez l'heure du repas au format 24h.",
      input: { placeholder: "HH:MM" },
      confirmText: "Ajouter",
      onConfirm: function (value, h) {
        var n = normHM(value);
        if (!n) { h.error("Format invalide. Utilisez HH:MM (ex. 08:30)."); return false; }
        if (currentTimes.indexOf(n) !== -1) { h.error("Cet horaire existe déjà."); return false; }
        writeSchedule(currentTimes.concat([n]));
      }
    });
  }

  function setupSchedule() {
    var found = findScheduleSection();
    if (!found) return;
    scheduleListEl = found.list;

    var addBtn = findAddButton(found.section);
    if (addBtn) {
      addBtn.style.cursor = "pointer";
      addBtn.addEventListener("click", openAddSchedule);
    }

    // Charge les horaires et suit les changements.
    db.ref("/schedule").on("value", function (snap) {
      renderSchedule(snap.val() || "");
    });
  }

  // ======================================================================
  //  Navigation & en-tête — icônes du design branchées à des actions.
  //  Les icônes sont des <div> sans id/classe : on les repère par leur
  //  path SVG, puis on remonte au conteneur cliquable (.closest('div')).
  // ======================================================================
  function navItem(dPrefix) {
    var p = root().querySelector('path[d^="' + dPrefix + '"]');
    return p ? p.closest("div") : null;
  }
  // Tous les conteneurs cliquables correspondant à un path (ex. 2 calendriers).
  function navItemAll(dPrefix) {
    var paths = root().querySelectorAll('path[d^="' + dPrefix + '"]');
    var out = [];
    for (var i = 0; i < paths.length; i++) {
      var d = paths[i].closest("div");
      if (d) out.push(d);
    }
    return out;
  }

  function bindClick(el, handler) {
    if (!el || el.__pfNavBound) return;
    el.__pfNavBound = true;
    el.style.cursor = "pointer";
    el.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
  }

  function setupNav() {
    // Maison → on reste sur le dashboard (retour en haut de page).
    bindClick(navItem("M3 9l9-7 9 7"), function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    // Graphique (stats) → historique.
    bindClick(navItem("M18 20V10"), function () {
      window.location.href = "Historique.dc.html";
    });
    // Calendrier → affiche la section de programmation des horaires.
    bindClick(navItem("M16 2v4"), function () {
      var found = findScheduleSection();
      if (found && found.section && found.section.scrollIntoView) {
        found.section.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    // Engrenage → paramètres (à venir).
    bindClick(navItem("M19.4 15a1.65"), function () {
      alert("Paramètres à venir");
    });
    // Cloche → panneau de notifications.
    bindClick(navItem("M18 8A6 6 0 0 0 6 8"), toggleNotifPanel);
    // Profil → menu avec Déconnexion.
    bindClick(navItem("M4 21v-1a6 6 0 0 1 12 0v1"), toggleProfileMenu);

    // Fermeture des panneaux au clic en dehors.
    document.addEventListener("click", function (e) {
      var notif = document.getElementById("pf-notif-panel");
      var menu = document.getElementById("pf-profile-menu");
      if (notif && !notif.contains(e.target)) closeNotifPanel();
      if (menu && !menu.contains(e.target)) closeProfileMenu();
    });
  }

  // --- Panneau de notifications ----------------------------------------
  function closeNotifPanel() {
    var p = document.getElementById("pf-notif-panel");
    if (p && p.parentNode) p.parentNode.removeChild(p);
  }
  function toggleNotifPanel() {
    closeProfileMenu();
    if (document.getElementById("pf-notif-panel")) { closeNotifPanel(); return; }

    var panel = document.createElement("div");
    panel.id = "pf-notif-panel";
    panel.style.cssText =
      "position:fixed;top:66px;right:16px;z-index:2147483400;width:280px;" +
      "max-width:calc(100vw - 32px);box-sizing:border-box;padding:18px 18px 14px;" +
      "font-family:'DM Sans',sans-serif;" +
      "background:linear-gradient(175deg,rgba(42,42,62,0.98),rgba(30,30,46,0.98));" +
      "border:1px solid rgba(255,255,255,0.08);border-radius:16px;" +
      "box-shadow:0 18px 50px rgba(0,0,0,0.5);" +
      "backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)";
    panel.innerHTML =
      '<div style="font-family:\'Playfair Display\',serif;font-size:16px;font-weight:600;' +
      'color:#F2EDE7;margin-bottom:12px">Notifications</div>' +
      '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;' +
      'background:rgba(91,204,126,0.06);border:1px solid rgba(91,204,126,0.12);' +
      'border-radius:12px"><span style="width:7px;height:7px;border-radius:50%;' +
      'background:#5BCC7E;flex-shrink:0"></span>' +
      '<span style="font-size:12.5px;color:rgba(242,237,231,0.6)">' +
      'Tout est à jour. Aucune alerte en cours.</span></div>';
    document.body.appendChild(panel);
  }

  // --- Menu profil (déconnexion) ---------------------------------------
  function closeProfileMenu() {
    var m = document.getElementById("pf-profile-menu");
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }
  function toggleProfileMenu() {
    closeNotifPanel();
    if (document.getElementById("pf-profile-menu")) { closeProfileMenu(); return; }

    var menu = document.createElement("div");
    menu.id = "pf-profile-menu";
    menu.style.cssText =
      "position:fixed;top:66px;right:16px;z-index:2147483400;width:200px;" +
      "max-width:calc(100vw - 32px);box-sizing:border-box;padding:8px;" +
      "font-family:'DM Sans',sans-serif;" +
      "background:linear-gradient(175deg,rgba(42,42,62,0.98),rgba(30,30,46,0.98));" +
      "border:1px solid rgba(255,255,255,0.08);border-radius:14px;" +
      "box-shadow:0 18px 50px rgba(0,0,0,0.5);" +
      "backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)";

    var logout = document.createElement("button");
    logout.type = "button";
    logout.style.cssText =
      "width:100%;box-sizing:border-box;display:flex;align-items:center;gap:10px;" +
      "padding:11px 12px;background:transparent;border:none;border-radius:10px;" +
      "cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13.5px;font-weight:500;" +
      "color:rgba(242,237,231,0.8);text-align:left;transition:background 0.2s ease";
    logout.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF6B6B" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
      '<polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
      "<span>Déconnexion</span>";
    logout.addEventListener("mouseenter", function () {
      logout.style.background = "rgba(239,107,107,0.1)";
    });
    logout.addEventListener("mouseleave", function () {
      logout.style.background = "transparent";
    });
    logout.addEventListener("click", function () {
      logout.disabled = true;
      firebase.auth().signOut().then(function () {
        window.location.href = "Login.dc.html";
      }).catch(function (e) {
        console.error("[controls] Échec de la déconnexion :", e);
        logout.disabled = false;
      });
    });

    menu.appendChild(logout);
    document.body.appendChild(menu);
  }

  // ======================================================================
  //  Page Historique — boutons inactifs branchés (retour, calendrier, nav bas)
  //  NB : les filtres "Tout/Repas/Présence/Alertes" sont déjà fonctionnels
  //  nativement (onClick liés à la logique DCLogic du design) — on n'y touche pas.
  // ======================================================================
  function setupHistorique() {
    // Retour (chevron gauche) → dashboard.
    bindClick(navItem("M15 18l-6-6"), function () {
      window.location.href = "Dashboard.dc.html";
    });

    // Deux icônes calendrier partagent le même path :
    //   [0] = en-tête (filtre par date), [1] = navigation du bas (horaires).
    var calendars = navItemAll("M16 2v4");
    bindClick(calendars[0], function () {
      alert("Filtrer par date — fonctionnalité à venir");
    });

    // Navigation du bas.
    bindClick(navItem("M3 9l9-7 9 7"), function () {       // maison → dashboard
      window.location.href = "Dashboard.dc.html";
    });
    bindClick(navItem("M18 20V10"), function () {           // graphique → historique
      window.location.href = "Historique.dc.html";
    });
    bindClick(calendars[1], function () {                   // calendrier → horaires
      var found = findScheduleSection();
      if (found && found.section && found.section.scrollIntoView) {
        found.section.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    bindClick(navItem("M19.4 15a1.65"), function () {       // engrenage → paramètres
      alert("Paramètres à venir");
    });
  }

  // ======================================================================
  //  Démarrage après rendu du design — polling jusqu'à présence des éléments
  //  (le web component <x-dc> est rendu par React après le chargement).
  // ======================================================================
  function init() {
    var dc = document.getElementById("dc-root");
    if (!dc) { setTimeout(init, 200); return; }

    if (isDashboard) {
      var feedBtn = null;
      var b = dc.querySelectorAll("button");
      for (var i = 0; i < b.length; i++) {
        if (/nourrir maintenant/i.test(b[i].textContent || "")) { feedBtn = b[i]; break; }
      }
      if (!feedBtn) { setTimeout(init, 200); return; }
      setupFeed();
      setupSchedule();
      setupNav();
    } else if (isHistorique) {
      // On attend que le bouton retour (chevron) soit rendu.
      if (!root().querySelector('path[d^="M15 18l-6-6"]')) { setTimeout(init, 200); return; }
      setupHistorique();
    }
  }
  init();
})();

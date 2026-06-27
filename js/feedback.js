// Couche "feedback" : notifications toast + log d'activité.
// - Détecte les événements en surveillant les transitions des nœuds Firebase.
// - Toasts (auto-disparition 5 s) pour : distribution, stock bas, perte/retour
//   de connexion. Style cohérent avec la charte luxe (verre sombre, accent or).
// - Log d'activité : 15 derniers événements en mémoire JS (jamais dans Firebase),
//   rendus dans la section "Activité récente" du design quand elle existe.
// Aucun style existant n'est modifié ; on ajoute seulement des éléments stylés
// avec les tokens de la charte.

(function () {
  "use strict";

  if (typeof firebase === "undefined" || !firebase.database) return;

  var base = decodeURIComponent(location.pathname).split("/").pop();
  if (base !== "Dashboard.dc.html" && base !== "Dashboard Desktop.dc.html") return;

  var db = firebase.database();

  // Palette
  var GOLD = "#C9A96E", GREEN = "#5BCC7E", AMBER = "#FFB74D", RED = "#EF6B6B";

  // ----------------------------------------------------------------------
  //  Helpers
  // ----------------------------------------------------------------------
  function root() { return document.getElementById("dc-root") || document.body; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function nowHHMM() {
    var d = new Date();
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function findLeafText(str) {
    var els = root().querySelectorAll("*");
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (e.children.length === 0 && (e.textContent || "").trim() === str) return e;
    }
    return null;
  }

  // Icônes (chemins SVG) par type d'événement.
  var ICONS = {
    feed: '<path d="M20 6L9 17l-5-5"/>',
    low: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    presIn: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    presOut: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><line x1="2" y1="2" x2="22" y2="22"/>',
    up: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
    down: '<path d="M1 1l22 22"/><path d="M16.72 11.06A11 11 0 0 1 19 12.55"/><path d="M5 12.55a11 11 0 0 1 5.17-2.39"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>'
  };

  function svg(pathKey, color) {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="' +
      color + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[pathKey] || "") + "</svg>";
  }

  // ----------------------------------------------------------------------
  //  Styles injectés (keyframes pour de nouveaux éléments uniquement)
  // ----------------------------------------------------------------------
  (function injectStyle() {
    var s = document.createElement("style");
    s.textContent =
      "@keyframes pfToastIn{from{opacity:0;transform:translateY(-12px) scale(.98)}to{opacity:1;transform:none}}" +
      "@keyframes pfToastOut{to{opacity:0;transform:translateY(-12px) scale(.98)}}" +
      "@keyframes pfRowIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}" +
      ".pf-toast{animation:pfToastIn .35s cubic-bezier(.2,.8,.2,1) both}" +
      ".pf-toast.pf-out{animation:pfToastOut .4s ease forwards}" +
      ".pf-act-row{animation:pfRowIn .35s ease both}";
    document.head.appendChild(s);
  })();

  // ----------------------------------------------------------------------
  //  Toasts
  // ----------------------------------------------------------------------
  var toastBox = null;
  function ensureToastBox() {
    if (toastBox && toastBox.isConnected) return toastBox;
    toastBox = document.createElement("div");
    toastBox.style.cssText =
      "position:fixed;top:64px;right:16px;z-index:2147483500;display:flex;" +
      "flex-direction:column;align-items:flex-end;pointer-events:none";
    document.body.appendChild(toastBox);
    return toastBox;
  }

  function showToast(opts) {
    var boxEl = ensureToastBox();
    var color = opts.color || GOLD;

    var toast = document.createElement("div");
    toast.className = "pf-toast";
    toast.style.cssText =
      "min-width:240px;max-width:320px;box-sizing:border-box;margin-bottom:12px;" +
      "display:flex;gap:12px;align-items:flex-start;padding:14px 16px;" +
      "border-radius:14px;pointer-events:auto;cursor:pointer;" +
      "background:linear-gradient(175deg,rgba(42,42,62,0.97),rgba(30,30,46,0.97));" +
      "border:1px solid rgba(255,255,255,0.08);border-left:3px solid " + color + ";" +
      "box-shadow:0 12px 40px rgba(0,0,0,0.45);" +
      "backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);" +
      "font-family:'DM Sans',sans-serif";

    var iconWrap = document.createElement("div");
    iconWrap.style.cssText =
      "width:30px;height:30px;border-radius:9px;flex-shrink:0;display:flex;" +
      "align-items:center;justify-content:center;background:" +
      hexA(color, 0.12);
    iconWrap.innerHTML = svg(opts.icon, color);

    var textCol = document.createElement("div");
    textCol.style.cssText = "flex:1;min-width:0";
    var title = document.createElement("div");
    title.textContent = opts.title;
    title.style.cssText =
      "font-size:13.5px;font-weight:600;color:#F2EDE7;margin-bottom:2px";
    var msg = document.createElement("div");
    msg.textContent = opts.message || "";
    msg.style.cssText =
      "font-size:12px;font-weight:400;line-height:1.4;color:rgba(242,237,231,0.5)";
    textCol.appendChild(title);
    if (opts.message) textCol.appendChild(msg);

    toast.appendChild(iconWrap);
    toast.appendChild(textCol);
    boxEl.appendChild(toast);

    var removed = false;
    function dismiss() {
      if (removed) return;
      removed = true;
      toast.classList.add("pf-out");
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 400);
    }
    toast.addEventListener("click", dismiss);
    setTimeout(dismiss, 5000); // disparaît après 5 secondes
  }

  // "#RRGGBB" + alpha → rgba(...) ; sinon renvoie la couleur telle quelle.
  function hexA(hex, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  // ----------------------------------------------------------------------
  //  Log d'activité (15 derniers, en mémoire)
  // ----------------------------------------------------------------------
  var logEvents = [];
  var activityListEl = null;

  function pushLog(entry) {
    logEvents.unshift(entry);
    if (logEvents.length > 15) logEvents.length = 15;
    renderLog();
  }

  function findActivityContainer() {
    var titles = ["Repas distribué", "Milo détecté", "Réserve basse"];
    var first = null;
    for (var k = 0; k < titles.length && !first; k++) first = findLeafText(titles[k]);
    if (!first) return null;
    var node = first;
    for (var d = 0; d < 8 && node; d++) {
      var p = node.parentElement;
      if (p && p.children.length >= 3) {
        var cnt = 0;
        for (var i = 0; i < p.children.length; i++) {
          if (p.children[i].querySelector && p.children[i].querySelector("svg")) cnt++;
        }
        if (cnt >= 2) return p;
      }
      node = p;
    }
    return null;
  }

  function buildLogRow(entry) {
    var row = document.createElement("div");
    row.className = "pf-act-row";
    row.style.cssText = "display:flex;gap:14px;padding-bottom:16px";

    var iconWrap = document.createElement("div");
    iconWrap.style.cssText =
      "width:32px;height:32px;border-radius:9px;flex-shrink:0;display:flex;" +
      "align-items:center;justify-content:center;background:" + hexA(entry.color, 0.08);
    iconWrap.innerHTML = svg(entry.icon, entry.color);

    var textCol = document.createElement("div");
    var title = document.createElement("div");
    title.textContent = entry.message;
    title.style.cssText =
      "font-size:12.5px;font-weight:500;color:#F2EDE7;margin-bottom:3px";
    var time = document.createElement("div");
    time.textContent = entry.time;
    time.style.cssText = "font-size:10px;font-weight:400;color:rgba(242,237,231,0.25)";
    textCol.appendChild(title);
    textCol.appendChild(time);

    row.appendChild(iconWrap);
    row.appendChild(textCol);
    return row;
  }

  function renderLog() {
    if (!activityListEl) return;
    activityListEl.innerHTML = "";
    logEvents.forEach(function (e) { activityListEl.appendChild(buildLogRow(e)); });
  }

  // Tente de localiser la section "Activité récente" (présente sur desktop).
  (function locateActivity() {
    var found = findActivityContainer();
    if (found) { activityListEl = found; renderLog(); return; }
    var obs = new MutationObserver(function () {
      var el = findActivityContainer();
      if (el) { obs.disconnect(); activityListEl = el; renderLog(); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  })();

  // ----------------------------------------------------------------------
  //  Émission d'un événement (log + toast éventuel)
  // ----------------------------------------------------------------------
  function emit(o) {
    pushLog({ time: nowHHMM(), message: o.message, color: o.color, icon: o.icon });
    if (o.toast) {
      showToast({ title: o.title || o.message, message: o.toastMsg, color: o.color, icon: o.icon });
    }
  }

  // ----------------------------------------------------------------------
  //  Détection d'événements via les transitions Firebase
  // ----------------------------------------------------------------------
  var prev = { food: null, pet: null, conn: null, last: null };

  db.ref("/foodLevel").on("value", function (s) {
    var v = s.val();
    if (typeof v !== "number") return;
    if ((prev.food == null || prev.food >= 20) && v < 20) {
      emit({
        message: "Réserve basse (" + Math.round(v) + "%)",
        title: "Stock bas",
        toastMsg: "Pensez à recharger le distributeur.",
        color: AMBER, icon: "low", toast: true
      });
    }
    prev.food = v;
  });

  db.ref("/petDetected").on("value", function (s) {
    var v = Number(s.val()) === 1 ? 1 : 0;
    if (prev.pet != null && v !== prev.pet) {
      if (v === 1) emit({ message: "Milo détecté à proximité", color: GOLD, icon: "presIn" });
      else emit({ message: "Milo s'est éloigné", color: "rgba(242,237,231,0.4)", icon: "presOut" });
    }
    prev.pet = v;
  });

  db.ref("/lastFeed").on("value", function (s) {
    var v = s.val();
    if (typeof v !== "number") return;
    if (prev.last != null && v !== prev.last) {
      emit({
        message: "Repas distribué",
        title: "Repas distribué",
        toastMsg: "La portion a été servie à Milo.",
        color: GREEN, icon: "feed", toast: true
      });
    }
    prev.last = v;
  });

  db.ref(".info/connected").on("value", function (s) {
    var c = s.val() === true;
    if (prev.conn != null && c !== prev.conn) {
      if (c) emit({
        message: "Système reconnecté",
        title: "Connexion rétablie",
        toastMsg: "Le distributeur est de nouveau en ligne.",
        color: GREEN, icon: "up", toast: true
      });
      else emit({
        message: "Connexion perdue",
        title: "Connexion perdue",
        toastMsg: "Le distributeur ne répond plus.",
        color: RED, icon: "down", toast: true
      });
    }
    prev.conn = c;
  });
})();

// Listeners Firebase temps réel — lecture des données de l'ESP32.
// Branché uniquement sur les dashboards "live" (mobile + desktop).
//
// Structure de la base attendue :
//   { foodLevel, petDetected, lastFeed, feedNow, schedule, currentTime }
//
// Stratégie d'intégration avec le design (rendu par support.js / React) :
//  - La JAUGE de nourriture est pilotée via le runtime (__dcSetProps) : le
//    composant recalcule lui-même %, arc, barre, couleurs ET l'état d'alerte
//    "Critique" rouge déjà prévu dans le design quand le niveau est bas.
//  - Les autres valeurs (badge connexion, présence, dernier/prochain repas)
//    sont du texte statique dans le template : on les met à jour directement
//    dans le DOM, ce que React ne réécrit jamais (valeurs constantes côté vDOM).
// Aucun style n'est modifié : on ne change que des textes et des couleurs
// déjà utilisées par la charte.

(function () {
  "use strict";

  if (typeof firebase === "undefined" || !firebase.database) {
    console.error("[realtime] Firebase Database n'est pas chargé.");
    return;
  }

  // Cibler seulement les pages live (pas la planche "States", ni Historique).
  var base = decodeURIComponent(location.pathname).split("/").pop();
  if (base !== "Dashboard.dc.html" && base !== "Dashboard Desktop.dc.html") {
    return;
  }

  var db = firebase.database();

  // ----------------------------------------------------------------------
  //  Helpers DOM
  // ----------------------------------------------------------------------
  function root() {
    return document.getElementById("dc-root") || document.body || document.documentElement;
  }
  function findInScope(scope, pred) {
    if (!scope) return null;
    var els = scope.querySelectorAll("*");
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (e.children.length === 0 && pred((e.textContent || "").trim(), e)) return e;
    }
    return null;
  }
  function findLeaf(pred) { return findInScope(root(), pred); }
  function findLeafText(str) { return findLeaf(function (t) { return t === str; }); }
  function findLeafIncludes(sub) { return findLeaf(function (t) { return t.indexOf(sub) !== -1; }); }

  // Remonte depuis un libellé jusqu'au conteneur "carte" qui renferme une heure HH:MM.
  function cardFromLabel(labelStr) {
    var label = findLeafText(labelStr);
    if (!label) return null;
    var node = label;
    for (var d = 0; d < 6 && node; d++) {
      node = node.parentElement;
      if (node && findInScope(node, function (t) { return /^\d{1,2}:\d{2}$/.test(t); })) {
        return node;
      }
    }
    return null;
  }
  function timeLeafIn(scope) {
    return findInScope(scope, function (t) { return /^\d{1,2}:\d{2}$/.test(t); });
  }

  // ----------------------------------------------------------------------
  //  Helpers temps
  // ----------------------------------------------------------------------
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function toHHMM(min) {
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    return pad2(Math.floor(min / 60)) + ":" + pad2(min % 60);
  }
  function parseHM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec((s || "").trim());
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }
  function nowMinutesLocal() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  // ----------------------------------------------------------------------
  //  Mise en place après rendu du design
  // ----------------------------------------------------------------------
  var originals = {}; // textes d'origine à restaurer (online / présence)

  // On attend (polling) que le design soit rendu — #dc-root + badge de statut —
  // avant de brancher les listeners temps réel. Même pattern qu'auth.js.
  function init() {
    if (!document.getElementById("dc-root") || !findStatusLabel()) {
      setTimeout(init, 200);
      return;
    }
    captureOriginals();
    attachListeners();
    // Rafraîchit le temps relatif chaque minute (même sans nouvel événement).
    setInterval(updateRelative, 60 * 1000);
    // Écrit l'heure du navigateur dans /currentTime : immédiat puis toutes les 60 s.
    pushCurrentTime();
    setInterval(pushCurrentTime, 60 * 1000);
  }
  init();

  // Écriture de l'heure courante (minutes depuis minuit) dans /currentTime.
  function pushCurrentTime() {
    db.ref("/currentTime").set(nowMinutesLocal()).catch(function (e) {
      console.warn("[realtime] écriture /currentTime échouée :", e);
    });
  }

  function findStatusLabel() {
    return findLeaf(function (t) {
      return t === "Connecté" || t === "Appareil en ligne" ||
             t === "En ligne" || t === "Hors ligne";
    });
  }
  function findPresenceText() {
    // mobile : "À proximité du distributeur" — desktop : "Détecté à proximité"
    return findLeaf(function (t) {
      return /proximit/i.test(t);
    });
  }

  function captureOriginals() {
    var status = findStatusLabel();
    if (status) originals.status = (status.textContent || "").trim();
    var presence = findPresenceText();
    if (presence) originals.presence = (presence.textContent || "").trim();
  }

  // ----------------------------------------------------------------------
  //  Pilotage de la jauge via le runtime (réactif, état d'alerte inclus)
  // ----------------------------------------------------------------------
  var pendingLevel = null;
  function applyGauge(level) {
    pendingLevel = level;
    flushGauge();
  }
  function flushGauge() {
    if (pendingLevel == null) return;
    if (window.__dcSetProps && window.__dcRootName) {
      var name = window.__dcRootName();
      if (name) {
        // foodLevel borné 0-100 ; le composant déclenche seul l'état "Critique".
        var lvl = Math.max(0, Math.min(100, Math.round(pendingLevel)));
        window.__dcSetProps(name, { foodLevel: lvl });
        pendingLevel = null;
        return;
      }
    }
    setTimeout(flushGauge, 120); // le runtime n'a pas encore booté
  }

  // ----------------------------------------------------------------------
  //  Badge en ligne / hors ligne
  // ----------------------------------------------------------------------
  function setConnection(online) {
    var label = findStatusLabel();
    if (!label) return;
    label.textContent = online ? (originals.status || "Connecté") : "Hors ligne";
    var dot = label.previousElementSibling;
    if (dot) {
      dot.style.transition = "background 0.4s ease, box-shadow 0.4s ease";
      if (online) {
        dot.style.background = "#5BCC7E";
        dot.style.boxShadow = "0 0 8px rgba(91,204,126,0.4)";
      } else {
        dot.style.background = "rgba(242,237,231,0.25)";
        dot.style.boxShadow = "none";
      }
    }
  }

  // ----------------------------------------------------------------------
  //  Présence de l'animal
  // ----------------------------------------------------------------------
  function setPresence(detected) {
    var text = findPresenceText();
    if (text) {
      text.textContent = detected ? (originals.presence || "À proximité du distributeur")
                                   : "Hors de portée";
    }
    // Badge de présence (le design affiche "DÉTECTÉ" au départ).
    var badge = findLeaf(function (t) { return t === "DÉTECTÉ" || t === "PRÉSENT" || t === "ABSENT"; });
    if (badge) badge.textContent = detected ? "PRÉSENT" : "ABSENT";

    // Pastille de présence verte, dans la carte du compagnon (autour de "Milo").
    var milo = findLeafText("Milo");
    var card = null, node = milo;
    for (var d = 0; d < 6 && node; d++) {
      node = node.parentElement;
      if (node && greenDots(node).length) { card = node; break; }
    }
    if (card) {
      greenDots(card).forEach(function (dot) {
        dot.style.transition = "background 0.4s ease";
        dot.style.background = detected ? "#5BCC7E" : "rgba(242,237,231,0.25)";
      });
    }
  }
  function greenDots(scope) {
    var out = [];
    var els = scope.querySelectorAll("div");
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      var w = e.offsetWidth;
      var s = window.getComputedStyle(e);
      if (w >= 10 && w <= 20 && s.borderRadius !== "0px" &&
          s.backgroundColor === "rgb(91, 204, 126)") {
        out.push(e);
      }
    }
    return out;
  }

  // ----------------------------------------------------------------------
  //  Dernier repas (minutes depuis minuit → HH:MM)
  // ----------------------------------------------------------------------
  var latestLastFeed = null;
  var relEl = null; // ligne "temps relatif" sous l'heure du dernier repas

  function setLastFeed(minutes) {
    latestLastFeed = minutes;
    var card = cardFromLabel("Dernier repas");
    var t = timeLeafIn(card);
    if (t) {
      t.style.transition = "color 0.4s ease";
      t.textContent = toHHMM(minutes);
      ensureRelEl(t);
    }
    updateRelative();
  }
  function ensureRelEl(timeEl) {
    if (relEl && relEl.isConnected) return;
    relEl = document.createElement("div");
    relEl.style.cssText =
      "font-size:11.5px;font-weight:400;color:rgba(201,169,110,0.55);" +
      "margin-top:3px;transition:opacity 0.4s ease";
    // inséré juste sous l'heure (avant le sous-titre existant)
    timeEl.parentNode.insertBefore(relEl, timeEl.nextSibling);
  }
  function updateRelative() {
    if (!relEl || latestLastFeed == null) return;
    var now = latestCurrentTime != null ? latestCurrentTime : nowMinutesLocal();
    var diff = (((now - latestLastFeed) % 1440) + 1440) % 1440;
    relEl.textContent = formatAgo(diff);
  }
  function formatAgo(diff) {
    if (diff < 1) return "à l'instant";
    if (diff < 60) return "il y a " + diff + "min";
    return "il y a " + Math.floor(diff / 60) + "h";
  }

  // ----------------------------------------------------------------------
  //  Prochain repas (parse du planning + heure courante)
  // ----------------------------------------------------------------------
  var latestSchedule = null;
  var latestCurrentTime = null;

  function setSchedule(csv) { latestSchedule = csv; recomputeNextMeal(); }
  function setCurrentTime(min) { latestCurrentTime = min; recomputeNextMeal(); updateRelative(); }

  function recomputeNextMeal() {
    if (latestSchedule == null) return;
    var times = String(latestSchedule)
      .split(",")
      .map(parseHM)
      .filter(function (v) { return v != null; })
      .sort(function (a, b) { return a - b; });
    if (!times.length) return;

    var now = latestCurrentTime != null ? latestCurrentTime : nowMinutesLocal();

    var next = null;
    for (var i = 0; i < times.length; i++) {
      if (times[i] > now) { next = times[i]; break; }
    }
    if (next == null) next = times[0]; // prochain = premier créneau du lendemain
    var delta = (((next - now) % 1440) + 1440) % 1440;

    var card = cardFromLabel("Prochain repas");
    if (!card) return;
    var t = timeLeafIn(card);
    if (t) t.textContent = toHHMM(next);
    var sub = findInScope(card, function (txt) { return /^Dans\b/.test(txt); });
    if (sub) sub.textContent = formatDelta(delta);
  }
  function formatDelta(delta) {
    var h = Math.floor(delta / 60), m = delta % 60;
    if (h > 0) return "Dans " + h + "h " + pad2(m) + "min";
    return "Dans " + m + "min";
  }

  // ----------------------------------------------------------------------
  //  Abonnements Firebase
  // ----------------------------------------------------------------------
  function attachListeners() {
    db.ref("/foodLevel").on("value", function (snap) {
      var v = snap.val();
      if (typeof v === "number") applyGauge(v);
    });

    db.ref("/petDetected").on("value", function (snap) {
      setPresence(Number(snap.val()) === 1);
    });

    db.ref("/lastFeed").on("value", function (snap) {
      var v = snap.val();
      if (typeof v === "number") setLastFeed(v);
    });

    db.ref("/schedule").on("value", function (snap) {
      var v = snap.val();
      if (typeof v === "string") setSchedule(v);
    });

    db.ref("/currentTime").on("value", function (snap) {
      var v = snap.val();
      if (typeof v === "number") setCurrentTime(v);
    });

    // Détection en ligne / hors ligne (nœud spécial de Firebase RTDB).
    db.ref(".info/connected").on("value", function (snap) {
      setConnection(snap.val() === true);
    });
  }
})();

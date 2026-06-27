// Service worker — Pet Feeder PWA
// Met en cache uniquement les fichiers statiques de MÊME ORIGINE (HTML, JS,
// icônes, manifest). Tout ce qui est cross-origin — données Firebase
// (*.firebaseio.com), SDK (gstatic), React (unpkg), polices (googleapis) —
// n'est jamais intercepté ni mis en cache : ces requêtes passent directement
// au réseau. Les données temps réel restent donc toujours fraîches.

var CACHE = "pet-feeder-v1";

// Chemins relatifs à la racine du scope (compatibles GitHub Pages en sous-dossier).
var ASSETS = [
  "./",
  "./index.html",
  "./Login.dc.html",
  "./Dashboard.dc.html",
  "./Dashboard%20Desktop.dc.html",
  "./Dashboard%20States.dc.html",
  "./Historique.dc.html",
  "./support.js",
  "./js/firebase-config.js",
  "./js/auth.js",
  "./js/realtime.js",
  "./js/controls.js",
  "./js/feedback.js",
  "./manifest.json",
  "./favicon.svg",
  "./icon.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // add() individuel + catch : un fichier manquant ne fait pas échouer l'install.
      return Promise.all(ASSETS.map(function (url) {
        return cache.add(url).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  // On n'intercepte QUE la même origine → Firebase & CDN passent au réseau.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        // Mise en cache à la volée des ressources statiques de même origine.
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // Hors ligne : repli sur la page de login si disponible.
        if (req.mode === "navigate") return caches.match("./Login.dc.html");
      });
    })
  );
});

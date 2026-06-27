# 🐾 Pet Feeder

Interface web (PWA) pour un **distributeur automatique de nourriture connecté** (IoT, ESP32 + Firebase).
Design luxueux statique (Claude Design) auquel toute la logique a été ajoutée en JavaScript vanilla, **sans modifier le design**.

- Authentification e-mail / mot de passe (Firebase Auth)
- Données temps réel depuis l'ESP32 (Firebase Realtime Database) : niveau de réserve, présence de l'animal, dernier/prochain repas, état en ligne
- Actions : nourrir maintenant, gestion des horaires, synchronisation du temps
- Notifications toast, log d'activité, installable (PWA hors-ligne pour le shell statique)

---

## 📁 Structure

```
front-end-pet-feeder/
├── index.html                 # redirige vers Login
├── Login.dc.html              # page de connexion
├── Dashboard.dc.html          # tableau de bord mobile (live)
├── Dashboard Desktop.dc.html  # tableau de bord desktop (live)
├── Dashboard States.dc.html   # planche de référence design (non branchée)
├── Historique.dc.html         # historique
├── support.js                 # runtime du design (NE PAS modifier)
├── js/
│   ├── firebase-config.js     # ⚙️ à configurer (placeholders)
│   ├── auth.js                # connexion / déconnexion / protection des routes
│   ├── realtime.js            # lecture temps réel
│   ├── controls.js            # écritures (nourrir, horaires, temps)
│   └── feedback.js            # toasts + log d'activité
├── manifest.json · service-worker.js · favicon.svg · icon.svg
```

---

## 1. Configurer Firebase

### a) Créer le projet
1. Va sur la [console Firebase](https://console.firebase.google.com/) → **Ajouter un projet**.
2. Active **Realtime Database** (menu *Build → Realtime Database → Créer une base*) et **Authentication**.

### b) Récupérer les identifiants et remplacer les placeholders
Dans la console : **⚙️ Paramètres du projet → Vos applications → Application Web (`</>`)**.
Copie l'objet `firebaseConfig`, puis ouvre **`js/firebase-config.js`** et remplace les placeholders :

```js
const firebaseConfig = {
  apiKey: "VOTRE_API_KEY",                                  // → AIza...
  authDomain: "VOTRE_PROJET.firebaseapp.com",
  databaseURL: "https://VOTRE_PROJET-default-rtdb.firebaseio.com",
  projectId: "VOTRE_PROJET",
  storageBucket: "VOTRE_PROJET.appspot.com",
  messagingSenderId: "VOTRE_SENDER_ID",
  appId: "VOTRE_APP_ID"
};
```

> ⚠️ Vérifie bien que **`databaseURL`** est présent (indispensable pour la Realtime Database).

### c) Créer le compte utilisateur
L'application n'a pas d'inscription : crée le compte à la main.
**Authentication → Sign-in method →** active **E-mail/Mot de passe**, puis
**Authentication → Users → Add user** → saisis un e-mail et un mot de passe.
Ce sont ces identifiants que tu utiliseras sur la page de connexion.

### d) Règles de sécurité de la Realtime Database
**Realtime Database → Règles**, colle ceci puis **Publier** :

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

Seuls les utilisateurs **authentifiés** peuvent lire/écrire les données.

### e) Structure des données (écrite par l'ESP32)
```json
{
  "foodLevel": 75,                              // % de réserve (0-100)
  "petDetected": 0,                             // 0 = absent, 1 = présent
  "lastFeed": 480,                              // minutes depuis minuit (480 = 08:00)
  "feedNow": 0,                                 // mis à 1 par l'app → l'ESP32 le remet à 0
  "schedule": "08:00,12:00,16:00,20:00",        // horaires (CSV trié, écrit par l'app)
  "currentTime": 845                            // minutes depuis minuit (écrit par l'app)
}
```

---

## 2. Tester en local

Un **serveur HTTP** est requis (l'authentification, les modules et le service worker ne marchent pas en `file://`) :

```bash
# Python
python -m http.server 8080
# ou Node
npx serve .
```

Puis ouvre `http://localhost:8080/`.

---

## 3. Déployer sur GitHub Pages

1. Crée un dépôt GitHub et pousse le contenu du dossier :
   ```bash
   git init
   git add .
   git commit -m "Pet Feeder PWA"
   git branch -M main
   git remote add origin https://github.com/<utilisateur>/<repo>.git
   git push -u origin main
   ```
2. Sur GitHub : **Settings → Pages → Build and deployment**
   → *Source* : **Deploy from a branch** → branche **main**, dossier **/ (root)** → **Save**.
3. Le site sera disponible sous quelques minutes à :
   `https://<utilisateur>.github.io/<repo>/`

> Tous les chemins du projet sont **relatifs** (`./…`), donc le sous-dossier de GitHub Pages
> (`/<repo>/`) est géré automatiquement, y compris le service worker et le manifest.

### Important après déploiement
- Dans **Authentication → Settings → Authorized domains**, ajoute
  `<utilisateur>.github.io` pour autoriser la connexion depuis GitHub Pages.

---

## 🔒 Note sur la clé API
La `apiKey` Firebase n'est pas un secret : elle identifie le projet côté client.
La sécurité repose sur les **règles** de la base (section 1.d) et l'authentification.

---

## 🛠️ Stack
HTML/CSS (Claude Design) · JavaScript vanilla · Firebase v8 (compat) · PWA

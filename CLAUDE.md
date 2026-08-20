# SIRH — Frontend

PWA de gestion RH en **JavaScript vanilla avec ES Modules**, sans framework ni
étape de build. Hébergée sur GitHub Pages (`sirh.cataria-systems.com`).
L'API est un dépôt séparé : `SIRH-BACKEND` (Express, sur Render).

## Architecture

- `index.html` — un seul fichier de ~155 000 caractères contenant **tout** le
  balisage de l'application. Les vues sont montrées ou masquées, il n'y a pas
  de routeur.
- `js/main.js` — point d'entrée. Attache les gestionnaires sur `window`, ce qui
  permet aux `onclick=""` de l'HTML d'appeler les modules.
- `js/core/`
  - `config.js` — URL de l'API, constantes, client Supabase.
  - `api.js` — `secureFetch` : jeton, gestion du 401, cache hors-ligne.
  - `state.js` — `AppState`, objet mutable global.
  - `utils.js` — helpers partagés.
- `js/modules/` — un module par domaine : `hr` (3 200 l.), `ops` (2 800 l.),
  `admin`, `crm`, `payroll`, `leaves`, `dashboard`, `auth`, `chat`, `ui`.
- `sw.js` — service worker, mode hors-ligne.

## Conventions

- Aucune étape de build : le code écrit est le code exécuté. Pas de JSX, pas
  de TypeScript, pas de bundler.
- Toujours passer par `secureFetch` plutôt que `fetch` : il ajoute le jeton,
  gère l'expiration de session et le mode hors-ligne.
- Toute nouvelle fonction appelée depuis un `onclick` de l'HTML doit être
  exposée dans `main.js` via `window.maFonction = Module.maFonction`.
- `Swal` (SweetAlert2), `Chart.js` et Tailwind sont chargés par CDN dans
  `index.html`, donc disponibles globalement.
- L'interface est en français.

## Pièges connus

- **Le jeton et les données sont en clair côté navigateur.** `localStorage`
  contient le JWT, et `secureFetch` met en cache toutes les réponses GET dans
  `CacheStorage`, fiches employés et paie comprises. `handleLogout` purge tout ;
  toute autre voie de déconnexion doit faire de même.
- La clé Supabase `anon` de `config.js` est **publique par nature**. Ne jamais
  y placer de secret, et ne rien exposer côté base qui ne doive pas l'être.
- Le client Supabase n'est utilisé que pour le temps réel du chat
  (`chat.js`). Tout le reste passe par le backend.
- Les modules sont volumineux et fortement couplés à `AppState`. Vérifier
  l'état partagé avant d'extraire une fonction.
- Fichiers en **LF**, `core.autocrlf=input` configuré localement.

## Développement

Le projet utilise des ES Modules : il ne fonctionne pas en `file://`.
Servir le dossier en HTTP (extension Live Server de VS Code, ou
`npx serve`), puis ouvrir `index.html`.

`config.js` pointe par défaut sur l'API de production. Pour travailler en
local, changer `apiBaseUrl` vers `http://localhost:4000/api` — et penser à
ajouter cette origine dans la liste CORS du backend.

Il n'existe pas encore de tests automatisés.

## Déploiement

GitHub Pages publie depuis `main`. **Déployer après le backend** : les deux
dépôts évoluent ensemble.

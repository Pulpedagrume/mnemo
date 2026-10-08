# Auto-hébergement

Le serveur Mnemo sert l’application web (PWA), l’API `/api/v1` (import, decks, prompts, statistiques,
synchronisation) et stocke vos données dans un seul dossier, `DATA_DIR`. Il est facultatif :
l’application fonctionne entièrement hors ligne sans lui. Il sert à synchroniser plusieurs
appareils, à importer depuis des scripts ou des IA (jetons d’API) et à garder une copie de vos
données chez vous.

- [Les deux modes](#les-deux-modes)
- [Démarrage local](#démarrage-local-mnemo-serve)
- [Docker](#docker)
- [VPS avec systemd](#vps-avec-systemd)
- [Fly.io, Render, Railway](#flyio-render-railway)
- [Comptes, invitations et jetons](#comptes-invitations-et-jetons)
- [Sauvegarde et restauration](#sauvegarde-et-restauration)
- [Mises à jour](#mises-à-jour)
- [Configuration](#configuration)
- [Site statique (GitHub Pages) et mentions légales](#site-statique-github-pages-et-mentions-légales)

## Les deux modes

| mode                 | quand                                                                                                                                  | authentification                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **mono-utilisateur** | `HOST` est une adresse locale (`127.0.0.1`, `::1`, `localhost`), `BASE_URL` absent ou local, et aucun compte n’existe ; ou `--no-auth` | aucune : un utilisateur local fixe ; seules les requêtes non relayées avec un en-tête `Host` local sont acceptées (protection contre le _DNS rebinding_) ; les écritures exigent l’en-tête `x-csrf-token` lu sur `/api/v1/auth/me` |
| **comptes**          | tous les autres cas                                                                                                                    | e-mail + mot de passe (argon2id), cookies de session, jetons d’API                                                                                                                                                                 |

Le serveur **refuse de démarrer** sans authentification sur une adresse publique
(`--no-auth` avec `HOST=0.0.0.0`), et exige `SESSION_SECRET` dès que `HOST` n’est pas local.

## Démarrage local (`mnemo serve`)

```bash
pnpm install && pnpm build
node apps/cli/dist/index.mjs serve            # http://127.0.0.1:8787, mode mono-utilisateur
node apps/cli/dist/index.mjs serve --port 9000 --data-dir ~/mnemo-data
```

Ou sans le CLI : `node apps/server/dist/server.mjs` (configuration par variables d’environnement).

## Docker

```bash
cp .env.example .env
# éditez .env : SESSION_SECRET (obligatoire), BASE_URL, REGISTRATION_MODE…
docker compose up -d
docker compose logs mnemo | grep invite   # invitation à usage unique du premier compte
```

- L’image est construite en deux étapes (build pnpm, puis `node:24-slim` sans sources), tourne
  avec l’utilisateur non privilégié `node`, en système de fichiers en lecture seule sauf `/data`.
- Les données sont dans le volume nommé `mnemo-data` (monté sur `/data`).
- `HEALTHCHECK` interroge `/api/v1/health`.
- Le port n’est publié que sur `127.0.0.1` : exposez-le via un proxy HTTPS.

### HTTPS avec Caddy

`deploy/Caddyfile` est un exemple prêt à l’emploi (certificat Let’s Encrypt automatique). Mettez
votre domaine, puis dans `.env` : `BASE_URL=https://votre.domaine` (cookies `Secure` + HSTS) et
`TRUST_PROXY=1` (vraies adresses IP pour la limitation de débit et le journal d’audit).

## VPS avec systemd

```bash
# en root
useradd --system --home /var/lib/mnemo --create-home mnemo
git clone <dépôt> /opt/mnemo && cd /opt/mnemo
corepack enable && pnpm install --frozen-lockfile && pnpm --filter @mnemo/web build && pnpm --filter @mnemo/server build
install -m 600 -o mnemo .env.example /etc/mnemo.env   # puis éditez-le
```

`/etc/systemd/system/mnemo.service` :

```ini
[Unit]
Description=Mnemo server
After=network-online.target

[Service]
User=mnemo
EnvironmentFile=/etc/mnemo.env
Environment=DATA_DIR=/var/lib/mnemo WEB_DIST=/opt/mnemo/apps/web/dist
ExecStart=/usr/bin/node /opt/mnemo/apps/server/dist/server.mjs
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/mnemo
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now mnemo
journalctl -u mnemo | grep invite
```

Placez Caddy (ou nginx) devant, avec dans `/etc/mnemo.env` : `HOST=127.0.0.1`,
`BASE_URL=https://votre.domaine`, `TRUST_PROXY=1` et `SESSION_SECRET`. Un `BASE_URL` public
désactive le mode mono-utilisateur : le serveur exige des comptes et affiche l’invitation du
premier compte. Par sécurité, le mode mono-utilisateur refuse aussi toute requête relayée par un
proxy (`X-Forwarded-For`, `Forwarded`) ou dont l’en-tête `Host` n’est pas local.

## Fly.io, Render, Railway

Les trois plateformes construisent le `Dockerfile` du dépôt. Dans chaque cas :

1. un **volume persistant** monté sur `/data` (sans lui, tout est perdu au redéploiement) ;
2. les variables `SESSION_SECRET`, `BASE_URL` (l’URL https fournie), `TRUST_PROXY=true` ;
3. le port interne `8787` et le contrôle de santé `/api/v1/health` ;
4. une seule instance (SQLite ne se partage pas entre machines).

- **Fly.io** : `fly launch --no-deploy`, `fly volumes create mnemo_data --size 1`, dans
  `fly.toml` : `[mounts] source="mnemo_data" destination="/data"` et `internal_port = 8787`,
  `fly secrets set SESSION_SECRET=…`, puis `fly deploy`.
- **Render** : _New Web Service_ → Docker, ajoutez un _Disk_ monté sur `/data`, les variables
  d’environnement, _Health Check Path_ `/api/v1/health`.
- **Railway** : _Deploy from repo_, ajoutez un _Volume_ sur `/data`, les variables, et exposez le
  port 8787.

## Comptes, invitations et jetons

- Au premier démarrage en mode comptes, le serveur affiche une **invitation à usage unique**
  (valable 7 jours) : elle crée le compte **administrateur**, quel que soit `REGISTRATION_MODE`.
- `REGISTRATION_MODE=invite` : l’administrateur crée des invitations (`POST /api/v1/invites`).
- `REGISTRATION_MODE=open` : inscription libre (réseau privé uniquement).
- Jetons d’API (`Authorization: Bearer mnemo_…`) : créés depuis une session, affichés **une
  seule fois**, portées `read`, `import`, `sync`, `admin`, expiration facultative, révocables.

## Sauvegarde et restauration

Tout est dans `DATA_DIR` :

```
DATA_DIR/
  accounts.sqlite              comptes, sessions, jetons (hachés), invitations, journal d’audit
  session-secret               clé générée en mode local seulement (sinon SESSION_SECRET)
  users/<id>.sqlite            collection de l’utilisateur
  users/<id>.server.sqlite     journal de synchronisation et contenus des médias
```

**Sauvegarde à chaud** (cohérente même pendant l’utilisation, SQLite en mode WAL) :

```bash
for f in "$DATA_DIR"/accounts.sqlite "$DATA_DIR"/users/*.sqlite; do
  sqlite3 "$f" ".backup '/sauvegardes/$(date +%F)/$(basename "$f")'"
done
```

Ou arrêtez le serveur et copiez le dossier entier (fichiers `-wal`/`-shm` compris). Avec Docker :
`docker run --rm -v mnemo-data:/data -v "$PWD":/b alpine tar czf /b/mnemo-$(date +%F).tgz /data`.

**Restauration** : serveur arrêté, remettez les fichiers dans `DATA_DIR` (mêmes noms), avec le
même `SESSION_SECRET` (sinon sessions et jetons sont invalidés, les données restent intactes),
puis redémarrez.

Chaque utilisateur peut aussi télécharger sa propre sauvegarde complète (`GET /api/v1/account/export`,
zip au format des sauvegardes de l’application).

## Mises à jour

```bash
git pull && docker compose up -d --build        # Docker
git pull && pnpm install --frozen-lockfile && pnpm --filter @mnemo/web build \
  && pnpm --filter @mnemo/server build && systemctl restart mnemo   # systemd
```

Faites une sauvegarde avant chaque mise à jour : les schémas SQLite sont migrés automatiquement au
démarrage et une migration ne se défait pas.

## Configuration

Voir `.env.example` (commenté). Variables : `HOST`, `PORT`, `DATA_DIR`, `BASE_URL`,
`REGISTRATION_MODE`, `SESSION_SECRET`, `MAX_UPLOAD_MB`, `TRUST_PROXY`, `CORS_ORIGINS`, `WEB_DIST`,
`NO_AUTH`, `LOG_LEVEL`, `SMTP_*` (réservées, inutilisées pour l’instant).

La documentation de l’API est servie par le serveur lui-même : `GET /api/v1/openapi.json`.

## Site statique (GitHub Pages) et mentions légales

L’application web seule (sans serveur) peut être publiée sur n’importe quel hébergement statique.
Le workflow `release.yml` la publie sur GitHub Pages à chaque tag `v*`
(`https://<compte>.github.io/<dépôt>/`).

**Sécurité.** Un hébergement statique ne permet pas d’envoyer d’en-têtes : la politique de
sécurité du contenu (CSP) est donc incluse dans `index.html` sous forme de balise `<meta>`
(scripts du site uniquement, pas de script en ligne, pas d’`eval`, aucun appel à un tiers sauf le
serveur de synchronisation que l’utilisateur choisit). HTTPS est imposé par `github.io`.

**Obligations légales (France).** Tout site public doit afficher des mentions légales (LCEN) :
l’éditeur et l’hébergeur. Une personne physique qui publie à titre non professionnel peut rester
anonyme en n’indiquant que l’hébergeur, à condition que celui-ci connaisse son identité. La page
« Mentions légales et confidentialité » (`#/legal`, liée en bas de chaque écran) est remplie au
build avec ces variables :

| variable                  | contenu                                     | valeur dans `release.yml`                                    |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `VITE_LEGAL_PUBLISHER`    | nom ou pseudonyme de l’éditeur              | variable de dépôt `LEGAL_PUBLISHER`, sinon le compte GitHub  |
| `VITE_LEGAL_CONTACT`      | moyen de contact (URL ou e-mail)            | variable de dépôt `LEGAL_CONTACT`, sinon les issues du dépôt |
| `VITE_LEGAL_HOST`         | nom et adresse de l’hébergeur               | GitHub, Inc.                                                 |
| `VITE_LEGAL_HOST_PRIVACY` | politique de confidentialité de l’hébergeur | déclaration de confidentialité de GitHub                     |
| `VITE_SOURCE_URL`         | code source de la version publiée           | le tag publié                                                |

Une activité professionnelle (entreprise, association, site commercial) doit au contraire
indiquer son identité complète (raison sociale, adresse, numéro d’immatriculation, directeur de
la publication) : renseignez-la dans `LEGAL_PUBLISHER`.

La page indique aussi que le site ne collecte aucune donnée et n’utilise aucun cookie ni traceur
(le stockage local, strictement nécessaire, ne demande pas de consentement), et donne accès au
texte intégral des licences tierces (`third-party-licenses.txt`, généré à chaque build).

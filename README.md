# Mnemo

**Répétition espacée paramétrable, avec un import pensé pour l’IA.** Transformez un cours
entier en cartes de révision fiables avec n’importe quelle IA, révisez hors ligne, et
synchronisez vos appareils avec votre propre serveur.

[![CI](https://github.com/Pulpedagrume/mnemo/actions/workflows/ci.yml/badge.svg)](https://github.com/Pulpedagrume/mnemo/actions/workflows/ci.yml)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/release/Pulpedagrume/mnemo?include_prereleases)](https://github.com/Pulpedagrume/mnemo/releases)

_English version: [README.en.md](README.en.md)._

![Liste des paquets](docs/screenshots/decks.png)

## Pourquoi Mnemo ?

- **L’import par IA est le chemin n°1.** Mnemo écrit pour vous le prompt adapté (flashcards,
  textes à trous, QCM, mélange intelligent…), vous le collez dans l’IA de votre choix avec votre
  cours, puis vous déposez la réponse : l’aperçu montre les cartes exactement comme à l’étude,
  signale les problèmes et génère au besoin un **prompt de correction** ou un prompt
  **« Continue »** si la réponse a été coupée.
- **Un moteur de répétition espacée entièrement réglable** : FSRS, SM-2, style Anki, boîtes de
  Leitner ou paliers simples, presets par paquet avec héritage, et un **simulateur de charge**.
- **Local d’abord** : tout fonctionne sans compte, sans clé d’API et sans réseau (PWA
  installable). Aucune télémétrie. Export complet à tout moment (JSON, YAML, Markdown, CSV, zip,
  `.apkg`).
- **En ligne si vous le voulez** : le même code tourne sur votre serveur (Docker), avec comptes,
  jetons d’API et synchronisation entre appareils.
- **Accessible** : tout se fait au clavier, contrastes AA, thème sombre, taille de texte réglable,
  corrections jamais signalées par la seule couleur.

## Le parcours en moins de 5 minutes

```
cours (PDF, texte) ──► Mnemo écrit le prompt ──► votre IA ──► fichier ──► aperçu fidèle ──► import ──► révision
                                                     ▲                         │
                                                     └── prompt de correction ─┘
```

| Assistant d’import                               | Aperçu avant import                            |
| ------------------------------------------------ | ---------------------------------------------- |
| ![Assistant](docs/screenshots/import-wizard.png) | ![Aperçu](docs/screenshots/import-preview.png) |

| Étude                                | Statistiques                                |
| ------------------------------------ | ------------------------------------------- |
| ![Étude](docs/screenshots/study.png) | ![Statistiques](docs/screenshots/stats.png) |

## Fonctionnalités

- **Types de cartes** : recto/verso (et inversé), réponse à saisir, textes à trous
  `{{c1::…::indice}}`, QCM à une ou plusieurs réponses, vrai/faux, appariement, remise en ordre
  (glisser-déposer ou clavier), listes, types personnalisés à modèles. Markdown, LaTeX (KaTeX),
  code coloré, tableaux, images.
- **Indices** (ampoule) du plus discret au plus explicite, pris en compte dans la notation.
- **Étude** : intervalles prévus sur chaque bouton, raccourcis clavier, annulation des 10
  dernières actions, mise de côté, suspension, drapeau, étude personnalisée (erreurs récentes,
  en avance, par étiquette, bachotage), résumé de fin de session.
- **Navigateur de notes** avec filtres, actions groupées et édition dans un panneau latéral.
- **Statistiques** : activité, prévision, rétention réelle, intervalles, boutons, indices,
  sangsues ; graphiques accessibles avec alternative en tableau, export CSV.
- **Import** : Markdown, YAML, JSON, CSV/TSV, bundles zip avec médias, Anki `.apkg` ; nettoyage
  tolérant des sorties d’IA, validation note par note, import partiel, fusion sans doublon par
  `uid`, annulation de chaque import.
- **Bibliothèque de prompts** (français et anglais) : 11 tâches, 4 formats de sortie, longs
  documents (plan, lots, contrôle), correction et reprise.
- **Intégrations** : CLI `mnemo`, API HTTP avec jetons à portées, serveur **MCP** pour que votre
  assistant IA valide puis importe directement (toujours après confirmation).

## Démarrage rapide

### 1. Dans le navigateur (sans installation)

Ouvrez la version publiée sur GitHub Pages (`https://pulpedagrume.github.io/mnemo/`), puis
« Installer l’application » dans le navigateur pour l’utiliser hors ligne. Vos données restent
dans votre navigateur ; pensez aux sauvegardes (Réglages → Sauvegarde).

### 2. En local avec un serveur (CLI, API et MCP sur la même base)

Prérequis : Node.js 22.13+ et pnpm 9.

```bash
git clone https://github.com/Pulpedagrume/mnemo.git mnemo && cd mnemo
pnpm install
pnpm build
node apps/cli/dist/index.mjs serve        # http://127.0.0.1:8787, données dans ~/.mnemo
```

Puis, depuis un autre terminal :

```bash
node apps/cli/dist/index.mjs prompt --task course-pack --format md --lang fr > prompt.txt
node apps/cli/dist/index.mjs validate reponse-ia.md
node apps/cli/dist/index.mjs import reponse-ia.md --deck "Mon cours"
```

Et pour votre assistant IA (serveur MCP sur la même collection, imports toujours confirmés,
voir [docs/MCP.md](docs/MCP.md)) :

```bash
claude mcp add mnemo -- node "$PWD/apps/mcp/dist/main.mjs"
```

### 3. Avec Docker (auto-hébergement, comptes et synchronisation)

```bash
cp .env.example .env      # renseignez SESSION_SECRET, BASE_URL…
docker compose up -d
```

Guide complet : [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) (Docker, VPS, Fly.io, Render,
Railway, sauvegardes, mises à jour, HTTPS avec Caddy).

### Développement

```bash
pnpm dev          # application web sur http://localhost:5173
pnpm check        # format, lint, types, tests, build
pnpm e2e          # tests de bout en bout (Playwright)
```

## Documentation

| Document                                                                             | Contenu                                                                            |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [docs/IMPORT_FORMAT.md](docs/IMPORT_FORMAT.md)                                       | format d’import `mnemo/1`, Markdown, CSV, Anki, règles et erreurs                  |
| [docs/AI_PROMPTS.md](docs/AI_PROMPTS.md)                                             | prompts prêts à l’emploi, longs documents, boucle de correction                    |
| [docs/SCHEDULERS.md](docs/SCHEDULERS.md)                                             | algorithmes, paramètres, conversion, simulateur                                    |
| [docs/SYNC.md](docs/SYNC.md)                                                         | protocole de synchronisation et règles de fusion                                   |
| [docs/MCP.md](docs/MCP.md)                                                           | serveur MCP pour assistants IA                                                     |
| [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)                                         | auto-hébergement                                                                   |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                         | organisation du code                                                               |
| [docs/DECISIONS.md](docs/DECISIONS.md)                                               | journal des décisions                                                              |
| [docs/PRIVACY.md](docs/PRIVACY.md), [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) | vie privée, modèle de menace                                                       |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                                   | contribuer, ajouter un algorithme, un type de note, un format, une tâche de prompt |

Le schéma JSON du format d’import est publié avec l’application
(`schema/mnemo-import.schema.json`) et disponible via `mnemo schema`.

## Feuille de route

Prévu après la v0.1.0 : occlusion d’image, optimiseur des poids FSRS à partir de votre
historique, chiffrement de bout en bout de la synchronisation, application de bureau (Tauri),
import du format Anki récent (`.anki21b`), éditeur graphique de modèles de cartes, partage de
paquets. Non prévu : add-ons Anki, IA obligatoire.

## Sujets GitHub suggérés

`spaced-repetition` · `flashcards` · `anki-alternative` · `fsrs` · `pwa` · `local-first` ·
`self-hosted` · `ai` · `education`

## Licence

[MIT](LICENSE). Mnemo est une implémentation indépendante : aucun code n’est issu d’Anki (voir
[NOTICE](NOTICE)). La syntaxe des textes à trous `{{c1::…}}` et le format `.apkg` sont pris en
charge pour l’interopérabilité.

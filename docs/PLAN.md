# Plan de réalisation

Chaque phase se termine quand `pnpm check && pnpm e2e` passe, que ce plan est à jour et que les
commits (Conventional Commits) sont faits. Les décisions sont dans [DECISIONS.md](DECISIONS.md).

## Phase 0 — Fondations

- [x] Monorepo pnpm (`packages/*`, `apps/*`), TypeScript strict partagé
- [x] ESLint (typé, a11y, i18n, anti-cycles, règles de pureté de `core`), Prettier, EditorConfig
- [x] Vitest (projets par paquet, couverture v8), Playwright (desktop + mobile)
- [x] Paquets `core`, `importers`, `prompts`, `storage`, `sync` qui compilent
- [x] Apps `web` (React 18 + Vite + Tailwind + i18n fr/en), `cli` (bundle tsdown), `server`, `mcp` (squelettes)
- [x] `APP_NAME` / `APP_SLUG` / `FORMAT_ID`, `Clock`, `Rng` (avec tests)
- [x] `pnpm rename-app`, `pnpm check:licenses`, `pnpm knip`
- [x] CI minimale (lint, typecheck, tests, build, knip, licences, audit, e2e, gitleaks)
- [x] `CLAUDE.md`, `docs/PLAN.md`, `docs/DECISIONS.md`, `LICENSE`, `NOTICE`, README provisoire
- [x] `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` vert en local

## Phase 1 — Cœur, stockage, planificateurs, étude (MVP local)

- [x] Modèle de données Zod (Deck, Preset, NoteType, Note, Card, ReviewLog, Media, ImportBatch, Settings), UUIDv7, `dayIndex`
- [x] Interface `Repository` + implémentations mémoire et Dexie + suite de conformité commune (148 tests)
- [x] Interface `Scheduler`, registre `registerScheduler`, `ParamSpec`
- [x] Planificateurs `anki`, `sm2`, `fsrs` (adaptateur `ts-fsrs` + tests dorés), `leitner`, `ladder`
- [x] Tests de propriétés (fast-check) et simulation 1 000 cartes × 365 jours par algorithme
- [x] Conversion entre algorithmes (`docs/SCHEDULERS.md`) avec écran de confirmation (avant / après)
- [x] Presets, limites, comportement, héritage parent → enfant, presets fournis, import/export de preset
- [x] File d’étude `buildQueue` (fuseaux, minuit, changement d’heure, 100 000 cartes) et compteurs
- [x] Types de notes intégrés et génération des cartes (basic, reversed, typed, cloze, mcq, truefalse, matching, ordering, list, template)
- [x] Rendu Markdown sûr (markdown-it + DOMPurify + KaTeX + coloration de code)
- [x] Liste des paquets (arbre, compteurs, recherche), navigateur de notes (panneau latéral d’édition), éditeur de note
- [x] Écran d’étude : notation, intervalles prévus, ampoule d’indices + `hintPolicy`, types interactifs, raccourcis, annulation ×10, étude personnalisée, résumé de fin
- [x] Réglages des presets générés depuis `paramSpec` + simulateur de charge (Web Worker, comparaison de presets)
- [x] Statistiques (SVG accessibles avec alternative en tableau, export CSV)
- [x] PWA hors ligne (vite-plugin-pwa), stockage persistant, mise à jour proposée sans rechargement forcé
- [x] Sauvegarde et restauration `.zip`
- [x] Thème clair/sombre/système, taille de texte, i18n fr/en complète
- [x] Couverture ≥ 90 % sur `core` (99 % des lignes, seuil vérifié en CI) ; e2e : paquet, note de chaque type, étude, hors ligne, presets, sauvegarde

## Phase 2 — Import, export, assistant IA

- [x] `ImportDocument` canonique (Zod) + JSON Schema généré (`schema/mnemo-import.schema.json`, publié avec l’app)
- [x] Nettoyage tolérant (BOM, blocs de code, guillemets, jsonrepair, troncature, alias) et mode strict
- [x] Parseurs JSON, YAML, Mnemo Markdown, CSV/TSV, bundles zip (limites et contrôles de sécurité)
- [x] Validation par note, contrôles sémantiques, rapport d’erreurs (texte, JSON, prompt de correction)
- [x] Fusion (skip-duplicates, update, add, replace-deck), identification par uid ou contenu, `ImportBatch`, annulation
- [x] Exports JSON/YAML/Markdown/CSV/zip et tests d’aller-retour (paquet → fichier → import)
- [x] Fixtures valides/invalides (51), tests dorés, fuzz, performance (10 000 notes ≈ 0,8 s)
- [x] Composeur de prompts + gabarits fr/en (T1–T15) + `docs/AI_PROMPTS.md`
- [x] Assistant « Importer avec l’IA » (4 étapes), aperçu fidèle, historique des imports, Guide IA, export depuis le menu des paquets
- [x] CLI `validate` (`--strict --json --ai-prompt`), `prompt`, `schema`, `import --dry-run`
- [ ] CLI `import` sans `--dry-run` et `export` : nécessitent la base locale SQLite (phase 3)
- [x] Scénarios d’acceptation A1–A4 automatisés (Playwright, bureau et mobile)

## Phase 3 — Serveur, en ligne, synchronisation

- [ ] `docs/SYNC.md` (avant le code), HLC, règles de fusion, tests de conflits
- [ ] `Repository` SQLite + conformité
- [ ] API Fastify, comptes (argon2id, sessions, CSRF), jetons d’API à portées, durcissement
- [ ] `mnemo serve`, Dockerfile, docker-compose, Caddy, `docs/SELF_HOSTING.md`
- [ ] Build GitHub Pages (chemin de base), workflow de release
- [ ] Scénario A5 automatisé

## Phase 4 — Intégrations

- [ ] API d’import à jetons, OpenAPI
- [ ] Serveur MCP (stdio + HTTP) avec dry-run obligatoire
- [ ] Import/export `.apkg`
- [ ] Simulateur avancé (comparaison de presets, Web Worker)
- [ ] Optimiseur FSRS (si faisable), Tauri (si le temps le permet)
- [ ] Scénario A6 automatisé

## Phase 5 — Publication v0.1.0

- [ ] README fr/en avec captures (`pnpm screenshots`), docs complètes, exemples
- [ ] Revue de sécurité (§6.3), budgets performance et accessibilité (Lighthouse), A7
- [ ] `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, modèles GitHub
- [ ] Tag `v0.1.0` préparé (non poussé) et commandes de publication

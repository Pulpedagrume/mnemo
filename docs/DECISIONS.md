# Journal des décisions (ADR)

Format court : contexte → décision → conséquences. Les décisions sont numérotées et jamais
réécrites ; une décision remplacée est marquée « Remplacée par ADR-xxx ».

## ADR-001 — Branche principale `main`

- **Contexte** : le dépôt local était sur `master`, sans aucun commit.
- **Décision** : renommer en `main` avant le premier commit (convention GitHub actuelle).
- **Conséquences** : aucune ; les commandes de publication utilisent `main`.

## ADR-002 — Node.js 22.12 minimum (au lieu de 20)

- **Contexte** : le cahier des charges demande Node 20+. Node 20 est en fin de vie depuis avril 2026,
  et Vitest 5 exige Node `^22.12 || ^24 || >=26` (Vite 8 : `^20.19 || >=22.12`).
- **Décision** : `engines.node >= 22.12`, `.nvmrc` = 22, CI sur Node 22 et 24.
- **Conséquences** : reste compatible avec l’esprit « Node 20+ » ; aucun utilisateur final n’est
  concerné par la PWA. Le CLI et le serveur demandent Node 22.12+.

## ADR-003 — TypeScript 6.0 (pas encore 7)

- **Contexte** : TypeScript 7 (port natif) est sorti, mais `typescript-eslint` 8 ne supporte que
  `< 6.1`, et le lint typé est indispensable (promesses non attendues, etc.).
- **Décision** : `typescript ~6.0`. Passage à 7 quand `typescript-eslint` le supportera.
- **Conséquences** : options TS 6 (`types` explicites par paquet, `moduleResolution: Bundler`).

## ADR-004 — ESLint 10 et `eslint-plugin-jsx-a11y-x`

- **Contexte** : ESLint 9 n’est plus supporté ; `eslint-plugin-jsx-a11y` n’est plus publié depuis
  2024 et ne déclare pas ESLint 10.
- **Décision** : ESLint 10 (config plate), `eslint-plugin-jsx-a11y-x` (fork MIT maintenu par
  es-tooling, compatible ESLint 9/10), `typescript-eslint` en mode `strictTypeChecked`,
  `eslint-plugin-import-x` pour `no-cycle`, `eslint-plugin-i18next` pour interdire les chaînes en dur.
- **Conséquences** : règles maison : `Date.now`, `new Date()` et `Math.random` interdits dans
  `packages/core` ; `core` ne peut importer ni Node ni d’autres paquets du dépôt.

## ADR-005 — Paquets internes livrés en sources TypeScript ; tsdown pour les apps Node

- **Contexte** : un build par paquet (dist + déclarations) alourdit le développement et la CI.
- **Décision** : les paquets `packages/*` exposent `src/index.ts` (pas d’étape de build). Les apps
  les embarquent : Vite pour le web, **tsdown** (successeur de tsup, qui est en maintenance) pour la
  CLI, le serveur et le MCP.
- **Conséquences** : les fichiers chargés directement par Node (ex. `vite.config.ts`) importent le
  code du dépôt par chemin relatif avec extension `.ts`. Si un paquet doit un jour être publié sur
  npm seul, on lui ajoutera un build.

## ADR-006 — Versions des outils web : Vite 8, Vitest 5, Tailwind 4, React 18

- **Contexte** : React 18 est imposé ; le reste suit les versions stables actuelles.
- **Décision** : Vite 8, `@vitejs/plugin-react` 6, Tailwind CSS 4 (configuration en CSS via
  `@tailwindcss/vite`), Vitest 5 (`test.projects` à la racine), Playwright 1.63, jsdom pour les
  tests de composants. `vite-plugin-pwa` 2 (compatible Vite 8) arrive en phase 1.
- **Conséquences** : mode sombre par classe `.dark` (`@custom-variant`) pour gérer clair/sombre/système.

## ADR-007 — Internationalisation

- **Contexte** : fr (défaut) et en dès le départ, pluriels corrects, aucune chaîne en dur.
- **Décision** : `i18next` + `react-i18next` pour l’interface (fichiers `apps/web/src/i18n/locales`,
  clés typées, pluriels `Intl.PluralRules`). Le domaine (`core`, `importers`) produit des messages
  bilingues de type `I18nString = { fr, en }`, sans dépendance à i18next.
- **Conséquences** : un test vérifie que `fr.json` et `en.json` ont exactement les mêmes clés ;
  l’attribut `lang` du document suit la langue choisie.

## ADR-008 — Contrôle des licences via `pnpm licenses`

- **Contexte** : `license-checker` n’est plus maintenu (dernière version 2019).
- **Décision** : script `scripts/check-licenses.mjs` qui lit `pnpm licenses list --json` et applique
  une liste blanche (stricte pour les dépendances de production ; MPL-2.0, CC-BY et Python-2.0
  tolérées pour les outils de build/test non redistribués). Expressions SPDX `OR`/`AND` gérées.
- **Conséquences** : aucune dépendance de plus ; exécuté en CI.

## ADR-009 — Identifiant de format stable `mnemo/1`

- **Contexte** : « Mnemo » est un nom de travail, renommable par `pnpm rename-app`.
- **Décision** : `APP_NAME`/`APP_SLUG` changent avec le renommage, mais l’identifiant de format
  `mnemo/1` et le nom du schéma publié restent fixes.
- **Conséquences** : les fichiers produits avant un renommage continuent de s’importer.

## ADR-010 — Analyse des secrets avec l’image Docker gitleaks

- **Contexte** : l’action GitHub officielle exige une licence pour les comptes d’organisation.
- **Décision** : exécuter l’image `ghcr.io/gitleaks/gitleaks` directement dans la CI.

## ADR-011 — PRNG mulberry32 et horloge injectée

- **Décision** : `Rng` (flottants dans [0, 1)) implémenté par mulberry32 ; `Clock` avec
  `manualClock` pour les tests/simulations et `systemClock` comme seule lecture de l’horloge réelle.
- **Conséquences** : simulations et fuzz reproductibles via une graine affichée.

## ADR-012 — Paquet `@mnemo/services` (couche applicative)

- **Contexte** : la structure imposée n’a pas de place pour la logique qui orchestre `core` et
  `storage` (créer une note et ses cartes, session d’étude, sauvegarde…), alors qu’elle doit être
  partagée par le web, la CLI, le serveur et le MCP (parité des surfaces).
- **Décision** : ajout de `packages/services` (dépend de `core` et `storage`). Les composants React
  n’appellent que ces services ; `core` reste pur.
- **Conséquences** : un paquet de plus ; aucune logique métier dans l’interface.

## ADR-013 — Contenu structuré des notes interactives (`Note.data`)

- **Contexte** : le modèle prévoit `fields: Record<string, string>` (Markdown), insuffisant pour
  les QCM (bonne réponse et explication par proposition), appariements, ordonnancements, listes,
  vrai/faux et réponses saisies (variantes, casse, accents).
- **Décision** : le texte libre reste dans `fields` (cherchable, rendu en Markdown) ; la partie
  structurée va dans `Note.data`, union discriminée par `kind` validée par Zod.
- **Conséquences** : l’import et l’export convertissent `choices`, `pairs`, `steps`… vers `data`.

## ADR-014 — Conventions des types de notes

- Les clés de champs sont stockées en minuscules (`front`, `back`, `text`, `extra`, `question`,
  `statement`) ; la recherche de champ est insensible à la casse.
- Le verso d’une carte reprend la question puis la réponse (séparées par `---`), comme Anki.
- Sans `Rng` fourni, l’ordre des propositions (QCM, ordonnancement) est déterministe, dérivé du
  contenu ; l’écran d’étude fournit un `Rng` pour varier l’ordre.
- Cloze : `\{` et `\}` sont des accolades littérales ; l’indice commence au premier `::` hors
  accolades ; trous imbriqués refusés en v1.

## ADR-015 — Sangsues gérées hors des planificateurs

- **Décision** : le seuil et l’action « sangsue » (`behavior.leechThreshold`, `leechAction`) sont
  appliqués par la couche d’étude générique (`answerCard`), pour tous les algorithmes. Le
  paramètre `leechThreshold` n’existe donc pas dans les paramètres propres à `anki`.

## ADR-016 — Routage par hash et écrans chargés à la demande

- **Contexte** : la PWA doit fonctionner sur un hébergement statique (GitHub Pages, sous-chemin)
  et hors ligne, sans réécriture d’URL côté serveur. Budget : première interaction < 1 s.
- **Décision** : `createHashRouter` (React Router 7). Les écrans secondaires (étude, navigateur,
  éditeur, presets, statistiques, réglages) sont découpés (`lazy`) ; le bundle initial passe de
  283 ko à 117 ko gzip. KaTeX, markdown-it et highlight.js ne sont chargés qu’avec l’étude ou
  l’éditeur.
- **Conséquences** : URL de la forme `/#/study/<id>` ; aucun réglage serveur nécessaire.

## ADR-017 — Points d’entrée du stockage

- **Décision** : `@mnemo/storage` exporte l’interface et l’implémentation mémoire ;
  `@mnemo/storage/dexie` l’implémentation IndexedDB (types DOM) ; `@mnemo/storage/testing` la
  suite de conformité. La CLI et le serveur n’embarquent donc jamais Dexie.
- **Conséquences** : dans une transaction Dexie, les magasins sont liés à la transaction ; seules
  des opérations de stockage peuvent y être attendues (sinon IndexedDB valide automatiquement).

## ADR-018 — Correspondance exacte des boutons et du flou (fuzz)

- **Décision** : l’aperçu des intervalles et la planification réelle utilisent la même graine
  `rngForReview(cardId, reps)` ; les libellés des boutons correspondent donc exactement à
  l’intervalle appliqué. FSRS (`ts-fsrs`) dérive son flou de l’état de la carte : déterministe.

## ADR-019 — Pluriels français

- **Contexte** : `Intl.PluralRules('fr')` renvoie `many` pour les très grands nombres.
- **Décision** : les clés françaises à pluriel ont les formes `_one`, `_many` et `_other` ; le test
  de parité fr/en ignore les suffixes de pluriel et compare aussi les variables d’interpolation.

## ADR-020 — Licences Zlib et PSF-2.0 acceptées

- **Contexte** : `pako` (compression, via `jszip`) est sous « MIT AND Zlib » ; `argparse`
  (dépendance de la ligne de commande de `markdown-it`, non embarquée dans la PWA) est sous PSF-2.0.
- **Décision** : ajout de `Zlib` et `PSF-2.0` à la liste blanche de production : licences
  permissives, compatibles avec une redistribution sous MIT, mention dans `NOTICE`.

## ADR-021 — « qcm » dans le scénario A2 : alias toléré, type inconnu en mode strict

- **Contexte** : le cahier des charges cite `qcm` à la fois comme alias toléré de `mcq` (§4.2) et
  comme « type inconnu » du scénario A2.
- **Décision** : en mode tolérant (par défaut), `qcm` produit un avertissement `alias` avec la
  suggestion « qcm → mcq » ; en mode strict, une erreur `unknown_type` avec la même suggestion.
  Le rapport A2 liste bien cinq problèmes (alias, cloze sans trou, QCM sans bonne réponse, uid en
  double, image non déclarée).

## ADR-022 — Doublons sans uid : contenu normalisé plutôt qu’un hachage stocké

- **Décision** : une note sans uid est rapprochée d’une note existante du même paquet par une clé
  « type + champ principal normalisé » (minuscules, espaces compressés, Markdown retiré), calculée
  à la volée. Un SHA-256 n’apporterait rien tant que la clé n’est pas stockée ; il reste utilisé
  pour dédoublonner les médias.

## ADR-023 — Médias importés

- **Décision** : les médias d’un bundle ou d’une URI `data:` sont stockés une seule fois
  (SHA-256) ; les références `media:<id du fichier>` des notes sont réécrites vers l’identifiant
  stocké. Les URL distantes ne sont jamais téléchargées automatiquement.

## ADR-024 — Règle de fusion des étiquettes en Markdown

- **Décision** : étiquettes du front-matter (pour tout le fichier) + dernière directive `@tags`
  (pour les blocs suivants) + attribut `tags=` du bloc + champ `Tags:`, dédoublonnées.

## ADR-025 — CLI `import` limitée à `--dry-run` avant la phase 3

- **Contexte** : écrire dans une collection depuis la CLI exige une base persistante.
- **Décision** : la phase 2 fournit l’analyse (`--dry-run`) ; l’écriture arrive avec le dépôt
  SQLite et `mnemo serve` (phase 3).

## ADR-026 — `useMutation` appelle toujours la dernière fonction

- **Contexte** : un test e2e (A4) a montré qu’un import en mode « Mettre à jour » utilisait le mode
  initial : la fonction passée à `useMutation` était mémorisée au premier rendu.
- **Décision** : le hook garde la dernière fonction dans une référence mise à jour à chaque rendu.

# Architecture

Ce document décrit l’organisation du code de Mnemo. Il est complété à chaque phase
(voir [PLAN.md](PLAN.md)) ; les choix structurants sont justifiés dans [DECISIONS.md](DECISIONS.md).

## Vue d’ensemble

```
            ┌────────────────────────── apps ──────────────────────────┐
            │  web (PWA React)   cli (mnemo)   server (Fastify)   mcp   │
            └───────────────┬──────────────────────────────────────────┘
                            │ appellent uniquement…
                  ┌─────────▼─────────┐
                  │ packages/services │  cas d’usage : paquets, notes, presets, étude,
                  └───┬───────────┬───┘  statistiques, sauvegarde
                      │           │
          ┌───────────▼──┐   ┌────▼─────────────┐
          │ packages/core│   │ packages/storage │  Repository : mémoire, Dexie (IndexedDB),
          │ (pur)        │◄──┤                  │  SQLite (phase 3)
          └──────────────┘   └──────────────────┘
```

- **`packages/core`** — domaine pur, sans DOM ni Node : schémas Zod et types, planificateurs
  (FSRS, SM-2, Anki, Leitner, paliers) et leur registre, types de notes (génération, rendu en
  Markdown, correction), file d’étude, statistiques, simulateur. L’horloge (`Clock`) et le hasard
  (`Rng`) sont toujours injectés ; ESLint interdit `Date.now()`, `new Date()` et `Math.random()`.
- **`packages/storage`** — interface asynchrone `Repository` et ses implémentations. Toutes
  passent la même suite de conformité (`@mnemo/storage/testing`).
- **`packages/services`** — orchestration `core` + `storage` (transactions, création des cartes
  d’une note, réponse à une carte avec journal de révision, annulation, changement d’algorithme…).
  Partagé par toutes les applications : aucune logique métier dans les composants React.
- **`apps/web`** — PWA React 18 : écrans, composants accessibles, rendu Markdown sûr
  (markdown-it + DOMPurify + KaTeX + highlight.js), Web Worker du simulateur.

## Flux d’une révision

1. `loadStudyQueue` (services) charge les cartes dues et nouvelles du sous-arbre, les révisions du
   jour, et appelle `buildQueue` (core) : limites quotidiennes par sous-arbre, mise de côté des
   cartes sœurs, ordre et mélange configurés.
2. `loadStudyItem` charge la note, son type et le preset effectif (héritage), et calcule les
   libellés des boutons (`previewLabels`).
3. L’écran affiche `renderCard` (core) via `StudyCard` ; les types interactifs sont corrigés par
   `gradeMcq`, `gradeMatching`… qui proposent une note.
4. `answer` (services) applique `answerCard` (core) : politique d’indices, planification, sangsues,
   `ReviewLog` ; le tout dans une transaction. `undoAnswer` restaure la carte et supprime le journal.

## Stockage navigateur (IndexedDB / Dexie)

- Schéma versionné dans `packages/storage/src/dexie/schema.ts` (`db.version(1)`). **Ne jamais
  modifier une version publiée** : pour migrer, ajouter `db.version(N+1).stores({...})` avec
  uniquement les tables dont les index changent (`null` supprime une table), et une fonction
  `.upgrade(tx => …)` si les données doivent être transformées.
- Les booléens et `deletedAt` ne sont pas indexés (filtrés en JavaScript).
- Suppression logique : une entité supprimée garde un `deletedAt` (pour la synchronisation) ;
  `changedSince` renvoie aussi ces « tombes ».
- L’implémentation mémoire sert aux tests et à la CLI (journal d’annulation, sans isolation).

## Internationalisation

- Interface : `i18next` ; fichiers `apps/web/src/i18n/locales/{fr,en}.json`, clés typées.
- Domaine : messages bilingues `I18nString = { fr, en }` (aides des paramètres, erreurs de cloze).
- Un test vérifie que les deux langues ont les mêmes clés et les mêmes variables.

## Accessibilité

- Composants Radix (dialogues, menus, infobulles) et contrôles natifs (sélecteurs, cases).
- Corrections toujours accompagnées d’un libellé texte et d’une icône (jamais la couleur seule),
  annoncées par des régions `aria-live`.
- Étude complète au clavier (raccourcis documentés dans l’écran d’aide « ? »), réordonnancement
  par boutons monter/descendre, lien d’évitement, focus visible, `prefers-reduced-motion`.
- Graphiques SVG avec résumé textuel et alternative en tableau.

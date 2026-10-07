# Prompts IA : transformer un cours en cartes

Mnemo n’appelle aucune IA : il **écrit le prompt pour vous**. Vous le collez dans l’assistant de
votre choix avec votre document, puis vous importez le fichier qu’il produit. Les prompts ne citent
aucun modèle ni aucun fournisseur : ils fonctionnent avec toute IA capable de lire un document.

Ce guide explique la démarche, puis publie **tous les gabarits tels quels** (français, puis
anglais) pour qui veut s’en servir sans l’application. Le format des fichiers d’import est décrit
dans [IMPORT_FORMAT.md](IMPORT_FORMAT.md).

## La démarche en six étapes

```text
cours → prompt → IA → fichier → import → révision
```

1. **Choisir la tâche** (flashcards, textes à trous, QCM, mélange intelligent…) dans l’assistant
   « Importer avec l’IA » ou avec `mnemo prompt`.
2. **Choisir le format** que l’IA doit produire ; l’application en recommande un (voir plus bas).
3. **Régler les options** (paquet, langue des cartes, niveau, densité, indices, explications…).
4. **Copier le prompt**, l’envoyer à l’IA, puis **coller ou joindre le document** à la place du
   repère `[COLLE OU JOINS TON DOCUMENT ICI]`.
5. **Copier la réponse** (le bloc de code, ou le fichier joint) et la coller ou la glisser dans
   « J’ai la réponse de l’IA ». L’aperçu montre les cartes exactement comme à l’étude, avec les
   avertissements et les erreurs.
6. **Importer**, puis réviser. En cas d’erreurs, utilisez le prompt de correction (T11) ; si la
   réponse est incomplète, le prompt « Continue » (T12).

## Les tâches

| N°  | Tâche (`id`)  | Pour quoi faire                               | Types de notes                                                                | Format conseillé |
| --- | ------------- | --------------------------------------------- | ----------------------------------------------------------------------------- | ---------------- |
| T1  | `flashcards`  | Cartes recto/verso                            | basic, basic_reversed, typed                                                  | Markdown         |
| T2  | `cloze`       | Textes à trous                                | cloze                                                                         | Markdown         |
| T3  | `mcq`         | QCM                                           | mcq                                                                           | Markdown         |
| T4  | `course-pack` | Mélange intelligent, recommandé pour un cours | basic, basic_reversed, cloze, mcq, ordering, matching, list, truefalse, typed | Markdown         |
| T5  | `vocabulary`  | Vocabulaire et langues                        | basic_reversed, cloze, typed                                                  | Markdown         |
| T6  | `formulas`    | Formules et calculs                           | cloze, basic, typed                                                           | YAML             |
| T7  | `code`        | Code et commandes                             | typed, cloze, basic, mcq                                                      | YAML             |
| T8  | `timeline`    | Dates et chronologie                          | basic, mcq, ordering, matching                                                | Markdown         |
| T9  | `convert`     | Convertir d’anciennes fiches ou des sujets    | basic, mcq, matching, ordering                                                | Markdown         |
| T10 | `audit`       | Vérifier ou corriger un fichier existant      | tous                                                                          | celui du fichier |
| T11 | `fix`         | Corriger les erreurs d’import                 | ceux des notes en erreur                                                      | celui du fichier |
| T12 | `continue`    | Continuer une réponse coupée                  | —                                                                             | —                |
| T13 | `plan`        | Planifier un long document (sans cartes)      | —                                                                             | —                |
| T14 | `batch`       | Générer un lot de sections                    | ceux de la tâche choisie                                                      | celui du plan    |
| T15 | `images`      | Documents avec figures                        | basic + liste `media`                                                         | YAML (ou JSON)   |

Le bloc FORMAT d’un prompt ne décrit **que** les types utiles à la tâche (une tâche « textes à
trous » n’embarque que `cloze`) : c’est plus court et l’IA s’égare moins.

## Quel format demander ?

- **Markdown** (par défaut) : lisible, presque aucun échappement, le plus tolérant à l’import.
  Recommandé dans la plupart des cas.
- **YAML** : pour un cours chargé en **formules LaTeX** ou en **code**. Les blocs `|` gardent le
  texte tel quel (aucun échappement de `\`), et le code ne se mélange pas avec les blocs de code de
  la réponse. Obligatoire (avec JSON) pour les figures, déclarées dans une liste `media`.
- **JSON** : le plus strict, pour les scripts et les outils. Les antislashs du LaTeX doivent être
  doublés, d’où plus d’erreurs quand une IA l’écrit.
- **CSV** : seulement si vous voulez passer par un tableur. Il ne sait décrire que `basic`,
  `basic_reversed`, `cloze` et `mcq`, sans `needsReview` ni `difficulty`.

## Les options

| Option                     | Effet dans le prompt                                             | Défaut                             |
| -------------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| Paquet racine              | `{{deck}}` ; sert aussi à fabriquer le préfixe des `uid`         | « Mon cours »                      |
| Langue des cartes          | `{{langue}}` (règle 14) ; un code comme `en` devient « anglais » | langue de l’interface              |
| Niveau                     | `{{niveau}}`                                                     | intermédiaire                      |
| Densité                    | `{{densite}}` : 3, 5 ou 10 cartes par section, ou exhaustif      | 5                                  |
| Indices, explications      | `{{regleIndices}}`, `{{regleExplications}}`                      | oui, oui                           |
| Propositions de QCM        | `{{nbChoix}}` (3 à 6)                                            | 4                                  |
| Préfixe d’`uid`            | exemple et ligne « Préfixe des uid »                             | paquet sans accents, ex. `reseaux` |
| Taille des lots            | `{{tailleLot}}` (plan, lots, document long)                      | 40                                 |
| N’utiliser que le document | décoché : variantes de la règle 1 et de l’auto-vérification 5    | coché                              |
| Type de document           | une ligne de conseil ajoutée au bloc TÂCHE                       | aucun                              |
| Mon document est long      | ajoute le bloc « DOCUMENT LONG » et propose le plan (T13)        | non                                |

Les valeurs exactes de ces phrases sont publiées plus bas
([Valeurs des variables](#valeurs-des-variables)).

## Anatomie d’un prompt

Un prompt composé (T1 à T10, T15) enchaîne huit blocs, séparés par une ligne vide :

1. **RÔLE** ;
2. **TÂCHE** propre à l’objectif (plus, éventuellement, la ligne « Type de document ») ;
3. **FORMAT** : spécification compacte, **générée** à partir de la description des types utilisée
   par le validateur (même source de vérité), limitée aux types de la tâche, dans la syntaxe du
   format choisi ;
4. **RÈGLES DE QUALITÉ** ;
5. **CONTRAINTES DE SORTIE** (plus « DOCUMENT LONG » si l’option est cochée) ;
6. **AUTO-VÉRIFICATION** ;
7. **EXEMPLE** minimal **valide** dans le format choisi (une note par disposition de champs ; il
   est importé sans erreur par les tests) ;
8. **DOCUMENT** : « Voici le document à traiter : » suivi du repère à remplacer.

Variantes appliquées par le composeur (les gabarits restent identiques) :

- **« N’utiliser que le document » décoché** : la règle 1 et le point 5 de l’auto-vérification sont
  remplacés par leurs variantes (connaissances générales bien établies permises, marquées
  `needsReview: true`).
- **T10 (audit)** : la première contrainte de sortie est remplacée pour autoriser la liste des
  problèmes avant le fichier (la tâche la demande).
- **Auto-vérification, point 1** : « guillemets, indentation et lignes ::: fermantes » ne vaut que
  pour Markdown ; en YAML on lit « guillemets et indentation », en JSON « guillemets, virgules et
  crochets », en CSV « en-têtes, séparateurs et guillemets ».
- **T7 en Markdown** : le bloc FORMAT rappelle d’entourer le fichier de quatre accents graves si
  une note contient un bloc de code.

Les variables s’écrivent `{{nom}}`. Seules celles d’une **liste blanche** sont remplacées (`deck`,
`langue`, `niveau`, `densite`, `nbChoix`, `appName`, `formatFence`, `formatExt`, `regleIndices`,
`regleExplications`, `tailleLot`, `n`, `sections`, `prefixe`, `dernierUid`, `continuation`,
`portee`, `nbErreurs`, `listeErreurs`, `extraits`, `specCompacte`) : un trou comme
`{{c1::réponse}}` n’est jamais pris pour une variable.

**Taille** : l’application affiche une estimation en tokens (caractères ÷ 4). C’est une borne
basse pour le français et le LaTeX (plutôt 3,5 caractères par token) : gardez une marge. Sans le
document, le prompt T4 en Markdown tient en moins de 1 800 tokens (vérifié par les tests).

## Documents longs

Une IA ne peut pas tout produire en une réponse pour un cours de cent pages. La démarche :

1. **Plan (T13)** : envoyez le prompt de plan avec le document. L’IA rend un tableau (section,
   notions clés, types conseillés, nombre de cartes) et un découpage en lots numérotés, sans créer
   de cartes.
2. **Lots (T14)** : dans la même conversation, demandez le lot 1, puis 2… Le premier lot embarque
   les blocs RÔLE à EXEMPLE (le document est déjà dans la conversation) ; les suivants se
   contentent du court bloc « TÂCHE (lot) ». Les `uid` continuent la numérotation avec le même
   préfixe.
3. **Contrôle (T10)** : faites relire l’ensemble (doublons, questions non autonomes, QCM biaisés…).
   L’IA ne renvoie que les notes à corriger ou à ajouter.
4. **Import** : importez les fichiers un par un ou ensemble. **Réimporter des notes avec les mêmes
   `uid` en mode « mettre à jour » les remplace** au lieu de créer des doublons, en gardant leur
   planification.

## Réponse coupée : « Continue » (T12)

Si l’IA s’arrête avant la fin, elle doit l’indiquer avec `continuation` (JSON, YAML) ou
`@continuation` (Markdown), par exemple « Reprendre à la section 5.3 ». Quand l’import détecte une
réponse tronquée ou une suite annoncée, il récupère toutes les notes complètes et propose le prompt
T12, qui donne le dernier `uid` valide et l’endroit où reprendre. Collez-le dans la **même
conversation**, puis importez la suite comme un fichier de plus.

## Boucle de correction (T11)

Quand l’aperçu signale des erreurs, le bouton « Copier le prompt de correction » produit un texte à
coller dans la **même conversation** :

- une ligne par erreur (et par avertissement qui fait perdre du contenu, comme un `uid` en double) :
  `uid` ou position, chemin, ligne, message et correction conseillée ;
- les extraits concernés (le bloc complet en Markdown) ;
- un rappel compact du format pour les seuls types en cause.

Par défaut, l’IA ne renvoie **que les notes corrigées, avec leurs `uid` d’origine** : les notes
valides ne sont pas renvoyées (moins de tokens, pas de nouvelles erreurs). Importez la réponse : les
notes en erreur n’avaient pas été importées, les notes corrigées les remplacent naturellement (et en
mode « mettre à jour », un même `uid` remplace la note existante). L’option « fichier complet » existe pour les fichiers
sans `uid`.

## Utiliser les prompts sans l’application

1. Copiez les blocs dans l’ordre : RÔLE, TÂCHE, FORMAT, RÈGLES DE QUALITÉ, CONTRAINTES DE SORTIE,
   AUTO-VÉRIFICATION, EXEMPLE, DOCUMENT, séparés par une ligne vide.
2. Remplacez chaque `{{variable}}` à la main (valeurs ci-dessous ; `{{appName}}` = Mnemo,
   `{{formatFence}}` = `markdown`, `yaml`, `json` ou `csv`, `{{formatExt}}` = `.md`, `.yaml`,
   `.json` ou `.csv`). Ne touchez pas aux `{{c1::…}}`.
3. Pour les blocs FORMAT et EXEMPLE, partez de l’[exemple complet](#exemple-complet--t4-en-markdown)
   et retirez les types inutiles, ou utilisez `mnemo prompt`.

## Pour les développeurs

Le paquet `@mnemo/prompts` est pur (aucun accès au DOM ni à Node) :

- `PROMPT_TASKS`, `recommendFormat(task, options)`, `buildPrompt({ task, format, locale, options })`
  → `{ prompt, specText, exampleText, approxTokens }` ;
- `buildFixPrompt({ report, sourceText?, format, locale, scope })`,
  `buildContinuePrompt({ lastUid, continuation, locale })`,
  `buildPlanPrompt({ locale, batchSize, documentType })`,
  `buildBatchPrompt({ n, sections, prefix, locale, base? })` ;
- `promptVariables(template)`, `PROMPT_VARIABLES`, `formatSpec(format, options)`.

Les gabarits sont les fichiers `prompts/fr/*.md` et `prompts/en/*.md` (mêmes fichiers, mêmes
variables : testé). Après une modification, lancez `pnpm --filter @mnemo/prompts templates` : le
script régénère `packages/prompts/src/templates.generated.ts` (pour le navigateur) et les sections
générées de ce document, puis passez Prettier sur ce fichier. Un test échoue si l’un des deux n’est
plus à jour. Les prompts composés sont figés dans des fichiers de référence
(`packages/prompts/src/__snapshots__`) : relisez le diff, puis mettez-les à jour avec
`pnpm vitest run --project @mnemo/prompts -u`.

## Valeurs des variables

<!-- generated:values:start -->

| Variable                | Français                                                                                                     | English                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `{{niveau}}`            | débutant                                                                                                     | beginner                                                                                               |
| `{{niveau}}`            | intermédiaire                                                                                                | intermediate                                                                                           |
| `{{niveau}}`            | expert                                                                                                       | expert                                                                                                 |
| `{{densite}}`           | environ 3 cartes par section                                                                                 | about 3 cards per section                                                                              |
| `{{densite}}`           | environ 5 cartes par section                                                                                 | about 5 cards per section                                                                              |
| `{{densite}}`           | environ 10 cartes par section                                                                                | about 10 cards per section                                                                             |
| `{{densite}}`           | exhaustif (toutes les notions utiles du document)                                                            | exhaustive (every useful concept of the document)                                                      |
| `{{regleIndices}}`      | Pour chaque carte non triviale, ajoute un indice (champ hint) qui oriente sans révéler la réponse.           | For each non-trivial card, add a hint (hint field) that guides without revealing the answer.           |
| `{{regleIndices}}`      | N’ajoute pas d’indices.                                                                                      | Do not add hints.                                                                                      |
| `{{regleExplications}}` | Ajoute une explication (champ explanation) d’une à deux phrases quand elle aide à comprendre ou à mémoriser. | Add a one- or two-sentence explanation (explanation field) when it helps to understand or to remember. |
| `{{regleExplications}}` | N’ajoute pas d’explications.                                                                                 | Do not add explanations.                                                                               |
| `{{portee}}`            | uniquement les notes corrigées, avec leurs uid d’origine                                                     | only the corrected notes, with their original uids                                                     |
| `{{portee}}`            | le fichier complet                                                                                           | the complete file                                                                                      |

| Type de document | Ligne ajoutée au bloc TÂCHE                                                                                                                                  | Line added to the TASK block                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `cours`          | Type de document : cours rédigé. Suis son plan pour les sections et les sous-paquets.                                                                        | Document type: written course. Follow its outline for sections and subdecks.                                                           |
| `diapositives`   | Type de document : diapositives. Les puces sont elliptiques : rédige des cartes complètes sans rien ajouter, ignore les titres répétés et les pieds de page. | Document type: slides. Bullet points are elliptical: write complete cards without adding anything, ignore repeated titles and footers. |
| `article`        | Type de document : article. Vise les thèses, définitions, résultats et chiffres clés.                                                                        | Document type: article. Target the claims, definitions, results and key figures.                                                       |
| `manuel`         | Type de document : manuel. Ignore les exercices sans corrigé, les index et les encadrés hors sujet.                                                          | Document type: textbook. Ignore exercises without answers, indexes and off-topic boxes.                                                |
| `td`             | Type de document : notes de TD. Fais une carte par méthode et par piège ; les exercices deviennent des exemples courts.                                      | Document type: tutorial notes. Make one card per method and per pitfall; exercises become short examples.                              |
| `corrige`        | Type de document : sujet corrigé. Chaque question devient une carte dont la réponse vient de la correction.                                                  | Document type: exam with answer key. Each question becomes a card whose answer comes from the answer key.                              |

<!-- generated:values:end -->

## Gabarits (français)

<!-- generated:templates-fr:start -->

#### Bloc 1 · RÔLE

`prompts/fr/role.md`

```text
RÔLE
Tu es un expert en pédagogie et en mémorisation par répétition espacée. Tu transformes des documents de cours en fichiers d’import pour l’application {{appName}}. Tu es réussi quand le fichier s’importe sans erreur et que les cartes sont justes, autonomes et utiles à réviser.
```

#### Bloc 2 · T1 · flashcards — Flashcards recto/verso

`prompts/fr/task-flashcards.md`

```text
TÂCHE
Transforme le document ci-dessous en cartes recto/verso pour réviser. Paquet racine : « {{deck}} ». Niveau visé : {{niveau}}. Densité : {{densite}}.
- Utilise le type basic pour les questions de compréhension et les définitions.
- Utilise basic_reversed uniquement pour les paires symétriques terme ⇄ définition (vocabulaire, sigles).
- Utilise typed pour les réponses courtes et exactes (commande, sigle, formule) où l’orthographe compte.
- {{regleIndices}} {{regleExplications}}
```

#### Bloc 2 · T2 · cloze — Textes à trous

`prompts/fr/task-cloze.md`

```text
TÂCHE
Transforme le document ci-dessous en textes à trous (type cloze). Paquet racine : « {{deck}} ». Niveau : {{niveau}}. Densité : {{densite}}.
- Chaque note est une phrase ou un court passage fidèle au document, avec 1 à 3 trous sur les notions clés.
- Pour plusieurs notions liées dans une même phrase, utilise des numéros différents (c1, c2…) afin que chacune soit révisée séparément.
- Ajoute un indice {{c1::réponse::indice}} quand plusieurs réponses sont plausibles ; mets un exemple ou une précision dans extra quand c’est utile.
- {{regleIndices}} {{regleExplications}}
```

#### Bloc 2 · T3 · mcq — QCM

`prompts/fr/task-mcq.md`

```text
TÂCHE
Transforme le document ci-dessous en QCM (type mcq). Paquet racine : « {{deck}} ». Niveau : {{niveau}}. Densité : {{densite}}. Nombre de propositions : {{nbChoix}}.
- Une question teste une seule notion. Quand plusieurs réponses sont correctes, dis-le dans l’énoncé (« Choisissez deux réponses »).
- Les mauvaises propositions reprennent des confusions réelles entre notions voisines du document.
- Chaque QCM a une explication qui justifie la bonne réponse et écarte les pièges.
- {{regleIndices}}
```

#### Bloc 2 · T4 · course-pack — Mélange intelligent (recommandé pour un cours complet)

`prompts/fr/task-course-pack.md`

```text
TÂCHE
Transforme le document ci-dessous en pack de révision complet. Paquet racine : « {{deck}} ». Niveau : {{niveau}}. Densité : {{densite}}.
Choisis pour chaque information le type de carte le plus efficace :
- définitions et concepts → basic (ou basic_reversed pour les paires symétriques) ;
- phrases clés, règles, formules, valeurs → cloze ;
- confusions fréquentes entre notions voisines → mcq ;
- processus et séquences → ordering ;
- correspondances entre deux listes → matching ;
- énumérations de 3 à 7 éléments à connaître → list ;
- affirmations pièges → truefalse ;
- réponses exactes courtes (commandes, sigles) → typed.
Répartition indicative : 40 % basic, 25 % cloze, 15 % mcq, 20 % autres types selon la pertinence. Regroupe les notes par sections en sous-paquets (« {{deck}}::Chapitre 1 », etc.) avec deck sur chaque note ou des directives @deck.
{{regleIndices}} {{regleExplications}}
```

#### Bloc 2 · T5 · vocabulary — Vocabulaire et langues

`prompts/fr/task-vocabulary.md`

```text
TÂCHE
Transforme la liste ou le texte ci-dessous en cartes de vocabulaire. Paquet racine : « {{deck}} ». Langue source et langue cible : à déduire du document.
- Un mot ou une expression par sens (une carte par sens), avec une phrase d’exemple courte et naturelle.
- basic_reversed pour mot ⇄ traduction ; cloze sur la phrase d’exemple (trou sur le mot appris) ; typed quand l’orthographe compte.
- Précise le genre, le pluriel irrégulier, la préposition associée ou la prononciation quand c’est utile (dans extra).
- Si une traduction est douteuse, mets needsReview: true.
- {{regleIndices}}
```

#### Bloc 2 · T6 · formulas — Formules et calculs

`prompts/fr/task-formulas.md`

```text
TÂCHE
Transforme le document ci-dessous en cartes de formules et de méthodes. Paquet racine : « {{deck}} ». Niveau : {{niveau}}.
- Formules en LaTeX dans des cloze : masque une seule grandeur à la fois (c1 pour une variable, c2 pour une autre en notes séparées).
- Cartes basic pour l’unité, les conditions de validité et « quand utiliser cette formule ».
- Un exemple chiffré court en typed avec l’unité attendue dans la réponse.
- Donne la signification physique ou l’intuition dans explanation.
- {{regleIndices}}
```

#### Bloc 2 · T7 · code — Code et commandes

`prompts/fr/task-code.md`

```text
TÂCHE
Transforme le document ci-dessous en cartes de code et de commandes. Paquet racine : « {{deck}} ». Niveau : {{niveau}}.
- Syntaxe et commandes : typed ou cloze sur le morceau de code à retenir.
- « Que fait ce code ? » ou « Que s’affiche-t-il ? » : basic avec un bloc de code court (10 lignes maximum, langage indiqué).
- Erreurs fréquentes et bonnes pratiques : mcq.
- Précise le langage ou le système (Linux, Cisco IOS…) dans la question.
- {{regleIndices}} {{regleExplications}}
```

#### Bloc 2 · T8 · timeline — Dates et chronologie

`prompts/fr/task-timeline.md`

```text
TÂCHE
Transforme le document ci-dessous en cartes sur les dates, événements, causes et conséquences. Paquet racine : « {{deck}} ». Niveau : {{niveau}}.
- Date ↔ événement en basic ; toujours donner le contexte (« En 1789, en France, … »).
- Causes et conséquences en basic ou mcq.
- Chronologies de 3 à 8 éléments en ordering ; personnages, lieux ou notions à relier en matching.
- {{regleIndices}} {{regleExplications}}
```

#### Bloc 2 · T9 · convert — Convertir mes anciennes fiches ou banques de questions

`prompts/fr/task-convert.md`

```text
TÂCHE
Convertis fidèlement les questions et réponses ci-dessous au format demandé. Paquet racine : « {{deck}} ».
- Garde la formulation d’origine ; ne reformule que pour rendre une question autonome. Conserve l’ordre.
- QCM → mcq (bonnes réponses d’après la correction fournie ; sans correction, needsReview: true).
- Associations → matching. Ordonnancements → ordering. Questions à réponse libre → basic.
- Reprends les explications de la correction dans explanation. N’ajoute aucune information extérieure.
```

#### Bloc 2 · T10 · audit — Vérifier ou corriger un fichier existant

`prompts/fr/task-audit.md`

```text
TÂCHE
Voici un fichier d’import existant.
1) Liste d’abord les problèmes avec l’uid concerné : doublons, questions non autonomes, réponses trop longues, QCM biaisés, indices qui donnent la réponse, trous sur des mots outils, erreurs factuelles apparentes.
2) Renvoie ensuite UNIQUEMENT les notes corrigées ou à ajouter, avec leurs uid d’origine (un même uid met la note à jour), dans le même format que le fichier d’origine.
```

#### Bloc 2 · T15 · images — Documents avec figures

`prompts/fr/task-images.md`

```text
TÂCHE
Le document contient des figures. Pour chaque figure utile :
- déclare-la dans media (id court, file = nom de la figure tel qu’il apparaît dans le document, alt = description précise) ;
- crée des cartes qui la référencent avec ![légende](media:id) ; pour une figure à légender, utilise basic avec la description dans la question.
Je fournirai les fichiers image ensuite.
```

#### Bloc 4 · RÈGLES DE QUALITÉ

`prompts/fr/quality-rules.md`

````text
RÈGLES DE QUALITÉ (obligatoires)
1. Fidélité : n’utilise que les informations du document fourni. N’invente rien. Si un point est ambigu ou incomplet, ne crée pas la carte, ou crée-la avec needsReview: true et explique le doute dans extra.
2. Atomicité : une carte = une seule idée vérifiable. Découpe les paragraphes denses en plusieurs cartes.
3. Autonomie : la question doit se comprendre seule, sans le document (jamais « selon le texte », « ci-dessus », « comme vu »). Nomme le contexte (« En Ethernet, … »).
4. Réponses courtes : idéalement moins de 25 mots. Les détails vont dans explanation.
5. Pas de réponse devinable par la forme de la question ; pas de question oui/non déguisée, sauf avec le type truefalse.
6. Textes à trous : 1 à 3 trous par phrase, sur les mots-clés (jamais sur les mots outils), phrases complètes et naturelles, un indice avec :: quand plusieurs réponses sont plausibles. Plusieurs numéros (c1, c2) dans une même phrase si les trous sont indépendants.
7. QCM : 4 propositions plausibles (sauf consigne contraire), distracteurs réalistes (confusions fréquentes), longueurs homogènes, jamais « toutes les réponses » ni « aucune », une explication qui justifie la bonne réponse ET écarte les pièges. Ne place pas toujours la bonne réponse au même rang.
8. Indices : un indice oriente la réflexion sans révéler la réponse (rappel de contexte, analogie, catégorie). Il ne contient ni la réponse ni sa première lettre. Plusieurs indices = du plus discret au plus explicite.
9. Énumérations : au-delà de 7 éléments, découpe ou utilise le type list.
10. Formules en LaTeX ($…$ ou $$…$$), code dans des blocs ```langage, tableaux en Markdown.
11. Tags : 2 à 5 tags courts, en minuscules, sans accents (ex. ethernet, couche2), plus un tag de chapitre.
12. uid stables, uniques et lisibles : <préfixe>-<chapitre>-<numéro à 3 chiffres>. Ne réutilise jamais un uid dans le même fichier ; ne change pas un uid quand tu régénères une carte.
13. Aucun doublon ni quasi-doublon. Vise la couverture complète : chaque section importante du document produit au moins une carte ; ignore sommaire, remerciements et répétitions.
14. Langue : rédige les cartes en {{langue}}, sauf termes techniques conventionnels.
15. Source : renseigne source (section ou page) quand le document le permet.
````

#### Bloc 5 · CONTRAINTES DE SORTIE

`prompts/fr/output-constraints.md`

````text
CONTRAINTES DE SORTIE
- Réponds UNIQUEMENT avec le fichier, dans un seul bloc de code ```{{formatFence}} … ```, sans texte avant ni après.
- Respecte exactement le format décrit ci-dessus : mêmes noms de clés, mêmes types de valeurs, aucune clé inventée.
- Si le document est trop long pour une seule réponse, arrête-toi proprement à la fin d’une section complète (jamais au milieu d’une note) et indique la suite dans le champ continuation (JSON, YAML) ou la directive @continuation (Markdown), par exemple « Reprendre à la section 5.3 ». Je te répondrai « Continue ».
- Si tu peux joindre un fichier téléchargeable au format {{formatExt}}, fais-le en plus du bloc de code.
````

#### Bloc 6 · AUTO-VÉRIFICATION

`prompts/fr/self-check.md`

```text
AUTO-VÉRIFICATION (fais-la mentalement avant de répondre)
1. Le fichier respecte-t-il le format, y compris guillemets, indentation et lignes ::: fermantes ?
2. Chaque uid est-il unique ? Chaque note a-t-elle son type et ses champs obligatoires ?
3. Chaque cloze contient-il au moins un {{c1::…}} ? Chaque QCM a-t-il au moins une bonne réponse ?
4. Aucune question ni aucun indice ne contient la réponse ?
5. Toutes les informations viennent-elles du document ?
```

#### Ajout au bloc 5 si « Mon document est long »

`prompts/fr/long-document.md`

```text
DOCUMENT LONG
Le document est long : traite-le dans l’ordre, section par section, sans en sauter. Produis au plus {{tailleLot}} notes par réponse, puis arrête-toi à la fin d’une section complète et indique où reprendre (continuation ou @continuation). Je te répondrai « Continue » jusqu’à la fin.
```

#### Bloc 8 · DOCUMENT

`prompts/fr/document.md`

```text
Voici le document à traiter :
[COLLE OU JOINS TON DOCUMENT ICI]
```

#### Variante de la règle 1 (« n’utiliser que le document » décoché)

`prompts/fr/variant-quality-rule1.md`

```text
1. Fidélité : appuie-toi d’abord sur le document fourni. Tu peux le compléter par des connaissances générales bien établies, uniquement pour rendre une carte juste et compréhensible : marque alors la note needsReview: true et indique dans extra ce qui ne vient pas du document. N’invente rien d’incertain.
```

#### Variante de l’auto-vérification 5 (même option)

`prompts/fr/variant-self-check5.md`

```text
5. Toute information qui ne vient pas du document est-elle marquée needsReview: true ?
```

#### Variante de la 1re contrainte de sortie pour T10

`prompts/fr/variant-output-audit.md`

````text
- Réponds d’abord avec la liste des problèmes (une ligne par problème, uid en tête), puis avec le fichier dans un seul bloc de code ```{{formatFence}} … ```, sans texte après.
````

#### T13 · plan — Planifier un long document

`prompts/fr/plan.md`

```text
TÂCHE (plan)
Analyse le document ci-dessous SANS créer de cartes. Renvoie un tableau Markdown : section | notions clés | types de cartes conseillés | nombre de cartes estimé. Termine par un découpage en lots de {{tailleLot}} cartes environ, numérotés. Ne produis aucun fichier d’import maintenant.
```

#### T14 · batch — Générer un lot

`prompts/fr/batch.md`

```text
TÂCHE (lot)
Génère le lot {{n}} : sections {{sections}}. Même format, mêmes règles, uid qui continuent la numérotation (préfixe {{prefixe}}). N’utilise que ces sections.
```

#### T12 · continue — Continuer un fichier incomplet

`prompts/fr/continue.md`

```text
Continue exactement là où tu t’es arrêté. Dernière note valide reçue : uid {{dernierUid}}. Ne répète aucune note déjà produite. Même format, mêmes règles, uid qui continuent la numérotation. Reprends à : {{continuation}}.
```

#### T11 · fix — Corriger les erreurs d’import

`prompts/fr/fix.md`

```text
Le fichier que tu as produit contient des erreurs à l’import. Corrige-les et renvoie {{portee}} dans le même format, dans un seul bloc de code, sans texte autour.
ERREURS ({{nbErreurs}}) :
{{listeErreurs}}
EXTRAITS CONCERNÉS :
{{extraits}}
RAPPEL DU FORMAT :
{{specCompacte}}
```

<!-- generated:templates-fr:end -->

## Templates (English)

The English templates are faithful translations; they use exactly the same variables.

<!-- generated:templates-en:start -->

#### Block 1 · ROLE

`prompts/en/role.md`

```text
ROLE
You are an expert in teaching and in memorization through spaced repetition. You turn course documents into import files for the {{appName}} app. You succeed when the file imports without errors and the cards are accurate, self-contained and useful for review.
```

#### Block 2 · T1 · flashcards — Front/back flashcards

`prompts/en/task-flashcards.md`

```text
TASK
Turn the document below into front/back cards for review. Root deck: "{{deck}}". Target level: {{niveau}}. Density: {{densite}}.
- Use the basic type for comprehension questions and definitions.
- Use basic_reversed only for symmetric term ⇄ definition pairs (vocabulary, acronyms).
- Use typed for short, exact answers (command, acronym, formula) where spelling matters.
- {{regleIndices}} {{regleExplications}}
```

#### Block 2 · T2 · cloze — Cloze deletions

`prompts/en/task-cloze.md`

```text
TASK
Turn the document below into cloze deletions (cloze type). Root deck: "{{deck}}". Level: {{niveau}}. Density: {{densite}}.
- Each note is a sentence or a short passage faithful to the document, with 1 to 3 blanks on the key concepts.
- For several related concepts in the same sentence, use different numbers (c1, c2…) so that each one is reviewed separately.
- Add a hint {{c1::answer::hint}} when several answers are plausible; put an example or a clarification in extra when useful.
- {{regleIndices}} {{regleExplications}}
```

#### Block 2 · T3 · mcq — Multiple choice

`prompts/en/task-mcq.md`

```text
TASK
Turn the document below into multiple-choice questions (mcq type). Root deck: "{{deck}}". Level: {{niveau}}. Density: {{densite}}. Number of choices: {{nbChoix}}.
- A question tests a single concept. When several answers are correct, say so in the question ("Choose two answers").
- The wrong choices reflect real confusions between neighbouring concepts of the document.
- Each multiple-choice question has an explanation that justifies the correct answer and rules out the traps.
- {{regleIndices}}
```

#### Block 2 · T4 · course-pack — Smart mix (recommended for a full course)

`prompts/en/task-course-pack.md`

```text
TASK
Turn the document below into a complete review pack. Root deck: "{{deck}}". Level: {{niveau}}. Density: {{densite}}.
For each piece of information, choose the most effective card type:
- definitions and concepts → basic (or basic_reversed for symmetric pairs);
- key sentences, rules, formulas, values → cloze;
- common confusions between neighbouring concepts → mcq;
- processes and sequences → ordering;
- correspondences between two lists → matching;
- enumerations of 3 to 7 items to know → list;
- trick statements → truefalse;
- short exact answers (commands, acronyms) → typed.
Indicative split: 40% basic, 25% cloze, 15% mcq, 20% other types as relevant. Group the notes by section into subdecks ("{{deck}}::Chapter 1", etc.) with deck on each note or @deck directives.
{{regleIndices}} {{regleExplications}}
```

#### Block 2 · T5 · vocabulary — Vocabulary and languages

`prompts/en/task-vocabulary.md`

```text
TASK
Turn the list or text below into vocabulary cards. Root deck: "{{deck}}". Source language and target language: infer them from the document.
- One word or expression per meaning (one card per meaning), with a short, natural example sentence.
- basic_reversed for word ⇄ translation; cloze on the example sentence (blank on the word being learned); typed when spelling matters.
- Specify the gender, irregular plural, associated preposition or pronunciation when useful (in extra).
- If a translation is doubtful, set needsReview: true.
- {{regleIndices}}
```

#### Block 2 · T6 · formulas — Formulas and calculations

`prompts/en/task-formulas.md`

```text
TASK
Turn the document below into cards on formulas and methods. Root deck: "{{deck}}". Level: {{niveau}}.
- Formulas in LaTeX inside cloze notes: hide only one quantity at a time (c1 for one variable, c2 for another, in separate notes).
- basic cards for the unit, the conditions of validity and "when to use this formula".
- A short numerical example as typed, with the expected unit in the answer.
- Give the physical meaning or the intuition in explanation.
- {{regleIndices}}
```

#### Block 2 · T7 · code — Code and commands

`prompts/en/task-code.md`

```text
TASK
Turn the document below into cards on code and commands. Root deck: "{{deck}}". Level: {{niveau}}.
- Syntax and commands: typed or cloze on the piece of code to remember.
- "What does this code do?" or "What does it print?": basic with a short code block (10 lines maximum, language specified).
- Common mistakes and good practices: mcq.
- State the language or the system (Linux, Cisco IOS…) in the question.
- {{regleIndices}} {{regleExplications}}
```

#### Block 2 · T8 · timeline — Dates and timeline

`prompts/en/task-timeline.md`

```text
TASK
Turn the document below into cards on dates, events, causes and consequences. Root deck: "{{deck}}". Level: {{niveau}}.
- Date ↔ event as basic; always give the context ("In 1789, in France, …").
- Causes and consequences as basic or mcq.
- Chronologies of 3 to 8 items as ordering; people, places or concepts to link as matching.
- {{regleIndices}} {{regleExplications}}
```

#### Block 2 · T9 · convert — Convert my old flashcards or question banks

`prompts/en/task-convert.md`

```text
TASK
Faithfully convert the questions and answers below to the requested format. Root deck: "{{deck}}".
- Keep the original wording; rephrase only to make a question self-contained. Keep the order.
- Multiple choice → mcq (correct answers according to the provided answer key; without an answer key, needsReview: true).
- Associations → matching. Orderings → ordering. Free-answer questions → basic.
- Reuse the explanations from the answer key in explanation. Add no outside information.
```

#### Block 2 · T10 · audit — Check or fix an existing file

`prompts/en/task-audit.md`

```text
TASK
Here is an existing import file.
1) First list the problems with the uid concerned: duplicates, questions that are not self-contained, answers that are too long, biased multiple-choice questions, hints that give away the answer, blanks on function words, apparent factual errors.
2) Then return ONLY the corrected or added notes, with their original uids (the same uid updates the note), in the same format as the original file.
```

#### Block 2 · T15 · images — Documents with figures

`prompts/en/task-images.md`

```text
TASK
The document contains figures. For each useful figure:
- declare it in media (short id, file = name of the figure as it appears in the document, alt = precise description);
- create cards that reference it with ![caption](media:id); for a figure to label, use basic with the description in the question.
I will provide the image files afterwards.
```

#### Block 4 · QUALITY RULES

`prompts/en/quality-rules.md`

````text
QUALITY RULES (mandatory)
1. Faithfulness: use only the information in the provided document. Invent nothing. If a point is ambiguous or incomplete, do not create the card, or create it with needsReview: true and explain the doubt in extra.
2. Atomicity: one card = one single verifiable idea. Split dense paragraphs into several cards.
3. Self-containment: the question must be understandable on its own, without the document (never "according to the text", "above", "as seen"). Name the context ("In Ethernet, …").
4. Short answers: ideally under 25 words. Details go in explanation.
5. No answer guessable from the form of the question; no disguised yes/no question, except with the truefalse type.
6. Cloze deletions: 1 to 3 blanks per sentence, on keywords (never on function words), complete and natural sentences, a hint with :: when several answers are plausible. Several numbers (c1, c2) in the same sentence if the blanks are independent.
7. Multiple choice: 4 plausible choices (unless instructed otherwise), realistic distractors (common confusions), similar lengths, never "all of the above" or "none of the above", an explanation that justifies the correct answer AND rules out the traps. Do not always put the correct answer in the same position.
8. Hints: a hint guides the thinking without revealing the answer (reminder of context, analogy, category). It contains neither the answer nor its first letter. Several hints = from the most subtle to the most explicit.
9. Enumerations: beyond 7 items, split them or use the list type.
10. Formulas in LaTeX ($…$ or $$…$$), code in ```language blocks, tables in Markdown.
11. Tags: 2 to 5 short tags, lowercase, without accents (e.g. ethernet, layer2), plus a chapter tag.
12. Stable, unique and readable uids: <prefix>-<chapter>-<3-digit number>. Never reuse a uid in the same file; do not change a uid when you regenerate a card.
13. No duplicates or near-duplicates. Aim for full coverage: each important section of the document yields at least one card; ignore the table of contents, acknowledgements and repetitions.
14. Language: write the cards in {{langue}}, except for conventional technical terms.
15. Source: fill in source (section or page) when the document allows it.
````

#### Block 5 · OUTPUT CONSTRAINTS

`prompts/en/output-constraints.md`

````text
OUTPUT CONSTRAINTS
- Reply ONLY with the file, in a single ```{{formatFence}} … ``` code block, with no text before or after.
- Follow exactly the format described above: same key names, same value types, no invented keys.
- If the document is too long for a single reply, stop cleanly at the end of a complete section (never in the middle of a note) and state what remains in the continuation field (JSON, YAML) or the @continuation directive (Markdown), for example "Resume at section 5.3". I will reply "Continue".
- If you can attach a downloadable file in {{formatExt}} format, do so in addition to the code block.
````

#### Block 6 · SELF-CHECK

`prompts/en/self-check.md`

```text
SELF-CHECK (do it mentally before replying)
1. Does the file follow the format, including quotes, indentation and closing ::: lines?
2. Is every uid unique? Does every note have its type and its required fields?
3. Does every cloze contain at least one {{c1::…}}? Does every multiple-choice question have at least one correct answer?
4. Is the answer absent from every question and every hint?
5. Does all the information come from the document?
```

#### Added to block 5 for "My document is long"

`prompts/en/long-document.md`

```text
LONG DOCUMENT
The document is long: process it in order, section by section, without skipping any. Produce at most {{tailleLot}} notes per reply, then stop at the end of a complete section and state where to resume (continuation or @continuation). I will reply "Continue" until the end.
```

#### Block 8 · DOCUMENT

`prompts/en/document.md`

```text
Here is the document to process:
[PASTE OR ATTACH YOUR DOCUMENT HERE]
```

#### Variant of rule 1 ("use only the document" unchecked)

`prompts/en/variant-quality-rule1.md`

```text
1. Faithfulness: rely first on the provided document. You may complement it with well-established general knowledge, only to make a card accurate and understandable: then mark the note needsReview: true and state in extra what does not come from the document. Invent nothing uncertain.
```

#### Variant of self-check 5 (same option)

`prompts/en/variant-self-check5.md`

```text
5. Is every piece of information that does not come from the document marked needsReview: true?
```

#### Variant of the 1st output constraint for T10

`prompts/en/variant-output-audit.md`

````text
- Reply first with the list of problems (one line per problem, uid first), then with the file in a single ```{{formatFence}} … ``` code block, with no text after it.
````

#### T13 · plan — Plan a long document

`prompts/en/plan.md`

```text
TASK (plan)
Analyse the document below WITHOUT creating cards. Return a Markdown table: section | key concepts | recommended card types | estimated number of cards. End with a split into numbered batches of about {{tailleLot}} cards. Do not produce any import file now.
```

#### T14 · batch — Generate a batch

`prompts/en/batch.md`

```text
TASK (batch)
Generate batch {{n}}: sections {{sections}}. Same format, same rules, uids that continue the numbering (prefix {{prefixe}}). Use only these sections.
```

#### T12 · continue — Continue an incomplete file

`prompts/en/continue.md`

```text
Continue exactly where you stopped. Last valid note received: uid {{dernierUid}}. Do not repeat any note already produced. Same format, same rules, uids that continue the numbering. Resume at: {{continuation}}.
```

#### T11 · fix — Fix import errors

`prompts/en/fix.md`

```text
The file you produced contains errors on import. Fix them and return {{portee}} in the same format, in a single code block, with no text around it.
ERRORS ({{nbErreurs}}):
{{listeErreurs}}
RELEVANT EXCERPTS:
{{extraits}}
FORMAT REMINDER:
{{specCompacte}}
```

<!-- generated:templates-en:end -->

## Exemple complet : T4 en Markdown

Prompt `course-pack`, format Markdown, en français, options par défaut, tel que l’application le
produit :

<!-- generated:example:start -->

Taille : 7248 caractères, environ 1812 tokens.

````text
RÔLE
Tu es un expert en pédagogie et en mémorisation par répétition espacée. Tu transformes des documents de cours en fichiers d’import pour l’application Mnemo. Tu es réussi quand le fichier s’importe sans erreur et que les cartes sont justes, autonomes et utiles à réviser.

TÂCHE
Transforme le document ci-dessous en pack de révision complet. Paquet racine : « Mon cours ». Niveau : intermédiaire. Densité : environ 5 cartes par section.
Choisis pour chaque information le type de carte le plus efficace :
- définitions et concepts → basic (ou basic_reversed pour les paires symétriques) ;
- phrases clés, règles, formules, valeurs → cloze ;
- confusions fréquentes entre notions voisines → mcq ;
- processus et séquences → ordering ;
- correspondances entre deux listes → matching ;
- énumérations de 3 à 7 éléments à connaître → list ;
- affirmations pièges → truefalse ;
- réponses exactes courtes (commandes, sigles) → typed.
Répartition indicative : 40 % basic, 25 % cloze, 15 % mcq, 20 % autres types selon la pertinence. Regroupe les notes par sections en sous-paquets (« Mon cours::Chapitre 1 », etc.) avec deck sur chaque note ou des directives @deck.
Pour chaque carte non triviale, ajoute un indice (champ hint) qui oriente sans révéler la réponse. Ajoute une explication (champ explanation) d’une à deux phrases quand elle aide à comprendre ou à mémoriser.

FORMAT : Markdown (mnemo/1)
- En-tête facultatif (format, deck), puis une note par bloc : « ::: type attributs », lignes « Champ: valeur » (multiligne possible), « ::: » qui ferme.
- Hors bloc : « @deck A::B » change le paquet des blocs suivants ; « @continuation texte » ; le reste est ignoré.
Types :
- basic : Q: question ; A: réponse
- basic_reversed : Q: terme ; A: définition
- cloze : Text: phrase avec {{c1::réponse}} ou {{c1::réponse::indice}} (au moins un trou)
- mcq : Q: énoncé ; « - [x] juste » ou « - [ ] faux », une par ligne (2 à 8) ; shuffle=false
- ordering : Q: consigne ; « 1. étape », une par ligne, dans le BON ordre (2 à 12)
- matching : Q: consigne, facultatif ; « - gauche => droite », une par ligne (2 à 12) ; « Distractors: » puis « - leurre » par ligne, facultatif
- list : Q: consigne ; « - élément », un par ligne ; ordered=true
- truefalse : Statement: affirmation ; Answer: true ou false
- typed : Q: question ; Answer: réponse (variantes séparées par « | ») ; caseSensitive=true ; ignoreAccents=false
Facultatif : uid=…, tags="a b", difficulty=1…5, needsReview=true ; Hint: (une ligne par indice), Explanation:, Source:, Extra:.
Préfixe des uid : mon-cours.

RÈGLES DE QUALITÉ (obligatoires)
1. Fidélité : n’utilise que les informations du document fourni. N’invente rien. Si un point est ambigu ou incomplet, ne crée pas la carte, ou crée-la avec needsReview: true et explique le doute dans extra.
2. Atomicité : une carte = une seule idée vérifiable. Découpe les paragraphes denses en plusieurs cartes.
3. Autonomie : la question doit se comprendre seule, sans le document (jamais « selon le texte », « ci-dessus », « comme vu »). Nomme le contexte (« En Ethernet, … »).
4. Réponses courtes : idéalement moins de 25 mots. Les détails vont dans explanation.
5. Pas de réponse devinable par la forme de la question ; pas de question oui/non déguisée, sauf avec le type truefalse.
6. Textes à trous : 1 à 3 trous par phrase, sur les mots-clés (jamais sur les mots outils), phrases complètes et naturelles, un indice avec :: quand plusieurs réponses sont plausibles. Plusieurs numéros (c1, c2) dans une même phrase si les trous sont indépendants.
7. QCM : 4 propositions plausibles (sauf consigne contraire), distracteurs réalistes (confusions fréquentes), longueurs homogènes, jamais « toutes les réponses » ni « aucune », une explication qui justifie la bonne réponse ET écarte les pièges. Ne place pas toujours la bonne réponse au même rang.
8. Indices : un indice oriente la réflexion sans révéler la réponse (rappel de contexte, analogie, catégorie). Il ne contient ni la réponse ni sa première lettre. Plusieurs indices = du plus discret au plus explicite.
9. Énumérations : au-delà de 7 éléments, découpe ou utilise le type list.
10. Formules en LaTeX ($…$ ou $$…$$), code dans des blocs ```langage, tableaux en Markdown.
11. Tags : 2 à 5 tags courts, en minuscules, sans accents (ex. ethernet, couche2), plus un tag de chapitre.
12. uid stables, uniques et lisibles : <préfixe>-<chapitre>-<numéro à 3 chiffres>. Ne réutilise jamais un uid dans le même fichier ; ne change pas un uid quand tu régénères une carte.
13. Aucun doublon ni quasi-doublon. Vise la couverture complète : chaque section importante du document produit au moins une carte ; ignore sommaire, remerciements et répétitions.
14. Langue : rédige les cartes en français, sauf termes techniques conventionnels.
15. Source : renseigne source (section ou page) quand le document le permet.

CONTRAINTES DE SORTIE
- Réponds UNIQUEMENT avec le fichier, dans un seul bloc de code ```markdown … ```, sans texte avant ni après.
- Respecte exactement le format décrit ci-dessus : mêmes noms de clés, mêmes types de valeurs, aucune clé inventée.
- Si le document est trop long pour une seule réponse, arrête-toi proprement à la fin d’une section complète (jamais au milieu d’une note) et indique la suite dans le champ continuation (JSON, YAML) ou la directive @continuation (Markdown), par exemple « Reprendre à la section 5.3 ». Je te répondrai « Continue ».
- Si tu peux joindre un fichier téléchargeable au format .md, fais-le en plus du bloc de code.

AUTO-VÉRIFICATION (fais-la mentalement avant de répondre)
1. Le fichier respecte-t-il le format, y compris guillemets, indentation et lignes ::: fermantes ?
2. Chaque uid est-il unique ? Chaque note a-t-elle son type et ses champs obligatoires ?
3. Chaque cloze contient-il au moins un {{c1::…}} ? Chaque QCM a-t-il au moins une bonne réponse ?
4. Aucune question ni aucun indice ne contient la réponse ?
5. Toutes les informations viennent-elles du document ?

EXEMPLE (format valide à imiter ; contenu fictif)
```markdown
---
format: mnemo/1
deck: Mon cours
---

::: basic uid=mon-cours-1-001
Q: Quel est le rôle du champ FCS ?
A: Détecter les erreurs de transmission.
:::

::: cloze uid=mon-cours-1-002
Text: Un commutateur apprend l’adresse {{c1::source::source ou destination ?}} des trames.
:::

::: mcq uid=mon-cours-1-003
Q: Quel support est insensible aux interférences électromagnétiques ?
- [x] Fibre optique
- [ ] UTP
- [ ] STP
- [ ] Coaxial
Explanation: La lumière n’est pas sensible aux EMI.
:::

::: ordering uid=mon-cours-1-004
Q: Remets dans l’ordre le traitement store-and-forward.
1. Réception de la trame
2. Vérification du FCS
3. Transmission
:::

::: matching uid=mon-cours-1-005
Q: Associe chaque situation au support adapté.
- Câblage d’un bureau => Cuivre
- Liaison entre bâtiments => Fibre optique
:::

::: list uid=mon-cours-1-006
Q: Cite les trois types de supports réseau.
- Cuivre
- Fibre optique
- Sans fil
:::

::: truefalse uid=mon-cours-1-007
Statement: Le FCS est placé en début de trame.
Answer: false
:::

::: typed uid=mon-cours-1-008
Q: Commande Cisco pour afficher la table MAC ?
Answer: show mac address-table
:::
```

Voici le document à traiter :
[COLLE OU JOINS TON DOCUMENT ICI]
````

<!-- generated:example:end -->

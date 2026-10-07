# Algorithmes de révision

Mnemo propose cinq algorithmes (« planificateurs ») qui décident **quand** chaque carte revient.
Chaque préréglage (_preset_) choisit un algorithme et ses paramètres ; vous pouvez en changer à tout
moment, vos cartes sont alors converties (voir [Changer d’algorithme](#changer-dalgorithme)).

| Algorithme  | Pour qui ?                                   | Idée en une phrase                                               |
| ----------- | -------------------------------------------- | ---------------------------------------------------------------- |
| **FSRS**    | Tout le monde (recommandé, réglage Standard) | Modélise votre mémoire carte par carte et vise 90 % de réussite. |
| **Anki**    | Habitués d’Anki                              | SM-2 amélioré : étapes courtes puis intervalles × « facilité ».  |
| **SM-2**    | Curieux, puristes                            | L’algorithme historique de SuperMemo (1987).                     |
| **Leitner** | Méthode papier, enfants                      | Des boîtes numérotées, chacune avec un délai fixe.               |
| **Échelle** | Débutants                                    | Une liste fixe de délais : chaque réussite monte d’un barreau.   |

## Vocabulaire commun

- **Les quatre boutons** : « À revoir » (1, oublié), « Difficile » (2), « Bien » (3), « Facile » (4).
  Avec 2 ou 3 boutons, les boutons absents ne sont simplement pas proposés.
- **États d’une carte** : _nouvelle_ (jamais vue), _en apprentissage_ (premières présentations
  rapprochées), _en révision_ (intervalles en jours), _en réapprentissage_ (oubliée, revue à court
  terme avant de repartir en révision).
- **Intervalle** : délai jusqu’à la prochaine présentation, exprimé en jours (fractions de jour pour
  les étapes en minutes).
- **Jour d’étude** : les délais en jours tombent toujours **au début d’un jour d’étude** (par défaut
  4 h du matin, dans votre fuseau horaire, changements d’heure compris). Une carte « à 1 jour »
  revue à 23 h revient donc le lendemain dès 4 h, pas 24 h plus tard. Les délais de moins d’un jour
  (1 min, 10 min…) sont exacts.
- **Variation aléatoire (fuzz)** : léger décalage des intervalles pour que les cartes apprises
  ensemble ne reviennent pas toutes le même jour. Elle est reproductible : le libellé affiché sur un
  bouton correspond exactement à ce qui sera programmé.

## FSRS (recommandé)

FSRS (_Free Spaced Repetition Scheduler_, version 6, via la bibliothèque libre `ts-fsrs`) estime
pour chaque carte une **stabilité** (en jours : le temps au bout duquel vous avez encore 90 % de
chances de vous en souvenir) et une **difficulté** (de 1 à 10). À chaque réponse, ces deux valeurs
sont mises à jour, puis la carte est programmée au moment où la probabilité de rappel tombe à la
**rétention souhaitée**.

- « À revoir » : la stabilité chute, la carte passe en réapprentissage (étapes courtes).
- « Difficile » : la stabilité augmente peu, la difficulté augmente.
- « Bien » : la stabilité augmente normalement.
- « Facile » : la stabilité augmente beaucoup, la difficulté baisse.

| Paramètre                 | Défaut       | Effet                                                                                                                                                   |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rétention souhaitée       | 0,90         | Entre 0,70 et 0,99. Plus haut = beaucoup plus de révisions ; plus bas = moins de travail.                                                               |
| Intervalle maximal        | 36 500 j     | Plafond de tout intervalle.                                                                                                                             |
| Étapes d’apprentissage    | 1m, 10m      | Revues le jour même d’une carte nouvelle. Vide = FSRS décide seul.                                                                                      |
| Étapes de réapprentissage | 10m          | Revues le jour même d’une carte oubliée.                                                                                                                |
| Variation aléatoire       | activée      | Étale la charge.                                                                                                                                        |
| Révisions le jour même    | activé       | (Avancé) Désactivé : les étapes sont ignorées, une carte passe directement en révision.                                                                 |
| Poids du modèle (w)       | poids FSRS-6 | (Avancé) 21 nombres (17 ou 19 acceptés). Ne les changez que s’ils sont optimisés sur votre historique ; « Réinitialiser » remet les valeurs par défaut. |

Les étapes s’écrivent en minutes (`m`), heures (`h`) ou jours (`d`/`j`) ; une étape d’un jour ou plus
fait directement passer la carte en révision.

## Anki (SM-2 amélioré)

**Apprentissage** (cartes nouvelles et en apprentissage, étapes par défaut 1 min puis 10 min) :

- « À revoir » : retour à la première étape.
- « Difficile » : répète l’étape en cours (sur la première étape : à mi-chemin entre la 1ʳᵉ et la
  2ᵉ, ou 1,5 × l’étape s’il n’y en a qu’une).
- « Bien » : étape suivante ; après la dernière, la carte passe en révision avec l’**intervalle de
  sortie** (1 jour).
- « Facile » : passe directement en révision avec l’**intervalle « Facile »** (4 jours).

**Révision** (intervalle actuel _I_, facilité _F_, 2,5 au départ) :

- « Difficile » : _I_ × 1,2 (au moins _I_ + 1 jour), facilité − 0,15.
- « Bien » : _I_ × _F_ × modificateur d’intervalle, au moins un jour de plus que « Difficile ».
- « Facile » : intervalle « Bien » × bonus Facile (1,3), facilité + 0,15.
- « À revoir » : oubli (_lapse_). Facilité − 0,20, la carte passe en réapprentissage (étape 10 min).
  À la fin des étapes, elle revient avec un nouvel intervalle = max(intervalle minimal après oubli,
  _I_ × pourcentage conservé). En réapprentissage, « Facile » ajoute un jour à cet intervalle.

La facilité ne descend jamais sous 1,3. La variation aléatoire (± 5 % environ, au moins ± 1 jour)
ne s’applique qu’aux intervalles d’au moins 3 jours, ne dépasse jamais l’intervalle maximal et ne
ramène jamais un intervalle qui a grandi à sa valeur précédente.

| Paramètre                         | Défaut                                                |
| --------------------------------- | ----------------------------------------------------- |
| Étapes d’apprentissage            | 1, 10 min                                             |
| Intervalle de sortie              | 1 j                                                   |
| Intervalle « Facile »             | 4 j                                                   |
| Étapes de réapprentissage         | 10 min                                                |
| Nouvel intervalle après un oubli  | 0 %                                                   |
| Intervalle minimal après un oubli | 1 j                                                   |
| Facilité de départ                | 2,5                                                   |
| Bonus « Facile »                  | 1,3                                                   |
| Multiplicateur « Difficile »      | 1,2                                                   |
| Modificateur d’intervalle         | 1,0                                                   |
| Intervalle maximal                | 36 500 j                                              |
| Variation aléatoire               | activée                                               |
| Facilité minimale (avancé)        | 1,3                                                   |
| Variations de facilité (avancé)   | −0,20 / −0,15 / +0,15 (À revoir / Difficile / Facile) |

Cette implémentation suit les descriptions publiques de l’algorithme ; elle ne reprend pas le code
d’Anki.

## SM-2 (SuperMemo-2)

L’algorithme original de P. Woźniak. Chaque bouton correspond à une **note de 0 à 5** (par défaut :
À revoir = 1, Difficile = 3, Bien = 4, Facile = 5 ; modifiable dans les réglages avancés, dans
l’ordre croissant).

- Note ≥ 3 (réussite) : 1ʳᵉ réussite → 1 jour, 2ᵉ → 6 jours, ensuite intervalle précédent × EF
  (arrondi).
- Note < 3 (échec) : la série repart de zéro, la carte revient dans 1 jour (compté comme un oubli si
  elle était déjà en révision).
- Après chaque réponse, le facteur de facilité EF devient
  EF + (0,1 − (5 − q) × (0,08 + (5 − q) × 0,02)), sans descendre sous 1,3.

Paramètres : facilité de départ (2,5), intervalle maximal (36 500 j), table des notes.
Il n’y a pas d’étapes en minutes : toute carte est revue au plus tôt le lendemain.

## Boîtes de Leitner

Chaque carte est dans une boîte numérotée ; chaque boîte a un délai fixe (par défaut 5 boîtes :
1, 2, 4, 8 et 16 jours).

- « Bien » : boîte suivante ; « Facile » : deux boîtes plus loin (sans dépasser la dernière).
- « Difficile » : même boîte.
- « À revoir » : retour à la boîte 1 (ou, au choix, une seule boîte en arrière).
- Une carte nouvelle entre dans la boîte 1 (À revoir / Difficile), 2 (Bien) ou 3 (Facile).

Le nombre de valeurs dans « Intervalle de chaque boîte » doit être égal au nombre de boîtes.

## Échelle simple

Une liste fixe de délais, par défaut 10m, 1d, 3d, 1w, 2w, 1mo, 3mo, 6mo (`1mo` = 30 jours).

- « Bien » : barreau suivant ; « Facile » : saute un barreau ; « Difficile » : même barreau.
- « À revoir » : retour en bas de l’échelle (ou, au choix, un ou deux barreaux plus bas).
- Une carte nouvelle démarre sur le premier barreau (ou le deuxième avec « Facile »).
- Un barreau de moins d’un jour garde la carte en apprentissage (délai exact) ; à partir d’un jour,
  la carte est en révision.

Les barreaux doivent être en ordre croissant, sans dépasser 100 ans.

## Indices, sangsues et limites

- **Indices** : si vous avez demandé un indice, la politique du préréglage (`hintPolicy`) est
  appliquée **avant** l’algorithme par la couche d’étude : « aucune » (la note reste inchangée),
  « plafonner à Bien » (Facile devient Bien) ou « forcer Difficile » (toute réponse réussie avec
  indice compte comme Difficile). L’algorithme ne voit que la note finale.
- **Sangsues** : les algorithmes ne gèrent pas les cartes « sangsues ». Le compteur d’oublis
  (`lapses`) qu’ils tiennent à jour est comparé au seuil du préréglage (`leechThreshold`, 8 par
  défaut) par la couche commune, qui étiquette ou suspend la carte.
- **Limites quotidiennes** (nouvelles cartes, révisions, ordre, mélange) : gérées par la file
  d’étude, indépendamment de l’algorithme.

## Changer d’algorithme

Quand vous changez l’algorithme d’un préréglage, chaque carte est convertie. L’écran de
confirmation affiche le nombre de cartes dues aujourd’hui, demain et sur 7 jours **avant et après**
la conversion. Les champs communs conservés sont : état, échéance, intervalle, facilité, nombre de
révisions, nombre d’oublis, date de dernière révision. L’historique des révisions n’est jamais
modifié.

| Vers →      | Ce qui arrive à chaque carte                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Toutes      | Une carte **nouvelle reste nouvelle**. Les données propres à l’ancien algorithme sont effacées. L’échéance est conservée, sauf si elle dépasse le nouvel intervalle maximal.                                                                                             |
| **FSRS**    | Stabilité ≈ intervalle actuel (définition de FSRS à 90 %). Difficulté déduite de la facilité : 2,5 → 5 ; 1,3 → 10 ; ≥ 3,46 → 1 (linéaire) ; sans facilité (Leitner, Échelle) → 5. Les cartes en (ré)apprentissage restent dans cet état, à l’étape la plus proche.       |
| **Anki**    | Facilité conservée ; sinon déduite de la difficulté FSRS (inverse de la ligne ci-dessus) ; sinon facilité de départ. Intervalle arrondi au jour. (Ré)apprentissage : étape la plus proche ; après un réapprentissage, intervalle minimal après oubli.                    |
| **SM-2**    | Toutes les cartes vues passent en révision. Facilité comme pour Anki (jamais sous 1,3). La série de réussites est estimée : intervalle ≥ 6 j → la prochaine réussite multiplie par EF ; plus court → prochaine réussite à 6 j ; (ré)apprentissage → série remise à zéro. |
| **Leitner** | Boîte dont le délai est le plus proche de l’intervalle actuel ; une carte en (ré)apprentissage va en boîte 1. L’échéance est ramenée au délai de la boîte si elle était plus lointaine.                                                                                  |
| **Échelle** | Barreau dont le délai est le plus proche de l’intervalle actuel ; l’échéance est ramenée au délai du barreau si elle était plus lointaine.                                                                                                                               |

## Simulateur de charge

Le simulateur estime, jour par jour, le nombre de révisions, de nouvelles cartes, d’oublis et les
minutes d’étude pour un algorithme et des réglages donnés, sur 30 à 365 jours. Il joue un
utilisateur fictif qui se souvient de chaque carte avec une probabilité fixe (la « rétention »,
par exemple 90 %) : réussite = « Bien », échec = « À revoir ». Les étapes du jour même sont
comptées comme des révisions. Durées par défaut : 8 s par révision, 20 s par nouvelle carte.

Le résultat est **reproductible** : la même graine (affichée) donne exactement les mêmes chiffres.
Il sert à comparer des réglages (par exemple rétention 0,85 contre 0,95), pas à prédire votre
avenir au jour près.

## Préréglages fournis

| Préréglage                 | Algorithme | Réglages principaux                                       |
| -------------------------- | ---------- | --------------------------------------------------------- |
| Débutant (simple)          | Échelle    | 10 nouvelles cartes / jour                                |
| **Standard** (par défaut)  | FSRS       | rétention 0,90, 20 nouvelles / jour                       |
| Examen dans 30 jours       | Anki       | intervalle maximal 30 j, étapes 1/10/60 min, 40 / jour    |
| Mémoire longue (FSRS 0,90) | FSRS       | rétention 0,90, intervalle max 100 ans, 10 / jour         |
| Langues                    | FSRS       | rétention 0,88, 25 / jour, nouvelles mêlées aux révisions |

Un préréglage peut être exporté dans un fichier (`format: "mnemo-preset/1"`) puis réimporté :
l’import vérifie la structure, l’algorithme et chaque paramètre, et complète les paramètres manquants
par leurs valeurs par défaut.

## Pour les développeurs : ajouter un algorithme

Un algorithme implémente l’interface `Scheduler<P>` (`packages/core/src/scheduling/types.ts`) :

- `id`, `label`, `description` (textes `{ fr, en }`) ;
- `paramSpec` : description de chaque paramètre (le formulaire de réglages est généré à partir de
  cette liste, avec info-bulles `help`) ; `defaults` ; `validate(params)` qui complète les valeurs
  par défaut et lève `ParamValidationError` (de préférence avec un schéma Zod) ;
- `initCard`, `schedule(card, rating, ctx)`, `preview(card, ctx)` (doit donner exactement le
  résultat de `schedule` pour chaque note), `adopt(card, ctx)` (conversion depuis un autre
  algorithme).

Règles : fonctions pures ; jamais `Date.now()` ni `Math.random()` — utiliser `ctx.now` et
`ctx.rng` ; délais en jours via `ctx.startOfDay(n)`, délais de moins d’un jour via
`ctx.now + ms` ; jamais d’intervalle négatif, `NaN` ou au-delà du maximum.

```ts
import { registerScheduler } from '@mnemo/core';

registerScheduler(myScheduler); // apparaît aussitôt dans la liste des algorithmes
```

Ajoutez ensuite l’algorithme à `BUILTIN_SCHEDULERS` si vous voulez qu’il bénéficie des tests de
propriétés communs (`properties.test.ts`) et du test de simulation sur 365 jours.

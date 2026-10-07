# Guide : créer des cartes avec une IA

Mnemo ne contient aucune IA et n’en demande aucune. Il vous écrit un **prompt** (une consigne)
que vous collez dans l’assistant de votre choix, avec votre cours. L’IA renvoie un fichier que
Mnemo vérifie avant de l’importer.

## Le parcours en 5 étapes

1. Ouvrez **Importer avec l’IA** et choisissez ce que vous voulez obtenir (flashcards, textes à
   trous, QCM, ou le mélange intelligent recommandé pour un cours complet).
2. Copiez le prompt généré.
3. Dans votre assistant IA, collez le prompt **puis** ajoutez votre document.
4. Copiez la réponse de l’IA (ou téléchargez le fichier qu’elle propose).
5. Revenez dans Mnemo, collez ou déposez la réponse : l’aperçu montre les cartes exactement
   comme à l’étude, avec les éventuels problèmes. Importez, puis révisez.

## Joindre un PDF ou un long texte

- **Téléversement** : la plupart des assistants acceptent un fichier joint (PDF, document,
  image). Joignez-le dans le même message que le prompt.
- **Texte collé** : si le téléversement n’est pas possible, copiez le texte du document et
  collez-le à la place de `[COLLE OU JOINS TON DOCUMENT ICI]`.
- Les diapositives exportées en PDF fonctionnent bien ; pour un document scanné, vérifiez que
  le texte est sélectionnable (sinon l’IA ne pourra pas le lire correctement).

## Document trop long ?

Cochez **« Mon document est long »** dans l’assistant :

1. demandez d’abord un **plan** (l’IA découpe le document en lots, sans créer de cartes) ;
2. générez ensuite chaque **lot** dans la même conversation ;
3. terminez par un **contrôle** du fichier complet (doublons, questions ambiguës) ;
4. importez les fichiers un par un ou ensemble.

Si la réponse s’arrête au milieu, Mnemo le détecte (« Il manque la suite »), récupère les notes
complètes et vous donne un prompt **« Continue »** à coller dans la même conversation.

## Quel format choisir ?

- **Markdown** (recommandé) : lisible, peu d’erreurs, idéal pour la plupart des cours.
- **YAML** : préférable quand il y a beaucoup de formules LaTeX ou de code (pas d’échappement
  des barres obliques inverses).
- **JSON** : le plus strict, pratique pour des scripts ; les formules LaTeX demandent de doubler
  les `\`, ce qui provoque plus d’erreurs.
- **CSV** : pour un tableur ; limité aux cartes simples, textes à trous et QCM.

## Corriger un fichier

Si l’aperçu signale des erreurs, cliquez sur **« Copier le prompt de correction »** et collez-le
dans la **même conversation** : l’IA ne renvoie que les notes corrigées. Les notes valides
peuvent être importées tout de suite (import partiel).

## Mettre à jour des cartes déjà importées

Chaque note porte un identifiant stable `uid` (par exemple `reseau-4-012`). Si vous régénérez
des cartes en gardant les mêmes `uid` et que vous importez en mode **« Mettre à jour »**, les
notes existantes sont modifiées **sans perdre leur historique de révision**, et aucun doublon
n’est créé. Un import peut toujours être annulé depuis l’historique des imports.

## Bonnes pratiques

- Relisez l’aperçu : une IA peut se tromper. Les cartes marquées **« À vérifier »** signalent
  un doute.
- Gardez une carte = une idée ; supprimez celles qui ne vous servent pas.
- Vos données restent sur votre appareil : rien n’est envoyé à l’IA par Mnemo.

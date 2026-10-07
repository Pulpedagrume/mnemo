---
format: mnemo/1
deck: Réseaux::Ethernet
tags: [ccna]
---

@tags ethernet couche2

::: basic uid=eth-4-001
Q: Quel est le rôle du champ FCS ?
A: Détecter les erreurs de transmission (CRC).
Hint: Frame Check Sequence.
Explanation: Si la valeur CRC reçue diffère de la valeur recalculée, la trame est rejetée.
:::

::: cloze uid=eth-4-002
Text: Un commutateur construit sa table MAC avec l’adresse {{c1::source::source ou destination ?}} des trames reçues.
:::

::: mcq uid=eth-4-003
Q: Quelles propositions décrivent la fibre optique ? (plusieurs réponses)
- [x] Insensible aux interférences électromagnétiques
- [ ] Chaque paire est enveloppée dans une feuille métallique
- [x] Plus chère qu’un câble UTP
- [ ] Contient généralement 4 paires de fibres
Explanation: La fibre résiste aux EMI/RFI mais coûte plus cher et demande un savoir-faire d’installation.
:::

::: matching uid=eth-4-004
Q: Associe chaque situation au support le plus adapté.
- Câblage horizontal d’un bureau => Cuivre
- Réseau fédérateur entre bâtiments => Fibre optique
- Accès invité dans un café => Sans fil
:::

::: ordering uid=eth-4-005
Q: Remets dans l’ordre les étapes d’une trame traversant un commutateur store-and-forward.
1. Réception de la trame entière
2. Vérification du FCS
3. Consultation de la table MAC
4. Transmission sur le port de sortie
:::

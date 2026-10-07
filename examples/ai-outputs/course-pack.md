Voici tes fiches au format Mnemo Markdown :

```markdown
---
format: mnemo/1
title: Révisions de fin de trimestre
tags: [revision]
---

## Ports

@deck Réseaux::Ports

::: basic uid=net-1-001 tags="ports"
Q: Quel est le port par défaut de FTP (transfert de données) ?
A: Le port 20.
:::

::: basic uid=net-1-002 tags="ports"
Q: Quel est le port par défaut de FTP (contrôle) ?
A: Le port 21.
:::

::: basic uid=net-1-003 tags="ports"
Q: Quel est le port par défaut de SSH ?
A: Le port 22.
:::

::: basic uid=net-1-004 tags="ports"
Q : Quel est le port par défaut de Telnet ?
A: Le port 23.
:::

::: basic uid=net-1-005 tags="ports"
Q: Quel est le port par défaut de SMTP ?
A: Le port 25.
:::

::: basic uid=net-1-006 tags="ports"
Q: Quel est le port par défaut de DNS ?
A: Le port 53.
:::

::: basic uid=net-1-007 tags="ports"
Q: Quel est le port par défaut de DHCP côté serveur ?
A: Le port 67.
:::

::: basic uid=net-1-008 tags="ports"
Q: Quel est le port par défaut de TFTP ?
A: Le port 69.
:::

::: basic uid=net-1-009 tags="ports"
Q: Quel est le port par défaut de HTTP ?
A: Le port 80.
:::

::: basic uid=net-1-010 tags="ports"
Q: Quel est le port par défaut de POP3 ?
A: Le port 110.
:::

::: basic uid=net-1-011 tags="ports"
Q: Quel est le port par défaut de NTP ?
A: Le port 123.
:::

::: basic uid=net-1-012 tags="ports"
Q: Quel est le port par défaut de IMAP ?
A: Le port 143.
:::

::: basic uid=net-1-013 tags="ports"
Q: Quel est le port par défaut de SNMP ?
A: Le port 161.
:::

::: basic uid=net-1-014 tags="ports"
Q: Quel est le port par défaut de LDAP ?
A: Le port 389.
:::

::: basic uid=net-1-015 tags="ports"
Q: Quel est le port par défaut de HTTPS ?
A: Le port 443.
:::

::: basic uid=net-1-016 tags="ports"
Q: Quel est le port par défaut de RDP ?
A: Le port 3389.
:::

## Acronymes

@deck Réseaux::Acronymes

::: basic uid=net-2-001 tags="vocabulaire"
Q: Que signifie l’acronyme LAN ?
A: Local Area Network : un réseau local, à l’échelle d’un bâtiment.
Hint: Développez le sigle en anglais.
:::

::: basic uid=net-2-002 tags="vocabulaire"
Q: Que signifie l’acronyme WAN ?
A: Wide Area Network : un réseau étendu qui relie des sites distants.
:::

::: basic uid=net-2-003 tags="vocabulaire"
Q: Que signifie l’acronyme VLAN ?
A: Virtual LAN : un réseau local logique isolé sur un même commutateur.
:::

::: basic uid=net-2-004 tags="vocabulaire"
Q: Que signifie l’acronyme MAC ?
A: Media Access Control : l’adresse physique de 48 bits d’une interface.
:::

::: basic uid=net-2-005 tags="vocabulaire"
Q: Que signifie l’acronyme ARP ?
A: Address Resolution Protocol : trouve l’adresse MAC associée à une adresse IPv4.
Hint: Développez le sigle en anglais.
:::

::: basic uid=net-2-006 tags="vocabulaire"
Q: Que signifie l’acronyme DHCP ?
A: Dynamic Host Configuration Protocol : attribue automatiquement une configuration IP.
:::

::: basic uid=net-2-007 tags="vocabulaire"
Q: Que signifie l’acronyme DNS ?
A: Domain Name System : traduit les noms de domaine en adresses IP.
:::

::: basic uid=net-2-008 tags="vocabulaire"
Q: Que signifie l’acronyme NAT ?
A: Network Address Translation : remplace les adresses privées par une adresse publique.
:::

::: basic uid=net-2-009 tags="vocabulaire"
Q: Que signifie l’acronyme TCP ?
A: Transmission Control Protocol : transport fiable, orienté connexion.
Hint: Développez le sigle en anglais.
:::

::: basic uid=net-2-010 tags="vocabulaire"
Q: Que signifie l’acronyme UDP ?
A: User Datagram Protocol : transport sans connexion ni accusé de réception.
:::

::: basic uid=net-2-011 tags="vocabulaire"
Q: Que signifie l’acronyme ICMP ?
A: Internet Control Message Protocol : messages d’erreur et de diagnostic (ping).
:::

::: basic uid=net-2-012 tags="vocabulaire"
Q: Que signifie l’acronyme OSPF ?
A: Open Shortest Path First : protocole de routage à état de liens.
:::

::: basic uid=net-2-013 tags="vocabulaire"
Q: Que signifie l’acronyme VPN ?
A: Virtual Private Network : tunnel chiffré à travers un réseau public.
Hint: Développez le sigle en anglais.
:::

::: basic uid=net-2-014 tags="vocabulaire"
Q: Que signifie l’acronyme QoS ?
A: Quality of Service : priorisation de certains flux (voix, vidéo).
:::

::: basic uid=net-2-015 tags="vocabulaire"
Q: Que signifie l’acronyme MTU ?
A: Maximum Transmission Unit : taille maximale d’une trame utile (1500 octets en Ethernet).
:::

::: basic uid=net-2-016 tags="vocabulaire"
Q: Que signifie l’acronyme TTL ?
A: Time To Live : compteur décrémenté à chaque routeur pour éviter les boucles.
:::

## Modèle OSI

@deck Réseaux::Modèle OSI

::: basic uid=net-3-001 tags="osi"
Q: Quel est le nom de la couche 1 du modèle OSI ?
A: La couche Physique.
Hint: On compte à partir du support physique.
:::

::: basic uid=net-3-002 tags="osi"
Q: Quel est le nom de la couche 2 du modèle OSI ?
A: La couche Liaison de données.
Hint: On compte à partir du support physique.
:::

::: basic uid=net-3-003 tags="osi"
Q: Quel est le nom de la couche 3 du modèle OSI ?
A: La couche Réseau.
Hint: On compte à partir du support physique.
:::

::: basic uid=net-3-004 tags="osi"
Q: Quel est le nom de la couche 4 du modèle OSI ?
A: La couche Transport.
Hint: On compte à partir du support physique.
:::

::: basic uid=net-3-005 tags="osi"
Q: Quel est le nom de la couche 5 du modèle OSI ?
A: La couche Session.
Hint: On compte à partir du support physique.
:::

::: basic uid=net-3-006 tags="osi"
Q: Quel est le nom de la couche 6 du modèle OSI ?
A: La couche Présentation.
Hint: On compte à partir du support physique.
:::

::: basic uid=net-3-007 tags="osi"
Q: Quel est le nom de la couche 7 du modèle OSI ?
A: La couche Application.
Hint: On compte à partir du support physique.
:::

## Cellule

@deck Biologie::Cellule

::: basic uid=bio-1-001 tags="cellule"
Q: Quel est le rôle du noyau ?
A: Contenir l’ADN et contrôler l’expression des gènes.
:::

::: basic uid=bio-1-002 tags="cellule"
Q: Quel est le rôle de la mitochondrie ?
A: Produire l’énergie de la cellule sous forme d’ATP par la respiration.
:::

::: basic uid=bio-1-003 tags="cellule"
Q: Quel est le rôle du ribosome ?
A: Assembler les protéines à partir de l’ARN messager.
:::

::: basic uid=bio-1-004 tags="cellule"
Q: Quel est le rôle du réticulum endoplasmique rugueux ?
A: Synthétiser et replier les protéines destinées à être exportées.
:::

::: basic uid=bio-1-005 tags="cellule"
Q: Quel est le rôle de l’appareil de Golgi ?
A: Modifier, trier et emballer les protéines dans des vésicules.
:::

::: basic uid=bio-1-006 tags="cellule"
Q: Quel est le rôle du lysosome ?
A: Digérer les déchets et les débris cellulaires grâce à ses enzymes.
:::

::: basic uid=bio-1-007 tags="cellule"
Q: Quel est le rôle du chloroplaste ?
A: Réaliser la photosynthèse chez les cellules végétales.
:::

::: basic uid=bio-1-008 tags="cellule"
Q: Quel est le rôle de la vacuole ?
A: Stocker l’eau et maintenir la pression de turgescence chez les plantes.
:::

::: basic uid=bio-1-009 tags="cellule"
Q: Quel est le rôle de la membrane plasmique ?
A: Délimiter la cellule et contrôler les échanges avec l’extérieur.
:::

::: basic uid=bio-1-010 tags="cellule"
Q: Quel est le rôle de la paroi cellulaire ?
A: Donner sa rigidité à la cellule végétale.
:::

::: basic uid=bio-1-011 tags="cellule"
Q: Quel est le rôle du centrosome ?
A: Organiser les microtubules lors de la division cellulaire.
:::

::: basic uid=bio-1-012 tags="cellule"
Q: Quel est le rôle du cytosquelette ?
A: Maintenir la forme de la cellule et permettre ses mouvements.
:::

## Génétique

@deck Biologie::Génétique

::: basic uid=bio-2-001 tags="genetique"
Q: Quelle molécule porte l’information génétique ?
A: L’ADN (acide désoxyribonucléique).
:::

::: basic uid=bio-2-002 tags="genetique"
Q: Combien de chromosomes compte une cellule humaine diploïde ?
A: 46, soit 23 paires.
:::

::: basic uid=bio-2-003 tags="genetique"
Q: Quelle base azotée remplace la thymine dans l’ARN ?
A: L’uracile.
:::

::: basic uid=bio-2-004 tags="genetique"
Q: Comment appelle-t-on la division qui produit les gamètes ?
A: La méiose.
:::

::: basic uid=bio-2-005 tags="genetique"
Q: Quel gaz les plantes rejettent-elles lors de la photosynthèse ?
A: Le dioxygène (O2).
:::

::: basic uid=bio-2-006 tags="genetique"
Q: Quelle est l’unité de base de tout être vivant ?
A: La cellule.
:::

::: basic uid=bio-2-007 tags="genetique"
Q: Quel type de cellule ne possède pas de noyau ?
A: La cellule procaryote (bactéries).
:::

::: basic uid=bio-2-008 tags="genetique"
Q: Comment s’appelle le passage de l’eau à travers une membrane semi-perméable ?
A: L’osmose.
:::

::: basic uid=bio-2-009 tags="genetique"
Q: Quelle enzyme copie l’ADN lors de la réplication ?
A: L’ADN polymérase.
:::

## Dates

@deck Histoire::Dates

::: basic uid=his-1-001 tags="chronologie"
Q: En quelle année a eu lieu le baptême de Clovis ?
A: En 496.
Explanation: Date à replacer sur la frise chronologique du chapitre.
:::

::: basic uid=his-1-002 tags="chronologie"
Q: En quelle année a eu lieu le couronnement de Charlemagne comme empereur ?
A: En 800.
:::

::: basic uid=his-1-003 tags="chronologie"
Q: En quelle année a eu lieu l’élection d’Hugues Capet ?
A: En 987.
:::

::: basic uid=his-1-004 tags="chronologie"
Q: En quelle année a eu lieu la conquête de l’Angleterre par Guillaume le Conquérant ?
A: En 1066.
:::

::: basic uid=his-1-005 tags="chronologie"
Q: En quelle année a eu lieu la bataille de Bouvines ?
A: En 1214.
:::

::: basic uid=his-1-006 tags="chronologie"
Q: En quelle année a eu lieu le début de la guerre de Cent Ans ?
A: En 1337.
Explanation: Date à replacer sur la frise chronologique du chapitre.
:::

::: basic uid=his-1-007 tags="chronologie"
Q: En quelle année a eu lieu la levée du siège d’Orléans par Jeanne d’Arc ?
A: En 1429.
:::

::: basic uid=his-1-008 tags="chronologie"
Q: En quelle année a eu lieu la chute de Constantinople ?
A: En 1453.
:::

::: basic uid=his-1-009 tags="chronologie"
Q: En quelle année a eu lieu le premier voyage de Christophe Colomb vers l’Amérique ?
A: En 1492.
:::

::: basic uid=his-1-010 tags="chronologie"
Q: En quelle année a eu lieu la bataille de Marignan ?
A: En 1515.
:::

::: basic uid=his-1-011 tags="chronologie"
Q: En quelle année a eu lieu l’ordonnance de Villers-Cotterêts ?
A: En 1539.
Explanation: Date à replacer sur la frise chronologique du chapitre.
:::

::: basic uid=his-1-012 tags="chronologie"
Q: En quelle année a eu lieu l’édit de Nantes ?
A: En 1598.
:::

::: basic uid=his-1-013 tags="chronologie"
Q: En quelle année a eu lieu la fondation de Québec ?
A: En 1608.
:::

::: basic uid=his-1-014 tags="chronologie"
Q: En quelle année a eu lieu le début du règne personnel de Louis XIV ?
A: En 1661.
:::

::: basic uid=his-1-015 tags="chronologie"
Q: En quelle année a eu lieu la révocation de l’édit de Nantes ?
A: En 1685.
:::

::: basic uid=his-1-016 tags="chronologie"
Q: En quelle année a eu lieu la prise de la Bastille ?
A: En 1789.
Explanation: Date à replacer sur la frise chronologique du chapitre.
:::

::: basic uid=his-1-017 tags="chronologie"
Q: En quelle année a eu lieu le sacre de Napoléon Ier ?
A: En 1804.
:::

::: basic uid=his-1-018 tags="chronologie"
Q: En quelle année a eu lieu la bataille de Waterloo ?
A: En 1815.
:::

::: basic uid=his-1-019 tags="chronologie"
Q: En quelle année a eu lieu l’abolition définitive de l’esclavage en France ?
A: En 1848.
:::

::: basic uid=his-1-020 tags="chronologie"
Q: En quelle année a eu lieu la loi de séparation des Églises et de l’État ?
A: En 1905.
:::

## Ports

@deck Réseaux::Ports

::: cloze uid=net-4-001 tags="ports"
Text: Le protocole {{c1::FTP (transfert de données)}} écoute par défaut sur le port {{c2::20}}.
:::

::: cloze uid=net-4-002 tags="ports"
Text: Le protocole {{c1::FTP (contrôle)}} écoute par défaut sur le port {{c2::21}}.
:::

::: cloze uid=net-4-003 tags="ports"
Text: Le protocole {{c1::SSH}} écoute par défaut sur le port {{c2::22}}.
:::

::: cloze uid=net-4-004 tags="ports"
Text: Le protocole {{c1::Telnet}} écoute par défaut sur le port {{c2::23}}.
:::

::: cloze uid=net-4-005 tags="ports"
Text: Le protocole {{c1::SMTP}} écoute par défaut sur le port {{c2::25}}.
:::

::: cloze uid=net-4-006 tags="ports"
Text: Le protocole {{c1::DNS}} écoute par défaut sur le port {{c2::53}}.
:::

::: cloze uid=net-4-007 tags="ports"
Text: Le protocole {{c1::DHCP côté serveur}} écoute par défaut sur le port {{c2::67}}.
:::

::: cloze uid=net-4-008 tags="ports"
Text: Le protocole {{c1::TFTP}} écoute par défaut sur le port {{c2::69}}.
:::

::: cloze uid=net-4-009 tags="ports"
Text: Le protocole {{c1::HTTP}} écoute par défaut sur le port {{c2::80}}.
:::

::: cloze uid=net-4-010 tags="ports"
Text: Le protocole {{c1::POP3}} écoute par défaut sur le port {{c2::110}}.
:::

::: cloze uid=net-4-011 tags="ports"
Text: Le protocole {{c1::NTP}} écoute par défaut sur le port {{c2::123}}.
:::

::: cloze uid=net-4-012 tags="ports"
Text: Le protocole {{c1::IMAP}} écoute par défaut sur le port {{c2::143}}.
:::

::: cloze uid=net-4-013 tags="ports"
Text: Le protocole {{c1::SNMP}} écoute par défaut sur le port {{c2::161}}.
:::

::: cloze uid=net-4-014 tags="ports"
Text: Le protocole {{c1::LDAP}} écoute par défaut sur le port {{c2::389}}.
:::

::: cloze uid=net-4-015 tags="ports"
Text: Le protocole {{c1::HTTPS}} écoute par défaut sur le port {{c2::443}}.
:::

::: cloze uid=net-4-016 tags="ports"
Text: Le protocole {{c1::RDP}} écoute par défaut sur le port {{c2::3389}}.
:::

## Cellule

@deck Biologie::Cellule

::: cloze uid=bio-3-001 tags="cellule"
Text: La {{c1::mitochondrie}} produit l’essentiel de l’{{c2::ATP}} de la cellule.
Extra: Voir le schéma de la cellule animale.
:::

::: cloze uid=bio-3-002 tags="cellule"
Text: Les {{c1::ribosomes}} traduisent l’ARN messager en {{c2::protéines}}.
:::

::: cloze uid=bio-3-003 tags="cellule"
Text: Le {{c1::chloroplaste}} contient la {{c2::chlorophylle}}.
:::

::: cloze uid=bio-3-004 tags="cellule"
Text: L’{{c1::appareil de Golgi}} expédie les protéines dans des {{c2::vésicules}}.
:::

::: cloze uid=bio-3-005 tags="cellule"
Text: Le {{c1::noyau}} est entouré d’une {{c2::double membrane}} percée de pores.
:::

::: cloze uid=bio-3-006 tags="cellule"
Text: Les {{c1::lysosomes}} contiennent des enzymes {{c2::digestives}}.
:::

::: cloze uid=bio-3-007 tags="cellule"
Text: La {{c1::membrane plasmique}} est une bicouche de {{c2::phospholipides}}.
:::

::: cloze uid=bio-3-008 tags="cellule"
Text: La {{c1::paroi}} des cellules végétales est faite de {{c2::cellulose}}.
:::

::: cloze uid=bio-3-009 tags="cellule"
Text: Le {{c1::cytosquelette}} comprend notamment des {{c2::microtubules}}.
:::

## Dates

@deck Histoire::Dates

::: mcq uid=his-2-001 tags="chronologie"
Q: Quel événement a eu lieu en 496 ?
- [x] le baptême de Clovis
- [ ] la conquête de l’Angleterre par Guillaume le Conquérant
- [ ] la chute de Constantinople
- [ ] l’édit de Nantes
:::

::: mcq uid=his-2-002 tags="chronologie"
Q: Quel événement a eu lieu en 800 ?
- [ ] la bataille de Bouvines
- [x] le couronnement de Charlemagne comme empereur
- [ ] le premier voyage de Christophe Colomb vers l’Amérique
- [ ] la fondation de Québec
:::

::: mcq uid=his-2-003 tags="chronologie"
Q: Quel événement a eu lieu en 987 ?
- [ ] le début de la guerre de Cent Ans
- [ ] la bataille de Marignan
- [x] l’élection d’Hugues Capet
- [ ] le début du règne personnel de Louis XIV
:::

::: mcq uid=his-2-004 tags="chronologie"
Q: Quel événement a eu lieu en 1066 ?
- [ ] la levée du siège d’Orléans par Jeanne d’Arc
- [ ] l’ordonnance de Villers-Cotterêts
- [ ] la révocation de l’édit de Nantes
- [x] la conquête de l’Angleterre par Guillaume le Conquérant
:::

::: mcq uid=his-2-005 tags="chronologie"
Q: Quel événement a eu lieu en 1214 ?
- [x] la bataille de Bouvines
- [ ] la chute de Constantinople
- [ ] l’édit de Nantes
- [ ] la prise de la Bastille
:::

::: mcq uid=his-2-006 tags="chronologie"
Q: Quel événement a eu lieu en 1337 ?
- [ ] le premier voyage de Christophe Colomb vers l’Amérique
- [x] le début de la guerre de Cent Ans
- [ ] la fondation de Québec
- [ ] le sacre de Napoléon Ier
:::

::: mcq uid=his-2-007 tags="chronologie"
Q: Quel événement a eu lieu en 1429 ?
- [ ] la bataille de Marignan
- [ ] le début du règne personnel de Louis XIV
- [x] la levée du siège d’Orléans par Jeanne d’Arc
- [ ] la bataille de Waterloo
:::

::: mcq uid=his-2-008 tags="chronologie"
Q: Quel événement a eu lieu en 1453 ?
- [ ] l’ordonnance de Villers-Cotterêts
- [ ] la révocation de l’édit de Nantes
- [ ] l’abolition définitive de l’esclavage en France
- [x] la chute de Constantinople
:::

::: mcq uid=his-2-009 tags="chronologie"
Q: Quel événement a eu lieu en 1492 ?
- [x] le premier voyage de Christophe Colomb vers l’Amérique
- [ ] l’édit de Nantes
- [ ] la prise de la Bastille
- [ ] la loi de séparation des Églises et de l’État
:::

::: mcq uid=his-2-010 tags="chronologie"
Q: Quel événement a eu lieu en 1515 ?
- [ ] la fondation de Québec
- [x] la bataille de Marignan
- [ ] le sacre de Napoléon Ier
- [ ] le baptême de Clovis
:::

::: mcq uid=his-2-011 tags="chronologie"
Q: Quel événement a eu lieu en 1539 ?
- [ ] le début du règne personnel de Louis XIV
- [ ] la bataille de Waterloo
- [x] l’ordonnance de Villers-Cotterêts
- [ ] le couronnement de Charlemagne comme empereur
:::

::: mcq uid=his-2-012 tags="chronologie"
Q: Quel événement a eu lieu en 1598 ?
- [ ] la révocation de l’édit de Nantes
- [ ] l’abolition définitive de l’esclavage en France
- [ ] l’élection d’Hugues Capet
- [x] l’édit de Nantes
:::

::: mcq uid=his-2-013 tags="chronologie"
Q: Quel événement a eu lieu en 1608 ?
- [x] la fondation de Québec
- [ ] la prise de la Bastille
- [ ] la loi de séparation des Églises et de l’État
- [ ] la conquête de l’Angleterre par Guillaume le Conquérant
:::

::: mcq uid=his-2-014 tags="chronologie"
Q: Quel événement a eu lieu en 1661 ?
- [ ] le sacre de Napoléon Ier
- [x] le début du règne personnel de Louis XIV
- [ ] le baptême de Clovis
- [ ] la bataille de Bouvines
:::

::: mcq uid=his-2-015 tags="chronologie"
Q: Quel événement a eu lieu en 1685 ?
- [ ] la bataille de Waterloo
- [ ] le couronnement de Charlemagne comme empereur
- [x] la révocation de l’édit de Nantes
- [ ] le début de la guerre de Cent Ans
:::
```

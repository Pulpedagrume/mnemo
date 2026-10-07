/**
 * Original course material (networks, cell biology, history) used to generate the example AI
 * outputs in `examples/ai-outputs/`. Written for this project; not taken from any course.
 */

export interface Fact {
  q: string;
  a: string;
}

export const PORTS: readonly (readonly [string, string])[] = [
  ['FTP (transfert de données)', '20'],
  ['FTP (contrôle)', '21'],
  ['SSH', '22'],
  ['Telnet', '23'],
  ['SMTP', '25'],
  ['DNS', '53'],
  ['DHCP côté serveur', '67'],
  ['TFTP', '69'],
  ['HTTP', '80'],
  ['POP3', '110'],
  ['NTP', '123'],
  ['IMAP', '143'],
  ['SNMP', '161'],
  ['LDAP', '389'],
  ['HTTPS', '443'],
  ['RDP', '3389'],
];

export const ACRONYMS: readonly (readonly [string, string])[] = [
  ['LAN', 'Local Area Network : un réseau local, à l’échelle d’un bâtiment.'],
  ['WAN', 'Wide Area Network : un réseau étendu qui relie des sites distants.'],
  ['VLAN', 'Virtual LAN : un réseau local logique isolé sur un même commutateur.'],
  ['MAC', 'Media Access Control : l’adresse physique de 48 bits d’une interface.'],
  ['ARP', 'Address Resolution Protocol : trouve l’adresse MAC associée à une adresse IPv4.'],
  ['DHCP', 'Dynamic Host Configuration Protocol : attribue automatiquement une configuration IP.'],
  ['DNS', 'Domain Name System : traduit les noms de domaine en adresses IP.'],
  ['NAT', 'Network Address Translation : remplace les adresses privées par une adresse publique.'],
  ['TCP', 'Transmission Control Protocol : transport fiable, orienté connexion.'],
  ['UDP', 'User Datagram Protocol : transport sans connexion ni accusé de réception.'],
  ['ICMP', 'Internet Control Message Protocol : messages d’erreur et de diagnostic (ping).'],
  ['OSPF', 'Open Shortest Path First : protocole de routage à état de liens.'],
  ['VPN', 'Virtual Private Network : tunnel chiffré à travers un réseau public.'],
  ['QoS', 'Quality of Service : priorisation de certains flux (voix, vidéo).'],
  [
    'MTU',
    'Maximum Transmission Unit : taille maximale d’une trame utile (1500 octets en Ethernet).',
  ],
  ['TTL', 'Time To Live : compteur décrémenté à chaque routeur pour éviter les boucles.'],
];

export const OSI: readonly string[] = [
  'Physique',
  'Liaison de données',
  'Réseau',
  'Transport',
  'Session',
  'Présentation',
  'Application',
];

export const ORGANELLES: readonly (readonly [string, string])[] = [
  ['du noyau', 'Contenir l’ADN et contrôler l’expression des gènes.'],
  ['de la mitochondrie', 'Produire l’énergie de la cellule sous forme d’ATP par la respiration.'],
  ['du ribosome', 'Assembler les protéines à partir de l’ARN messager.'],
  [
    'du réticulum endoplasmique rugueux',
    'Synthétiser et replier les protéines destinées à être exportées.',
  ],
  ['de l’appareil de Golgi', 'Modifier, trier et emballer les protéines dans des vésicules.'],
  ['du lysosome', 'Digérer les déchets et les débris cellulaires grâce à ses enzymes.'],
  ['du chloroplaste', 'Réaliser la photosynthèse chez les cellules végétales.'],
  ['de la vacuole', 'Stocker l’eau et maintenir la pression de turgescence chez les plantes.'],
  ['de la membrane plasmique', 'Délimiter la cellule et contrôler les échanges avec l’extérieur.'],
  ['de la paroi cellulaire', 'Donner sa rigidité à la cellule végétale.'],
  ['du centrosome', 'Organiser les microtubules lors de la division cellulaire.'],
  ['du cytosquelette', 'Maintenir la forme de la cellule et permettre ses mouvements.'],
];

export const CLOZE_ORGANELLE: readonly string[] = [
  'La {{c1::mitochondrie}} produit l’essentiel de l’{{c2::ATP}} de la cellule.',
  'Les {{c1::ribosomes}} traduisent l’ARN messager en {{c2::protéines}}.',
  'Le {{c1::chloroplaste}} contient la {{c2::chlorophylle}}.',
  'L’{{c1::appareil de Golgi}} expédie les protéines dans des {{c2::vésicules}}.',
  'Le {{c1::noyau}} est entouré d’une {{c2::double membrane}} percée de pores.',
  'Les {{c1::lysosomes}} contiennent des enzymes {{c2::digestives}}.',
  'La {{c1::membrane plasmique}} est une bicouche de {{c2::phospholipides}}.',
  'La {{c1::paroi}} des cellules végétales est faite de {{c2::cellulose}}.',
  'Le {{c1::cytosquelette}} comprend notamment des {{c2::microtubules}}.',
];

export const BIO_FACTS: readonly Fact[] = [
  { q: 'Quelle molécule porte l’information génétique ?', a: 'L’ADN (acide désoxyribonucléique).' },
  { q: 'Combien de chromosomes compte une cellule humaine diploïde ?', a: '46, soit 23 paires.' },
  { q: 'Quelle base azotée remplace la thymine dans l’ARN ?', a: 'L’uracile.' },
  { q: 'Comment appelle-t-on la division qui produit les gamètes ?', a: 'La méiose.' },
  { q: 'Quel gaz les plantes rejettent-elles lors de la photosynthèse ?', a: 'Le dioxygène (O2).' },
  { q: 'Quelle est l’unité de base de tout être vivant ?', a: 'La cellule.' },
  { q: 'Quel type de cellule ne possède pas de noyau ?', a: 'La cellule procaryote (bactéries).' },
  {
    q: 'Comment s’appelle le passage de l’eau à travers une membrane semi-perméable ?',
    a: 'L’osmose.',
  },
  { q: 'Quelle enzyme copie l’ADN lors de la réplication ?', a: 'L’ADN polymérase.' },
];

export const EVENTS: readonly (readonly [string, string])[] = [
  ['le baptême de Clovis', '496'],
  ['le couronnement de Charlemagne comme empereur', '800'],
  ['l’élection d’Hugues Capet', '987'],
  ['la conquête de l’Angleterre par Guillaume le Conquérant', '1066'],
  ['la bataille de Bouvines', '1214'],
  ['le début de la guerre de Cent Ans', '1337'],
  ['la levée du siège d’Orléans par Jeanne d’Arc', '1429'],
  ['la chute de Constantinople', '1453'],
  ['le premier voyage de Christophe Colomb vers l’Amérique', '1492'],
  ['la bataille de Marignan', '1515'],
  ['l’ordonnance de Villers-Cotterêts', '1539'],
  ['l’édit de Nantes', '1598'],
  ['la fondation de Québec', '1608'],
  ['le début du règne personnel de Louis XIV', '1661'],
  ['la révocation de l’édit de Nantes', '1685'],
  ['la prise de la Bastille', '1789'],
  ['le sacre de Napoléon Ier', '1804'],
  ['la bataille de Waterloo', '1815'],
  ['l’abolition définitive de l’esclavage en France', '1848'],
  ['la loi de séparation des Églises et de l’État', '1905'],
];

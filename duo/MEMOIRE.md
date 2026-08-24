# MEMOIRE.md — ce que DUO a appris

Mémoire technique de **DUO**, le jeu de duel à la racine du dépôt.
Complète `CLAUDE.md`, qui décrit la méthode commune aux deux jeux.

**Ce fichier ne concerne pas Callaghan.** Le jeu de `callaghan/` a sa propre
mémoire, bien plus fournie : `callaghan/MEMOIRE.md`. Ses pièges valent
souvent ici — même auteur, même cible — mais les architectures n'ont rien
à voir.

---

## 0. Ce que DUO ne doit pas casser

Ces contraintes vivaient dans `CLAUDE.md` à la racine, du temps où ce
dépôt n'hébergeait qu'un jeu. Elles sont ici parce qu'elles ne concernent
QUE DUO — `callaghan/` a les siennes, différentes.

- **Un seul fichier.** Tout le jeu tient dans `index.html` : HTML, CSS et
  JavaScript. Pas d'outil de compilation, pas de dépendance à installer.
  Seules exceptions : PeerJS chargé depuis un CDN, les décors dans
  `arenes/`, et la suite de tests dans `tests/`.
- **Pas de stockage navigateur en dehors de `localStorage`** pour les
  préférences : nom, photo, réglages, compteur de duels.
- **Le terrain fait toujours 540 × 720 unités de jeu**, quelle que soit
  la taille d'écran. Toute la géométrie en dépend.
- **Un miroir Netlify** est relié au même dépôt et déploie en une
  quinzaine de secondes : utile pour faire vérifier vite, mais ce n'est
  pas l'adresse de référence.

Commandes : `node tests/tests.js` pour la suite, `node tests/simulation.js`
pour la simulation de duel.

---

## 1. Architecture

### Réseau

Pair-à-pair par **PeerJS**, sans serveur de jeu. L'hôte fait autorité sur toute
la physique ; l'invité envoie sa raquette et affiche ce qu'il reçoit.

**Deux canaux, et c'est essentiel :**

| Canal | Fiabilité | Contenu |
|---|---|---|
| `conn` | non fiable | positions, ping, effets visuels — un paquet perdu est rattrapé 33 ms plus tard |
| `connVoix` | fiable | **messages de contrôle** (`lu`, `vc`, `rm`, `nm`), photos, clips vocaux |

Tout message dont la perte bloquerait la partie passe par `envoyerFiable()`,
qui met en file d'attente si le canal fiable n'est pas encore ouvert.

**Mise en relation** : deux serveurs de signalisation, l'officiel PeerJS et
`peerjs.92k.de` en secours. Quand le secours est utilisé, le code de partie
passe à 5 caractères, le `2` final routant l'invité vers le bon serveur.

**Traversée de réseau** : STUN Google + relais TURN Metered (identifiants
statiques, conçus pour vivre côté client). Le relais ne sert que si le direct
échoue — le HUD affiche `DIRECT` ou `RELAIS` pour le vérifier sur pièces.

### Boucle de jeu

Pas de temps **fixe** à 60 Hz avec accumulateur : la physique est identique sur
un écran 60, 90 ou 120 Hz. Rattrapage borné à 5 pas après une mise en veille.

Phases : `regles` → `vs` → `compte` → `jeu` → `recap` → `vice` → … → `fin`.

### Compensation de latence

L'hôte lit sa raquette en direct, celle de l'invité arrive avec un demi-ping de
retard. Il la **projette en avant** avec sa vitesse reçue et lui accorde une
tolérance proportionnelle au ping (lissé par moyenne glissante). Sans cela, à
200 ms de ping, 40 % des interceptions de l'invité étaient ignorées.

---

## 2. Réglages calibrés

Ces valeurs ont été réglées par mesure, pas au jugé. Les changer demande de
relancer la suite.

| Réglage | Valeur | Justification |
|---|---|---|
| Vitesse au service | 7,4 | −20 % après retour de jeu : c'était trop rapide |
| Plafond normal / éclair | 15,2 / 18,4 | hiérarchie vérifiée par test |
| Plancher balle en feu | 16,8 | sous le plafond éclair |
| Lift : gain de vitesse | +52 % | en dessous, le geste n'apportait rien |
| Lift : seuil de survol | 62 % du spin max | un geste moyen ne doit pas suffire |
| Attraction du VIDE | 0,5 sur 245 px | balayage de 5 valeurs ; 0,55 faisait traîner la balle |
| Immunité des blocs | 340 ms | un bloc oscillant recognait la balle à l'image suivante |
| IA facile / moyen / difficile | 37 / 64 / 90 % d'interception | mesuré sur 3 000 échanges simulés |
| Cadre des arènes | 42 × 50 | correspond exactement au cadre peint des décors |
| Format du terrain | 540 × 880 | rapport 0,614 : épouse la hauteur réellement disponible sur iPhone, contre 0,75 où 130 pt restaient vides |

**Arènes** : six, tirées au sort dès la manche 1 ou imposées depuis le menu.
Chacune a sa matière (facteur de vitesse, chaos, absorption, attraction), son
décor peint, sa musique et son nombre de bûches (une ou deux).

**Bûches centrales** : indestructibles, taille fixe, une simple fêlure au
premier choc. Seuls les éclats arrachés aux murs sont pulvérisables.

---

## 3. Pièges rencontrés

Chacun a coûté du temps, et chacun est désormais surveillé par la suite.

### Le joueur 0 est falsy
`if (gagnant)` sautait silencieusement le joueur 0. Toujours comparer
explicitement : `=== 0`, `>= 0`. Vaut aussi pour les horodatages : `!o.tImpact`
contournait l'immunité quand la valeur était nulle.

### Fonction appelée mais jamais définie
Une édition partiellement appliquée a laissé `dessinerRaquette` invoquée sans
corps. `node --check` n'a rien vu, la version est partie en production. La suite
reconstruit désormais la liste des fonctions définies et la confronte aux
appels.

### Édition partielle
Un script de remplacement qui échoue en cours de route ne doit rien écrire, et
il faut **relire ce qui a réellement été appliqué** avant de continuer. Deux
incidents : les fonctions de raquette manquantes, et un numéro de version resté
en arrière parce que l'incrément faisait partie du script échoué.

### Publication malgré un test rouge
Enchaîner avec `&&`. Des commandes séparées par des retours à la ligne ont
poussé une version alors que la suite venait d'échouer.

### `animation-fill-mode: both`
L'élément applique son **premier état pendant le délai** : un éclair blanc à
85 % couvrait tout l'écran VS en permanence. Préférer une opacité par défaut
explicite et aucun remplissage.

### `dvh` sur iOS
L'unité change de valeur quand Safari masque sa barre d'adresse au défilement,
d'où des sauts de mise en page inexplicables. Utiliser `svh`.

### Hauteur de barre variable
Un nom long passant sur deux lignes, ou une pastille de plus selon le format de
match, faisait grandir le bandeau et **décalait le terrain centré**. Figer la
hauteur des barres, tronquer plutôt que renvoyer à la ligne.

### Panneau plus haut que le terrain
Avec un contenu centré, le dépassement se produit **en haut et en bas à la
fois**, sans possibilité de défiler. Rendre les panneaux défilables et compacter
le contenu.

### `shadowBlur` du canevas
Force une passe de rendu séparée par objet : 29 appels suffisaient à faire
chuter la fluidité et à déclencher le repli automatique des effets, ce qui
donnait l'impression que « la lumière disparaît après le premier échange ». Le
bloom rend le même service pour une fraction du prix. Le flou est neutralisé
partout.

### Traversée de raquette
Trois causes cumulées, corrigées séparément : la physique lisait une position de
raquette jamais rafraîchie en solo, la détection ne testait que la position
finale au lieu du franchissement, et l'entrée latérale n'était pas couverte.

### Plafond incohérent
La traînée était plafonnée à 12 points à l'empilement alors que le mode lifté en
demandait 20 : la traîne longue était inatteignable. Vérifier qu'un plafond est
bien au-dessus de la plus grande valeur demandée.

### L'invité ne connaît pas son propre état
Symétrique du piège précédent, et tout aussi coûteux : `etat.raqHaut` est
renseigné chez l'hôte quand il reçoit la raquette de l'invité, mais **l'invité
ne se le renvoie jamais à lui-même**. Tout affichage qui lit cet état montrait
donc, chez l'invité, une valeur figée à sa position initiale — le puits de
gravité en v13.0. Pour l'affichage, chacun doit partir de sa propre position
locale et de la position lissée reçue pour l'autre.

### La physique ne tourne que chez l'hôte
Tout ce qui est calculé dans `physique()` ou `frapper()` est **invisible pour
l'invité**. Les records d'échange et de série ne progressaient donc jamais chez
lui. Avant d'ajouter une mesure, se demander de quel côté elle est calculée et
comment elle traverse le réseau.

### Découper sur le grand canevas coûte très cher
La lentille gravitationnelle découpait trente-six anneaux par image **directement
sur le terrain de 540 x 880**, soit dix-sept millions de pixels de zone de
découpe par image. Assez pour faire chuter la fluidité, déclencher le repli
automatique, et faire disparaître l effet au bout de quelques secondes — le
symptôme observé était « au début ça marche, ensuite non ». Les anneaux sont
désormais assemblés dans un tampon de 124 x 124 puis reposés en une seule
opération : quarante-trois fois moins de surface. Règle générale : composer hors
écran, poser une fois.

### Le temps de jeu repose sur des horodatages absolus
Décompte, durées de bonus, arc d'orage, annonces, immunités : tout est daté en
temps absolu. Toute suspension du jeu — la pause en v14.0 — doit donc **décaler
ces échéances** du temps écoulé, sinon elles expirent pendant l'arrêt et le jeu
reprend dans un état incohérent. Attention aux sentinelles `-1e9` qui signifient
« jamais » : elles ne doivent pas être décalées.

### Zone morte temporelle
Une initialisation placée plus haut dans le fichier que les `const`/`let`
qu'elle utilise lève une erreur au chargement — écran blanc, aucun message
utile. Deux fois rencontré : les boutons d'arène, puis le calibrage des
graphismes. Les blocs d'initialisation qui lisent des données déclarées bas
vont **en fin de script**.

### Secrets
Une clé secrète Metered a été publiée dans un dépôt public avant d'être retirée
et régénérée. Distinguer les identifiants **conçus pour le client** (TURN
statiques) des clés serveur. Le dépôt est public : rien de sensible dedans.

**Un `<audio>` créé hors geste utilisateur ne joue pas sur iOS, et se tait sans
prévenir.** Les clips vocaux arrivaient bien, mais `new Audio(url).play()`
partait d'un callback réseau : Safari refusait, et le `.catch(() => {})` avalait
le refus. La bannière « VOUS PARLE » s'affichant juste après, tout semblait
fonctionner côté émetteur comme côté récepteur. Passer par l'`AudioContext`
déjà débloqué au premier tap, qui n'est pas soumis à cette restriction. Règle
générale : un `catch` vide sur une promesse de lecture masque précisément le
diagnostic dont on aura besoin.

**`speechSynthesis` ne se route pas dans l'AudioContext.** Aucune API ne permet
de brancher la synthèse vocale sur un nœud audio : le curseur de volume doit
être recopié dans chaque `SpeechSynthesisUtterance`, sinon la voix ignore le
réglage. Deux autres pièges du même bord : `getVoices()` renvoie une liste vide
au chargement sur iOS, il faut écouter `onvoiceschanged` ; et la première
énonciation exige un geste utilisateur, consommée à vide dans
`reveillerAudio()`.

**Une capture micro ouverte bascule la sortie iOS sur l'écouteur d'oreille.**
Tant que `getUserMedia({audio:true})` tient un flux, le haut-parleur est
abandonné et tout le son du jeu faiblit. Ne tenir le flux que pendant la
fenêtre d'enregistrement, et couper les pistes ensuite.

---

## 3bis. Palmarès sans serveur

Chaque appareil garde les meilleurs scores connus **par nom de joueur**, et les
deux adversaires échangent leurs tableaux à la fin de chaque match. Les records
se propagent ainsi de proche en proche : jouer contre Kemal, qui a joué contre
Léa, suffit à récupérer le score de Léa. Vérifié par simulation à trois
appareils.

Limites assumées : c'est **déclaratif**, donc ça vaut la bonne foi du cercle, et
il n'y a pas de vérité globale — deux appareils peuvent diverger un temps. Pour
un jeu entre proches, c'est le bon compromis : zéro infrastructure, zéro compte,
zéro modération de noms. Tableau borné à 24 joueurs, soit environ 1,3 Ko
transmis.

## 3ter. Autour du duel

Ces briques existent dans le code depuis longtemps sans avoir jamais été
consignées ici. Elles vivent toutes hors de la boucle de jeu, ce qui explique
qu'aucun piège ne les ait fait remonter.

- **Carte de résultat partageable** — l'issue du match est peinte en image,
  destinée à être envoyée telle quelle.
- **Photo de profil** — capturée puis transmise par le canal fiable, avec le nom.
- **Défi asynchrone** — un record voyage dans un lien : l'adversaire le reçoit
  sans qu'aucune partie soit en cours.
- **Musique rétro percussive** — batterie, basse et lead synthétisés, sans
  fichier audio à charger.
- **Vannes sur le nom** — commentaires générés à partir du nom du joueur.
- **Diagnostic réseau** — le HUD affiche `DIRECT` ou `RELAIS`, et le détail des
  serveurs de signalisation.
- **Historique et records locaux** — conservés sur l'appareil, distincts du
  palmarès échangé en fin de match.

## 4. Mini-jeux à tester

Quatre pistes retenues, à construire et éprouver une par une. Toutes réutilisent
le moteur et les six arènes existantes.

**GRAVITÉ** — *construit en v11.0.* Le puits est projeté dans la moitié
ADVERSE, à l'aplomb de sa propre raquette — et non devant soi, ce qui aurait
facilité sa propre défense. Calibré à 1,15 de force sur 268 px : le point
d'arrivée se déplace de 219 px selon la position du puits, soit 2,1 largeurs
de raquette. Le rayon VISIBLE (62 px) n'a rien à voir avec la portée physique :
à 122 px le puits masquait le jeu. Le trou noir suit la référence fournie : pas de disque d'accrétion
flamboyant, c'est le fond enroulé qui fait tout. Le décor est réellement
déformé par une lentille : on prélève
l'image autour du puits et on la repose en neuf anneaux de plus en plus tournés
et grossis vers le centre. Aucune donnée réseau supplémentaire, les puits se
déduisent des raquettes déjà synchronisées. Une balle qui passe sur un puits ou
s'y attarde plus de 0,85 s est **avalée** et ressort par l'autre puits, plus
rapide et dans la même direction : comme le puits d'un joueur est chez
l'adversaire, la balle avalée revient dans son propre camp. Les éclats de mur ne tombent pas droit : ils sont **capturés en orbite**, leur
vitesse tangentielle étant rappelée vers la valeur qui équilibre l'attraction, et
leur composante radiale amortie. Ils sont en outre **emportés avec le trou** quand il se déplace, ce qui leur
permet de suivre : ils ne décrochent qu'au-delà de seize pixels par image, soit
un balayage du terrain en un tiers de seconde. Sept rochers sont semés au début
de chaque manche, déjà lancés sur leur orbite. Puits calme, ils tournent
indéfiniment ; puits
agité, ceux qui ne suivent plus la rotation finissent au centre — mesuré : aucun
avalé sous 60 px d'agitation, presque tous au-delà de 150 px.

**CASSE-MUR** — un mur de blocs occupe la moitié du terrain, dans la matière de
l'arène : la glace ralentit, la lave accélère, les cristaux attirent. Chacun
creuse dans le mur adverse, le premier qui perce gagne. Donne enfin un rôle
central au travail fait sur les matières.

**RELAIS** — *construit en v12.0.* Coopératif : personne ne marque, la série
s'arrête à la première balle perdue. La balle gagne 3,5 % de vitesse par renvoi
et atteint son plafond en 27 échanges, avec un palier annoncé tous les dix. Le
compteur remplace le score dans le bandeau, et le record est commun aux deux
joueurs. La fin de série est transmise à l'invité, sans quoi seul l'hôte
verrait l'écran final.

**CIBLES** — on ne marque plus en passant la raquette adverse mais en touchant
des cibles derrière elle. Bascule le jeu de la défense vers la visée, et rend le
point de contact sur la raquette enfin décisif.

Ordre conseillé : GRAVITÉ, puis RELAIS.

## 4bis. Points en suspens

Par ordre d'intérêt, issus de l'audit :

1. **Trafic réseau** — 620 octets à 30 Hz, dont environ 2 Ko/s de données qui ne
   changent jamais en cours de match. Un envoi initial fiable pour le statique
   et une cadence réduite pour le décor feraient gagner un bon quart.
2. **Volume** — activable ou coupé, sans réglage intermédiaire.
3. **Compteur de duels** — local à chaque appareil, donc chacun compte sa propre
   vision du score.

Réglés depuis l'audit : le clavier et la pause partagée (v14.0 à v14.3), le
manifeste PWA et ses quatre icônes.

Écartés volontairement : découper le fichier en modules, et ajouter un vrai
serveur de jeu. L'architecture hôte-autoritaire suffit largement pour du duel
entre proches.

---

## 5. Repères de version

| Version | Apport |
|---|---|
| 1 → 3 | Pong pair-à-pair, direction artistique néon, orbes de bonus |
| 5 | Manches, vices secrets, smash chargé, mort subite |
| 6 → 7 | Solo contre IA, micro, arènes à matière, TURN, diagnostic réseau |
| 8 | Modes arcade et classique, écran VERSUS, récap de manche |
| 9 | Décors peints, éclairage puis son retrait, arc électrique, rimes |
| 10 | Fiabilité du canal de contrôle, reprise après coupure, suite de tests |
| 11 | Mini-jeu GRAVITÉ : puits en camp adverse, lentille, balle avalée |
| 12 | Mini-jeu RELAIS coopératif, record commun aux deux joueurs |
| 13 | Palmarès propagé de proche en proche, rochers capturés en orbite |
| 14.0 → 14.3 | Pause partagée valable en réseau, clavier, bouton unique |
| 14.4 | Rochers à partir de la manche 2, relance automatique à 14 s |
| 14.5 | Lentille composée hors écran : elle ne disparaît plus après quelques secondes |
| 14.6 | Clips vocaux lus par l'AudioContext, micro relâché entre deux points |
| 14.7 | Écho du micro en solo : la chaîne de lecture se valide sans second appareil |
| 14.8 | Voix de l'IA : elle dit la vanne, moqueuse en gagnant, rageuse en perdant |
| 14.9 | L'IA parle aussi en fin de manche, musique écartée le temps de la phrase |
| 15.0 | Cri de victoire de 1,5 s enregistré au départ, décompte 3·2·1 et mot de lancement |
| 15.1 | Le mot n'ouvre que la manche ; le cri s'enregistre depuis le menu, à côté de la photo |
| 15.2 | Palmarès : victoires, taux, face-à-face agrégé avec titres ; avatars monstres procéduraux |
| 15.3 | Retrait de la photo, retour au monstre, et propagation de l'absence à l'adversaire |

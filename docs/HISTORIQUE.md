# Historique détaillé — Night City Table puis Table JDR

Tout ce qui a été construit, décidé et corrigé avant le passage à VS Code, avec le **pourquoi** de chaque choix.
Avant de modifier une fonctionnalité, cherche-la ici (Ctrl+F) pour ne pas défaire une décision de Sam.

Sommaire :
1. Méthode de travail utilisée jusqu'ici
2. Night City Table : la table, les personnages, les corrections de données
3. Fonctionnalités, une par une (règles + détails d'implémentation)
4. Table JDR : la version neutre multi-univers
5. Design : couleurs, polices, formes, boutons
6. Pièges techniques déjà rencontrés (et leur solution)
7. Journal des demandes de Sam (chronologique)

---

## 1. Méthode de travail utilisée jusqu'ici

- Le projet est né sur **Lovable** : TanStack Start, React, Supabase.
- Quand Sam n'a plus eu de crédits Lovable, on est passés au « à l'ancienne » :
  - Sam envoyait un zip du projet exporté ;
  - je renvoyais un zip des seuls fichiers modifiés (mêmes chemins), plus un script SQL à coller dans Supabase → SQL Editor ;
  - Sam remplaçait les fichiers dans Lovable.
- Chaque livraison était vérifiée avant envoi :
  - `tsc` à 0 erreur et tous les tests vitest verts (133 tests sur la dernière version de Night City) ;
  - le SQL testé sur un Postgres local qui imite Supabase (schéma `auth` factice, rôles `anon` / `authenticated`, scénarios d'accès autorisés et refusés) ;
  - des captures Playwright de l'interface sur ordinateur et sur mobile (390 px).
- **Aperçus sans base** : on rend le composant React avec vitest/jsdom, on écrit le HTML dans un fichier avec les vraies feuilles de style, puis on le photographie avec Playwright.
  - jsdom n'écrit pas la valeur des `<select>` dans le HTML : les listes affichent leur première option, c'est un artefact d'aperçu.
  - Les miniatures YouTube ne chargent pas dans le bac à sable.
  - Les éléments `position: fixed` apparaissent au milieu des captures pleine page.
- À partir du 30/10/2026 : dépôt GitHub `Samv02/table-jdr`, développement local dans VS Code avec Claude Code.

---

## 2. Night City Table

### La table
- Partie de **Cyberpunk RED** entre amis, avec un MJ et quatre ou cinq joueurs.
- Personnages (pseudos affichés) : **SUDO** (le personnage de Sam, netrunner), **Reacon/Ross**, **D.**, **dexter** (nom complet « veyne silas »), **K.** (Kaïra).
- On ne montre **jamais** les e-mails. Les comptes ont été associés aux personnages par SQL, d'après la liste donnée par Sam (non recopiée ici).
- Comptes de démo créés au début : MJ `mj@test.com` (mot de passe `test1234`), et le compte de Sam repassé en simple joueur.

### Fiche de SUDO (pour les questions de règles)
- **Caractéristiques** : INT 2, RÉF 2, DEX 5, TECH 3, PRÉ 2, VOL 5, CHANCE 2, MOUV 5, CORPS 9, EMP 4. PV max 45, humanité 33/40.
- **Compétences** : Pistolets 6, Esquive 6, Infiltration 6, Perception 6, Piratage/Interface 6, Cybertech 6, Électronique/Sécurité 6, les autres à 2.
- **Armes** : Couteau léger, Mitraillette légère (CdT 1, tir auto ×10, 30 balles), Main nue (Bagarre, 3d6 grâce à CORPS 9).
- **Cyberware** : Neural Link, Interface Plugs, Cyber-Œil.
- **Cyberdeck** : 8 slots ; Sword (2), Shield (2), Eraser (1), Zap (1).
- Conseils de jeu donnés à Sam :
  - en RED, les actions de netrun utilisent le rang d'Interface, pas INT ni TECH ;
  - son vrai point faible est RÉF 2 (l'initiative) : programmes Speedy Gonzalvez et Worm, cyberware Kerenzikov ou Sandevistan ;
  - les compétences inventées « à la maison » restent à faire valider par son MJ ;
  - il voulait demander **Contrefaçon (TECH)**, une compétence officielle.

### Corrections de données faites en SQL (Night City)
- Les armes de SUDO :
  - la Mitraillette légère passe en CdT 1 avec tir automatique ;
  - « Main nue » utilise Bagarre, avec des dégâts calculés depuis CORPS ;
  - les compétences Bagarre et Tir automatique ont été ajoutées.
- Le pistolet de D. : 12 balles, compétence Pistolets.
- Le pistolet de dexter : 12 balles, compétence Pistolets, CdT 2.
- Des commandes pour vider le fil des jets (`delete from rolls`) et les messages (`delete from messages`) ont été fournies.

### Règles Cyberpunk RED codées (aujourd'hui = préréglage « Cyberpunk »)
- PV max = `10 + 5 × arrondi_sup((CORPS + VOL) / 2)`.
- Gravement blessé ≤ `arrondi_sup(max / 2)`, avec un malus de −2.
- Jet de mort = CORPS. Humanité max = EMP × 10.
- Compétence = **1d10 + carac + niveau**. Un 10 naturel est un critique (dé vert), un 1 naturel un échec critique (dé rouge).
- Mains nues selon CORPS : ≤4 → 1d6, 5–6 → 2d6, 7–10 → 3d6, 11+ → 4d6.
- **Tir automatique ×10** seulement pour les mitraillettes et fusils d'assaut (d'après le nom de l'arme). **Rafale ×2** si la CdT est d'au moins 2.
- Codes JSON des caracs : `INT REF DEX TECH PRE VOL CHANCE MOUV CORPS EMP`.
  - Alias acceptés : `ADR` = DEX, `COOL` / `FROID` = PRÉ, `BODY` = CORPS, `WILL` = VOL, `LUCK` = CHANCE, `MOVE` = MOUV.
  - Affichage : DEX et PRÉ.

---

## 3. Fonctionnalités, une par une

> Sauf mention contraire, chacune existe dans Night City **et** dans Table JDR (rendue générique).

### 3.1 Comptes, profils, rôles
- Night City : pas d'inscription publique, le MJ crée les comptes (tableau de bord Supabase → Authentication). Table JDR : inscription ouverte depuis le 30/10/2026 (voir §7, n° 20).
- À la création d'un compte, le trigger `handle_new_user` donne un pseudo provisoire (`Joueur-XXXX` ; `Runner-XXXX` dans Night City), **jamais l'e-mail**.
- Page Profil : pseudo (3 à 20 caractères, unique), couleur néon (jaune, rouge, cyan, vert, violet, orange) et avatar (bucket privé `avatars/<user_id>/…`, liens signés). Le changement de mot de passe a été retiré.
- Le rôle (`player` / `gm`) se change seulement par le MJ : fonction `set_user_role`, plus un trigger `protect_role`.
- Le MJ peut supprimer un compte, sauf le sien. Ça passe par une fonction serveur avec la clé de service, qui vide d'abord les avatars. Les personnages sont conservés, sans propriétaire.
- **Avatar** : l'image est en `position: absolute; inset: 0` dans la bulle. Sinon elle débordait (« raté ») quand la grille `.av` donnait une hauteur automatique.

### 3.2 Personnage actif et navigation
- Un joueur a souvent un seul personnage, choisi automatiquement. Le MJ choisit dans un sélecteur ; « MJ » veut dire aucun personnage.
- Navigation :
  - MJ : Tableau de bord / Fiche / Profil / MJ ;
  - joueur : Ma fiche / Profil.
  - Centrée (Sam : « recentre ça »).
- Le bouton de messagerie a été retiré du HUD et placé en bas à gauche.
- En haut : la barre du groupe (avatars et pseudos, point vert si en ligne, bulle qui pulse quand quelqu'un lance un dé). Le MJ y apparaît avec sa photo et sa couleur ; « ▲ » marque son propre personnage côté joueur.
- **Œil** : masque toute l'interface pour profiter de la scène. Raccourci `H` ; `Échap` pour revenir.

### 3.3 Fiche
- **Mise en page** :
  - ordinateur : 3 colonnes (Perso | Compétences | Combat + Sac) ;
  - mobile : onglets avec une barre en bas (Perso, Jets, ⬢ dés, Combat, Sac).
- **Colonnes alignées en bas** : le dernier bloc de chaque colonne s'étire jusqu'à la même ligne. Sam avait tracé une ligne rouge sur une capture.
- **Bloc-notes** : taille fixe et défilement interne. Avant, on pouvait l'étirer et ça faisait descendre la page.
- **Mode édition** (MJ seulement) : caractéristiques, compétences (nom, titre affiché, carac choisie dans une liste, niveau), armes (nom, dégâts, compétence, munitions, CdT), cyberware (une ligne = une puce), champs d'identité, armures et jauges.
  - Les modifications de la fiche passent par une **file d'enregistrement** avec numéro de révision, pour qu'une lecture en temps réel n'écrase pas une saisie en cours.
- **Nouvelle compétence** : nom unique automatique (« Nouvelle compétence 2 »…). Le MJ choisit sa carac : avant, elle était toujours sur INT, ce que Sam a signalé.
- **Compétences** : un clic lance le jet (1d10 + base). Les 5 meilleures bases sont mises en valeur. L'ordre est fixe : Pistolets, Fusils, Tir auto, Mêlée, Bagarre, Esquive… puis l'ordre alphabétique.
- **PV** :
  - boutons −5, −1, +1, +5, « Encaisser » (dégâts saisis) et « Max » ;
  - jamais au-dessus du max, corrigés automatiquement si le max baisse ;
  - Sam l'a signalé quand il a vu 50/45.
- **ECG (signes vitaux)** :
  - stable : vert, 60 bpm ;
  - gravement blessé : jaune, 150 bpm ;
  - critique (≤ 25 %) : rouge, irrégulier et clignotant ;
  - à 0 : ligne plate.
  - Anti-saut : la longueur de chaque motif (120, 80, 160) divise 480 exactement, et la phase est calée sur l'horloge (`animationDelay` négatif), donc recréer l'élément ne fait pas sauter le tracé. Sam avait signalé « encore un jump ».
- **Export JSON** de la fiche, au format des fichiers CP_RED d'origine. Les munitions sont écrites dans `weapons[].note`.

### 3.4 Dés
- **Lanceur** : d4, d6, d8, d10, d12, d20, d100, ou un nombre de faces libre (2 à 10 000) ; 1 à 10 dés ; modificateur ; libellé ; jet secret.
- **Fil des jets en direct** :
  - tiroir latéral, ou fil **épinglé** sur ordinateur (préférence mémorisée par utilisateur) ;
  - mini-fil sur mobile ;
  - le fil reste fixe quand on clique ailleurs, avec un fond transparent pour voir la scène.
- **Animation** :
  - affichée dans `document.body` (portail), sinon elle était décalée sur mobile ;
  - les chiffres « tournent » au moins 650 ms, puis affichent **uniquement le résultat du serveur** (un bug montrait des valeurs aléatoires).
- **Critique** : dé vert `#00ff88` et étiquette « 10 NATUREL · CRITIQUE » ; échec critique en rouge. La règle est partagée entre l'animation et le fil, qui ne peuvent pas diverger.
- **Bouton de dés** : jaune, compact, en bas à droite.
  - Sur la fiche mobile d'un joueur, il est au centre de la barre du bas.
  - Le MJ mobile ne voyait plus le bouton : la classe `gm-home` n'était plus posée par aucun code. Corrigé avec `.fab-desk:not(.player-fab)` sous 1100 px.

### 3.5 Munitions (Arsenal)
- Pour chaque arme à munitions : **chargeur** (`mag`), **chargeurs de rechange** (`spare`) et **balles en vrac** (`loose`). L'entrée est indexée par la position de l'arme : `ammo["0"]`.
- **TIR** −1, **RAFALE ×2** si CdT ≥ 2, **AUTO ×10** pour les armes automatiques. Petites animations (douille éjectée, flash, vibration).
- **RECHARGER** :
  - utilise d'abord un chargeur plein, et les balles restantes passent en vrac ;
  - sinon complète le chargeur avec le vrac ;
  - ne crée ni ne perd jamais de balle.
- **« Vrac → chargeur »** : fabrique un chargeur plein si le vrac le permet.
- Avoir 0 chargeur de rechange ne vide pas l'arme.
- Total affiché : chargeur + rechanges × capacité + vrac.
- La sauvegarde est immédiate et fonctionnelle (`onAmmo(current => …)`) ; les animations ne bloquent pas l'enregistrement.

### 3.6 Verrou MJ des fiches
- `characters.players_can_edit`. Bouton sur la fiche (MJ), dans chaque colonne du tableau de bord, et boutons « Tout autoriser » / « Tout verrouiller ».
- Bandeau côté joueur : « Fiche verrouillée par le MJ — tu peux toujours lancer les dés ». Le bloc-notes reste utilisable.
- La base refuse les modifications d'état d'un joueur verrouillé : politique `update state` + `player_can_edit()`.

### 3.7 Bloc-notes privé
- Table `character_notes` (10 000 caractères). Sauvegarde automatique 700 ms après la frappe, compteur, état « Enregistrement… / ✓ Enregistré ».
- Le MJ le lit en direct, sans pouvoir le modifier.

### 3.8 Messagerie (« Holo-Net » dans Night City)
- **Canaux** :
  - `all` : annonces, écrites par le MJ seulement ;
  - `gm:<perso>` : canal privé joueur ↔ MJ, toujours ouvert ;
  - `holo:<a>:<b>` : échange entre deux personnages (« Holo-Call »), seulement si la paire est dans `holo_links`.
- L'expéditeur est **fixé par le serveur** (trigger) : impossible d'écrire au nom d'un autre. Le MJ signe « MJ ».
- **Interface** :
  - tiroir à gauche ;
  - bouton flottant **compact en bas à gauche**, qui **clignote** quand il y a des non-lus, avec un badge ;
  - pas de toast.
- Le MJ supprime un message (avec confirmation). Les non-lus sont mémorisés par utilisateur (`localStorage`).
- **Écran des autorisations** (MJ) : vue par personnage avec des « puces » cliquables (`pnode` / `pchip`), plus « Tout autoriser » / « Tout couper » (avec confirmation). Sam : « il en manque pas ? Et je pense qu'il y a mieux à faire en UI/UX » → refait.

### 3.9 Scènes
- Le MJ importe des images (bucket privé `scenes`, 5 Mo max), les renomme, les réordonne et les active. Le changement s'applique pour tous, avec un fondu et le titre de la scène.
- **Interface masquée** : l'image devient explorable (glisser, molette ou pincement pour zoomer, double-clic pour recentrer). Le réglage est local.
- Améliorations proposées et non faites : voir `CONTEXTE.md` §6.

### 3.10 Musique (YouTube synchronisé)
- État partagé dans `session_state.music`.
  - Position = `position_sec` + (heure serveur − `started_at`). `set_table_music` horodate avec l'horloge du serveur, et l'horloge de chaque client est recalée toutes les 30 s.
  - Fondus `{from, to, dur}` relatifs à `started_at`. `rebaseFade` évite les redémarrages.
- **Lecteur visible côté joueur** :
  - déplaçable et réductible ;
  - « × » ferme seulement le lecteur local, sans couper la musique des autres ;
  - volume personnel multiplié par le volume du MJ ;
  - le joueur ne pilote rien ;
  - bouton « Activer le son » à cause des règles des navigateurs.
- **Panneau MJ v2** (Sam trouvait l'ancien « pas intuitif ») :
  - **Lecteur** :
    - miniature, ambiance, et une ligne « À la suite : … / S'arrêtera à la fin… » ;
    - transport (−10 s, précédent, lecture, suivant, +10 s) et volume ;
    - **Voix** (baisse la musique), **Fondu & stop**, **Couper** ;
    - **À la fin du morceau** : Arrêter / Répéter / Enchaîner, plus Ordre aléatoire ;
    - **Transition** : coupe nette, ou fondu de 2, 4 ou 8 s ;
    - raccourcis clavier.
  - **Ambiances** : une tuile par ambiance (Exploration, Combat, Tension, Boss, Poursuite, Bar/Club — devenu « Taverne / Bar » dans Table JDR —, Calme, Émotion), plus « Tout ».
    - Un clic joue un morceau de cette ambiance et enchaîne dans cette ambiance.
    - Une tuile vide prépare l'ajout de morceaux.
  - **Bibliothèque** : filtres, recherche, miniatures (clic = jouer), ambiance par morceau, **À la suite** (`next_up`), retirer (avec confirmation).
  - **Ajouter** : liens YouTube collés en vrac, ou **playlist entière** importée par un lecteur YouTube caché.
  - Les vidéos indisponibles sont marquées ⚠ et **sautées automatiquement**.
  - L'ancien mode « playlist » est converti en bibliothèque modifiable.
- Pièges :
  - l'icône Lucide `Infinity` masquait le global `Infinity` : on l'importe en `InfinityIcon` ;
  - un seul lecteur YouTube persistant, avec contrôle de « prêt » à chaque appel.

### 3.11 Tableau de bord MJ
- **Bandeau** : une carte par personnage (avatar, PV, mini-barres de munitions des deux premières armes, alertes santé et munitions).
  - Clic : amène sa colonne à l'écran et la fait briller.
  - Double-clic : ouvre la fiche complète. Sam : « c'est cliquable mais je ne sais pas pourquoi », d'où l'infobulle explicative.
- **Sections affichables** : Vitaux, Stats, Compétences, Combat, Sac. Filtre « En ligne seulement ».
- **Colonnes alignées** en *subgrid* sur ordinateur, une colonne par écran sur mobile.
  - Ajouter un 7e enfant à la grille l'avait cassée (« on a cassé un truc ») : le bouton de verrou est donc **dans** l'en-tête de colonne.
- **Bloc Combat** (`dw-*`) : par arme, les dégâts, la base d'attaque, un compteur et des balles, les rechanges, et les actions −1, recharger, +1 chargeur, vrac→chargeur. Le doublon de munitions dans « Sac » a été retiré.
- Opacité des panneaux réduite (`--dash-glass`), parce que Sam trouvait ça « trop transparent ».
- Le MJ modifie l'état de chaque personnage : une file d'enregistrement par personnage, et un clignotement rouge quand les PV baissent.

### 3.12 Emplacements (« Cyberdeck » dans Night City)
- Colonnes `character_state.programs` (JSON) et `program_slots`. Un élément = `{id, name, slots | null, dice, effect, active}`.
- **Barre de slots** colorée. Activer sans assez de place fait trembler la carte, avec « Il manque X slot(s) ».
- Le MJ règle tout seulement en **Mode édition** (Sam : « je peux le modifier sans activer le mode édition »).
  - Quand le MJ réduit la capacité, les éléments en trop se désactivent automatiquement (`fitToCapacity`).
- Le dé d'un élément se lance seulement s'il est actif, et seulement par son propriétaire.
- Le trigger `cyberdeck_guard` vérifie tout en base : 15 scénarios testés.

### 3.13 Confirmations dans l'appli
- `confirmAction({title, message, confirmLabel})` dans `ConfirmDialog.tsx` remplace tous les `window.confirm`. Sam : « inapp bien sûr pas navigateur ».
- « Annuler » a le focus par défaut (Entrée ne supprime pas par erreur). Échap ou un clic à côté annule. Sur mobile, la fenêtre s'ouvre en bas.
- Branchée sur toutes les suppressions :
  - compétence, arme, objet (fiche et tableau de bord), élément d'emplacement ;
  - message, « tout couper » de la messagerie ;
  - morceau de musique, scène, fiche entière, compte.
- Après la confirmation, l'élément est retrouvé par son nom ou son identifiant, au cas où la liste aurait bougé entre-temps.

### 3.14 Divers
- **Icône d'onglet** :
  - Night City : une « credchip » originale (Sam voulait le logo €$ du jeu : refusé, droits d'auteur, d'où un dessin original) ;
  - Table JDR : un d20 neutre.
- **Titre d'onglet** : « PSEUDO · Nom de la table ».
- La **barre d'outils « ••• »** en bas à gauche vient de l'éditeur Lovable, pas de l'appli.

---

## 4. Table JDR : la version neutre multi-univers

**Demande de Sam** : « une copie du projet en mode neutre pour adapter les univers (fantasy, Warhammer…) ». Choix faits avec lui :
- tout configurable : look, mots **et** règles ;
- réglage dans l'appli ;
- nouveau projet ;
- script SQL complet.

### 4.1 L'univers (`src/lib/universe.ts`)
- **`theme`** :
  - couleurs : `bg`, `panel`, `text`, `mute`, et 6 accents. Leurs noms internes viennent de Night City (`cyan` principale, `pink` secondaire, `yellow` mise en avant, `red` danger, `green` réussite, `violet` mystique) ;
  - 3 polices : titres, texte, chiffres et étiquettes ;
  - `corners` : `cut`, `round` ou `square` ;
  - `glow` (néon), `scanlines` ;
  - `atmosphere` : none, rain, embers, ash, stars ou fog.
- **`words`** : environ 35 mots affichés (nom de la table, santé, sections, argent, messagerie, emplacements, munitions…).
- **`rules`** :
  - `stats` : `{key, label, aliases?}` ;
  - `skillDice` : par exemple 1d10 ;
  - `rollMode` : `over` (dé + base) ou `under` (faire moins que la base, en %) ;
  - `skillBase` : une formule, avec `STAT` et `NIV` ;
  - `crit` et `fumble` : max, min, doubles ou none ;
  - `hpMax` : une formule ; vide = saisi par le MJ dans `sheet.hpMax` ;
  - `woundedAt` : une formule, avec `MAX` ;
  - `deathSave` ;
  - `gauges` : `{key, label, max, color}`. Un max vide = saisi par le MJ dans `sheet[key+"Max"]` ;
  - `defenses` et `infoFields` : des champs texte ;
  - `unarmed` : `{count: formule, sides}` ;
  - `rangedStat` et `meleeStat` ;
  - `autofire` ;
  - `skillOrder` : des débuts de noms.
- **`modules`** : `ammo`, `money`, `slots`, `features`, `ecg`.
- **`normalizeUniverse()`** relit n'importe quel JSON : les valeurs absurdes sont remplacées par celles du préréglage, et les listes limitées en taille.
- **`universeErrors()`** donne les erreurs de formule en français, pour la page Univers.
- Stockage : `session_state.universe`. Lisible **avant connexion** via `get_universe()` (security definer, accordé à `anon`), pour que la page d'accueil ait déjà le bon thème.

### 4.2 Les 5 préréglages
| Id | Jets | Caracs | Spécificités |
|---|---|---|---|
| `neutre` (défaut) | 1d20 + STAT + NIV | PHY AGI ESP PER VOL PRE | coins arrondis, sobre, sans néon |
| `fantasy` | 1d20 + `floor((STAT-10)/2)` + NIV | FOR DEX CON INT SAG CHA | Mana `2*INT`, Grimoire de sorts, carquois, braises, Cinzel + Alegreya |
| `grimdark` | **1d100 ≤ STAT+NIV**, degrés de réussite | CC CT F E I Ag Dex Int FM Soc | critiques sur les **doubles**, Blessures `floor(F/10)+2*floor(E/10)+floor(FM/10)`, Destin, Résilience, Corruption, PA par zone, cendres |
| `horreur` | 1d100 ≤ NIV | FOR CON TAI DEX APP ÉDU INT POU | 01 critique, 100 maladresse, Santé mentale, Chance, Magie, brume |
| `cyberpunk` | 1d10 + STAT + NIV | les 10 de RED + alias | exactement Night City : humanité, chance, cyberdeck, tir auto, néons, pluie, ECG |

### 4.3 Les formules (`src/lib/formula.ts`)
- Le texte est analysé caractère par caractère : **jamais d'`eval`**.
- Autorisé :
  - nombres et noms (sans accents ni casse : « Volonté » devient `VOLONTE`) ;
  - `+ - * / %` et `×`, parenthèses ;
  - comparaisons qui valent 1 ou 0 ;
  - fonctions `ceil floor round min max abs`.
- `evalFormula(src, vars, fallback)` ne plante jamais : une formule vide ou cassée renvoie la valeur de secours. `checkFormula` dit ce qui ne va pas.

### 4.4 Les jets « sous la base »
- `skillRoll(u, base)` renvoie `{count, sides, mod, target}`. La fonction serveur `rollDice` accepte `target` et le stocke dans `rolls.target`.
- L'animation et le fil affichent « ≤ 45 », « RÉUSSITE · +3 DR » ou « ÉCHEC · −1 DR ».
- `dieClass(u, roll, v)` donne la couleur des dés : critique vert, maladresse rouge, et max/min seulement pour les jets classiques.

### 4.5 Le thème appliqué (`src/lib/theme.ts`)
- `applyTheme()` :
  - écrit les variables CSS sur `<html>` ;
  - ajoute les classes du `<body>` : `corners-*`, `fx-glow` / `fx-noglow`, `fx-scan` / `fx-noscan`, `atmo-*` ;
  - charge les Google Fonts.
- `THEME_BOOT`, un script dans `<head>`, réapplique le dernier thème (gardé dans `localStorage`) avant l'affichage : pas de flash.
- **Aperçu** : sur la page Univers, le brouillon est appliqué à l'écran du MJ seulement, sans être mis en cache. Il revient à l'univers enregistré quand le MJ quitte la page.
- **CSS** : environ 260 couleurs écrites en dur ont été converties automatiquement en `color-mix(in srgb, var(--accent) X%, transparent)`.
  - Il ne reste que des neutres (noir et blanc translucides) et le laiton des balles.
  - Variables disponibles : `--bg --panel --ink --glass --glass2 --line --line2 --text --mute --dim --cyan --pink --yellow --red --green --violet --orange --head --display --mono`.
- Les PV sont colorés selon l'état : `.hp-ok` vert, `.hp-blesse` jaune, `.hp-mourant` rouge.
- La grille des caracs s'adapte à leur nombre : 6 en 3 colonnes, 8 en 4, 10 en 5. Les 3 meilleures caracs sont mises en valeur, quelle que soit l'échelle du jeu.

### 4.6 La page MJ → Univers (`src/components/UniverseEditor.tsx`)
- Cartes des modèles. Choisir un modèle demande une confirmation, puis remplace le brouillon.
- Sections repliables :
  - Identité ;
  - Apparence (10 couleurs, 3 polices, coins, ambiance, néon, scanlines) ;
  - Vocabulaire (par groupes) ;
  - Caractéristiques (liste : ajouter, monter, descendre, retirer) ;
  - Jets (dé, mode, formule, critiques, plus un exemple calculé en direct) ;
  - Santé et ressources (PV, seuil, jet de mort, jauges, défenses, champs d'identité) ;
  - Combat ;
  - Blocs.
- Barre fixe en bas :
  - état : « aperçu sur ton écran seulement » ou « X formule(s) à corriger » ;
  - export et import d'un fichier univers ;
  - Annuler ;
  - **Enregistrer pour la table**, bloqué tant qu'il reste des erreurs.
- Codes réservés : `STAT`, `NIV`, `MAX`. Les codes en double sont refusés.

### 4.7 Autres changements de Table JDR
- Le MJ peut **créer une fiche vierge** (MJ → Table) : toutes les caracs prennent une même valeur de départ selon le jeu (5, 10 ou 30), et les PV sont calculés.
- `Cyberdeck.tsx` est devenu `SlotPanel.tsx`, avec le vocabulaire de l'univers.
- Les clés `localStorage` ont été renommées `table:*`. `roll-crit.ts` a été supprimé (remplacé par `universe.ts`).
- Les noms internes en base sont hérités de Night City et **ne sont jamais affichés** :
  - `eddies` = argent ;
  - `programs` / `program_slots` = emplacements ;
  - `holo_links` = échanges autorisés ;
  - `sheet.cyberware` = particularités.
- `.env` et `supabase/config.toml` de l'export Lovable pointaient vers la **base de Night City**. Ils ont été vidés, puis remplacés pour le local.

### 4.8 Base de données de Table JDR
- `supabase/migrations/20261030000000_installation.sql` : un script complet et **idempotent**, en 8 parties :
  - profils ;
  - personnages et état, avec verrou et trigger des emplacements ;
  - jets ;
  - scènes, musique et univers ;
  - bloc-notes ;
  - messagerie ;
  - stockage ;
  - temps réel.
- Testé sur un faux Supabase : lancé deux fois sans erreur, plus une vingtaine de vérifications d'accès (anonyme, joueur verrouillé, autre joueur, MJ).
- Le 30/10/2026, les copies en double ont été supprimées : `supabase/installation.sql` (même script avec BEGIN/COMMIT) et `drizzle/` (pour Lovable). Seules les migrations font foi.
- `supabase/seed.sql` : 3 comptes (`@table.local`, mot de passe `table1234`), le MJ, et 2 personnages, Alex et Sam. Relançable sans erreur.

### 4.9 Passage en local
- Le projet tourne sans Lovable. Depuis le 30/10/2026, `vite.config.ts` est une configuration Vite standard (le paquet `@lovable.dev/vite-tanstack-config` a été retiré), toujours sur le port 8080.
- `vite.config.ts` charge `.env` dans `process.env`, pour les fonctions serveur (dés, suppression de compte).
- Scripts : `db:push` (applique les migrations au projet relié) et `db:types` (régénère les types). Les scripts Docker (`db:start`, `db:reset`, `env:local`…) ont été supprimés le 30/10/2026.
- `.vscode/` : extensions recommandées (Claude Code, Prettier, ESLint, Tailwind), formatage à l'enregistrement.
- Docker n'est pas installé chez Sam : il utilise un projet Supabase en ligne (voir `CONTEXTE.md` §4).

---

## 5. Design (repères)

- **Night City / préréglage Cyberpunk** :
  - fond `#04050a` ;
  - cyan `#00f0ff`, rose `#ff2a6d`, jaune `#fcee0a`, rouge `#ff003c`, vert `#2bffc6`, violet `#b16bff` ;
  - polices Chakra Petch + JetBrains Mono ;
  - coins coupés en biseau (`.cut`, `.cut-s`), scanlines, pluie, lueurs néon.
- **Critique** : vert `#00ff88` (Sam : « #00ff88 ça me va »).
- **Boutons flottants** : messagerie en bas à gauche (compacte, clignotante) ; dés en bas à droite (jaune, compact, sans biseau, pour que le badge ne soit pas coupé).
- **Mobile** : barre d'onglets en bas sur la fiche, gouttière de 16 px, aucun défilement horizontal (`overflow-x: clip`).
- Les couches fixes (animation de dé, confirmation) sont rendues dans `document.body` : un parent avec `transform` ou `backdrop-filter` les décalerait.

---

## 6. Pièges techniques déjà rencontrés

| Symptôme | Cause | Solution |
|---|---|---|
| Erreur SQL sur « d'assaut » | Apostrophe dans une chaîne | Guillemets dollar `$json$…$json$` ou `''` |
| Le joueur ne pouvait rien modifier | Pas de politique UPDATE sur `character_state` | Politique `update state` (puis le verrou) |
| Avatar qui déborde | `img` en hauteur auto dans la grille `.av` | `position: absolute; inset: 0` |
| ECG qui « saute » | Motif qui ne divise pas la boucle, élément recréé | Longueurs diviseurs de 480 + délai calé sur l'horloge |
| Grille du tableau de bord cassée | 7e enfant dans une grille en *subgrid* à 6 colonnes | Bouton déplacé dans l'en-tête |
| Animation de dé décalée sur mobile | `position: fixed` sous un parent transformé | `createPortal` vers `body` |
| Badge coupé sur un bouton | `clip-path` du biseau | Bouton compact sans biseau |
| Tests React cassés après le portail | `view.container` ne contient plus l'overlay | `view.baseElement` |
| `scrollTo` absent dans les tests | jsdom | Utiliser `scrollTop` |
| `Infinity` cassé | Import Lucide qui masque le global | `Infinity as InfinityIcon` |
| Erreurs `exactOptionalPropertyTypes` | `prop: undefined` refusé | Construire l'objet sans la clé, ou typer `T \| undefined` |
| Un test échoue à cause d'un toast restant | Toasts supprimés partout | Ne plus en utiliser |
| Les erreurs ne s'affichaient plus du tout (appels `toast` sans Toaster monté) | Remplacés le 30/10/2026 par `InlineError`, un message rouge dans la page près de l'action, effacé après 8 s | Pour une nouvelle erreur : un état `useState<string \| null>` + `<InlineError>` ; jamais de pop-up |
| Bouton de dés MJ invisible sur mobile | Classe `gm-home` plus posée par aucun code | Règle `.fab-desk:not(.player-fab)` |
| Fonction `usePreset` refusée par ESLint | Nom commençant par `use` = hook | Renommée `applyPreset` |
| `npm` non reconnu sous Windows | Node.js pas installé ou terminal ouvert avant | Installer Node, rouvrir VS Code |
| « l'exécution de scripts est désactivée » | Politique PowerShell | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `supabase start` : « docker: command not found » | Pas de Docker | Base Supabase en ligne pour le dev |

---

## 7. Journal des demandes de Sam (chronologique, résumé)

1. Fiche SUDO en HTML : compteurs de PV, chargeurs et balles ; Eddies ; inventaire modifiable ; ordre des blocs ; export JSON au format d'origine. Même chose pour la fiche d'un ami (Kaïra).
2. Idée de webapp Lovable : chacun voit sa fiche, jets de tous en direct, dés d4 à d100 avec 1d10/2d10…, et le MJ modifie tout.
3. Personnages de test en SQL (et script de suppression) ; compte MJ de test ; son propre compte repassé en joueur.
4. Profil joueur ; « pourquoi je ne peux rien modifier » (politique manquante) ; jamais d'e-mail, toujours le pseudo du personnage.
5. « Personne ne lance un dé à la place de quelqu'un d'autre, même le MJ » ; le meilleur aléatoire possible.
6. Grosse refonte graphique cyberpunk moderne :
   - le groupe visible sans détails ;
   - mobile ;
   - clic sur une compétence = 1d10 + base ;
   - munitions plus jolies ;
   - fond choisi par le MJ ;
   - œil pour masquer l'interface ;
   - musique YouTube pilotée par le MJ (volume, position…).
7. Arsenal à rapprocher du prototype ; couleurs et animations des compétences ; bugs visuels sur des jets ; fil des jets fixe et transparent.
8. Tableau de bord MJ (onglets Tableau de bord / Fiche / Profil / MJ) ; association des joueurs aux personnages en SQL.
9. Passage « à l'ancienne » (zips). Correctifs : photo, saut de l'ECG (trois états visuels), verrou MJ, barre du groupe, widget YouTube déplaçable et réductible avec un son local pour les joueurs.
10. Musique : plus de réglages (boucles, changement facile) ; scènes : propositions d'améliorations ; transparence réduite ; navigation recentrée.
11. Champs encore modifiables sous verrou ; dé centré sur mobile ; exploration de l'image en interface masquée ; balles de D. ; bloc-notes joueur visible par le MJ seulement ; icône et titre d'onglet ; balles de dexter ; bandeau cliquable.
12. Messagerie : le MJ voit tout ; les joueurs entre eux si le MJ le permet (« Holo-Call ») ; le MJ parle partout ; les joueurs joignent toujours le MJ. Puis : balles dans le bandeau ; critique en vert.
13. Messagerie en bas à gauche, petite et sobre, avec le clignotement ; même style pour le bouton de dés ; « retire-moi tous » les pop-ups ; « ••• » (Lovable).
14. Tableau de bord plus clair, centré sur les balles (« ne touche à rien d'autre ») ; écran des permissions de messagerie à revoir ; SQL pour vider les jets et les messages.
15. Choisir la carac d'une compétence créée par le MJ ; panneau musique « vraiment intuitif » ; PV 50/45 « pas possible ».
16. Cyberdeck : slots, programmes, dé et effet réglés par le MJ, et le joueur choisit selon la place. Puis : réglage seulement en Mode édition ; confirmations de suppression dans l'appli ; colonnes alignées et bloc-notes qui défile ; dés du MJ sur mobile.
17. Conseils de jeu pour SUDO (compétences de netrunner, Contrefaçon).
18. **Version neutre** pour d'autres univers : tout configurable, réglage dans l'appli, nouveau projet, SQL complet.
19. « On le fait avec Claude Code » : dépôt GitHub `Samv02/table-jdr` ; React + TypeScript confirmé comme bon choix ; passage en local avec VS Code et Claude Code ; base Supabase en ligne (sans Docker) ; premier lancement réussi le 30/10/2026.
20. **Plateforme multi-équipes et back office** (30/10/2026) : plusieurs groupes séparés, inscription libre, créer une équipe (on en devient MJ) ou en rejoindre une avec un code, back office `/admin` (vue globale, équipes, comptes, activité). Choix : équipe active côté base (une requête ne peut pas sortir de son équipe) ; une équipe active par compte, donc pas deux équipes ouvertes en même temps sur deux appareils ; changer d'équipe recharge la page ; un compte peut être MJ ici et joueur là ; une équipe garde toujours un MJ (le plus ancien membre est promu si le dernier MJ part) ; un MJ retire un membre de son équipe mais seul l'admin supprime ou suspend un compte ; chacun peut supprimer son propre compte.
21. **Back office complet** (30/10/2026) : console séparée du jeu (l'admin ne joue pas), vue globale (à traiter, KPI, graphiques 14 jours, équipes actives), support par tickets (ouvert, en cours, traité, notes internes), pilotage (maintenance, ouverture des inscriptions, des créations et des jonctions, limite d'équipes, annonces en bandeau, exports CSV), activité séparée en Jets / Messages / Journal admin, jamais mélangés, filtrée par équipe, période et visibilité. Les notifications par e-mail du support restent à faire : la réponse s'affiche seulement dans l'appli.
22. **Modération** (30/10/2026) : aucun message n'est bloqué. Les mots de `moderation_words` (modifiables dans Pilotage) surlignent le message en rouge dans Activité, avec suspension de l'auteur en un clic. Pas de mots seuls comme « tuer » ou « mort », normaux en jeu de rôle.
23. **Catalogue et fiche de départ** (30/10/2026) : le MJ prépare armes, consommables, pouvoirs et équipement (prix, description, dé, effets) dans Univers. Table `catalog_items` plutôt que l'univers : ce qui est caché reste illisible pour les joueurs. Achat, don et utilisation passent par `src/lib/catalog.functions.ts` : dé tiré au serveur, verrou MJ respecté. La fiche de départ (`universe.template`) s'applique aux nouvelles fiches uniquement.
24. **Tableau de bord organisable** (30/10/2026) : le MJ choisit l'ordre et le tri des fiches, les fiches, sections, stats et valeurs affichées, avec les filtres en ligne et blessés. Disposition gardée par MJ et par équipe dans `team_members.dashboard`, donc sur tous ses appareils.
25. **Visuels de santé** (30/10/2026) : 7 visuels fixes (`theme.hpVisual`, `src/lib/hp-visual.ts`), conseillés selon le thème, avec aperçu dans Univers. Le visuel ne décide jamais de l'état : `hpLevel` est la seule règle.
26. **Assistant de formules** (30/10/2026) : plus aucune formule à écrire pour les cas courants, des phrases à trous (`src/lib/formula-builder.ts`) relues depuis la formule enregistrée, un résumé en français et un exemple. Le mode libre garde tout le langage de `formula.ts`.
27. **Disposition du tableau de bord** (30/10/2026) : mode activable façon gestionnaire de fenêtres, grille 1 à 6 colonnes, fiches et sections déplacées au doigt ou à la souris (`src/lib/use-drag-sort.ts`, sans bibliothèque), largeur par fiche. Sous 700 px, la fiche reste en défilement horizontal. Puis version poussée : copie qui suit le pointeur, réorganisation animée en direct, galerie de dispositions avec aperçu au survol, poignée de largeur, densité, Annuler et Ctrl+Z, éléments masqués à restaurer, clavier complet.
28. **Panneau Personnaliser** (30/10/2026) : remplace Organiser. Panneau à côté du tableau, fiches et sections glissées, œil pour masquer, pastilles de stats, vues rapides et vues enregistrées. La ligne de munitions a quitté les cartes du haut à la demande de Sam.
29. **Onglet Personnages et bibliothèque de compétences** (31/10/2026) : créer, attribuer et ouvrir au même endroit. `rules.skillLibrary` (remplie par préréglage) relie chaque compétence à sa caractéristique ; le MJ l'ajoute à une fiche d'un clic, sans doublon, et la base se calcule toute seule.
30. **Bug PV à 0 en Horreur** (31/10/2026) : le maximum calculé valait 0 sur des fiches sans CON ni TAI, et les boutons plafonnaient les PV dessus, ce qui écrasait la donnée. Règle posée par Sam : base → information affichée → visuel, jamais l'inverse. Un maximum à 0 veut dire « inconnu ».
31. **Revue globale** (31/10/2026) : plus aucune écriture depuis l'affichage (ouvrir une fiche pouvait réécrire PV et munitions, y compris avec l'univers neutre avant chargement) ; un seul composant `Button`, imposé par ESLint ; `table-integration.css` nettoyé (854 lignes de code mort). Le flou double `backdrop-filter` + `-webkit-backdrop-filter` était perdu à la compilation : n'écrire que `backdrop-filter`.

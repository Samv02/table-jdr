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
31. **Revue globale** (31/10/2026) : plus aucune écriture depuis l'affichage (ouvrir une fiche pouvait réécrire PV et munitions, y compris avec l'univers neutre avant chargement) ; un seul composant `Button`, imposé par ESLint ; `table-integration.css` nettoyé (854 lignes de code mort). Le flou double `backdrop-filter` + `-webkit-backdrop-filter` était perdu à la compilation : n'écrire que `backdrop-filter`. Couleurs de `table-integration.css` passées sur les variables du thème, sauf le métal des balles, le noir des vidéos, les masques et les voiles sur image, qui ne doivent pas suivre le thème.
32. **Nouveau plan de l'appli** (31/10/2026) : hub « Mes tables » (une carte aux couleurs de chaque univers, un clic pour entrer, reprise de la dernière table, prochaine séance, signal « Du nouveau »), lien d'invitation, guide des premiers pas du MJ. Navigation séparée entre le compte et la table ; pages MJ à part entière (Partie, Scènes, Musique, Personnages, Joueurs, Univers). Retirés car en double : onglet « Table » (`GmTable`), liste de personnages du profil, sélecteur de fiche hors de la fiche. Univers passe d'un accordéon à un sommaire avec recherche, une page par sujet. Le mot « équipe » disparaît de l'interface au profit de « table ».
33. **Hub habillé** (31/10/2026) : chaque carte reprend l'ambiance réelle de son univers (fond animé, coins, lueurs, scanlines, police) sans rien de propre à un jeu dans le code ; groupe affiché par pseudos de personnages (`party` dans `my_hub`), accueil personnalisé, prochaine séance en tête, transition à l'entrée. Testé de 320 px au téléphone couché ; animations coupées si l'appareil demande moins de mouvement.
34. **Mon compte et Aide refaits** (31/10/2026) : même maison que le hub. Compte : carte d'identité à la couleur du joueur, aperçu du pseudo en direct, suppression isolée. Aide : une porte par type de demande, formulaire adapté, conversation en bulles. Bug corrigé : un chargement tardif effaçait le pseudo en cours de saisie. Les classes `shape-*` et `air-*` du hub sont composées dynamiquement : un nettoyage CSS doit les garder.
35. **Aperçus de l'Univers** (31/10/2026) : un modèle s'essaie sans fenêtre de confirmation, avec Garder ou Revenir (retour au brouillon d'avant, pas seulement à l'enregistré). Panneau de fiche fictive à côté des réglages, dans un tiroir ouvert par un bouton sous 1200 px. Vue joueur plein écran sur le personnage fictif ou un vrai personnage de la table. `src/components/SheetPreview.tsx` n'écrit jamais rien et ne réutilise pas `routes/fiche.tsx`, qui enregistre à chaque clic : un bloc ajouté à la vraie fiche doit aussi y être reporté. La messagerie, le bloc-notes et la boutique n'y figurent pas.
36. **Photo par table** (31/10/2026) : `team_members.avatar_url`, vide = photo du compte. Écrite seulement par `set_table_avatar` (sa ligne, un fichier de son dossier), réglée dans Mon compte. `get_party` et `get_team_members` renvoient la photo de la table ; `useProfiles` la reprend pour les dés et les joueurs. Quitter une table laisse le fichier dans le dossier du compte jusqu'à sa suppression.
37. **Hub : mes tables et tri** (31/10/2026) : `my_hub` renvoie `is_owner`. Badge couronne « MJ · Propriétaire » et liseré sur les tables du compte. Tri `sortTables` (dernière ouverte, mes tables d'abord, prochaine séance, nom), mémorisé sur l'appareil. La grande carte « Reprendre » n'existe qu'en tri « Dernière ouverte ».
38. **Lisibilité** (31/10/2026) : options des listes déroulantes opaques pour toute l'appli, textes d'exemple des champs dans la police du texte. La police mono écarte trop les mots : elle reste aux chiffres et étiquettes, une phrase prend `.note plain`.
39. **Maximum de PV fixé par le MJ** (31/10/2026) : `sheet.hpMaxForced`, réglé en Mode édition, passe avant la formule dans `hpMax` ; 0 ou vide = la formule. Le maximum peut aussi baisser : les PV enregistrés ne changent pas, l'écran plafonne (règle 6).
40. **Carte 2D** (31/10/2026) : page `/carte`, bouton en haut à droite pour tout le monde. Tables `maps` (taille, `walls` = arêtes de grille) et `map_tokens` (pions libres, en fractions de case), `session_state.active_map_id` pour la carte affichée. Le joueur ne lit que la carte affichée et les pions non cachés, filtré par la base (RLS) ; seul le MJ écrit. Calculs dans `src/lib/map.ts`. Masquer un pion touche aussi `maps.updated_at`, car le joueur ne reçoit plus d'événement pour une ligne qu'il ne peut plus lire. Le déplacement part en base au lâcher, pas pendant le glissé.
41. **Carte, table virtuelle** (31/10/2026) : plateau plein écran avec caméra libre (molette, pincement, glissé, Espace), barres flottantes, plein écran par CSS pour garder les fenêtres de confirmation. Outils Pièce, Mesurer (échelle et unité par carte), Signaler (Alt+clic). Annuler et rétablir pour murs, portes et déplacements du MJ, raccourcis clavier, image de fond (bucket privé `maps`). Pions : taille, couleur, duplication, liste. Glissés et signaux passent par un canal Realtime passager, jamais en base ; un pion caché n’est jamais diffusé. `move_my_token` laisse un joueur bouger son seul pion si le MJ l’a permis. Vision limitée : polygone de visibilité par pion du groupe (`blockers`, `visibility`). Limite : ce filtre est fait sur l’écran du joueur, les pions non cachés lui sont envoyés quand même ; pour un secret absolu, le MJ coche Caché. Les murs n’arrêtent pas les pions.
42. **Carte du joueur en fenêtre flottante** (31/10/2026) : demandé par Sam, le joueur ouvre la carte par-dessus sa fiche depuis le bouton du header, avec transparence réglable (mémorisée sur l’appareil). `MapPage` prend `popup` ; le MJ garde la page `/carte`. La zone couverte par la vision limitée reste opaque, sinon elle laisserait voir la fiche sans rien cacher de plus.
43. **Types de portes sur la carte** (01/11/2026) : l'outil Porte propose Porte, Double, Secrète, Grille et Trappe, sans migration (champ `door` dans `walls`, absent pour une porte simple, donc les anciennes cartes ne changent pas). La grille laisse passer la vue même fermée ; la secrète est un mur pour les joueurs tant qu'elle est fermée ; la trappe se pose au sol d'une case (`dir: "c"`), pas sur une arête, et ne bloque pas la vue.
44. **Règles de vision de la carte** (01/11/2026) : réglées par carte, sous « Vision limitée ». `vision_mode` room (toute la pièce, de proche en proche jusqu’aux portes fermées) ou sight (champ de vue), `vision_range` dans l’unité de la carte (0 = sans limite), `vision_corners` pour voir derrière les angles. Calculs dans `sightFrom` et `sees` (`src/lib/map.ts`), mêmes règles de blocage que `blocksView` : une grille laisse voir, une porte secrète fermée bloque. Pose de pions directement cachés (choix mémorisé sur l’appareil, touche H), « Révéler tous ». Limite : la vision reste un filtre d’écran, seul un pion Caché n’est pas envoyé au joueur.
45. **Particularités en puces et disposition de la fiche** (03/11/2026) : en Mode édition, le Cyberware (et ses équivalents) s'édite en puces (`FeatureEditor`), la donnée reste une ligne par élément. Bloc identité lisible en édition sur téléphone. Bouton « Disposition » sur la fiche, à l'ordinateur seulement : plateau libre de 12 colonnes sur toute la largeur de l'écran. Chaque bloc a sa colonne, sa largeur (bord droit à tirer) et sa hauteur, on peut laisser des espaces ; sa hauteur suit son contenu et un bloc qui grandit pousse ceux du dessous (`resolveLayout`). Œil pour masquer, « Resserrer » retire les espaces, « Par défaut », flèches du clavier (Maj : largeur). Propre à chaque membre et à chaque table (`team_members.sheet_layout`, `get_sheet_layout` / `save_sheet_layout`), donc valable pour toutes les fiches qu'il ouvre. Règles dans `src/lib/sheet-layout.ts`. Sur téléphone, les onglets du bas restent : chaque bloc garde son onglet, seul l'ordre et le masquage s'appliquent.
46. **Carte : sols dessinés par formes** (03/11/2026) : Sam veut un éditeur de carte complet, sur le modèle des éditeurs de donjons en ligne (liste fournie le 03/11). Découpé en 7 étapes, voir `docs/CONTEXTE.md` §6 ; ceci est l'étape 1. L'outil « Pièce » (murs en rectangle) devient « Sol » (touche B) : Rectangle (coins arrondis), Cercle ou polygone régulier, Couloir (points posés au clic, largeur 1 à 4, droit ou courbe ; double-clic, Entrée ou « Terminer » pour finir, Retour arrière enlève le dernier point), Forme libre (revenir au premier coin ferme, contour droit ou arrondi). Ajouter / Creuser (touche X), Aimant case / demi-case / libre (touche S), Usure 0 à 3, `[` `]` pour la largeur ou les côtés. Stocké dans `maps.shapes` (liste ordonnée, points en `[x, y]`, 1000 formes au plus), calculé par `src/lib/map-shapes.ts` avec la bibliothèque `polygon-clipping` : les formes s'appliquent dans l'ordre (ajout = union, creuser = différence), le sol est rogné au bord de la carte. Le contour donne les murs, qui bloquent la vue (`sightFrom(..., walls)`, et `reachableCells` coupe un pas de case à case qui traverse un mur). Une porte posée sur un mur de sol le perce (`cutByDoors`) : ouverte ou en grille, la vue passe. La grille ne se dessine que dans les salles, plus une grille pâle dehors pour le MJ. Les murs de la grille, les portes et les anciennes cartes ne changent pas. Limites : une porte ne perce qu'un mur droit aligné sur la grille ; en vision « pièce », les bords courbes sont révélés case par case.
47. **Carte : styles de rendu et matières** (03/11/2026, étape 2 de l'éditeur) : Réglages de la carte → « Apparence ». Six styles de départ : Thème (couleurs de l'univers, par défaut : les anciennes cartes ne changent pas), Hachures, Parchemin, Plan bleu, Murs pleins, Noir et blanc ; puis retouches : couleurs du sol, de la roche, des murs, de la grille et de chaque matière (sélecteur de couleur), épaisseur des murs, hachures et leur largeur, ombre, grille hors des salles, « Revenir au style d'origine ». Stocké dans `maps.style` (le style et seulement ce qui s'en écarte, `styleToJson`), lu par `readMapStyle` (`src/lib/map-style.ts`) ; l'écran suit tout de suite, l'écriture attend 350 ms (sélecteur de couleur). Les couleurs passent par des variables CSS sur le plateau (`styleVars`) ; une couleur absente suit le thème. Hachures : motif stable (`hatchTile`) dans une bande autour des salles (masque SVG). Outil Sol → « Matière » : Sol, Eau, Lave, Végétation, Route. Chaque matière est sa propre couche (`floorOf(..., layer)`, champ `layer` des formes) : creuser n'agit que sur la matière choisie, et seule la matière Sol fait des murs qui bloquent la vue. Ordre de dessin : roche, hachures, route, ombre, sol, végétation, eau, lave, grille, murs.
48. **Carte : objets, tampon et zones** (04/11/2026, étape 3 de l'éditeur) : trois outils MJ. **Objet** (touche O) : poser un symbole ou une image de la Bibliothèque, un escalier (marches par case, flèche de montée) ou un texte ; « Choisir » sélectionne, glisse pour déplacer, le coin pour agrandir (Maj : sans garder les proportions), la poignée du haut pour tourner (calée de 15 en 15°, Maj : libre). Barre de l'objet choisi : texte, taille, rotation, couleur, opacité, devant, derrière, dupliquer (Ctrl+D), supprimer (Suppr) ; les retouches rapprochées d'un même objet font une seule annulation et une seule écriture (`patchObject`). Aimant case, demi-case ou libre (`snapObjectCenter` : les bords tombent sur la grille). **Bibliothèque** : environ 100 symboles au trait (icônes lucide, noms français dans `SYMBOL_LABELS`, dessins dans `src/components/map-symbols.ts`) et les images importées par le MJ, rangées dans le stockage `maps`, dossier `<table>/objets/` (lisible par la table seule, règles déjà en place). Aucune image d'un autre site. **Tampon** (touche T) : répète le symbole ou l'image au fil du pinceau (écart, taille P/M/G, rotation au hasard, dispersion), un seul enregistrement au lâcher. **Zone** (touche C) : glisser choisit un rectangle de cases ; Copier (Ctrl+C), Couper (Ctrl+X), Vider (Suppr) ; un clic colle la copie (coin haut-gauche sur la case touchée). La copie garde chaque matière de sol (contours en formes libres, trous en formes qui creusent), murs, portes et objets (`src/lib/map-zone.ts`). Stockage : `maps.objects` (2000 objets au plus, `readObjects` refuse un chemin d'image hors du dossier de la table). Sols, murs et objets partagent une seule opération d'annulation (`saveContent`), donc un collage s'annule d'un coup. Les objets ne bloquent pas la vue et restent sous le brouillard. Limite : un objet est lisible par les joueurs dans les données de la carte affichée, il n'y a pas d'objet caché.
49. **Carte : calques et étages** (04/11/2026, étape 4 de l'éditeur) : **Calques** (pastille en haut, à côté des pions) : le calque principal, ce sont les sols et objets de la carte (`maps.shapes`, `maps.objects`) avec les murs et portes ; chaque autre calque est une ligne de `map_layers` (nom, position, `hidden`, `locked`, `shapes`, `objects`, 20 au plus). On dessine dans le calque choisi ; les calques visibles s'empilent dans l'ordre (un calque peut creuser ceux du dessous, `visibleShapes`). **Un calque caché n'est jamais envoyé aux joueurs** : la règle de lecture de `map_layers` le filtre en base (vérifié le 04/11 avec joueur1 : calque caché absent, visible présent, écriture refusée). Le MJ le voit en violet pointillé, ses sols ne comptent pas pour les murs ni la vision. Cacher ou montrer touche `maps.updated_at` pour que les joueurs rechargent. Verrouillé : les outils de dessin ne font que déplacer la vue. Monter, descendre, renommer, supprimer (confirmé ; les annulations de ce calque sont retirées). Dupliquer une carte copie ses calques. L'annulation vise le calque de l'action (`Op.layer`). **Étages** : `maps.place` (lieu) et `maps.level` (niveau, de -50 à 50), réglés dans Réglages → Étages ; flèches en haut pour l'étage voisin du même lieu (`neighborFloor`, insensible à la casse et aux espaces) ; « Nouvel étage » crée la carte du niveau au-dessus, même taille et même apparence. Un objet (escalier, échelle, portail) peut « mener à » une autre carte (`link`) : « Y aller », et « Emmener le groupe » qui déplace les pions du groupe près de l'objet qui ramène ici (sinon au centre, `partySpots`) et fait suivre l'affichage si la carte était affichée.
50. **Carte : éclairage et brouillard à la main** (05/11/2026, étape 5 de l'éditeur) : Réglages → Éclairage. « Nuit et lumières » (`maps.light` : `on`, `night` couleur de la nuit, `dark` obscurité de 0 à 1, `party` portée en cases de la lumière des pions du groupe, saisie dans l'unité de la carte). Outil Objet → **Lumière** : objet `k: "light"` avec `rad` (portée en cases), `bright` (part en pleine lumière), `color` (teinte) et `op` (intensité) ; portée réglée en −/+ ou Petite/Moyenne/Grande (2, 4, 8 cases : tailles neutres, aucune règle de jeu dans le code). Chaque lumière est arrêtée par les murs (même calcul que la vue, `visibility`), dessinée par un masque qui troue la nuit (`map-dark`) et une teinte en mode `screen`. Le MJ voit la nuit à moitié et le petit soleil des lumières ; le joueur ne voit que l'effet. Les lumières d'un calque caché n'éclairent pas. **Brouillard à la main** : interrupteur dans les réglages (`maps.manual_fog`) et outil **Brouillard** (touche F) : Pinceau (taille 1, 2, 3 ou 5 cases) ou Pièce (révèle toute la pièce touchée, jusqu'aux murs et portes fermées, `revealRoom`), Révéler ou Cacher, Tout révéler, Tout cacher. Masque `maps.fog_mask` : un bit par case sur une grille fixe 100 × 100, en base64 (`src/lib/map-light.ts`), annulable avec le reste du dessin. Chez le joueur, une case cachée est opaque et les pions non joueurs qui s'y trouvent ne s'affichent pas ; le MJ la voit assombrie. Limite : comme la vision, le brouillard et la nuit sont un filtre d'écran, les données de la carte affichée restent lisibles ; pour un vrai secret, un calque caché.
51. **Carte : donjon aléatoire** (05/11/2026, étape 6 de l'éditeur) : bouton dés en haut de la carte (MJ) → panneau « Donjon aléatoire ». Réglages : taille (Petite 24 × 16, Moyenne 36 × 24, Grande 50 × 34, la carte prend cette taille), nombre de pièces (4, 7, 11, 16), taille des pièces, longueur et largeur des couloirs, disposition (En ligne, Ramifiée, Équilibrée avec boucles, Sinueuse), portes (part des entrées de pièce), formes (carrées, irrégulières à coin entaillé, arrondies ; au moins une), usure, numéros de salle (textes). « Générer » remplace sols, murs, portes et objets du **calque principal** (confirmation la première fois ; les pions et les autres calques restent), en une seule opération annulable ; le changement de taille, lui, ne s'annule pas. Calcul dans `src/lib/map-dungeon.ts` : tirage stable (`random(seed)`, mulberry32), pièces qui poussent à côté d'une pièce posée (en ligne : de la dernière), couloirs droits quand les pièces se font face, sinon en L (zigzag en sinueux), portes sur la case où un couloir étroit sort d'une pièce (couloirs larges : pas de portes). Tests : même tirage = même donjon, toutes les pièces reliées et un seul sol d'un seul tenant pour chaque disposition.
52. **Carte : export, fichier et écran de table** (05/11/2026, étape 7, dernière de l'éditeur) : bouton Exporter (flèche de téléchargement) en haut de la carte (MJ). **Image** : PNG ou JPG, 50 / 70 / 100 / 140 pixels par case (taille finale affichée, bornée à 40 millions de pixels), avec ou sans pions, avec ou sans la nuit ; toute la carte, sans brouillard, outils, graduations ni calques cachés. `mapImage` (`src/lib/map-export.ts`) recopie le plateau affiché avec ses styles calculés (une image SVG ne lit pas les feuilles de style), intègre les images en `data:` et retire la caméra. **Imprimer ou PDF** : l'image dans une fenêtre d'impression (le navigateur propose « Enregistrer en PDF »), sans bibliothèque. **Fichier** `.carte.json` (format `table-jdr-carte`, version 1) : carte, calques, ennemis et alliés (jamais les pions du groupe) ; « Ouvrir » crée une nouvelle carte « (importée) », tout est revérifié à la lecture (`readMapFile`, mêmes lecteurs qu'en base, limites des pions alignées sur la base). Les images importées restent propres à la table d'origine. **Écran de table** : `/carte?ecran=1`, ouvert depuis le panneau dans une fenêtre à glisser sur une télé : la carte affichée telle que la voient les joueurs (brouillard et nuit opaques, aucun outil, bouton Plein écran discret). Le compte MJ reçoit aussi ce qui est caché : calques et pions cachés y sont retirés explicitement (vérifié le 05/11 : seul le pion visible apparaît).
53. **Carte : portes du donjon et interface pour tous** (08/11/2026) : **Portes du donjon aléatoire** : une porte n'est posée que si le passage est un vrai goulet (la case devant la porte est hors de toute pièce et n'a pas de sol sur ses côtés) ; avant, un couloir qui longeait une pièce ou croisait un autre couloir recevait des portes qu'on pouvait contourner (capture de Sam). Test sur 80 donjons. **Refonte, étape 1 sur 4** (Sam : « refonte graphique plus moderne et user friendly… n'importe qui, même novice ») : le choix de carte devient une **galerie** (bouton au nom de la carte, en haut à gauche) avec vignettes dans les couleurs de chaque carte (`MapThumb`), recherche, Montrer aux joueurs, Renommer, Dupliquer, Supprimer, Importer. **Assistant de création** en quatre choix : modèle (Vide, Une salle, Maison, Bâtiment, Grotte, Donjon ; `src/lib/map-templates.ts`, tests : chaque pièce accessible à pied, chaque porte entre deux sols), taille, apparence, nom ; sans carte, l'assistant s'ouvre directement. **Mode Simple / Avancé** (mémorisé sur l'appareil, Simple par défaut) : Simple garde Déplacer, Pièce (ex-Sol), Porte, Objet, Gomme, Ennemi, Allié, Mesurer, Signaler et seulement la forme du sol ; Avancé ajoute Mur, Tampon, Zone, Brouillard, les options du sol, les calques et le donjon. Outils nommés sous leur icône, **bulle d'aide** de l'outil (masquable), **visite guidée** de 4 écrans à la première ouverture (bouton Aide pour la revoir). Bouton « Montrer aux joueurs » / « Vue par les joueurs » (voyant qui pulse). Interface en verre dépoli ; sur téléphone, barre du haut sur une ligne qui défile, outils en bas avec leur nom. Rien n'a changé en base.
54. **Carte : réglages des outils et thèmes** (08/11/2026) : **Panneau des réglages** (Sam : « les sous-catégories ne sont pas trop user friendly ») : les deux barres de boutons texte au-dessus de la carte deviennent un panneau accroché à droite des outils (`src/components/MapInspector.tsx`), avec le nom de l'outil, des sections nommées, des choix en vignettes dessinées (formes, coins, côtés, largeur, tracé, matières en pastilles de couleur, aimant, types de portes, taille du pinceau) et l'explication du choix courant dessous ; usure et opacités en curseurs avec leur valeur écrite ; l'objet choisi s'y règle aussi (taille, rotation, couleur, opacité, « mène à », devant, derrière, dupliquer, supprimer). Le panneau se replie (mémorisé sur l'appareil) ; sur téléphone, il passe en bas au-dessus des outils. Ancien CSS des barres retiré. **Refonte, étape 2 sur 4 : thèmes de carte en un clic** : bouton « Thème » en haut de la carte (et « Changer de thème » dans les réglages), 14 thèmes rangés par époque avec un aperçu vivant (`src/components/MapThemeArt.tsx`) : À l'ancienne (Parchemin, Gravure, Carnet, Pierre), Classiques (Thème, Hachures, Plan bleu, Murs pleins, Noir et blanc), Modernes (Architecte, Station, Néon, Hologramme, Tactique). Nouveaux réglages de `maps.style`, sans migration : `texture` (papier, grain, pierre, écran, trame, motifs de bruit « stitch » sans couture), `wallLine` (plein, double, à la main par filtre de déplacement), `gridLine` (lignes, tirets, points), `font` (lettres du thème, anciennes, techniques, manuscrites), `glow` (lueur des murs), `vignette` (bords assombris). « Retoucher ce thème » ouvre couleurs et effets. Le thème Parchemin gagne papier, lettres anciennes et vignettage : les cartes déjà en Parchemin changent d'aspect. L'export en image garde les filtres (`filter` copié). L'assistant de création montre les mêmes aperçus.
55. **Carte : caméras et champs de vision** (08/11/2026, refonte étape 3 sur 4) : outil Objet → **Caméra** (nouvel objet `k: "camera"` dans `objects`, sans migration : `cone` = ouverture `fov`, portée `range` en cases, balayage `sweep` et vitesse `speed`, `show` ; nom facultatif dans `text`). Elle regarde dans le sens de sa rotation (poignée, boussole à 8 flèches ou curseur). **Ennemis et alliés** : interrupteur « Champ de vision » dans le panneau de l'outil Ennemi/Allié et dans la liste des pions, colonne `map_tokens.cone` (migration `20261108100000_cartes_champs_de_vision.sql`, null = aucun, taille bornée). Réglages communs (`ConeControls`) : direction, ouverture (Étroit, Normal, Large, Tout autour), portée dans l'unité de la carte, mouvement (Fixe, Lent 8 s, Rapide 4 s) et amplitude, visible ou caché aux joueurs. Calcul dans `src/lib/map-cones.ts` (tests) : le cône est coupé par les murs (polygone de visibilité), un pion du groupe dedans est **repéré** : le cône devient rouge et clignote, le pion a un anneau rouge, le MJ voit un voyant « Alex repéré » en haut (pas de pop-up). Tout est calculé sur l'écran de chacun, rien n'est écrit en base (règle 6) ; le balayage suit l'horloge de l'appareil. Un cône « caché » n'est montré qu'au MJ, en pointillés, avec sa caméra ; comme la vision, c'est un filtre d'écran (la caméra reste dans les données) : pour un vrai secret, un calque caché. Le fichier de carte garde le champ de vision des pions.
56. **Carte : styles des symboles** (08/11/2026, demandé par Sam : « les objets c'est un peu trop simple, propose différents styles des mêmes, ancien, tech… ») : chaque symbole se dessine en 6 styles (`OBJECT_LOOKS`, `SymbolArt`) : Trait, Encre (sépia tremblé avec lavis, filtre `map-obj-ink`), Pastille (couleur de sa famille, `GROUP_COLORS`, variables du thème), Néon, Plan (cadre en pointillés), Pion (jeton). Chaque thème a son style d'objets (`objLook` : encre pour les thèmes anciens, plan pour Architecte, Station et Plan bleu, néon pour Néon et Hologramme, pion pour Tactique, trait sinon), réglable dans « Retoucher ce thème » ; un objet peut choisir le sien (`look`, « Carte » le rend au thème, `updateObject(..., { look: "auto" })`). **Bibliothèque refaite** : choix du style des prochains symboles avec aperçu, recherche par nom français, familles en pastilles, vignettes plus grandes avec leur nom. Le tampon pose ses symboles dans le style de la carte. Piège évité : les classes de dessin sont préfixées `sym-` (la classe `badge` existe déjà dans l'appli).
57. **Carte : ambiance, flammes, glisser-déposer, journal** (09/11/2026, refonte étape 4 sur 4, ajouts de notre initiative) : **Ambiance animée** (panneau « Thème et ambiance ») : Aucune, Pluie, Orage (éclairs de temps en temps), Neige, Brume qui dérive, Braises qui montent, Cendres, Parasites ; force réglable. Stockée dans `maps.light` (`weather`, `weatherPower`, sans migration, `WEATHERS` dans `src/lib/map-light.ts`), dessinée par un calque CSS au-dessus du plateau (`.map-weather`), vue des joueurs, arrêtée si l'appareil demande moins de mouvement ; pas dans l'export en image. **Lumière qui vacille** : réglage « Flamme : Fixe / Vacille » d'une lumière (`flicker` dans l'objet), animation du masque de nuit et de la teinte, décalée d'une lumière à l'autre. **Glisser-déposer** : un symbole de la bibliothèque se glisse sur la carte (ordinateur) ; il est posé à l'endroit lâché, dans le style choisi, puis sélectionné (`onDropSymbol`, type `application/x-map-symbol`). Sur téléphone, on touche le symbole puis la carte, comme avant. **Journal des repérages** (MJ) : le voyant de repérage ouvre la liste « 14:32 Alex repéré par Caméra du hall », 40 lignes au plus, sur l'écran du MJ seulement et pour la séance (rien en base).
58. **Scènes refaites** (09/11/2026, demandé par Sam : « 123 », pistes Scènes, Partie, Armes) : page MJ (`src/components/SceneManager.tsx`) en vignettes larges avec badge « Vue par les joueurs », musique et ambiance ; **un clic ouvre l'aperçu** (rien ne change chez les joueurs), le gros bouton « Montrer aux joueurs » diffuse, « Ne plus montrer » retire la scène. **Import de plusieurs images d'un coup**, nommées d'après le fichier (`nameFromFile`). **Glisser-déposer** pour l'ordre, seules les positions changées sont réécrites (`reorder`, `sortChanges`), plus « Plus tôt / Plus tard » au clavier. **Dossiers** (champ libre avec propositions, filtres en pastilles). **Transition** par scène (Fondu, Direct, Zoom, Glissé, Mise au point, Éclair) avec « Revoir la transition » dans l'aperçu ; **ambiance animée** (les mêmes que la carte, calque `.scene-weather` au-dessus du fond, sous l'interface) ; **musique liée** (une piste de la musique de la table ou un lien YouTube collé) qui démarre depuis le début quand on montre la scène (`musicForScene` : se place sur la piste si elle est dans la file, sinon l'ajoute à la fin ; passe par `set_table_music`, donc horloge serveur). Migration `20261109100000_scenes_ambiance.sql` : `scenes.folder`, `transition`, `ambiance`, `music` (contraintes de valeurs et de taille). Règles dans `src/lib/scenes.ts` (tests). Sur téléphone, l'aperçu passe au-dessus des vignettes et l'écran y descend. Piège : les tests lancés d'un bloc échouent sans message quand un serveur tourne ; par dossier (`npx vitest run --maxWorkers=1 src/lib`, puis `src/components`, `src/test`), ils passent.
59. **Partie : emplacements et bloc-notes des joueurs** (09/11/2026) : deux nouvelles sections dans chaque fiche du tableau de bord (`DASHBOARD_SECTIONS`). **Emplacements**, au nom de l'univers (Cyberdeck, Grimoire…) et seulement si le module est actif : barre de place prise (rouge si elle déborde), éléments avec point allumé s'ils sont actifs, dé, coût, « ? » et rappel quand un élément attend le réglage du MJ ; lecture seule, le réglage reste en Mode édition sur la fiche. **Bloc-notes** : lecture seule (le MJ ne l'écrit jamais), « Modifié il y a 5 min », « Tout lire » pour les longues notes ; mis à jour en direct (abonnement à `character_notes`). Vue rapide « Suivi » (les deux sections). Lecture dans la même requête que les fiches (`character_state(programs, program_slots)`, `character_notes(body, updated_at)`), aidée par `notesOf` et `timeAgo` (tests). Une disposition déjà enregistrée reçoit les deux sections à la fin, visibles. Bug évité : la grille comptait 6 rangées fixes (en-tête + 5 sections) et les nouvelles sections se superposaient aux Vitaux ; le nombre de rangées suit maintenant `DASHBOARD_SECTIONS` (variable `--rows`).
60. **Armes : suggestions d'après le nom** (09/11/2026) : nouveau réglage d'univers `rules.weaponHints` (MJ → Univers → « Armes : suggestions »), une ligne = des mots du nom (séparés par des virgules), la compétence, les munitions (0 = sans munitions), les dégâts et la cadence (vide ou 0 = inchangé). Rien de propre à un jeu dans le code : chaque préréglage a sa liste (Neutre : Bagarre, Armes de poing ; Fantasy : dégâts par arme, 20 flèches ; Grimdark : Corps à corps, Tir ; Horreur 1920 : Armes à feu, revolver 6, pistolet 8… ; Cyberpunk : pistolets léger à très lourd, mitraillettes, fusils, armes de mêlée par taille, mains nues), et chaque compétence proposée existe dans la bibliothèque du préréglage (test). En Mode édition, sous les champs d'une arme dont le nom correspond, la fiche affiche « Suggestion pour « pistolet » : Pistolet · 12 balles · Dégâts 2d6 · CdT 2 » et un bouton **Appliquer** : rien ne s'écrit sans ce clic (règle 6). Règles dans `src/lib/weapon-rules.ts` : `guessWeapon` (mot entier, sans accents ni majuscules ; le mot le plus long l'emporte : « fusil d'assaut » avant « fusil »), `applyWeaponHint`, `hintChanges` ; lecture bornée dans `normalizeUniverse` (80 lignes, munitions ≤ 999, cadence ≤ 20).

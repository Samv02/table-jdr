# Contexte du projet — à lire avant toute chose

Résumé de plusieurs semaines de travail menées dans une conversation claude.ai avant l'arrivée du projet dans VS Code.
**Tous les détails** (chaque fonctionnalité, ses règles, les bugs déjà corrigés et pourquoi) : `docs/HISTORIQUE.md`.
Ouvre-le dès qu'une demande touche une partie existante, pour ne pas défaire une décision déjà prise.

---

## 1. Qui est Sam (le propriétaire)

- Francophone. Il joue surtout à **Cyberpunk RED** : il est joueur (son personnage s'appelle **SUDO**, un netrunner) et parfois MJ.
- Il a commencé avec Lovable, puis a codé « à l'ancienne » : il envoyait des zips, recevait des zips de fichiers modifiés et des scripts SQL à coller dans Supabase.
- **Débutant en gestion de données et en hébergement.** Il apprend vite, mais il faut :
  - expliquer chaque commande avant de la lui faire lancer : ce qu'elle fait et pourquoi ;
  - avancer une étape à la fois et attendre son retour ;
  - lire ses erreurs avec lui (il colle la sortie du terminal) ;
  - ne jamais lui demander de coller une clé secrète dans une conversation.
- Il écrit vite, avec des fautes et en abrégé (« pk », « tkt », « fix moi ça »). Comprendre l'intention, ne pas corriger.
- Il réagit par captures d'écran : souvent une zone entourée de rouge et une phrase courte. La zone entourée est le sujet.
- Il dit franchement quand ça ne va pas : « raté », « on a cassé un truc », « pas foufou », « pas possible ça ». Il faut alors chercher la cause réelle, pas réessayer à l'aveugle.

### Ce qu'il aime
- Une interface **immersive** et soignée, fidèle à l'univers (néons et chrome pour Cyberpunk), mais **lisible**. Il a fait réduire la transparence du tableau de bord : « trop transparent, ça fait mal aux yeux ».
- **Mobile d'abord** : beaucoup de joueurs jouent sur téléphone. Tout doit être centré et accessible au pouce.
- Les animations **sobres** :
  - le bouton de messagerie qui clignote quand il y a un message non lu « était bien » ;
  - le dé du critique qui passe en vert (`#00ff88`), celui de l'échec critique en rouge ;
  - le tracé ECG des PV.
- Les boutons flottants **petits et discrets** : messagerie en bas à gauche, dés en bas à droite.
- Que le MJ ait « la main sur tout » : musique, scènes, fiches, verrous, permissions.

### Ce qu'il refuse
- Les **pop-ups de notification** (toasts) : il les a tous fait retirer.
- Les **confirmations du navigateur** (`window.confirm`) : on utilise la fenêtre maison `confirmAction()`.
- Qu'un **e-mail** s'affiche où que ce soit : on montre toujours le pseudo du personnage (le MJ apparaît comme « MJ »).
- **Qu'on touche à ce qui marche** quand il demande autre chose. Il l'a écrit : « ne touche à rien d'autre, type clignotement, ils sont bien ».
- Les PV au-dessus du maximum (« pas possible ça »).

---

## 2. Règles de jeu et de sécurité non négociables

1. **Personne ne lance un dé à la place d'un autre, même le MJ.**
   - Le MJ lance sous le nom « MJ ».
   - Un joueur lance avec SON personnage, jamais avec celui d'un autre.
   - Les dés sont tirés **côté serveur** (`crypto.getRandomValues` avec rejet pour éviter les biais) ; le navigateur n'écrit jamais dans la table `rolls`.
2. **Fiches privées** : un joueur ne voit que la sienne. Le groupe est visible (pseudo, avatar, couleur) via `get_party()`, jamais les fiches.
3. **Le MJ voit et modifie tout dans son équipe**, et rien ailleurs. Seul l'admin du back office (Sam) a accès à toutes les équipes ; il lance sous le nom « Admin » et signe ses messages « Admin ».
4. **Verrou MJ** (`players_can_edit`) : fiche verrouillée = le joueur ne peut plus changer PV, argent, munitions, inventaire ni emplacements. Il garde ses **jets** et son **bloc-notes**. Vérifié par la base (RLS), pas seulement par l'interface.
5. **Bloc-notes** : seul le joueur écrit ; le MJ lit ; les autres joueurs ne voient rien.
6. **Messagerie** :
   - Le MJ lit tout et écrit partout.
   - Les annonces sont écrites par le MJ seulement.
   - Le canal joueur ↔ MJ est toujours ouvert.
   - Les échanges entre deux joueurs n'existent que si le MJ a autorisé cette paire.
7. **Emplacements** (cyberdeck, grimoire…) :
   - Le MJ fixe la capacité et, pour chaque élément, son coût, son dé et son effet.
   - Le joueur crée, renomme, retire et active ses éléments sans jamais dépasser la capacité.
   - Un élément créé par le joueur reste « en attente MJ » tant que son coût n'est pas fixé.
   - Tout cela est vérifié par un trigger en base.
8. **PV** : jamais au-dessus du maximum. Ils sont corrigés automatiquement si le max baisse.
9. **Suppressions** : toujours confirmées avec `confirmAction()`.

---

## 3. Les deux projets

| | **Night City Table** | **Table JDR** (ce dépôt) |
|---|---|---|
| Où | Projet Lovable en ligne, utilisé par le vrai groupe | GitHub `Samv02/table-jdr`, développé en local |
| Jeu | Cyberpunk RED uniquement | N'importe quel jeu (univers réglable) |
| Base | Supabase de Lovable | Projet Supabase gratuit « JDR » (dev) |
| Code | Pas dans ce dépôt | Ici |

**Night City** continue de vivre à part, avec les vrais joueurs (voir `docs/HISTORIQUE.md` §2).
**Table JDR** est la copie neutre : tout ce qui est propre à un jeu est passé dans **l'univers**, réglé par le MJ dans **MJ → Univers** (voir `docs/HISTORIQUE.md` §4).

---

## 4. Installation actuelle (30/10/2026)

- **PC** : Windows, PowerShell dans VS Code, Node.js 26. La politique d'exécution est réglée (`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`).
- **Dossier** : `C:\dev\table-jdr` depuis le 30/10/2026 (hors de OneDrive, qui faisait planter Node sur `node_modules`). L'ancien dossier sous OneDrive n'est plus utilisé.
- **Pas de Docker** : la base de dev est en ligne. Les scripts Docker ont été supprimés le 30/10/2026.
- **Base de dev** : projet Supabase en ligne gratuit « **JDR** » (`https://hdbykvymmjwvkhwaazet.supabase.co`, région Europe).
  - Le schéma (aujourd'hui `supabase/migrations/20261030000000_installation.sql`) puis `supabase/seed.sql` y ont été lancés à la main dans le SQL Editor.
  - Les clés (URL, publishable, secret) sont dans `.env`, ignoré par git.
  - Le dossier est relié au projet avec la CLI Supabase (`npx supabase login` puis `link`, faits le 30/10/2026 ; la migration d'installation est marquée appliquée).
  - **Toute modification du schéma** : nouvelle migration dans `supabase/migrations/`, puis Claude l'applique lui-même avec `npm run db:push` et régénère les types avec `npm run db:types` (aucun mot de passe nécessaire). Plus besoin de faire coller le SQL à Sam.
  - Sans Docker, `supabase db diff` ne marche pas.
- **GitHub** : le PC est connecté (gestionnaire d'identifiants Windows), `git push` fonctionne.
- **Comptes de test** (mot de passe `table1234`) :
  - `mj@table.local` : MJ, pseudo « MaitreDuJeu » ;
  - `joueur1@table.local` : personnage Alex ;
  - `joueur2@table.local` : personnage Sam ;
  - `joueur3@table.local` : personnage Mika ;
  - `admin@table.local` : admin du back office, hors équipe.
  Les quatre premiers forment l'équipe « Table de test ».
- **Lancer** : `npm run dev`, puis http://localhost:8080. Testé : connexion MJ et tableau de bord avec Alex et Sam, tout fonctionne.
- **Avertissement au lancement, sans effet** : « localStorage is not available… --localstorage-file » (vient de Node 26, pas du projet).
- `npm install` a signalé 6 vulnérabilités dans des outils de dev. **Ne jamais lancer `npm audit fix --force`**, qui casse les versions. À regarder avant la mise en ligne.

---

## 5. Comment travailler avec Sam

- Avant de modifier : relire la zone concernée, et `docs/HISTORIQUE.md` si c'est une fonctionnalité existante.
- Après chaque modification :
  - `npx tsc --noEmit`, `npm test` et `npm run lint` ;
  - expliquer en 3 à 6 phrases ce qui a changé, **ce que Sam doit faire** (relancer `npm run dev` ? tester quoi ?) et ce qui reste à tester.
- Pour l'interface : vérifier sur mobile (390 px de large) **et** sur ordinateur.
- Les changements de base sont **idempotents** (`if not exists`, `drop policy if exists`…) et testés autant que possible.
- Commits : en français, clairs, sur `main`. Pas de force push.
- Quand une demande est floue ou coûteuse, poser **une** question précise, avec des options courtes.

---

## 6. À faire / idées en attente

**Technique**
- [x] Enregistrer `package-lock.json` sur GitHub (fait le 30/10/2026).
- [x] Déplacer le projet hors de OneDrive (fait le 30/10/2026).
- [ ] Avant la mise en ligne :
  - un projet Supabase propre, sans comptes de test ;
  - créer le compte réel de Sam puis `npm run admin -- <son e-mail>` (ne jamais lancer `seed.sql`) ;
  - brancher un service d'envoi d'e-mails (Supabase → Authentication → SMTP), sinon les inscriptions ne reçoivent pas leur lien ;
  - régler Site URL et Redirect URLs dans Supabase avec l'adresse du site, et compléter `/confidentialite` (nom et contact du responsable) ;
  - regarder `npm audit` sans `--force` ;
  - choisir un hébergeur pour l'appli ;
  - tout expliquer pas à pas (Sam l'a demandé : « il va falloir me guider »).

**Fonctionnalités proposées, pas encore commencées**
- [ ] **Scènes** :
  - réordonner par glisser-déposer ;
  - musique liée à une scène ;
  - transitions entre scènes ;
  - effets d'ambiance par scène ;
  - aperçu avant diffusion ;
  - dossiers ;
  - import de plusieurs images.
- [ ] **Armes** : deviner la capacité et la compétence à partir du nom.
- [ ] **Tableau de bord MJ** :
  - une section « Notes » pour lire les bloc-notes des joueurs ;
  - une vue compacte des emplacements de chaque joueur.
- [ ] **Support** : prévenir l'utilisateur par e-mail d'une réponse (besoin du service d'envoi).
- [ ] Réactiver des notifications uniquement pour les **erreurs**. Proposé, pas demandé : Sam n'aime pas les pop-ups, donc à redemander.

**Côté jeu (Night City, hors code)**
- Sam voulait demander à son MJ la compétence officielle **Contrefaçon (TECH)** pour SUDO : faux badges, cartes d'accès, documents de corpo. Rien n'a été appliqué en base.

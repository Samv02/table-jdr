# Contexte du projet (reprise depuis la conversation claude.ai)

Ce fichier résume l'historique et les décisions prises avant l'arrivée du projet dans VS Code.
Claude Code : lis-le pour connaître le propriétaire, ses préférences et ce qui reste à faire.

## Le propriétaire

- Sam, francophone, MJ et joueur de jeu de rôle (surtout Cyberpunk RED).
- Débutant en gestion de données et en hébergement : explique simplement, en français, une étape à la fois. Avant chaque commande, dis ce qu'elle fait et pourquoi.
- Sous Windows, avec PowerShell dans VS Code et Node.js 26. La politique d'exécution est déjà réglée (`RemoteSigned`).
- Le projet est dans `C:\Users\vsamv\OneDrive\Bureau\table-jdr` : OneDrive le ralentit. Proposer de le déplacer vers `C:\dev\table-jdr` à un moment calme.
- Il aime : les interfaces immersives, belles et lisibles, qui marchent aussi sur mobile, et les animations sobres (le clignotement du bouton de messagerie « était bien »).
- Il refuse :
  - les pop-ups de notification (toasts) ;
  - les confirmations du navigateur (on utilise `confirmAction`) ;
  - qu'un e-mail soit affiché ailleurs que sur la page de connexion (toujours le pseudo du personnage) ;
  - qu'on touche à ce qui marche déjà quand il demande autre chose.

## Règles de jeu non négociables

- Personne ne lance un dé à la place d'un autre, **même le MJ**. Le MJ lance au nom de « MJ ». Les dés sont tirés côté serveur.
- Un joueur ne voit jamais la fiche d'un autre ; le MJ voit et modifie tout.
- Le MJ peut verrouiller les fiches : le joueur ne modifie alors plus ses PV, son argent, ses munitions ni son inventaire. Ses notes et ses jets restent possibles.
- Les PV ne dépassent jamais le maximum.

## Historique

1. **Night City Table** (projet Lovable d'origine, toujours en ligne, réservé à Cyberpunk RED).
   - On y a ajouté au fil du temps :
     - le verrou MJ et le bloc-notes privé ;
     - la messagerie (annonces, canal MJ, échanges entre joueurs autorisés par le MJ) ;
     - le panneau musique v2 (ambiances, bibliothèque, enchaînements) ;
     - le cyberdeck (programmes rangés dans des slots) ;
     - les confirmations de suppression dans l'appli ;
     - l'alignement des colonnes de la fiche ;
     - le choix de la caractéristique d'une compétence ;
     - le bouton de dés du MJ sur mobile.
   - Ces changements ont été livrés en zips et appliqués à la main dans Lovable. Ce dépôt-ci ne contient pas Night City.
2. **Table JDR** (ce dépôt) : copie **neutre et multi-univers** de Night City.
   - Le MJ règle tout dans MJ → Univers : thème, vocabulaire, règles, blocs de la fiche.
   - 5 modèles : Neutre, Fantasy, Grimdark (façon Warhammer, jets en %), Horreur 1920, Cyberpunk.
   - Le code a été rendu indépendant de Lovable pour tourner en local.

## Installation actuelle (30/10/2026)

- L'appli tourne en local avec `npm run dev`, sur http://localhost:8080.
- La base de développement est un projet **Supabase en ligne gratuit** nommé « JDR », sans Docker. Docker n'est pas installé : les commandes `npm run db:*` ne servent pas pour l'instant.
  - `supabase/installation.sql` et `supabase/seed.sql` y ont été lancés à la main dans le SQL Editor.
  - Les clés sont dans `.env`, qui n'est pas sur GitHub.
- **Base en ligne = toute modification du schéma doit aussi être lancée à la main** dans le SQL Editor de Supabase. Donne à Sam le script exact à coller, puis garde `supabase/migrations/` à jour.
- Comptes de test (mot de passe `table1234`) : `mj@table.local`, `joueur1@table.local`, `joueur2@table.local`.
- Tout a été testé et fonctionne : connexion MJ, tableau de bord avec Alex et Sam.

## À faire / idées en attente

- Enregistrer `package-lock.json` sur GitHub (créé par `npm install`).
- Avant la mise en ligne :
  - regarder `npm audit` sans `--force` ;
  - créer un projet Supabase propre, sans les comptes de test ;
  - choisir un hébergeur pour l'appli et expliquer chaque étape à Sam.
- Le message « vite-tsconfig-paths détecté » au lancement est sans effet. On peut le nettoyer si la config Lovable le permet.
- Idées proposées, non commencées :
  - scènes : réordonner par glisser-déposer, musique liée à une scène, transitions, aperçu avant diffusion, dossiers ;
  - armes : deviner la capacité et la compétence à partir du nom ;
  - tableau de bord MJ : section notes, et vue compacte des emplacements (cyberdeck, grimoire…) de chaque joueur.
- Côté jeu (Night City) : Sam voulait proposer à son MJ la compétence officielle **Contrefaçon (TECH)** pour son netrunner SUDO. Rien n'a été appliqué.

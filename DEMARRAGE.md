# Lancer la table sur ton PC (en local)

Tout tourne sur ta machine : l'appli **et** la base de données. Rien n'est en ligne, rien n'est payant, et tu peux tout casser puis tout remettre à zéro.

## Comment ça marche (en 30 secondes)

```
 Ton navigateur  ──►  L'appli (npm run dev)  ──►  La base de données (Supabase dans Docker)
 http://localhost       React + TypeScript          Postgres : comptes, fiches, dés, messages…
```

- **L'appli** est le site que tu vois.
- **La base** est l'endroit où les données sont rangées, dans des tables comme dans un tableur.
- **Supabase** ajoute à Postgres les comptes, le temps réel et le stockage d'images.
- **Docker** fait tourner Supabase sur ton PC dans une boîte isolée.

## Deux façons de faire tourner la base

| | **Base en ligne (sans Docker)** | **Base sur ton PC (Docker)** |
|---|---|---|
| Installation | Un projet gratuit sur supabase.com | Docker Desktop (plusieurs Go) |
| Internet | Nécessaire | Pas besoin |
| Remise à zéro | À la main | `npm run db:reset` |
| Utilisée actuellement | ✅ Oui (projet « JDR ») | Non |

### Base en ligne (méthode actuelle)

1. Sur supabase.com, ouvre le projet **JDR**, puis **SQL Editor**.
2. Une seule fois, colle et lance `supabase/installation.sql`, puis `supabase/seed.sql`.
3. Copie `.env.example` en `.env` et remplis-le avec l'URL du projet, la *Publishable key* et la *Secret key* (Project Settings → API Keys).
4. Lance `npm run dev`. La partie Docker ci-dessous ne sert pas.

> ⚠️ Ce projet contient des comptes de test au mot de passe faible : il sert seulement à développer. Pour la vraie mise en ligne, on créera un projet propre.

## 1. Installer les outils (une seule fois)

| Outil | À quoi il sert | Où le trouver |
|---|---|---|
| **Node.js 22 LTS** | Faire tourner l'appli | nodejs.org |
| **Git** | Récupérer le code depuis GitHub et envoyer tes changements | git-scm.com |
| **Docker Desktop** | Seulement pour la base sur ton PC (facultatif) | docker.com/products/docker-desktop |
| **VS Code** | L'éditeur de code | code.visualstudio.com |
| **Extension Claude Code** | Discuter avec Claude dans VS Code | Dans VS Code : `Ctrl+Shift+X`, cherche « Claude Code », puis Installer |

> Sous Windows, Docker Desktop demande d'activer **WSL 2** : accepte quand il le propose, puis redémarre.
> Sous Windows, si `npm` affiche « l'exécution de scripts est désactivée », lance une fois : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
> Évite de mettre le projet dans OneDrive : le dossier `node_modules` y devient très lent. Préfère par exemple `C:\dev\table-jdr`.
> L'extension Claude Code demande un abonnement Claude payant (Pro ou Max) : connecte-toi à la première ouverture.

## 2. Récupérer le projet

Dans VS Code :
1. `Ctrl+Shift+P` → **Git: Clone**.
2. Colle `https://github.com/Samv02/table-jdr.git`.
3. Choisis un dossier, puis **Ouvrir**.
4. Accepte d'installer les extensions recommandées.

Ensuite, ouvre un terminal (`Ctrl+ù`, ou menu Terminal → Nouveau terminal) et installe les dépendances :

```sh
npm install
```

## 3. Démarrer (à chaque séance de travail)

1. Ouvre **Docker Desktop** et attends qu'il soit prêt (baleine verte).
2. Dans le terminal de VS Code :

```sh
npm run db:start     # 1re fois : quelques minutes (téléchargement). Ensuite : ~20 secondes
npm run env:local    # 1re fois seulement : écrit le fichier .env avec les clés locales
npm run dev          # lance l'appli
```

3. Ouvre l'adresse affichée (par exemple http://localhost:8080) et connecte-toi :

| Compte | Mot de passe | Rôle |
|---|---|---|
| `mj@table.local` | `table1234` | MJ |
| `joueur1@table.local` | `table1234` | Joueur (Alex) |
| `joueur2@table.local` | `table1234` | Joueur (Sam) |

> Astuce : pour jouer MJ et joueur en même temps, ouvre une seconde fenêtre en **navigation privée**.

## 4. Voir les données

Ouvre **http://127.0.0.1:54323** (Supabase Studio) :
- **Table Editor** pour voir et modifier les tables (`characters`, `rolls`, `messages`…) ;
- **Authentication** pour gérer les comptes ;
- **SQL Editor** pour lancer des requêtes.

## 5. Travailler avec Claude Code

Ouvre le panneau Claude Code (icône ✱ en haut à droite de l'éditeur) et parle normalement, par exemple :
- « Ajoute un bouton pour soigner tout le groupe sur le tableau de bord MJ » ;
- « Explique-moi comment sont rangées les fiches dans la base » ;
- « Lance les tests et corrige ce qui casse ».

Claude lit automatiquement `CLAUDE.md`, qui contient les règles du projet. Il te montre chaque modification avant de l'appliquer.

## Commandes utiles

| Commande | Effet |
|---|---|
| `npm run dev` | Lance l'appli |
| `npm test` | Lance les tests automatiques |
| `npm run db:reset` | **Remet la base à zéro** (comptes et personnages de test recréés) |
| `npm run db:stop` | Arrête la base (libère la mémoire) |
| `npm run db:status` | Affiche les adresses et clés de la base locale |

## Ça ne marche pas ?

| Problème | Solution |
|---|---|
| `db:start` échoue | Docker Desktop est-il ouvert et prêt ? |
| Page blanche ou « Chargement impossible » | La base tourne-t-elle (`npm run db:status`) ? Le fichier `.env` existe-t-il (`npm run env:local`) ? |
| Mot de passe refusé | `npm run db:reset` recrée les comptes de test |
| Autre chose | Copie l'erreur dans Claude Code : « J'ai cette erreur, explique-moi et corrige » |

## Plus tard : mettre en ligne

On verra ensemble au moment voulu. Le principe : une base Supabase hébergée (gratuite pour démarrer) dans laquelle on rejoue les mêmes migrations, et un hébergeur pour l'appli. Les étapes manuelles sont déjà décrites dans `INSTALLATION.md`.

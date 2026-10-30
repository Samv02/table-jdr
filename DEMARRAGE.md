# Lancer la table sur ton PC

## Comment ça marche (en 30 secondes)

```
 Ton navigateur  ──►  L'appli (npm run dev)  ──►  La base de données (Supabase, en ligne)
 http://localhost       React + TypeScript          Postgres : comptes, fiches, dés, messages…
```

- **L'appli** est le site que tu vois. Elle tourne sur ton PC pendant que tu développes.
- **La base** est l'endroit où les données sont rangées, dans des tables comme dans un tableur.
- **Supabase** ajoute à Postgres les comptes, le temps réel et le stockage d'images. On utilise un projet gratuit sur supabase.com.

## 1. Installer les outils (une seule fois)

| Outil | À quoi il sert | Où le trouver |
|---|---|---|
| **Node.js 22 ou plus** | Faire tourner l'appli | nodejs.org |
| **Git** | Récupérer le code depuis GitHub et envoyer tes changements | git-scm.com |
| **VS Code** | L'éditeur de code | code.visualstudio.com |
| **Extension Claude Code** | Discuter avec Claude dans VS Code | Dans VS Code : `Ctrl+Shift+X`, cherche « Claude Code », puis Installer |

> Sous Windows, si `npm` affiche « l'exécution de scripts est désactivée », lance une fois : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
> Évite de mettre le projet dans OneDrive : le dossier `node_modules` y devient très lent. Préfère par exemple `C:\dev\table-jdr`.

## 2. Récupérer le projet

Dans VS Code :
1. `Ctrl+Shift+P` → **Git: Clone**.
2. Colle `https://github.com/Samv02/table-jdr.git`.
3. Choisis un dossier, puis **Ouvrir**, et accepte les extensions recommandées.

Ouvre un terminal (`Ctrl+ù`) et installe les dépendances :

```sh
npm install
```

## 3. Brancher la base

Le projet de développement s'appelle **JDR** sur supabase.com.

1. Copie `.env.example` en `.env` et remplis-le avec l'URL du projet, la *Publishable key* et la *Secret key* (Project Settings → API Keys). `.env` n'est jamais envoyé sur GitHub.
2. Relie le dossier au projet (une seule fois par PC) :

```sh
npx supabase login                                     # ouvre le navigateur pour te connecter
npx supabase link --project-ref hdbykvymmjwvkhwaazet   # relie ce dossier au projet JDR
```

> ⚠️ Ce projet contient des comptes de test au mot de passe faible : il sert seulement à développer. Pour la vraie mise en ligne, on créera un projet propre.

## 4. Démarrer (à chaque séance de travail)

```sh
npm run dev
```

Ouvre http://localhost:8080 et connecte-toi :

| Compte | Mot de passe | Rôle |
|---|---|---|
| `mj@table.local` | `table1234` | MJ |
| `joueur1@table.local` | `table1234` | Joueur (Alex) |
| `joueur2@table.local` | `table1234` | Joueur (Sam) |

> Astuce : pour jouer MJ et joueur en même temps, ouvre une seconde fenêtre en **navigation privée**.
> Sur ton téléphone, connecté au même Wi-Fi : utilise l'adresse « Network » affichée dans le terminal.

Pour voir les données : sur supabase.com, projet JDR → **Table Editor** (tables), **Authentication** (comptes), **SQL Editor** (requêtes).

## Commandes utiles

| Commande | Effet |
|---|---|
| `npm run dev` | Lance l'appli |
| `npm test` | Lance les tests automatiques |
| `npm run db:push` | Applique à la base les nouvelles migrations de `supabase/migrations/` |
| `npm run db:types` | Régénère `src/integrations/supabase/types.ts` depuis la base |

## Repartir d'une base neuve

Pour un nouveau projet Supabase (par exemple la vraie mise en ligne) :

1. Crée le projet sur supabase.com, puis remplis `.env` avec ses clés.
2. Relie le dossier : `npx supabase link --project-ref <identifiant du projet>`.
3. Crée toutes les tables : `npm run db:push`. Le script est sans danger s'il est relancé.
4. **Base de développement seulement** : colle `supabase/seed.sql` dans le SQL Editor pour avoir les comptes et personnages de test.
5. Sinon, crée les vrais comptes : **Authentication → Users → Add user** (e-mail, mot de passe, coche *Auto Confirm User*), pour toi et chaque joueur. Puis fais de ton compte le MJ dans le SQL Editor :

```sql
update public.profiles set role = 'gm'
 where id = (select id from auth.users where email = 'ton-email@exemple.com');
```

Ensuite, dans l'appli avec le compte MJ :
1. **MJ → Univers** : choisis un modèle (Neutre, Fantasy, Grimdark, Horreur 1920 ou Cyberpunk), ajuste-le, puis **Enregistrer pour la table**.
2. **MJ → Table** : « Créer une fiche vierge » (ou « Importer un JSON ») pour chaque personnage, et choisis son joueur.
3. **Fiche → Mode édition** : remplis caractéristiques, compétences, armes…
4. **Tableau de bord** : déverrouille les fiches quand les joueurs peuvent modifier leurs PV, leur argent ou leur inventaire.

L'hébergement de l'appli elle-même sera ajouté ici au moment de la mise en ligne.

## Bon à savoir

- **Changer de caractéristiques en cours de campagne** : les valeurs déjà saisies restent rangées sous l'ancien code. Garde les mêmes codes, ou corrige les fiches en Mode édition.
- **Réutiliser un univers** : dans MJ → Univers, le bouton ⬇ exporte un fichier, le bouton ⬆ l'importe dans une autre copie du projet.
- **Côté base**, certains noms internes restent hérités (`eddies` = argent, `programs` = emplacements, `holo_links` = échanges autorisés). Ils ne sont jamais affichés aux joueurs.

## Ça ne marche pas ?

| Problème | Solution |
|---|---|
| Page blanche ou « Variable(s) Supabase manquante(s) » | Le fichier `.env` existe-t-il et est-il rempli ? |
| Mot de passe refusé | Vérifie le compte dans Authentication sur supabase.com |
| Autre chose | Copie l'erreur dans Claude Code : « J'ai cette erreur, explique-moi et corrige » |

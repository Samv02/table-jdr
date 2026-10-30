# Installer la table (nouveau projet Lovable)

Cette copie est **indépendante** de Night City. Elle a sa propre base de données, donc les personnages, jets et messages ne se mélangent pas.

## 1. Créer le projet

1. Crée un **nouveau projet** Lovable.
2. Mets-y le code de ce dossier. Le plus simple :
   - connecte le nouveau projet à un dépôt GitHub vide (Lovable → GitHub) ;
   - pousse ce dossier dans ce dépôt ;
   - Lovable récupère le code automatiquement.
3. Active la base : **Lovable Cloud** (ou connecte un projet Supabase neuf). Les clés du fichier `.env` sont alors remplies automatiquement.

> ⚠️ Ne réutilise **pas** le projet Supabase de Night City.
> `.env` et `supabase/config.toml` ont été vidés exprès.

## 2. Créer la base (une seule fois)

Ouvre l'éditeur SQL de la base :
- **Supabase** : SQL Editor ;
- **Lovable Cloud** : Cloud → Database → SQL.

Colle tout le contenu de **`supabase/installation.sql`** et lance-le.

Ce script crée tout : tables, règles d'accès, dés anti-triche, messagerie, bloc-notes, stockage des images et temps réel.
- Il peut être relancé sans danger.
- Si Lovable applique déjà la migration `drizzle/migrations/0000_installation.sql` (c'est le même script), le relancer à la main ne casse rien.

## 3. Créer les comptes

Il n'y a pas d'inscription publique : c'est le MJ qui crée les comptes.

1. **Authentication → Users → Add user** :
   - e-mail + mot de passe ;
   - coche *Auto Confirm User*.
   Fais-le pour toi et pour chaque joueur.
2. Fais de ton compte le MJ. Dans l'éditeur SQL, remplace l'e-mail puis lance :

```sql
update public.profiles set role = 'gm'
 where id = (select id from auth.users where email = 'ton-email@exemple.com');
```

## 4. Préparer la partie (dans l'appli)

Connecte-toi avec le compte MJ, puis :

1. **MJ → Univers**
   - choisis un modèle : Neutre, Fantasy, Grimdark, Horreur 1920 ou Cyberpunk ;
   - ajuste ce que tu veux : nom de la table, couleurs, caractéristiques, formules… ;
   - clique sur **Enregistrer pour la table**.
   Tout le monde voit le changement en direct, même la page de connexion.
2. **MJ → Table**
   - « Créer une fiche vierge » pour chaque personnage (ou « Importer un JSON ») ;
   - choisis le joueur propriétaire de chaque fiche.
3. **Fiche → Mode édition** : remplis caractéristiques, compétences, armes, etc.
4. **Tableau de bord** : déverrouille les fiches quand les joueurs peuvent modifier leurs PV, leur argent ou leur inventaire.
5. **Scènes** et **Musique** : comme dans Night City.

## Bon à savoir

- **Changer de caractéristiques en cours de campagne** : les valeurs déjà saisies restent rangées sous l'ancien code. Garde les mêmes codes, ou corrige les fiches en Mode édition.
- **Réutiliser un univers** : dans MJ → Univers, le bouton ⬇ exporte un fichier, le bouton ⬆ l'importe dans une autre copie du projet.
- **Côté base**, certains noms internes restent hérités (`eddies` = argent, `programs` = emplacements, `holo_links` = échanges autorisés). Ils ne sont jamais affichés aux joueurs.

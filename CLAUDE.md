# Table JDR — consignes pour Claude Code

Table de jeu de rôle en ligne, multi-univers : fiches privées, dés anti-triche, scènes, musique, messagerie, tableau de bord MJ.
Le propriétaire du projet débute en gestion de données et en hébergement : **explique simplement, en français**, chaque commande que tu lui demandes de lancer, et pourquoi.

## Commandes

```sh
npm run dev         # lance l'appli (http://localhost:8080)
npm test            # tests (vitest)
npx tsc --noEmit    # vérification des types
npm run lint        # eslint + prettier
npm run db:push     # applique les nouvelles migrations à la base en ligne (projet relié)
npm run db:types    # régénère src/integrations/supabase/types.ts depuis la base
```

Comptes de test (mot de passe `table1234`) : `mj@table.local` (MJ), `joueur1@table.local`, `joueur2@table.local`.

## Architecture

- TanStack Start + React + TypeScript strict (`exactOptionalPropertyTypes`, accès indexés en `obj["clé"]`).
- Supabase : Postgres + RLS, Realtime, Storage (buckets privés `avatars`, `scenes`, liens signés).
- Fonctions serveur (`createServerFn` + `requireSupabaseAuth`) pour ce qui doit être sûr : jets de dés (`src/lib/dice.functions.ts`), suppression de compte.
- Styles : `src/styles/table-base.css` + `src/styles/table-integration.css`, uniquement avec les variables du thème.

## Règles du projet (à respecter)

1. **Rien de propre à un jeu dans le code.** Caractéristiques, dé, formules, vocabulaire, couleurs : tout vient de l'univers (`src/lib/universe.ts`, `useUniverse()` / `useWords()`). Une nouvelle règle de jeu = un nouveau champ d'univers + son réglage dans `src/components/UniverseEditor.tsx` + des tests sur plusieurs préréglages.
2. **Formules** : toujours via `src/lib/formula.ts` (jamais `eval`).
3. **Sécurité des données** : chaque accès est contrôlé par la base (RLS). Personne ne lance un dé à la place d'un autre, même le MJ. Un joueur ne voit jamais la fiche d'un autre. On n'affiche jamais un e-mail, seulement le pseudo du personnage.
4. **Base de données** : toute modification du schéma = une **nouvelle** migration dans `supabase/migrations/` (horodatée, idempotente). Ne jamais modifier une migration déjà appliquée. Puis `npm run db:push` et `npm run db:types`.
5. **Pas de pop-up de notification** (toasts) ni de `window.confirm` : confirmation via `confirmAction()` (`src/components/ConfirmDialog.tsx`).
6. Avant de dire « c'est fini » : `npx tsc --noEmit`, `npm test`, `npm run lint`.
7. Interface en français, adaptée au mobile.

Historique, préférences du propriétaire et tâches en attente : @docs/CONTEXTE.md
Détails techniques complémentaires : @AGENTS.md

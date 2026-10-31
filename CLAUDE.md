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
npm run admin -- <e-mail>   # donne l'accès au back office à un compte existant
```

Comptes de test (mot de passe `table1234`) : `mj@table.local` (MJ), `joueur1@table.local`, `joueur2@table.local`, `joueur3@table.local`, `admin@table.local` (back office).

## Architecture

- TanStack Start + React + TypeScript strict (`exactOptionalPropertyTypes`, accès indexés en `obj["clé"]`).
- Supabase : Postgres + RLS, Realtime, Storage (buckets privés `avatars`, `scenes`, liens signés).
- **Équipes** : chaque compte a une équipe active (`profiles.active_team_id`, changée seulement par `enter_team`, `create_team`, `join_team`). `current_team()` la lit et toutes les règles RLS filtrent dessus. Le rôle MJ / joueur est dans `team_members`. L'admin (`platform_admins`) agit comme MJ dans l'équipe où il entre.
- Fonctions serveur (`createServerFn` + `requireSupabaseAuth`) pour ce qui doit être sûr : jets de dés (`src/lib/dice.functions.ts`), suppression de compte et d'équipe (`src/lib/accounts.functions.ts`), back office (`src/lib/admin.functions.ts`).
- **Back office** (`/admin`, `src/components/admin/`) : espace séparé, sans aucun élément de jeu. Toutes ses actions passent par `src/lib/admin.functions.ts` (vérifie `is_platform_admin`, utilise la clé de service) et sont tracées dans `admin_log`. Un admin sans équipe ouverte est renvoyé vers `/admin`. Maintenance, ouvertures et limites sont dans `platform_settings` et vérifiées en base.
- **Support** : tickets dans `support_tickets` et `support_messages` ; l'utilisateur n'écrit que par `open_ticket` et `reply_ticket`, les notes internes (`internal`) lui restent invisibles par RLS.
- Boutons : toujours le composant `Button` (`src/components/ui/button.tsx`), l'apparence vient de ses classes. ESLint refuse un `<button>` brut.
- Styles : `src/styles/table-base.css` + `src/styles/table-integration.css`, uniquement avec les variables du thème.

## Règles du projet (à respecter)

1. **Rien de propre à un jeu dans le code.** Caractéristiques, dé, formules, vocabulaire, couleurs : tout vient de l'univers (`src/lib/universe.ts`, `useUniverse()` / `useWords()`). Une nouvelle règle de jeu = un nouveau champ d'univers + son réglage dans `src/components/UniverseEditor.tsx` + des tests sur plusieurs préréglages.
2. **Formules** : toujours via `src/lib/formula.ts` (jamais `eval`).
3. **Sécurité des données** : chaque accès est contrôlé par la base (RLS). Une équipe ne voit jamais rien d'une autre : toute nouvelle table de jeu porte un `team_id` filtré sur `current_team()`. Personne ne lance un dé à la place d'un autre, même le MJ ou l'admin. Un joueur ne voit jamais la fiche d'un autre. On n'affiche jamais un e-mail, seulement le pseudo du personnage (seule exception : le back office `/admin`).
4. **Base de données** : toute modification du schéma = une **nouvelle** migration dans `supabase/migrations/` (horodatée, idempotente). Ne jamais modifier une migration déjà appliquée. Puis `npm run db:push` et `npm run db:types`.
5. **Pas de pop-up de notification** (toasts) ni de `window.confirm` : confirmation via `confirmAction()` (`src/components/ConfirmDialog.tsx`).
6. **Les données commandent l'affichage, jamais l'inverse.** Base → information affichée → visuel. Un visuel, un thème ou une valeur calculée (maximum, base, formule) ne décide rien et n'écrase jamais une donnée enregistrée. Les PV passent par `hpAfter` et `hpShown` (`src/lib/sheet.ts`) : un maximum à 0 veut dire « inconnu », pas « zéro PV ». Seule une action de l'utilisateur écrit en base : jamais un `useEffect` d'affichage.
7. Avant de dire « c'est fini » : `npx tsc --noEmit`, `npm test`, `npm run lint`.
8. Interface en français, adaptée au mobile.

Historique, préférences du propriétaire et tâches en attente : @docs/CONTEXTE.md
Détails techniques complémentaires : @AGENTS.md

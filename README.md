# Table de jeu de rôle — version neutre

Table en ligne pour jouer entre amis à **n'importe quel jeu de rôle** :
- fiches privées (chacun ne voit que la sienne, le MJ voit tout) ;
- dés en direct, tirés côté serveur (anti-triche) ;
- scènes, musique YouTube synchronisée, messagerie, bloc-notes ;
- tableau de bord MJ.

Le **look**, les **mots** et les **règles** se règlent dans l'appli : **MJ → Univers**.

## Les 5 modèles fournis

| Modèle | Jets | Caractéristiques | Particularités |
|---|---|---|---|
| **Neutre** | d20 + base | 6 génériques | Sobre, coins arrondis |
| **Fantasy** | d20 + modificateur (FOR 16 → +3) | FOR DEX CON INT SAG CHA | Mana, grimoire de sorts, carquois, braises |
| **Grimdark** (façon Warhammer) | d100 **sous** la compétence, degrés de réussite | CC CT F E I Ag Dex Int FM Soc | Critiques sur les doubles, Destin, Corruption, cendres |
| **Horreur 1920** (façon Cthulhu) | d100 sous la compétence | FOR CON TAI DEX APP ÉDU INT POU | Santé mentale, 01 critique, 100 maladresse, brume |
| **Cyberpunk** | d10 + base | 10 caracs RED | Humanité, cyberdeck, tir automatique, néons et pluie |

Chaque modèle n'est qu'un point de départ. Tout reste modifiable, et un univers peut s'exporter en fichier pour le réutiliser dans une autre copie du projet.

## Ce qui est réglable (MJ → Univers)

- **Apparence**
  - 10 couleurs et 3 polices ;
  - coins des cadres : coupés, arrondis ou droits ;
  - lueurs néon et lignes d'écran ;
  - ambiance animée : pluie, braises, cendres, étoiles ou brume.
- **Vocabulaire**
  - noms des sections, de l'argent et de la messagerie ;
  - emplacements (cyberdeck, grimoire…) ;
  - munitions, états de santé.
- **Caractéristiques** : la liste complète (code + nom), dans l'ordre voulu.
- **Jets**
  - le dé lancé ;
  - « dé + base » ou « faire moins que la base » ;
  - la formule de la base ;
  - la règle des critiques et des échecs critiques.
- **Santé**
  - la formule des PV max (ou saisie à la main) ;
  - le seuil de blessure grave et le jet contre la mort ;
  - les jauges (humanité, mana, santé mentale…) ;
  - les défenses ;
  - les champs sous le nom (classe, niveau…).
- **Combat**
  - la carac par défaut des armes ;
  - les dégâts à mains nues calculés ;
  - le tir automatique ;
  - l'ordre des compétences.
- **Blocs** : munitions, argent, emplacements, particularités et ECG, chacun activable ou non.

### Écrire une formule

On utilise les **codes** des caractéristiques, `+ - * /`, des parenthèses, et les fonctions `ceil` (arrondi supérieur), `floor` (arrondi inférieur), `round`, `min`, `max` et `abs`. Une comparaison vaut 1 si elle est vraie, 0 sinon.

| Exemple | Signification |
|---|---|
| `10 + 5*ceil((CORPS+VOL)/2)` | PV de Cyberpunk RED |
| `floor((STAT-10)/2) + NIV` | base d20 : modificateur + niveau |
| `1 + (CORPS>=5) + (CORPS>=7)` | 1 dé, +1 si CORPS ≥ 5, +1 si CORPS ≥ 7 |
| `ceil(MAX/2)` | seuil de blessure : la moitié des PV max |

Dans la formule de la base, `STAT` est la valeur de la caractéristique de la compétence et `NIV` son niveau. Une erreur s'affiche en rouge tout de suite, et on ne peut pas enregistrer tant qu'il en reste.

## Démarrer

Tout est dans **[DEMARRAGE.md](DEMARRAGE.md)** : installer les outils, brancher la base Supabase, lancer l'appli, repartir d'une base neuve.

## Technique

TanStack Start, React, Supabase (Postgres, RLS, Realtime, Storage) et Vitest.
- Les règles : `src/lib/universe.ts` (univers et préréglages) et `src/lib/formula.ts` (formules, sans `eval`).
- Le thème : `src/lib/theme.ts`.
- La base : `supabase/migrations/` (appliquées avec `npm run db:push`).

```sh
npm install
npm run dev       # http://localhost:8080
npm test
```

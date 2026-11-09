# Reprise du travail

Point d'arrivée de la session du 31/10/2026, pour continuer depuis n'importe quel PC.
Le détail de chaque fonctionnalité est dans `docs/HISTORIQUE.md` (entrées 35 à 42).

## Fait pendant cette session
- Univers : essai des modèles (Garder, Revenir), panneau d'aperçu, vue joueur.
- Photo propre à chaque table, réglée dans Mon compte.
- Hub : tables du compte signalées (MJ, Propriétaire), tri mémorisé sur l'appareil.
- Le MJ peut fixer le maximum de PV d'une fiche (Mode édition).
- Lisibilité : listes déroulantes et textes d'exemple corrigés dans toute l'appli.
- Carte : page MJ `/carte`, fenêtre flottante pour le joueur, qu'un clic en dehors ferme.

## Préférences de Sam apprises ici
- Lisibilité d'abord : une phrase ne se met pas en police mono, elle écarte trop les mots. Utiliser `.note plain`. Une liste déroulante doit rester lisible une fois ouverte.
- Quand il dit « va au-delà », il attend des ajouts de notre propre initiative, avec un plateau moderne à l'usage.
- La carte des joueurs se présente en fenêtre flottante semi-transparente au-dessus de la fiche, pas en page séparée.

## Limites connues de la carte
- La vision limitée masque l'affichage côté joueur ; seul « Caché » retient vraiment un pion en base.
- Pour une surprise sûre dans une pièce fermée, poser les ennemis en Caché : un pion seulement masqué par la vision arrive quand même sur le navigateur du joueur.
- Les murs bloquent la vue, pas les déplacements.
- Une porte secrète fermée est dessinée comme un mur, mais elle reste lisible dans les données envoyées au joueur (colonne `walls`).

## Éditeur de carte (03 au 05/11/2026)
Les 7 étapes sont faites (HISTORIQUE 46 à 52) : sols par formes, styles, objets, calques et étages, éclairage et brouillard, donjon aléatoire, export et écran de table.
Un vrai secret se met dans un **calque caché** (filtré par la base) ; la vision, la nuit et le brouillard ne sont qu’un filtre d’écran.

## Sur un PC avec peu de mémoire
`npm test` peut échouer par dépassement de temps sur des tests sans rapport. Lancer `npx vitest run --maxWorkers=2 --testTimeout=30000`.
Si tous les fichiers échouent d’un coup sans message (« no tests »), relancer avec `--maxWorkers=1`, ou par dossier (`src/lib`, `src/components`, `src/test`) : c’est arrivé quand le serveur et un navigateur de test tournaient en même temps, et souvent juste après `npm run lint` : relancer les tests seuls suffit.

## Sur un nouveau PC
1. `git clone https://github.com/Samv02/table-jdr.git C:\dev\table-jdr`, puis `npm install`.
2. Recréer `.env` à la main (il n'est jamais envoyé sur GitHub) : les clés sont dans Supabase → Project Settings. Ne jamais les coller dans une conversation.
3. `npx supabase login`, puis relier le projet avec `npx supabase link`.

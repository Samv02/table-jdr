> [!NOTE]
> Ce dépôt n'est plus relié à Lovable : il se développe en local (VS Code + Claude Code).
> Ne pas réécrire l'historique déjà poussé (pas de force push) et garder la branche `main` fonctionnelle.

- Shared scene, minimal party directory, and presence are managed by TableEnvironment; keep private sheet reads separate and RLS-protected.
- Table context and its hook live in the non-component table-context module; all consumers import it directly so Fast Refresh cannot split provider identity.
- Session scene/music state lives in the singleton session_state; music writes use set_table_music to stamp server time.
- TableMusic owns one persistent visible YouTube player outside the immersive UI wrapper, so playback continues when UI is hidden.
- YouTube calls require the current instance's onReady and callable API methods; reset readiness on replacement and ignore disposed callbacks to prevent initialization races.
- Music metadata writes preserve the server-derived playhead for the current track and skip unchanged metadata; closing the visible player destroys only the local instance without writing shared playback state.
- Account deletion runs only in an authenticated GM-authorized server function, rejects self-deletion, and uses existing FK actions to preserve character sheets while removing profile-linked data.
- Character state persistence stays in the fiche controller; presentation tabs must not unmount realtime listeners.
- Character-state writes are serialized and pending optimistic state is protected from stale reads so older requests cannot overwrite newer counter changes.
- Characters and character_state stay in the Realtime publication; sheet reloads wait for local write queues and refresh on subscription to keep HP live across clients and reconnects.
- Fixed-sheet edits also use a serialized queue and a revision-guarded character ref; the editing confirmation waits for queued writes so realtime reads cannot discard pending edits.
- Weapon eligibility, attack bases and derived damage are centralized in weapon-rules and shared by sheet controls and rule tests to prevent divergent calculations.
- ArsenalWeapon owns transient shot/reload animations only; ammo updates use functional callbacks into the fiche controller so persistence and realtime remain mounted and rapid counters read current optimistic state.
- Table presentation uses an immutable uploaded reference stylesheet plus a separate application adapter stylesheet; the prototype Button variant bypasses utility classes to prevent conflicting focus, colors, and dimensions.
- Skill ordering and top-base ranking live in a browser-safe presentation module shared with tests; JSON object key order never determines display order.
- Editable skill titles use an optional title override preserved by sheet readers/writers; keep canonical names stable so weapon matching and skill ordering survive presentation edits.
- DicePanel receives roll:start before the request and roll:new after the authenticated result; animation-only random digits never determine or persist dice outcomes.
- RollAnimation owns disposable timers per keyed roll; done-phase dice render only server results, preventing decorative ticks from overwriting outcomes.
- Standard and custom dice share browser-safe validation in dice.ts, consumed by the launcher and authenticated server function, so accepted face counts cannot diverge.
- DicePanel keeps one roll subscription for drawer and mini-feed; per-user pin preferences sync through pinned-feed, and measured HUD/dock heights anchor persistent surfaces without stopping immersive-mode reception.
- Ammo reload arithmetic stays in sheet.reload and conserves total rounds when swapping a full magazine; ArsenalWeapon sends functional state updates so loose rounds and realtime saves share the same calculation.

- The GM dashboard keeps one pair of realtime subscriptions and per-character serialized state queues; revision-guarded refreshes preserve rapid optimistic changes while existing RLS authorizes writes.
- Dashboard visibility toggles apply to every character and desktop rows use subgrid; this aligns sections while mobile keeps horizontally snapping single-character columns.

- HealthTrace derives its visual state from the shared hpStatus rule; the ECG never determines health or changes persisted state.
- Critical-hit presentation reads the shared isCritical / isFumble / dieClass rules in lib/universe.ts (per-universe crit rules); the roll animation and the roll feed must never restate the condition, so both stay colored identically.

- Universe (lib/universe.ts) holds every game-specific choice: theme, words, rules (stats, skill die, roll-under mode, formulas), modules. Never hard-code a stat name, currency, die size or label: read it from useUniverse()/useWords().
- Rule formulas go through lib/formula.ts (tokenizer + parser, no eval). Pure rule helpers take the Universe as a parameter so tests can run each preset.
- The universe lives in session_state.universe, readable before login through get_universe(); UniverseProvider applies the theme (CSS variables + body classes) and caches it for THEME_BOOT.
- Styles use only theme variables (--bg, --panel, --ink, --text, --mute, --cyan…--violet, --orange, --head, --display, --mono); add new colors through color-mix() on those variables.
- Database schema: supabase/installation.sql is the full script; supabase/migrations/ (Supabase CLI) and drizzle/migrations/0000_installation.sql hold the same schema. Schema changes go in a NEW timestamped migration, also appended to installation.sql. The dev database is a hosted Supabase project: give the owner the SQL to paste in its SQL Editor.


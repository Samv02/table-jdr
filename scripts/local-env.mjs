// Écrit le fichier .env pour la base LOCALE à partir de « supabase status ».
// Usage : npm run env:local   (la base locale doit tourner : npm run db:start)
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

let raw;
try {
  raw = execSync("npx supabase status -o env", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch {
  console.error(
    "✖ La base locale ne répond pas. Lance d'abord : npm run db:start (Docker Desktop doit être ouvert).",
  );
  process.exit(1);
}
const vars = Object.fromEntries(
  raw
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const url = vars.API_URL;
const publicKey = vars.PUBLISHABLE_KEY || vars.ANON_KEY;
const secretKey = vars.SECRET_KEY || vars.SERVICE_ROLE_KEY;
if (!url || !publicKey || !secretKey) {
  console.error("✖ Clés introuvables dans « supabase status ». Sortie reçue :\n" + raw);
  process.exit(1);
}
writeFileSync(
  ".env",
  `# Base LOCALE (généré par npm run env:local — ne pas utiliser en ligne)
SUPABASE_URL="${url}"
SUPABASE_PUBLISHABLE_KEY="${publicKey}"
SUPABASE_SERVICE_ROLE_KEY="${secretKey}"
VITE_SUPABASE_URL="${url}"
VITE_SUPABASE_PUBLISHABLE_KEY="${publicKey}"
`,
);
console.log(`✔ .env écrit pour la base locale (${url}).`);
console.log("  Studio (voir les tables) : " + (vars.STUDIO_URL || "http://127.0.0.1:54323"));

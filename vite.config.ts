import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// En local, les fonctions serveur (dés, suppression de compte) lisent process.env :
// on y charge le fichier .env sans écraser les variables déjà définies (hébergeur…).
for (const [key, value] of Object.entries(
  loadEnv(
    process.env["NODE_ENV"] === "production" ? "production" : "development",
    process.cwd(),
    "",
  ),
)) {
  process.env[key] ??= value;
}

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Interdit d'importer du code serveur dans le navigateur.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    // Nitro emballe le serveur pour l'hébergement : seulement au build.
    ...(command === "build" ? [nitro()] : []),
    viteReact(),
  ],
  css: { transformer: "lightningcss" },
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
  },
  // "::" rend l'appli joignable depuis un téléphone sur le même Wi-Fi.
  server: { host: "::", port: 8080 },
}));

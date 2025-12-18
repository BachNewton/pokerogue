/**
 * Training entry point
 *
 * Registers custom loaders for handling Vite-specific imports,
 * then launches the CLI.
 */

import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Set up import.meta.env (Vite-specific) before importing any app code
// @ts-expect-error - import.meta.env is Vite-specific
(import.meta as any).env = {
  DEV: false,
  PROD: true,
  MODE: "production",
  NODE_ENV: "production",
  VITE_BYPASS_LOGIN: "1",
  VITE_BYPASS_TUTORIAL: "1",
  VITE_SERVER_URL: "",
  VITE_I18N_DEBUG: "",
};

// Get the directory of this file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loaderPath = path.join(__dirname, "loader.mjs");
const loaderURL = pathToFileURL(loaderPath).href;

// Register our custom loader for ?raw imports and shader files
register(loaderURL, import.meta.url);

// Now import and run the CLI
const { main } = await import("./cli.ts");
await main();

/**
 * Environment polyfill for headless training
 *
 * This file sets up import.meta.env and other Vite-specific globals
 * that are needed when running outside of Vite.
 *
 * Must be imported before any application code.
 */

// Set up import.meta.env on the global object so it can be accessed by all modules
const env = {
  DEV: false,
  PROD: true,
  MODE: "production",
  NODE_ENV: "production",
  VITE_BYPASS_LOGIN: "1",
  VITE_BYPASS_TUTORIAL: "1",
  VITE_SERVER_URL: "",
  VITE_I18N_DEBUG: "",
};

// Store in globalThis for loader to access
(globalThis as any).__VITE_ENV__ = env;

// Also set on import.meta for this module (others will get it from the loader)
// @ts-expect-error
(import.meta as any).env = env;

console.log("[Training] Environment polyfill loaded");

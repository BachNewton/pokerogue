/**
 * Custom ESM loader for handling Vite-specific imports in Node.js
 *
 * This loader handles:
 * - ?raw imports for shader files (.frag, .vert, .glsl)
 * - CommonJS modules that need ESM named export interop (crypto-js)
 * - import.meta.env polyfill for Vite compatibility
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// CommonJS modules that need special handling for ESM named exports
const CJS_NAMED_EXPORT_MODULES = new Set(["crypto-js", "i18next-korean-postposition-processor"]);

// Default import.meta.env values for headless training
const IMPORT_META_ENV = {
  DEV: false,
  PROD: true,
  MODE: "production",
  NODE_ENV: "production",
  VITE_BYPASS_LOGIN: "1",
  VITE_BYPASS_TUTORIAL: "1",
  VITE_SERVER_URL: "",
  VITE_I18N_DEBUG: "",
};

// Store env in globalThis for access across modules
globalThis.__VITE_ENV__ = IMPORT_META_ENV;

/**
 * Resolve hook - transforms ?raw imports
 */
export async function resolve(specifier, context, nextResolve) {
  // Handle ?raw imports
  if (specifier.endsWith("?raw")) {
    const cleanSpecifier = specifier.slice(0, -4); // Remove ?raw

    // Resolve relative to parent
    if (context.parentURL) {
      const parentPath = fileURLToPath(context.parentURL);
      const parentDir = path.dirname(parentPath);
      const resolvedPath = path.resolve(parentDir, cleanSpecifier);

      return {
        shortCircuit: true,
        url: pathToFileURL(resolvedPath).href + "?raw",
        format: "raw",
      };
    }
  }

  // Handle CommonJS modules that need named export interop
  if (CJS_NAMED_EXPORT_MODULES.has(specifier)) {
    return {
      shortCircuit: true,
      url: `cjs-interop:${specifier}`,
      format: "cjs-interop",
    };
  }

  return nextResolve(specifier, context);
}

// Create a require function for loading CommonJS modules
const require = createRequire(import.meta.url);

/**
 * Load hook - loads ?raw files as text and handles CJS interop
 */
export async function load(url, context, nextLoad) {
  // Handle CommonJS interop
  if (url.startsWith("cjs-interop:")) {
    const moduleName = url.slice("cjs-interop:".length);
    const cjsModule = require(moduleName);

    // Generate ESM module that re-exports all properties from CJS module
    const exports = Object.keys(cjsModule);
    const namedExports = exports
      .filter(key => key !== "default" && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key))
      .map(key => `export const ${key} = _module["${key}"];`)
      .join("\n");

    // The module should have been pre-loaded in setup-env.mjs
    // This approach stores the module in globalThis.__CJS_MODULES__ which is shared
    // between the setup script and the loaded modules

    return {
      shortCircuit: true,
      format: "module",
      source: `
        const _module = globalThis.__CJS_MODULES__?.["${moduleName}"];
        if (!_module) {
          throw new Error("CJS module '${moduleName}' was not pre-loaded. Add it to setup-env.mjs");
        }
        export default _module;
        ${namedExports}
      `,
    };
  }

  // Handle ?raw files
  if (url.endsWith("?raw")) {
    const cleanUrl = url.slice(0, -4); // Remove ?raw
    const filePath = fileURLToPath(cleanUrl);

    try {
      const content = await readFile(filePath, "utf-8");
      return {
        shortCircuit: true,
        format: "module",
        source: `export default ${JSON.stringify(content)};`,
      };
    } catch (_error) {
      // If file doesn't exist, return empty string (for headless mode)
      return {
        shortCircuit: true,
        format: "module",
        source: `export default "";`,
      };
    }
  }

  // Handle shader files directly (without ?raw)
  if (url.endsWith(".frag") || url.endsWith(".vert") || url.endsWith(".glsl")) {
    const filePath = fileURLToPath(url);

    try {
      const content = await readFile(filePath, "utf-8");
      return {
        shortCircuit: true,
        format: "module",
        source: `export default ${JSON.stringify(content)};`,
      };
    } catch (_error) {
      return {
        shortCircuit: true,
        format: "module",
        source: `export default "";`,
      };
    }
  }

  // For .ts and .tsx files in the src directory, transform import.meta.env
  // This runs before tsx processes the file
  if (url.startsWith("file:") && (url.endsWith(".ts") || url.endsWith(".tsx")) && url.includes("/src/")) {
    const result = await nextLoad(url, context);

    if (result.source) {
      let source = typeof result.source === "string" ? result.source : result.source.toString();

      // Check if the file uses import.meta.env
      if (source.includes("import.meta.env")) {
        // Replace import.meta.env with a fallback to globalThis.__VITE_ENV__
        source = source.replace(/import\.meta\.env/g, "(globalThis.__VITE_ENV__ || import.meta.env)");

        return {
          ...result,
          source,
        };
      }
    }

    return result;
  }

  return nextLoad(url, context);
}

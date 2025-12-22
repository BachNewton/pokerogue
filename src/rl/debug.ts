/**
 * RL Debug Utilities
 *
 * Global debug flag for RL training system.
 * Set RL_DEBUG=true to enable verbose debug logging.
 *
 * Usage:
 *   import { rlDebug, setRLDebug } from "./debug";
 *   rlDebug("My message", { someData: 123 });
 *   setRLDebug(true); // Enable debug mode
 */

/**
 * Global debug flag - set to true to enable verbose RL debug logging
 * Can be enabled via:
 * 1. Environment variable: RL_DEBUG=1
 * 2. Programmatically: setRLDebug(true)
 * 3. CLI flag: --debug (if implemented in entrypoint)
 */
let DEBUG_ENABLED = process.env.RL_DEBUG === "1" || process.env.RL_DEBUG === "true";

/**
 * Enable or disable RL debug logging
 */
export function setRLDebug(enabled: boolean): void {
  DEBUG_ENABLED = enabled;
  if (enabled) {
    console.log("[RL_DEBUG] Debug logging enabled");
  }
}

/**
 * Check if RL debug logging is enabled
 */
export function isRLDebugEnabled(): boolean {
  return DEBUG_ENABLED;
}

/**
 * Log a debug message if RL_DEBUG is enabled
 * @param prefix - Short prefix for the log (e.g., "BC" for BattleController)
 * @param message - The message to log
 * @param data - Optional additional data to log
 */
export function rlDebug(prefix: string, message: string, data?: unknown): void {
  if (!DEBUG_ENABLED) {
    return;
  }

  const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  if (data !== undefined) {
    console.log(`[${timestamp}] [${prefix}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [${prefix}] ${message}`);
  }
}

/**
 * Log a warning (always shown, regardless of debug flag)
 */
export function rlWarn(prefix: string, message: string, data?: unknown): void {
  if (data !== undefined) {
    console.warn(`[${prefix}] ${message}`, data);
  } else {
    console.warn(`[${prefix}] ${message}`);
  }
}

/**
 * Log an error (always shown, regardless of debug flag)
 */
export function rlError(prefix: string, message: string, error?: unknown): void {
  if (error !== undefined) {
    console.error(`[${prefix}] ${message}`, error);
  } else {
    console.error(`[${prefix}] ${message}`);
  }
}

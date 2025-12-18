/**
 * Browser Module Exports
 *
 * Provides browser-compatible exports for visual AI playback.
 */

// biome-ignore lint/performance/noBarrelFile: Intentional re-export module
export { createModelPlayer, ModelPlayer } from "./model-player";
export {
  createVisualController,
  DEFAULT_VISUAL_CONFIG,
  getVisualController,
  VisualController,
  type VisualControllerConfig,
} from "./visual-controller";

/**
 * Headless RL Training Infrastructure
 *
 * Provides standalone game initialization without vitest dependencies.
 */

// biome-ignore lint/performance/noBarrelFile: Intentional re-export module
export {
  createHeadlessGameManager,
  HeadlessGameManager,
  type HeadlessGameManagerConfig,
  type StarterConfig,
} from "./headless-game-manager";
export { type HeadlessMocksConfig, injectHeadlessMocks } from "./headless-mocks";
export { createRuntimeOverrides, RuntimeOverrides } from "./runtime-overrides";

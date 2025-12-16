/**
 * PokeRogue RL Environment
 *
 * A headless reinforcement learning environment for training AI agents
 * to play PokeRogue battles.
 *
 * Usage:
 * ```typescript
 * import { createRLEnvironment, ActionType } from "#app/rl";
 *
 * const env = createRLEnvironment({
 *   episodeType: "single_battle",
 *   starters: [6, 9, 3], // Charizard, Blastoise, Venusaur
 * });
 *
 * let obs = await env.reset();
 *
 * while (!env.isDone) {
 *   // Get valid actions
 *   const validActions = env.actionMask
 *     .map((valid, i) => valid ? i : -1)
 *     .filter(i => i >= 0);
 *
 *   // Select action (your AI logic here)
 *   const action = validActions[Math.floor(Math.random() * validActions.length)];
 *
 *   // Take step
 *   const [nextObs, reward, terminated, truncated, info] = await env.step(action);
 *   obs = nextObs;
 *
 *   if (terminated || truncated) break;
 * }
 *
 * env.close();
 * ```
 */

// Action utilities
// biome-ignore lint/performance/noBarrelFile: This is the public API entry point for the RL module
export {
  describeAction,
  getValidActions,
  selectRandomValidAction,
  translateAction,
} from "./action";
export type {
  AutoPilotConfig,
  BiomeStrategy,
  ModifierStrategy,
} from "./auto-pilot";
// Auto-pilot
export {
  AutoPilot,
  createAutoPilot,
  DEFAULT_AUTO_PILOT_CONFIG,
} from "./auto-pilot";
// Controller
export { BattleController, ControllerState, createBattleController } from "./battle-controller";
// Main environment
export { createRLEnvironment, RLEnvironment, VectorizedRLEnvironment } from "./environment";
// Observation utilities
export {
  computeActionMask,
  extractBattleObservation,
  extractMoveObservation,
  extractPokemonObservation,
  isEnemyDefeated,
  isPlayerDefeated,
  takeBattleStateSnapshot,
} from "./observation";
// Reward utilities
export {
  calculateReward,
  createRewardConfig,
  RewardShaping,
} from "./reward";
// Types
export type {
  BattleObservation,
  BattleStateSnapshot,
  EnvironmentConfig,
  MoveObservation,
  PokemonObservation,
  RewardConfig,
  StepInfo,
  StepResult,
} from "./types";
export {
  ACTION_SPACE_SIZE,
  ActionType,
  DEFAULT_ENV_CONFIG,
  DEFAULT_REWARD_CONFIG,
} from "./types";

/**
 * RLEnvironment - Gym-like interface for RL training
 *
 * This is the main entry point for training AI agents on PokeRogue.
 * It provides a standard RL interface with reset() and step() methods.
 */

import { type BattleController, ControllerState, createBattleController } from "./battle-controller";
import type { ActionType, BattleObservation, EnvironmentConfig } from "./types";
import { ACTION_SPACE_SIZE, DEFAULT_ENV_CONFIG } from "./types";

/**
 * Observation space description (for compatibility with Gym)
 */
export interface ObservationSpace {
  type: "dict";
  description: string;
  shape: {
    playerActive: string;
    playerBench: string;
    enemyActive: string;
    enemyBench: string;
    weather: string;
    terrain: string;
    turn: string;
    waveIndex: string;
    isDoubleBattle: string;
    activeFieldIndex: string;
    actionMask: string;
  };
}

/**
 * Action space description (for compatibility with Gym)
 */
export interface ActionSpace {
  type: "discrete";
  n: number;
  description: string;
  actions: { [key: number]: string };
}

/**
 * RLEnvironment provides a Gym-like interface for training RL agents
 *
 * Usage:
 * ```typescript
 * const env = new RLEnvironment(config);
 * let obs = await env.reset();
 *
 * while (!done) {
 *   const action = agent.selectAction(obs, env.actionMask);
 *   const [nextObs, reward, terminated, truncated, info] = await env.step(action);
 *   obs = nextObs;
 *   done = terminated || truncated;
 * }
 * ```
 */
export class RLEnvironment {
  private config: EnvironmentConfig;
  private controller: BattleController;
  private episodeCount = 0;
  private totalSteps = 0;
  private lastObservation: BattleObservation | null = null;

  constructor(config: Partial<EnvironmentConfig> = {}) {
    this.config = { ...DEFAULT_ENV_CONFIG, ...config };
    this.controller = createBattleController(this.config);
  }

  /**
   * Reset the environment and start a new episode
   * @param seed - Optional seed for reproducibility
   * @returns Initial observation
   */
  async reset(seed?: number): Promise<BattleObservation> {
    this.episodeCount++;

    // Set seed if provided
    if (seed !== undefined) {
      this.config.seed = seed.toString();
    }

    // Reset the controller
    const observation = await this.controller.reset();
    this.lastObservation = observation;

    return observation;
  }

  /**
   * Take an action in the environment
   * @param action - The action to take (0-12)
   * @returns Tuple of [observation, reward, terminated, truncated, info]
   */
  async step(action: ActionType | number): Promise<[BattleObservation, number, boolean, boolean, Record<string, any>]> {
    this.totalSteps++;

    const result = await this.controller.step(action as ActionType);
    this.lastObservation = result.observation;

    return [result.observation, result.reward, result.terminated, result.truncated, result.info];
  }

  /**
   * Get the current action mask (which actions are valid)
   */
  get actionMask(): boolean[] {
    if (!this.lastObservation) {
      return new Array(ACTION_SPACE_SIZE).fill(false);
    }
    return this.lastObservation.actionMask;
  }

  /**
   * Get the observation space description
   */
  get observationSpace(): ObservationSpace {
    return {
      type: "dict",
      description: "Battle state observation including player/enemy Pokemon, weather, terrain, and valid actions",
      shape: {
        playerActive: "List[PokemonObservation] - Active player Pokemon (1-2)",
        playerBench: "List[PokemonObservation] - Benched player Pokemon",
        enemyActive: "List[PokemonObservation] - Active enemy Pokemon (1-2)",
        enemyBench: "List[PokemonObservation] - Known enemy bench Pokemon",
        weather: "WeatherType - Current weather condition",
        terrain: "TerrainType - Current terrain",
        turn: "int - Current battle turn",
        waveIndex: "int - Current wave/stage",
        isDoubleBattle: "bool - Whether this is a double battle",
        activeFieldIndex: "int - Which Pokemon needs to act (0 or 1)",
        actionMask: "List[bool] - Valid actions mask (length 13)",
      },
    };
  }

  /**
   * Get the action space description
   */
  get actionSpace(): ActionSpace {
    return {
      type: "discrete",
      n: ACTION_SPACE_SIZE,
      description: "Discrete action space with 13 actions: 4 moves, 5 switches, 4 tera+moves",
      actions: {
        0: "MOVE_0 - Use move at index 0",
        1: "MOVE_1 - Use move at index 1",
        2: "MOVE_2 - Use move at index 2",
        3: "MOVE_3 - Use move at index 3",
        4: "SWITCH_1 - Switch to party Pokemon 1",
        5: "SWITCH_2 - Switch to party Pokemon 2",
        6: "SWITCH_3 - Switch to party Pokemon 3",
        7: "SWITCH_4 - Switch to party Pokemon 4",
        8: "SWITCH_5 - Switch to party Pokemon 5",
        9: "TERA_MOVE_0 - Terastallize and use move 0",
        10: "TERA_MOVE_1 - Terastallize and use move 1",
        11: "TERA_MOVE_2 - Terastallize and use move 2",
        12: "TERA_MOVE_3 - Terastallize and use move 3",
      },
    };
  }

  /**
   * Get the last observation
   */
  get lastObs(): BattleObservation | null {
    return this.lastObservation;
  }

  /**
   * Get the number of episodes completed
   */
  get episodes(): number {
    return this.episodeCount;
  }

  /**
   * Get the total number of steps taken across all episodes
   */
  get steps(): number {
    return this.totalSteps;
  }

  /**
   * Check if the environment is ready for an action
   */
  get isReady(): boolean {
    return this.controller.getState() === ControllerState.AWAITING_DECISION;
  }

  /**
   * Check if the current episode is done
   */
  get isDone(): boolean {
    return this.controller.getState() === ControllerState.EPISODE_ENDED;
  }

  /**
   * Get the current configuration
   */
  getConfig(): EnvironmentConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration
   * Note: Some changes may only take effect on the next reset()
   */
  setConfig(config: Partial<EnvironmentConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Close the environment and clean up resources
   */
  close(): void {
    // Clean up any resources
    this.lastObservation = null;
  }

  /**
   * Render the environment (no-op for headless mode)
   */
  render(mode: "human" | "rgb_array" = "human"): void {
    // No-op for headless mode
    if (mode === "human") {
      console.log("Render not available in headless mode");
    }
  }

  /**
   * Get a string representation of the current state
   */
  toString(): string {
    const state = this.controller.getState();
    const wave = this.lastObservation?.waveIndex ?? 0;
    const turn = this.lastObservation?.turn ?? 0;

    return `RLEnvironment(state=${state}, episode=${this.episodeCount}, wave=${wave}, turn=${turn}, steps=${this.totalSteps})`;
  }
}

/**
 * Create an RL environment with the given configuration
 */
export function createRLEnvironment(config: Partial<EnvironmentConfig> = {}): RLEnvironment {
  return new RLEnvironment(config);
}

/**
 * Vectorized environment for parallel training
 * (Placeholder for future implementation)
 */
export class VectorizedRLEnvironment {
  private envs: RLEnvironment[];

  constructor(numEnvs: number, config: Partial<EnvironmentConfig> = {}) {
    this.envs = [];
    for (let i = 0; i < numEnvs; i++) {
      this.envs.push(new RLEnvironment(config));
    }
  }

  get numEnvs(): number {
    return this.envs.length;
  }

  async reset(): Promise<BattleObservation[]> {
    return Promise.all(this.envs.map(env => env.reset()));
  }

  async step(
    actions: (ActionType | number)[],
  ): Promise<[BattleObservation[], number[], boolean[], boolean[], Record<string, any>[]]> {
    const results = await Promise.all(this.envs.map((env, i) => env.step(actions[i])));

    const observations = results.map(r => r[0]);
    const rewards = results.map(r => r[1]);
    const terminated = results.map(r => r[2]);
    const truncated = results.map(r => r[3]);
    const infos = results.map(r => r[4]);

    return [observations, rewards, terminated, truncated, infos];
  }

  getActionMasks(): boolean[][] {
    return this.envs.map(env => env.actionMask);
  }

  close(): void {
    this.envs.forEach(env => env.close());
  }
}

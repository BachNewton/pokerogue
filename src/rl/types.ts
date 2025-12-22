/**
 * Type definitions for the RL environment
 */

import type { TerrainType } from "#data/terrain";
import type { MoveCategory } from "#enums/move-category";
import type { WeatherType } from "#enums/weather-type";

/**
 * Types of decisions the RL agent can make
 */
export enum DecisionType {
  /** CommandPhase: choose move or switch during battle */
  COMMAND = "command",
  /** CheckSwitchPhase: optional switch after KO (yes/no) */
  CHECK_SWITCH = "check_switch",
  /** SwitchPhase: forced switch, select Pokemon */
  SWITCH = "switch",
  /** SelectTargetPhase: choose target in doubles */
  TARGET = "target",
}

/**
 * Observation for a single Pokemon
 */
export interface PokemonObservation {
  /** Species ID */
  speciesId: number;
  /** Current level */
  level: number;
  /** Pokemon types (up to 2), -1 for none */
  types: [number, number];
  /** HP as percentage (0.0 - 1.0) */
  hpPercent: number;
  /** Base stats [HP, ATK, DEF, SPATK, SPDEF, SPD] */
  stats: [number, number, number, number, number, number];
  /** Stat stages (-6 to +6) for [ATK, DEF, SPATK, SPDEF, SPD, ACC, EVA] */
  statStages: [number, number, number, number, number, number, number];
  /** Status effect (0 = none, see StatusEffect enum) */
  status: number;
  /** Available moves (up to 4) */
  moves: MoveObservation[];
  /** Tera type (-1 if not available) */
  teraType: number;
  /** Whether this Pokemon can Terastallize */
  canTera: boolean;
  /** Whether this Pokemon is currently Terastallized */
  isTerastallized: boolean;
  /** Whether this Pokemon is fainted */
  isFainted: boolean;
}

/**
 * Observation for a single move
 */
export interface MoveObservation {
  /** Move ID */
  moveId: number;
  /** Move type */
  type: number;
  /** Move category (Physical/Special/Status) */
  category: MoveCategory;
  /** Base power (0 for status moves) */
  power: number;
  /** Accuracy (0-100, or -1 for moves that can't miss) */
  accuracy: number;
  /** PP remaining */
  ppRemaining: number;
  /** Max PP */
  ppMax: number;
  /** Move priority */
  priority: number;
}

/**
 * Full battle observation
 */
export interface BattleObservation {
  /** Active player Pokemon on the field (1-2) */
  playerActive: PokemonObservation[];
  /** Benched player Pokemon (remaining party) */
  playerBench: PokemonObservation[];
  /** Active enemy Pokemon on the field (1-2) */
  enemyActive: PokemonObservation[];
  /** Known enemy bench Pokemon (partial info) */
  enemyBench: PokemonObservation[];
  /** Current weather type */
  weather: WeatherType;
  /** Current terrain type */
  terrain: TerrainType;
  /** Current turn number */
  turn: number;
  /** Current wave index */
  waveIndex: number;
  /** Whether this is a double battle */
  isDoubleBattle: boolean;
  /** Index of the Pokemon that needs to make a decision (0 or 1) */
  activeFieldIndex: number;
  /** Valid actions mask (true = valid) */
  actionMask: boolean[];

  // === Decision Context ===
  /** The type of decision required */
  decisionType: DecisionType;
  /** For SwitchPhase: which field index is switching out */
  switchingFieldIndex?: number;
  /** For SelectTargetPhase: valid target indices (BattlerIndex values) */
  validTargets?: number[];
  /** For CheckSwitchPhase: opponent's next Pokemon if visible */
  opponentNextPokemon?: PokemonObservation;
}

/**
 * Action types for the RL agent
 *
 * Actions are grouped by decision type:
 * - COMMAND (0-12): Move selection, voluntary switch, tera moves
 * - SWITCH (13-18): Forced switch to party slot
 * - TARGET (19-22): Target selection in doubles
 * - CHECK_SWITCH (23-24): Optional switch yes/no
 */
export enum ActionType {
  // === COMMAND Phase Actions (0-12) ===
  /** Use move at index 0 */
  MOVE_0 = 0,
  /** Use move at index 1 */
  MOVE_1 = 1,
  /** Use move at index 2 */
  MOVE_2 = 2,
  /** Use move at index 3 */
  MOVE_3 = 3,
  /** Switch to party Pokemon at index 1 (voluntary) */
  SWITCH_1 = 4,
  /** Switch to party Pokemon at index 2 (voluntary) */
  SWITCH_2 = 5,
  /** Switch to party Pokemon at index 3 (voluntary) */
  SWITCH_3 = 6,
  /** Switch to party Pokemon at index 4 (voluntary) */
  SWITCH_4 = 7,
  /** Switch to party Pokemon at index 5 (voluntary) */
  SWITCH_5 = 8,
  /** Terastallize and use move at index 0 */
  TERA_MOVE_0 = 9,
  /** Terastallize and use move at index 1 */
  TERA_MOVE_1 = 10,
  /** Terastallize and use move at index 2 */
  TERA_MOVE_2 = 11,
  /** Terastallize and use move at index 3 */
  TERA_MOVE_3 = 12,

  // === SWITCH Phase Actions (13-18) ===
  /** Select party slot 0 for forced switch */
  SWITCH_SLOT_0 = 13,
  /** Select party slot 1 for forced switch */
  SWITCH_SLOT_1 = 14,
  /** Select party slot 2 for forced switch */
  SWITCH_SLOT_2 = 15,
  /** Select party slot 3 for forced switch */
  SWITCH_SLOT_3 = 16,
  /** Select party slot 4 for forced switch */
  SWITCH_SLOT_4 = 17,
  /** Select party slot 5 for forced switch */
  SWITCH_SLOT_5 = 18,

  // === TARGET Phase Actions (19-22) ===
  /** Target player slot 0 (ally in doubles, or self for certain moves) */
  TARGET_PLAYER = 19,
  /** Target player slot 1 (ally in doubles) */
  TARGET_PLAYER_2 = 20,
  /** Target enemy slot 0 */
  TARGET_ENEMY = 21,
  /** Target enemy slot 1 (in doubles) */
  TARGET_ENEMY_2 = 22,

  // === CHECK_SWITCH Phase Actions (23-24) ===
  /** Decline optional switch after KO */
  CHECK_SWITCH_NO = 23,
  /** Accept optional switch after KO (triggers SwitchPhase next) */
  CHECK_SWITCH_YES = 24,
}

/** Total number of actions in the action space */
export const ACTION_SPACE_SIZE = 25;

/** Action ranges for each decision type */
export const ACTION_RANGES: Record<DecisionType, { start: number; end: number }> = {
  [DecisionType.COMMAND]: { start: 0, end: 12 },
  [DecisionType.SWITCH]: { start: 13, end: 18 },
  [DecisionType.TARGET]: { start: 19, end: 22 },
  [DecisionType.CHECK_SWITCH]: { start: 23, end: 24 },
};

/**
 * Result of taking a step in the environment
 */
export interface StepResult {
  /** New observation after the action */
  observation: BattleObservation;
  /** Reward received for the action */
  reward: number;
  /** Whether the episode is terminated (win/lose) */
  terminated: boolean;
  /** Whether the episode is truncated (max steps, error, etc.) */
  truncated: boolean;
  /** Additional info */
  info: StepInfo;
}

/**
 * Additional info returned with each step
 */
export interface StepInfo {
  /** Current wave index */
  waveIndex: number;
  /** Number of enemy Pokemon knocked out this step */
  enemyKOs: number;
  /** Number of player Pokemon fainted this step */
  playerFaints: number;
  /** Whether the battle was won */
  battleWon: boolean;
  /** Whether the battle was lost */
  battleLost: boolean;
  /** Whether the game is over (run ended) */
  gameOver: boolean;
  /** Error message if any */
  error?: string;
}

/**
 * Configuration for reward calculation
 */
export interface RewardConfig {
  /** Reward for knocking out an enemy Pokemon */
  knockoutEnemy: number;
  /** Penalty for player Pokemon fainting */
  playerFainted: number;
  /** Reward multiplier for damage dealt (per % of enemy HP) */
  damageDealtMultiplier: number;
  /** Penalty multiplier for damage taken (per % of player HP) */
  damageTakenMultiplier: number;
  /** Reward for winning a battle */
  battleWon: number;
  /** Penalty for losing a battle */
  battleLost: number;
  /** Reward for progressing to the next wave */
  waveProgression: number;
  /** Small penalty per turn to encourage efficiency */
  turnPenalty: number;
}

/**
 * Default reward configuration
 */
export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  knockoutEnemy: 1.0,
  playerFainted: -1.0,
  damageDealtMultiplier: 0.01,
  damageTakenMultiplier: -0.01,
  battleWon: 5.0,
  battleLost: -5.0,
  waveProgression: 0.5,
  turnPenalty: -0.01,
};

/**
 * Configuration for the RL environment
 */
export interface EnvironmentConfig {
  /** Type of episode: single battle or full run */
  episodeType: "single_battle" | "full_run";
  /** Maximum turns per battle before truncation */
  maxTurnsPerBattle: number;
  /** Maximum waves before truncation (for full_run) */
  maxWaves: number;
  /** Starter Pokemon species IDs (1-6) */
  starters: number[];
  /** Strategy for auto-selecting modifiers */
  modifierStrategy: "skip" | "first" | "random";
  /** Strategy for auto-selecting biomes */
  biomeStrategy: "first" | "random";
  /** Reward configuration */
  rewardConfig: RewardConfig;
  /** Optional seed for reproducibility */
  seed?: string;
  /** Whether to randomize starters each episode */
  randomizeStarters: boolean;
  /** Starting wave (default 1) */
  startingWave: number;
}

/**
 * Default environment configuration
 */
export const DEFAULT_ENV_CONFIG: EnvironmentConfig = {
  episodeType: "single_battle",
  maxTurnsPerBattle: 100,
  maxWaves: 200,
  starters: [6, 9, 3], // Charizard, Blastoise, Venusaur
  modifierStrategy: "skip",
  biomeStrategy: "first",
  rewardConfig: DEFAULT_REWARD_CONFIG,
  randomizeStarters: false,
  startingWave: 1,
};

/**
 * Snapshot of battle state for reward calculation
 */
export interface BattleStateSnapshot {
  /** HP percentages of player party */
  playerHPs: number[];
  /** HP percentages of enemy party */
  enemyHPs: number[];
  /** Number of fainted player Pokemon */
  playerFaintCount: number;
  /** Number of fainted enemy Pokemon */
  enemyFaintCount: number;
  /** Current wave index */
  waveIndex: number;
  /** Current turn number */
  turn: number;
}

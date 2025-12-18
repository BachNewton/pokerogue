/**
 * Observation Encoder for TensorFlow.js
 *
 * Converts structured BattleObservation into Float32Array for neural network input.
 */

import type { BattleObservation, MoveObservation, PokemonObservation } from "../types";
import { ACTION_SPACE_SIZE } from "../types";

/**
 * Size constants for the observation encoding
 */
export const OBSERVATION_SIZES = {
  /** Features per move (8 floats) */
  MOVE_FEATURES: 8,
  /** Features per Pokemon (excluding moves): species, level, types, hp, stats, stages, status, tera */
  POKEMON_BASE_FEATURES: 23,
  /** Total features per Pokemon (base + 4 moves) */
  POKEMON_FEATURES: 23 + 8 * 4, // 55
  /** Number of Pokemon slots per side */
  MAX_POKEMON_PER_SIDE: 6,
  /** Battle state features */
  BATTLE_FEATURES: 8,
  /** Total observation size */
  TOTAL_SIZE: 55 * 12 + 8, // 6 player + 6 enemy pokemon + battle state = 668
};

/**
 * Encode a single move into a float array
 */
export function encodeMove(move: MoveObservation): number[] {
  return [
    move.moveId / 1000, // Normalize move ID
    move.type / 20, // Normalize type (max ~18 types)
    move.category / 3, // 0=Physical, 1=Special, 2=Status
    move.power / 200, // Normalize power (max ~200)
    move.accuracy === -1 ? 1.0 : move.accuracy / 100, // -1 means can't miss
    move.ppRemaining / 40, // Normalize PP (max ~40)
    move.ppMax / 40,
    (move.priority + 6) / 12, // Priority range [-6, +6] -> [0, 1]
  ];
}

/**
 * Encode a single Pokemon into a float array
 */
export function encodePokemon(pokemon: PokemonObservation | null): number[] {
  if (!pokemon || pokemon.speciesId === 0) {
    // Return zeros for empty slot
    return new Array(OBSERVATION_SIZES.POKEMON_FEATURES).fill(0);
  }

  const baseFeatures = [
    // Identity
    pokemon.speciesId / 1025, // Normalize species ID (max ~1025)
    pokemon.level / 100, // Level 1-100

    // Types (one-hot would be better but this is simpler)
    pokemon.types[0] / 20, // Type 1
    (pokemon.types[1] === -1 ? 0 : pokemon.types[1]) / 20, // Type 2 (-1 means none)

    // HP
    pokemon.hpPercent, // Already 0-1
    pokemon.isFainted ? 0 : 1, // Boolean as 0/1

    // Stats (normalized to reasonable ranges)
    pokemon.stats[0] / 500, // HP
    pokemon.stats[1] / 300, // ATK
    pokemon.stats[2] / 300, // DEF
    pokemon.stats[3] / 300, // SPATK
    pokemon.stats[4] / 300, // SPDEF
    pokemon.stats[5] / 300, // SPD

    // Stat stages (-6 to +6, normalize to 0-1)
    (pokemon.statStages[0] + 6) / 12, // ATK
    (pokemon.statStages[1] + 6) / 12, // DEF
    (pokemon.statStages[2] + 6) / 12, // SPATK
    (pokemon.statStages[3] + 6) / 12, // SPDEF
    (pokemon.statStages[4] + 6) / 12, // SPD
    (pokemon.statStages[5] + 6) / 12, // ACC
    (pokemon.statStages[6] + 6) / 12, // EVA

    // Status and special state
    pokemon.status / 10, // Status effect enum
    pokemon.canTera ? 1 : 0,
    pokemon.isTerastallized ? 1 : 0,
    pokemon.teraType === -1 ? 0 : pokemon.teraType / 20,
  ];

  // Verify base features count (should match POKEMON_BASE_FEATURES)
  if (baseFeatures.length !== OBSERVATION_SIZES.POKEMON_BASE_FEATURES) {
    console.warn(
      `Pokemon base features mismatch: ${baseFeatures.length} vs expected ${OBSERVATION_SIZES.POKEMON_BASE_FEATURES}`,
    );
  }

  // Encode moves
  const moveFeatures: number[] = [];
  for (let i = 0; i < 4; i++) {
    if (i < pokemon.moves.length) {
      moveFeatures.push(...encodeMove(pokemon.moves[i]));
    } else {
      moveFeatures.push(...new Array(OBSERVATION_SIZES.MOVE_FEATURES).fill(0));
    }
  }

  return [...baseFeatures, ...moveFeatures];
}

/**
 * Encode battle state features
 */
export function encodeBattleState(obs: BattleObservation): number[] {
  return [
    obs.weather / 10, // Weather type enum
    obs.terrain / 10, // Terrain type enum
    obs.turn / 100, // Normalize turn count
    obs.waveIndex / 200, // Normalize wave (max 200)
    obs.isDoubleBattle ? 1 : 0,
    obs.activeFieldIndex, // 0 or 1
    // Pad to expected size
    0,
    0,
  ];
}

/**
 * Encode a full battle observation into a Float32Array
 */
export function encodeObservation(obs: BattleObservation): Float32Array {
  const encoded: number[] = [];

  // Encode player Pokemon (active first, then bench)
  // Always encode 6 slots for consistent tensor shape
  const playerPokemon = [...obs.playerActive, ...obs.playerBench];
  for (let i = 0; i < OBSERVATION_SIZES.MAX_POKEMON_PER_SIDE; i++) {
    encoded.push(...encodePokemon(playerPokemon[i] ?? null));
  }

  // Encode enemy Pokemon (active first, then bench)
  const enemyPokemon = [...obs.enemyActive, ...obs.enemyBench];
  for (let i = 0; i < OBSERVATION_SIZES.MAX_POKEMON_PER_SIDE; i++) {
    encoded.push(...encodePokemon(enemyPokemon[i] ?? null));
  }

  // Encode battle state
  encoded.push(...encodeBattleState(obs));

  return new Float32Array(encoded);
}

/**
 * Encode the action mask as a Float32Array (1.0 for valid, -Infinity for invalid)
 * This format is ready for direct use with softmax masking
 */
export function encodeActionMask(mask: boolean[]): Float32Array {
  const encoded = new Float32Array(ACTION_SPACE_SIZE);
  for (let i = 0; i < ACTION_SPACE_SIZE; i++) {
    encoded[i] = mask[i] ? 0 : -1e9; // 0 for valid (no penalty), -inf for invalid
  }
  return encoded;
}

/**
 * Encode action mask as simple 0/1 values
 */
export function encodeActionMaskBinary(mask: boolean[]): Float32Array {
  const encoded = new Float32Array(ACTION_SPACE_SIZE);
  for (let i = 0; i < ACTION_SPACE_SIZE; i++) {
    encoded[i] = mask[i] ? 1 : 0;
  }
  return encoded;
}

/**
 * Get the observation shape for model input
 */
export function getObservationShape(): [number] {
  return [OBSERVATION_SIZES.TOTAL_SIZE];
}

/**
 * Get the action space size
 */
export function getActionSpaceSize(): number {
  return ACTION_SPACE_SIZE;
}

/**
 * Decode an action index to a human-readable description
 */
export function describeAction(action: number): string {
  if (action < 4) {
    return `Use Move ${action}`;
  }
  if (action < 9) {
    return `Switch to Pokemon ${action - 3}`;
  }
  return `Terastallize + Use Move ${action - 9}`;
}

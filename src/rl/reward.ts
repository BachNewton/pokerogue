/**
 * Reward calculation for the RL environment
 */

import type { BattleStateSnapshot, RewardConfig, StepInfo } from "./types";
import { DEFAULT_REWARD_CONFIG } from "./types";

/**
 * Calculate the reward for a step based on state changes
 * @param prevState - State snapshot before the action
 * @param currState - State snapshot after the action
 * @param info - Additional step info
 * @param config - Reward configuration
 * @returns The calculated reward
 */
export function calculateReward(
  prevState: BattleStateSnapshot,
  currState: BattleStateSnapshot,
  info: StepInfo,
  config: RewardConfig = DEFAULT_REWARD_CONFIG,
): number {
  let reward = 0;

  // Reward for knocking out enemy Pokemon
  const enemyKOs = currState.enemyFaintCount - prevState.enemyFaintCount;
  if (enemyKOs > 0) {
    reward += config.knockoutEnemy * enemyKOs;
  }

  // Penalty for player Pokemon fainting
  const playerFaints = currState.playerFaintCount - prevState.playerFaintCount;
  if (playerFaints > 0) {
    reward += config.playerFainted * playerFaints;
  }

  // Reward/penalty for HP changes
  const damageDealt = calculateTotalDamageDealt(prevState, currState);
  const damageTaken = calculateTotalDamageTaken(prevState, currState);

  reward += damageDealt * config.damageDealtMultiplier;
  reward += damageTaken * config.damageTakenMultiplier;

  // Reward for winning the battle
  if (info.battleWon) {
    reward += config.battleWon;
  }

  // Penalty for losing the battle
  if (info.battleLost) {
    reward += config.battleLost;
  }

  // Reward for wave progression
  if (currState.waveIndex > prevState.waveIndex) {
    reward += config.waveProgression * (currState.waveIndex - prevState.waveIndex);
  }

  // Small penalty per turn to encourage efficiency
  if (currState.turn > prevState.turn) {
    reward += config.turnPenalty * (currState.turn - prevState.turn);
  }

  return reward;
}

/**
 * Calculate total damage dealt to enemies (as percentage of their max HP)
 */
function calculateTotalDamageDealt(prevState: BattleStateSnapshot, currState: BattleStateSnapshot): number {
  let totalDamage = 0;

  // Compare HP percentages of enemies
  for (let i = 0; i < Math.min(prevState.enemyHPs.length, currState.enemyHPs.length); i++) {
    const hpDiff = prevState.enemyHPs[i] - currState.enemyHPs[i];
    if (hpDiff > 0) {
      totalDamage += hpDiff * 100; // Convert to percentage points
    }
  }

  return totalDamage;
}

/**
 * Calculate total damage taken by player Pokemon (as percentage of their max HP)
 */
function calculateTotalDamageTaken(prevState: BattleStateSnapshot, currState: BattleStateSnapshot): number {
  let totalDamage = 0;

  // Compare HP percentages of player Pokemon
  for (let i = 0; i < Math.min(prevState.playerHPs.length, currState.playerHPs.length); i++) {
    const hpDiff = prevState.playerHPs[i] - currState.playerHPs[i];
    if (hpDiff > 0) {
      totalDamage += hpDiff * 100; // Convert to percentage points
    }
  }

  return totalDamage;
}

/**
 * Create a reward configuration with custom values
 * @param overrides - Partial config to override defaults
 * @returns Complete reward configuration
 */
export function createRewardConfig(overrides: Partial<RewardConfig> = {}): RewardConfig {
  return {
    ...DEFAULT_REWARD_CONFIG,
    ...overrides,
  };
}

/**
 * Reward shaping utilities for curriculum learning
 */
export const RewardShaping = {
  /**
   * Create a config focused on survival (avoid fainting)
   */
  survivalFocused(): RewardConfig {
    return createRewardConfig({
      playerFainted: -3.0,
      battleLost: -10.0,
      damageTakenMultiplier: -0.02,
    });
  },

  /**
   * Create a config focused on aggression (deal damage, KO enemies)
   */
  aggressiveFocused(): RewardConfig {
    return createRewardConfig({
      knockoutEnemy: 2.0,
      battleWon: 10.0,
      damageDealtMultiplier: 0.02,
    });
  },

  /**
   * Create a config focused on efficiency (quick victories)
   */
  efficiencyFocused(): RewardConfig {
    return createRewardConfig({
      turnPenalty: -0.05,
      battleWon: 3.0,
      waveProgression: 1.0,
    });
  },

  /**
   * Create a sparse reward config (only win/lose matters)
   */
  sparse(): RewardConfig {
    return createRewardConfig({
      knockoutEnemy: 0,
      playerFainted: 0,
      damageDealtMultiplier: 0,
      damageTakenMultiplier: 0,
      battleWon: 1.0,
      battleLost: -1.0,
      waveProgression: 0,
      turnPenalty: 0,
    });
  },
};

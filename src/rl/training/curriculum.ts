/**
 * Curriculum Learning Manager
 *
 * Manages training stages from simple battles to full runs.
 */

import type { EnvironmentConfig } from "../types";

/**
 * Graduation criteria for advancing to next stage
 */
export interface GraduationCriteria {
  /** Minimum win rate required */
  winRate?: number;
  /** Minimum average waves reached */
  averageWaves?: number;
  /** Minimum episodes completed at this stage */
  minEpisodes: number;
}

/**
 * A single curriculum stage configuration
 */
export interface CurriculumStage {
  /** Stage name for logging */
  name: string;
  /** Description of this stage */
  description: string;
  /** Environment config overrides for this stage */
  config: Partial<EnvironmentConfig>;
  /** Criteria to graduate to next stage */
  graduationCriteria: GraduationCriteria;
}

/**
 * Episode result for tracking progress
 */
export interface EpisodeResult {
  /** Whether the battle/run was won */
  won: boolean;
  /** Number of waves reached (for full runs) */
  wavesReached: number;
  /** Total episode reward */
  totalReward: number;
  /** Number of turns taken */
  turns: number;
}

/**
 * Default curriculum stages
 */
export const DEFAULT_CURRICULUM: CurriculumStage[] = [
  {
    name: "basic_single_battle",
    description: "Learn basic combat against fixed weak opponent",
    config: {
      episodeType: "single_battle",
      maxTurnsPerBattle: 50,
      startingWave: 1,
      modifierStrategy: "skip",
      biomeStrategy: "first",
      randomizeStarters: false,
    },
    graduationCriteria: {
      winRate: 0.8,
      minEpisodes: 1000,
    },
  },
  {
    name: "varied_opponents",
    description: "Battle against varied opponents with random starters",
    config: {
      episodeType: "single_battle",
      maxTurnsPerBattle: 100,
      startingWave: 1,
      modifierStrategy: "skip",
      biomeStrategy: "first",
      randomizeStarters: true,
    },
    graduationCriteria: {
      winRate: 0.7,
      minEpisodes: 5000,
    },
  },
  {
    name: "wave_progression",
    description: "Progress through multiple waves",
    config: {
      episodeType: "full_run",
      maxWaves: 10,
      maxTurnsPerBattle: 100,
      modifierStrategy: "first",
      biomeStrategy: "first",
      randomizeStarters: true,
    },
    graduationCriteria: {
      averageWaves: 8,
      minEpisodes: 10000,
    },
  },
  {
    name: "full_run",
    description: "Complete full roguelike runs",
    config: {
      episodeType: "full_run",
      maxWaves: 200,
      maxTurnsPerBattle: 100,
      modifierStrategy: "random",
      biomeStrategy: "random",
      randomizeStarters: true,
    },
    graduationCriteria: {
      averageWaves: 50,
      minEpisodes: 50000,
    },
  },
];

/**
 * Curriculum Manager handles stage progression during training
 */
export class CurriculumManager {
  private readonly stages: CurriculumStage[];
  private currentStageIndex = 0;
  private stageResults: EpisodeResult[] = [];
  private allResults: EpisodeResult[] = [];
  private stageStartEpisode = 0;

  constructor(stages: CurriculumStage[] = DEFAULT_CURRICULUM) {
    this.stages = stages;
  }

  /**
   * Get the current curriculum stage
   */
  getCurrentStage(): CurriculumStage {
    return this.stages[this.currentStageIndex];
  }

  /**
   * Get the current stage index
   */
  getCurrentStageIndex(): number {
    return this.currentStageIndex;
  }

  /**
   * Get the current stage name
   */
  getCurrentStageName(): string {
    return this.getCurrentStage().name;
  }

  /**
   * Get environment config for current stage
   */
  getConfig(): Partial<EnvironmentConfig> {
    return this.getCurrentStage().config;
  }

  /**
   * Record an episode result
   */
  recordEpisode(result: EpisodeResult): void {
    this.stageResults.push(result);
    this.allResults.push(result);

    // Check for graduation
    if (this.shouldGraduate()) {
      this.advanceStage();
    }
  }

  /**
   * Check if graduation criteria are met
   */
  shouldGraduate(): boolean {
    const stage = this.getCurrentStage();
    const criteria = stage.graduationCriteria;

    // Need minimum episodes
    if (this.stageResults.length < criteria.minEpisodes) {
      return false;
    }

    // Check win rate if specified
    if (criteria.winRate !== undefined) {
      const wins = this.stageResults.filter(r => r.won).length;
      const winRate = wins / this.stageResults.length;
      if (winRate < criteria.winRate) {
        return false;
      }
    }

    // Check average waves if specified
    if (criteria.averageWaves !== undefined) {
      const avgWaves = this.stageResults.reduce((sum, r) => sum + r.wavesReached, 0) / this.stageResults.length;
      if (avgWaves < criteria.averageWaves) {
        return false;
      }
    }

    return true;
  }

  /**
   * Advance to the next stage
   */
  private advanceStage(): void {
    if (this.currentStageIndex < this.stages.length - 1) {
      console.log(`\n🎓 Graduating from stage "${this.getCurrentStageName()}"!`);

      this.currentStageIndex++;
      this.stageResults = [];
      this.stageStartEpisode = this.allResults.length;

      console.log(`📚 Starting stage "${this.getCurrentStageName()}": ${this.getCurrentStage().description}\n`);
    }
  }

  /**
   * Force advance to a specific stage (for resuming training)
   */
  setStage(stageIndex: number): void {
    if (stageIndex >= 0 && stageIndex < this.stages.length) {
      this.currentStageIndex = stageIndex;
      this.stageResults = [];
      this.stageStartEpisode = this.allResults.length;
    }
  }

  /**
   * Get win rate for current stage
   */
  getWinRate(): number {
    if (this.stageResults.length === 0) {
      return 0;
    }
    return this.stageResults.filter(r => r.won).length / this.stageResults.length;
  }

  /**
   * Get average waves for current stage
   */
  getAverageWaves(): number {
    if (this.stageResults.length === 0) {
      return 0;
    }
    return this.stageResults.reduce((sum, r) => sum + r.wavesReached, 0) / this.stageResults.length;
  }

  /**
   * Get average reward for current stage
   */
  getAverageReward(): number {
    if (this.stageResults.length === 0) {
      return 0;
    }
    return this.stageResults.reduce((sum, r) => sum + r.totalReward, 0) / this.stageResults.length;
  }

  /**
   * Get rolling statistics
   */
  getRollingStats(window = 100): { winRate: number; avgReward: number; avgWaves: number } {
    const recent = this.stageResults.slice(-window);
    if (recent.length === 0) {
      return { winRate: 0, avgReward: 0, avgWaves: 0 };
    }

    return {
      winRate: recent.filter(r => r.won).length / recent.length,
      avgReward: recent.reduce((sum, r) => sum + r.totalReward, 0) / recent.length,
      avgWaves: recent.reduce((sum, r) => sum + r.wavesReached, 0) / recent.length,
    };
  }

  /**
   * Get total episodes completed
   */
  getTotalEpisodes(): number {
    return this.allResults.length;
  }

  /**
   * Get episodes in current stage
   */
  getStageEpisodes(): number {
    return this.stageResults.length;
  }

  /**
   * Get progress towards graduation (0-1)
   */
  getGraduationProgress(): number {
    const criteria = this.getCurrentStage().graduationCriteria;
    let progress = 0;
    let count = 0;

    // Episode progress
    const episodeProgress = Math.min(this.stageResults.length / criteria.minEpisodes, 1);
    progress += episodeProgress;
    count++;

    // Win rate progress
    if (criteria.winRate !== undefined) {
      const winRate = this.getWinRate();
      const winRateProgress = Math.min(winRate / criteria.winRate, 1);
      progress += winRateProgress;
      count++;
    }

    // Average waves progress
    if (criteria.averageWaves !== undefined) {
      const avgWaves = this.getAverageWaves();
      const wavesProgress = Math.min(avgWaves / criteria.averageWaves, 1);
      progress += wavesProgress;
      count++;
    }

    return progress / count;
  }

  /**
   * Check if training is complete (all stages graduated)
   */
  isComplete(): boolean {
    return this.currentStageIndex === this.stages.length - 1 && this.shouldGraduate();
  }

  /**
   * Get a summary of current training state
   */
  getSummary(): string {
    const stage = this.getCurrentStage();
    const stats = this.getRollingStats();
    const progress = this.getGraduationProgress();

    return [
      `Stage: ${stage.name} (${this.currentStageIndex + 1}/${this.stages.length})`,
      `Episodes: ${this.getStageEpisodes()}/${stage.graduationCriteria.minEpisodes}`,
      `Win Rate: ${(stats.winRate * 100).toFixed(1)}%`,
      `Avg Reward: ${stats.avgReward.toFixed(2)}`,
      `Avg Waves: ${stats.avgWaves.toFixed(1)}`,
      `Progress: ${(progress * 100).toFixed(0)}%`,
    ].join(" | ");
  }

  /**
   * Serialize state for checkpointing
   */
  serialize(): object {
    return {
      currentStageIndex: this.currentStageIndex,
      stageResults: this.stageResults,
      allResults: this.allResults,
      stageStartEpisode: this.stageStartEpisode,
    };
  }

  /**
   * Restore state from checkpoint
   */
  restore(state: any): void {
    this.currentStageIndex = state.currentStageIndex ?? 0;
    this.stageResults = state.stageResults ?? [];
    this.allResults = state.allResults ?? [];
    this.stageStartEpisode = state.stageStartEpisode ?? 0;
  }
}

/**
 * Create a curriculum manager
 */
export function createCurriculumManager(stages?: CurriculumStage[]): CurriculumManager {
  return new CurriculumManager(stages);
}

/**
 * RL Trainer
 *
 * Main training loop for PPO agent on PokeRogue.
 */

import type { SpeciesId } from "#enums/species-id";
import type { BattleController } from "../battle-controller";
import { createHeadlessGameManager, type HeadlessGameManager } from "../headless";
import type { BattleObservation, EnvironmentConfig, StepResult } from "../types";
import { DEFAULT_ENV_CONFIG } from "../types";
import { type CurriculumManager, createCurriculumManager, type EpisodeResult } from "./curriculum";
import { createMetricsLogger, type MetricsLogger, type StepMetrics } from "./metrics";
import { createPPOAgent, type Experience, type PPOAgent, type PPOConfig } from "./model";
import { encodeObservation } from "./observation-encoder";
import { createTrajectoryBuffer, type TrajectoryBuffer } from "./replay-buffer";

/**
 * Training configuration
 */
export interface TrainerConfig {
  /** Total training steps */
  totalSteps: number;
  /** Steps between policy updates */
  updateInterval: number;
  /** Steps between checkpoints */
  checkpointInterval: number;
  /** Directory for checkpoints */
  checkpointDir: string;
  /** PPO configuration */
  ppoConfig: Partial<PPOConfig>;
  /** Environment configuration */
  envConfig: Partial<EnvironmentConfig>;
  /** Starter Pokemon species */
  starters: SpeciesId[];
  /** Random seed */
  seed?: string;
  /** Enable curriculum learning */
  useCurriculum: boolean;
  /** Log interval (steps) */
  logInterval: number;
}

/**
 * Default trainer configuration
 */
export const DEFAULT_TRAINER_CONFIG: TrainerConfig = {
  totalSteps: 100000,
  updateInterval: 2048,
  checkpointInterval: 10000,
  checkpointDir: "./checkpoints",
  ppoConfig: {},
  envConfig: {},
  starters: [6, 9, 3], // Charizard, Blastoise, Venusaur
  useCurriculum: true,
  logInterval: 100,
};

/**
 * Checkpoint data structure
 */
export interface Checkpoint {
  step: number;
  episode: number;
  curriculumState: object;
  config: TrainerConfig;
  timestamp: string;
}

/**
 * RL Trainer class
 */
export class RLTrainer {
  private readonly config: TrainerConfig;
  private readonly agent: PPOAgent;
  private readonly curriculum: CurriculumManager;
  private readonly metrics: MetricsLogger;
  private readonly buffer: TrajectoryBuffer;
  private gameManager: HeadlessGameManager | null = null;
  private controller: BattleController | null = null;

  private step = 0;
  private episode = 0;
  private episodeReward = 0;
  private episodeSteps = 0;
  private lastObs: BattleObservation | null = null;
  private lastActionMask: boolean[] = [];

  constructor(config: Partial<TrainerConfig> = {}) {
    this.config = { ...DEFAULT_TRAINER_CONFIG, ...config };

    // Initialize components
    this.agent = createPPOAgent(this.config.ppoConfig);
    this.curriculum = createCurriculumManager();
    this.metrics = createMetricsLogger({ logInterval: this.config.logInterval });
    this.buffer = createTrajectoryBuffer();
  }

  /**
   * Initialize the training environment
   */
  async initialize(): Promise<void> {
    console.log("Initializing headless game environment...");

    this.gameManager = await createHeadlessGameManager({
      seed: this.config.seed,
      gameSpeed: 20,
      debugPhases: false,
    });

    // Apply environment configuration
    const envConfig = {
      ...DEFAULT_ENV_CONFIG,
      ...this.config.envConfig,
      ...this.curriculum.getConfig(),
    };

    this.controller = this.gameManager.createBattleController(envConfig);

    console.log("Environment initialized successfully!");
  }

  /**
   * Run the main training loop
   */
  async train(): Promise<void> {
    if (!this.gameManager || !this.controller) {
      await this.initialize();
    }

    this.metrics.logStart(this.config.totalSteps, this.config);

    try {
      // Start first episode
      await this.resetEpisode();

      while (this.step < this.config.totalSteps) {
        // Collect experience
        await this.collectStep();

        // Update policy periodically
        if (this.buffer.size >= this.config.updateInterval) {
          await this.updatePolicy();
        }

        // Save checkpoint periodically
        if (this.step > 0 && this.step % this.config.checkpointInterval === 0) {
          await this.saveCheckpoint();
        }

        // Log metrics
        this.logProgress();
      }

      // Final checkpoint
      await this.saveCheckpoint();

      const finalMetrics = this.getCurrentMetrics();
      this.metrics.logComplete(finalMetrics);
    } catch (error) {
      this.metrics.logError("Training failed", error as Error);
      throw error;
    }
  }

  /**
   * Reset for a new episode
   */
  private async resetEpisode(): Promise<void> {
    // Update environment config from curriculum
    const envConfig = {
      ...DEFAULT_ENV_CONFIG,
      ...this.config.envConfig,
      ...this.curriculum.getConfig(),
      starters: this.config.starters,
    };

    // Start a new battle
    await this.gameManager!.startBattle({
      species: this.config.starters,
      level: envConfig.startingWave === 1 ? 5 : undefined,
    });

    // Get initial observation
    this.lastObs = await this.controller!.reset();
    this.lastActionMask = this.lastObs.actionMask;

    this.episodeReward = 0;
    this.episodeSteps = 0;
  }

  /**
   * Collect a single step of experience
   */
  private async collectStep(): Promise<void> {
    if (!this.lastObs || !this.controller) {
      return;
    }

    // Encode observation and select action
    const obsEncoded = encodeObservation(this.lastObs);
    const { action, logProb, value } = this.agent.selectAction(obsEncoded, this.lastActionMask);

    // Take action in environment
    const result: StepResult = await this.controller.step(action);

    // Store experience
    const experience: Experience = {
      observation: obsEncoded,
      action,
      reward: result.reward,
      nextObservation: encodeObservation(result.observation),
      done: result.terminated || result.truncated,
      logProb,
      value,
    };

    this.buffer.add(experience, this.lastActionMask);

    // Update tracking
    this.step++;
    this.episodeSteps++;
    this.episodeReward += result.reward;

    // Check if episode ended
    if (result.terminated || result.truncated) {
      // Record episode result
      const episodeResult: EpisodeResult = {
        won: result.info.battleWon,
        wavesReached: result.info.waveIndex,
        totalReward: this.episodeReward,
        turns: this.episodeSteps,
      };

      this.curriculum.recordEpisode(episodeResult);
      this.episode++;

      // Reset for next episode
      await this.resetEpisode();
    } else {
      // Update observation for next step
      this.lastObs = result.observation;
      this.lastActionMask = result.observation.actionMask;
    }
  }

  /**
   * Update the policy using collected experiences
   */
  private async updatePolicy(): Promise<void> {
    const { experiences, actionMasks } = this.buffer.getAll();

    if (experiences.length === 0) {
      return;
    }

    // Perform PPO update
    const losses = await this.agent.update(experiences, actionMasks);

    // Clear buffer after update
    this.buffer.clear();

    // Log update
    if (this.config.logInterval > 0) {
      const metrics = this.getCurrentMetrics();
      metrics.policyLoss = losses.policyLoss;
      metrics.valueLoss = losses.valueLoss;
      metrics.entropy = losses.entropy;
      this.metrics.log(metrics);
    }
  }

  /**
   * Get current training metrics
   */
  private getCurrentMetrics(): StepMetrics {
    const stats = this.curriculum.getRollingStats();

    return {
      step: this.step,
      episode: this.episode,
      stage: this.curriculum.getCurrentStageName(),
      avgReward: stats.avgReward,
      winRate: stats.winRate,
      avgWaves: stats.avgWaves,
    };
  }

  /**
   * Log training progress
   */
  private logProgress(): void {
    if (this.step % this.config.logInterval === 0) {
      this.metrics.log(this.getCurrentMetrics());
    }
  }

  /**
   * Save a checkpoint
   */
  async saveCheckpoint(): Promise<void> {
    const fs = await import("node:fs");
    const path = await import("node:path");

    // Create checkpoint directory if needed
    if (!fs.existsSync(this.config.checkpointDir)) {
      fs.mkdirSync(this.config.checkpointDir, { recursive: true });
    }

    const checkpointPath = path.join(this.config.checkpointDir, `checkpoint-${this.step}`);

    // Save model
    await this.agent.save(checkpointPath);

    // Save checkpoint metadata
    const checkpoint: Checkpoint = {
      step: this.step,
      episode: this.episode,
      curriculumState: this.curriculum.serialize(),
      config: this.config,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(path.join(checkpointPath, "checkpoint.json"), JSON.stringify(checkpoint, null, 2));

    // Save metrics history
    await this.metrics.saveToFile(path.join(checkpointPath, "metrics.json"));

    this.metrics.logCheckpoint(checkpointPath, this.step);
  }

  /**
   * Load from a checkpoint
   */
  async loadCheckpoint(checkpointPath: string): Promise<void> {
    const fs = await import("node:fs");
    const path = await import("node:path");

    // Load model
    await this.agent.load(checkpointPath);

    // Load checkpoint metadata
    const checkpointFile = path.join(checkpointPath, "checkpoint.json");
    if (fs.existsSync(checkpointFile)) {
      const checkpoint: Checkpoint = JSON.parse(fs.readFileSync(checkpointFile, "utf-8"));

      this.step = checkpoint.step;
      this.episode = checkpoint.episode;
      this.curriculum.restore(checkpoint.curriculumState);

      console.log(`Loaded checkpoint from step ${this.step}, episode ${this.episode}`);
    }
  }

  /**
   * Get the trained agent
   */
  getAgent(): PPOAgent {
    return this.agent;
  }

  /**
   * Get the curriculum manager
   */
  getCurriculum(): CurriculumManager {
    return this.curriculum;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.agent.dispose();
    this.gameManager?.dispose();
  }
}

/**
 * Create a trainer instance
 */
export function createTrainer(config?: Partial<TrainerConfig>): RLTrainer {
  return new RLTrainer(config);
}

/**
 * Quick start training with default configuration
 */
export async function train(config?: Partial<TrainerConfig>): Promise<RLTrainer> {
  const trainer = createTrainer(config);
  await trainer.train();
  return trainer;
}

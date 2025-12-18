/**
 * Training Metrics and Logging
 *
 * Provides console logging and metrics tracking for training progress.
 */

/**
 * Metrics data for a single training step
 */
export interface StepMetrics {
  /** Global step count */
  step: number;
  /** Episode count */
  episode: number;
  /** Current curriculum stage name */
  stage: string;
  /** Average episode reward (rolling) */
  avgReward: number;
  /** Win rate (rolling) */
  winRate: number;
  /** Average waves reached (rolling) */
  avgWaves: number;
  /** Policy loss from last update */
  policyLoss?: number;
  /** Value loss from last update */
  valueLoss?: number;
  /** Entropy from last update */
  entropy?: number;
  /** Steps per second */
  stepsPerSecond?: number;
}

/**
 * Configuration for the metrics logger
 */
export interface MetricsConfig {
  /** Log every N steps */
  logInterval: number;
  /** Rolling window size for statistics */
  rollingWindow: number;
  /** Enable verbose logging */
  verbose: boolean;
}

/**
 * Default metrics configuration
 */
export const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  logInterval: 100,
  rollingWindow: 100,
  verbose: false,
};

/**
 * Metrics Logger for training
 */
export class MetricsLogger {
  private readonly config: MetricsConfig;
  private history: StepMetrics[] = [];
  private startTime: number;
  private lastLogTime: number;
  private lastLogStep: number;

  constructor(config: Partial<MetricsConfig> = {}) {
    this.config = { ...DEFAULT_METRICS_CONFIG, ...config };
    this.startTime = Date.now();
    this.lastLogTime = this.startTime;
    this.lastLogStep = 0;
  }

  /**
   * Log metrics to console
   */
  log(metrics: StepMetrics): void {
    this.history.push(metrics);

    // Only log at intervals
    if (metrics.step % this.config.logInterval !== 0) {
      return;
    }

    // Calculate steps per second
    const now = Date.now();
    const elapsed = (now - this.lastLogTime) / 1000;
    const stepsDone = metrics.step - this.lastLogStep;
    const stepsPerSecond = elapsed > 0 ? stepsDone / elapsed : 0;

    this.lastLogTime = now;
    this.lastLogStep = metrics.step;

    // Format log line
    const parts = [
      `Step: ${metrics.step.toString().padStart(8)}`,
      `Ep: ${metrics.episode.toString().padStart(6)}`,
      `Stage: ${metrics.stage.padEnd(20)}`,
      `Reward: ${metrics.avgReward.toFixed(2).padStart(8)}`,
      `WinRate: ${(metrics.winRate * 100).toFixed(1).padStart(5)}%`,
      `Waves: ${metrics.avgWaves.toFixed(1).padStart(5)}`,
      `SPS: ${stepsPerSecond.toFixed(0).padStart(5)}`,
    ];

    // Add loss metrics if available
    if (metrics.policyLoss !== undefined) {
      parts.push(`PLoss: ${metrics.policyLoss.toFixed(4).padStart(8)}`);
    }
    if (metrics.valueLoss !== undefined) {
      parts.push(`VLoss: ${metrics.valueLoss.toFixed(4).padStart(8)}`);
    }
    if (metrics.entropy !== undefined) {
      parts.push(`Ent: ${metrics.entropy.toFixed(4).padStart(8)}`);
    }

    console.log(parts.join(" | "));
  }

  /**
   * Log a milestone or important event
   */
  logEvent(message: string): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(0);
    console.log(`\n[${elapsed}s] 🎯 ${message}\n`);
  }

  /**
   * Log an error
   */
  logError(message: string, error?: Error): void {
    console.error(`\n❌ ERROR: ${message}`);
    if (error) {
      console.error(error.stack ?? error.message);
    }
    console.error("");
  }

  /**
   * Log training start
   */
  logStart(totalSteps: number, config: any): void {
    console.log("\n" + "=".repeat(80));
    console.log("🚀 Starting PokeRogue RL Training");
    console.log("=".repeat(80));
    console.log(`Total Steps: ${totalSteps.toLocaleString()}`);
    console.log(`Log Interval: ${this.config.logInterval}`);
    console.log(`Rolling Window: ${this.config.rollingWindow}`);
    if (this.config.verbose) {
      console.log("\nConfiguration:", JSON.stringify(config, null, 2));
    }
    console.log("=".repeat(80) + "\n");
  }

  /**
   * Log training completion
   */
  logComplete(finalMetrics: StepMetrics): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = Math.floor(elapsed % 60);

    console.log("\n" + "=".repeat(80));
    console.log("✅ Training Complete!");
    console.log("=".repeat(80));
    console.log(`Total Time: ${hours}h ${minutes}m ${seconds}s`);
    console.log(`Total Steps: ${finalMetrics.step.toLocaleString()}`);
    console.log(`Total Episodes: ${finalMetrics.episode.toLocaleString()}`);
    console.log(`Final Stage: ${finalMetrics.stage}`);
    console.log(`Final Win Rate: ${(finalMetrics.winRate * 100).toFixed(1)}%`);
    console.log(`Final Avg Reward: ${finalMetrics.avgReward.toFixed(2)}`);
    console.log(`Final Avg Waves: ${finalMetrics.avgWaves.toFixed(1)}`);
    console.log("=".repeat(80) + "\n");
  }

  /**
   * Log checkpoint saved
   */
  logCheckpoint(path: string, step: number): void {
    console.log(`💾 Checkpoint saved: ${path} (step ${step})`);
  }

  /**
   * Log stage graduation
   */
  logGraduation(fromStage: string, toStage: string): void {
    console.log(`\n🎓 Graduated from "${fromStage}" to "${toStage}"!\n`);
  }

  /**
   * Get metrics history
   */
  getHistory(): StepMetrics[] {
    return [...this.history];
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalSteps: number;
    totalEpisodes: number;
    elapsedSeconds: number;
    avgStepsPerSecond: number;
  } {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const lastMetrics = this.history.at(-1);

    return {
      totalSteps: lastMetrics?.step ?? 0,
      totalEpisodes: lastMetrics?.episode ?? 0,
      elapsedSeconds: elapsed,
      avgStepsPerSecond: lastMetrics ? lastMetrics.step / elapsed : 0,
    };
  }

  /**
   * Save metrics to file
   */
  async saveToFile(path: string): Promise<void> {
    const fs = await import("node:fs");
    fs.writeFileSync(path, JSON.stringify(this.history, null, 2));
  }

  /**
   * Reset the logger
   */
  reset(): void {
    this.history = [];
    this.startTime = Date.now();
    this.lastLogTime = this.startTime;
    this.lastLogStep = 0;
  }
}

/**
 * Create a metrics logger
 */
export function createMetricsLogger(config?: Partial<MetricsConfig>): MetricsLogger {
  return new MetricsLogger(config);
}

/**
 * Format duration in seconds to human readable string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

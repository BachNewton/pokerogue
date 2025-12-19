/**
 * TensorBoard Logging Utilities
 *
 * Writes training metrics to a format compatible with TensorBoard visualization.
 * Uses a JSON-lines format for simplicity and cross-platform compatibility.
 *
 * To view logs:
 *   1. Use the provided viewer script: node scripts/view-training-logs.js
 *   2. Or convert to TensorBoard format using tensorboard-exporter
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Configuration for TensorBoard logging
 */
export interface TensorBoardConfig {
  /** Directory to write log files */
  logDir: string;
  /** Whether logging is enabled */
  enabled: boolean;
  /** Flush interval in milliseconds */
  flushInterval: number;
  /** Run name for this training session */
  runName: string;
}

/**
 * Default TensorBoard configuration
 */
export const DEFAULT_TB_CONFIG: TensorBoardConfig = {
  logDir: "./tensorboard-logs",
  enabled: true,
  flushInterval: 30000,
  runName: `run-${Date.now()}`,
};

/**
 * A single scalar event
 */
interface ScalarEvent {
  tag: string;
  value: number;
  step: number;
  wallTime: number;
}

/**
 * TensorBoard Writer for training metrics
 *
 * Writes scalar metrics to JSON-lines format files organized by tag category.
 * Files are structured as:
 *   logDir/runName/scalars.jsonl
 */
export class TensorBoardWriter {
  private readonly config: TensorBoardConfig;
  private readonly buffer: ScalarEvent[] = [];
  private readonly runDir: string;
  private readonly scalarPath: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private closed = false;

  constructor(config: Partial<TensorBoardConfig> = {}) {
    this.config = { ...DEFAULT_TB_CONFIG, ...config };
    this.runDir = join(this.config.logDir, this.config.runName);
    this.scalarPath = join(this.runDir, "scalars.jsonl");
  }

  /**
   * Initialize the writer (create directories, start flush timer)
   */
  initialize(): void {
    if (!this.config.enabled || this.initialized) {
      return;
    }

    // Create log directory
    mkdirSync(this.runDir, { recursive: true });

    // Write metadata
    const metadata = {
      startTime: Date.now(),
      config: this.config,
    };
    writeFileSync(join(this.runDir, "metadata.json"), JSON.stringify(metadata, null, 2));

    // Start periodic flush
    if (this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
    }

    this.initialized = true;
    console.log(`TensorBoard logging to: ${this.runDir}`);
  }

  /**
   * Add a scalar value
   */
  addScalar(tag: string, value: number, step: number): void {
    if (!this.config.enabled || this.closed) {
      return;
    }

    // Auto-initialize on first write
    if (!this.initialized) {
      this.initialize();
    }

    // Skip NaN or Infinity values
    if (!Number.isFinite(value)) {
      return;
    }

    this.buffer.push({
      tag,
      value,
      step,
      wallTime: Date.now() / 1000,
    });
  }

  /**
   * Flush buffered events to disk
   */
  flush(): void {
    if (!this.config.enabled || this.buffer.length === 0 || this.closed) {
      return;
    }

    // Append events to file
    const lines = this.buffer.map(event => JSON.stringify(event)).join("\n") + "\n";
    appendFileSync(this.scalarPath, lines);

    // Clear buffer
    this.buffer.length = 0;
  }

  /**
   * Close the writer (flush remaining events, stop timer)
   */
  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;

    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    this.flush();

    // Write summary
    if (this.initialized) {
      const summary = {
        endTime: Date.now(),
        totalEvents: this.getEventCount(),
      };
      writeFileSync(join(this.runDir, "summary.json"), JSON.stringify(summary, null, 2));
    }
  }

  /**
   * Get total number of events written
   */
  private getEventCount(): number {
    if (!existsSync(this.scalarPath)) {
      return 0;
    }
    const content = readFileSync(this.scalarPath, "utf-8");
    return content.split("\n").filter(line => line.trim()).length;
  }

  /**
   * Get the run directory path
   */
  getRunDir(): string {
    return this.runDir;
  }

  /**
   * Check if writer is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Create a TensorBoard writer
 */
export function createTensorBoardWriter(config?: Partial<TensorBoardConfig>): TensorBoardWriter {
  return new TensorBoardWriter(config);
}

/**
 * Read scalar events from a log file
 * Useful for analysis and visualization
 */
export function readScalarEvents(logPath: string): ScalarEvent[] {
  if (!existsSync(logPath)) {
    return [];
  }

  const content = readFileSync(logPath, "utf-8");
  const events: ScalarEvent[] = [];

  for (const line of content.split("\n")) {
    if (line.trim()) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }
  }

  return events;
}

/**
 * Get events grouped by tag
 */
export function groupEventsByTag(events: ScalarEvent[]): Map<string, { step: number; value: number }[]> {
  const grouped = new Map<string, { step: number; value: number }[]>();

  for (const event of events) {
    if (!grouped.has(event.tag)) {
      grouped.set(event.tag, []);
    }
    grouped.get(event.tag)!.push({ step: event.step, value: event.value });
  }

  // Sort each group by step
  for (const values of grouped.values()) {
    values.sort((a, b) => a.step - b.step);
  }

  return grouped;
}

/**
 * Print a simple ASCII chart of scalar values
 */
export function printScalarChart(
  tag: string,
  values: { step: number; value: number }[],
  width = 60,
  height = 10,
): void {
  if (values.length === 0) {
    console.log(`No data for ${tag}`);
    return;
  }

  const minVal = Math.min(...values.map(v => v.value));
  const maxVal = Math.max(...values.map(v => v.value));
  const range = maxVal - minVal || 1;

  console.log(`\n${tag}`);
  console.log(`Max: ${maxVal.toFixed(4)}`);

  // Sample values to fit width
  const step = Math.max(1, Math.floor(values.length / width));
  const sampled = values.filter((_, i) => i % step === 0).slice(0, width);

  // Build chart
  for (let row = height - 1; row >= 0; row--) {
    const threshold = minVal + (range * (row + 1)) / height;
    let line = "";
    for (const v of sampled) {
      line += v.value >= threshold - range / height / 2 ? "█" : " ";
    }
    console.log(line);
  }

  console.log(`Min: ${minVal.toFixed(4)}`);
  console.log(`Steps: ${values[0].step} - ${values.at(-1)?.step}`);
}

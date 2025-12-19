/**
 * Training Performance Profiler
 *
 * Simple profiling utilities for identifying bottlenecks in the training loop.
 */

// Use Node.js native performance API to avoid JSDOM conflicts
import { performance as nodePerformance } from "node:perf_hooks";

/**
 * Timing statistics for a profiled section
 */
export interface TimingStats {
  name: string;
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  percentOfTotal: number;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  heapUsedMB: number;
  heapTotalMB: number;
  tensorCount: number;
  tensorBytes: number;
}

/**
 * Profiler report
 */
export interface ProfilerReport {
  timings: TimingStats[];
  memory: MemoryStats[];
  totalTimeMs: number;
  stepsProfiled: number;
  avgStepMs: number;
}

/**
 * Training Profiler
 */
export class TrainingProfiler {
  private readonly timings: Map<string, number[]> = new Map();
  private memorySnapshots: MemoryStats[] = [];
  private startTime = 0;
  private totalStepTime = 0;
  private stepsProfiled = 0;
  private enabled = false;

  /**
   * Enable profiling
   */
  enable(): void {
    this.enabled = true;
    this.startTime = nodePerformance.now();
    console.log("[Profiler] Profiling enabled");
  }

  /**
   * Disable profiling
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Check if profiling is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Start timing a section
   * Returns a function to call when the section ends
   */
  startTimer(name: string): () => void {
    if (!this.enabled) {
      return () => {};
    }

    const start = nodePerformance.now();
    return () => {
      const elapsed = nodePerformance.now() - start;
      this.recordTiming(name, elapsed);
    };
  }

  /**
   * Record a timing measurement
   */
  recordTiming(name: string, ms: number): void {
    if (!this.enabled) {
      return;
    }

    if (!this.timings.has(name)) {
      this.timings.set(name, []);
    }
    this.timings.get(name)!.push(ms);
  }

  /**
   * Record a full step timing
   */
  recordStepTime(ms: number): void {
    if (!this.enabled) {
      return;
    }

    this.totalStepTime += ms;
    this.stepsProfiled++;
  }

  /**
   * Record memory usage
   */
  async recordMemory(_step: number): Promise<void> {
    if (!this.enabled) {
      return;
    }

    let tensorCount = 0;
    let tensorBytes = 0;

    // Try to get TensorFlow.js memory info
    try {
      const tf = await import("@tensorflow/tfjs");
      const mem = tf.memory();
      tensorCount = mem.numTensors;
      tensorBytes = mem.numBytes;
    } catch {
      // TensorFlow not available
    }

    // Get Node.js heap info
    const heapUsed = process.memoryUsage().heapUsed;
    const heapTotal = process.memoryUsage().heapTotal;

    this.memorySnapshots.push({
      heapUsedMB: heapUsed / (1024 * 1024),
      heapTotalMB: heapTotal / (1024 * 1024),
      tensorCount,
      tensorBytes,
    });
  }

  /**
   * Get profiling report
   */
  getReport(): ProfilerReport {
    const totalTimeMs = nodePerformance.now() - this.startTime;
    const timingStats: TimingStats[] = [];

    // Calculate timing statistics
    for (const [name, times] of this.timings.entries()) {
      if (times.length === 0) {
        continue;
      }

      const totalMs = times.reduce((a, b) => a + b, 0);
      const avgMs = totalMs / times.length;
      const minMs = Math.min(...times);
      const maxMs = Math.max(...times);

      timingStats.push({
        name,
        count: times.length,
        totalMs,
        avgMs,
        minMs,
        maxMs,
        percentOfTotal: (totalMs / this.totalStepTime) * 100,
      });
    }

    // Sort by total time descending
    timingStats.sort((a, b) => b.totalMs - a.totalMs);

    return {
      timings: timingStats,
      memory: this.memorySnapshots,
      totalTimeMs,
      stepsProfiled: this.stepsProfiled,
      avgStepMs: this.stepsProfiled > 0 ? this.totalStepTime / this.stepsProfiled : 0,
    };
  }

  /**
   * Print report to console
   */
  printReport(): void {
    const report = this.getReport();

    console.log("\n" + "=".repeat(80));
    console.log("PROFILING REPORT");
    console.log("=".repeat(80));

    console.log(`\nTotal Time: ${(report.totalTimeMs / 1000).toFixed(1)}s`);
    console.log(`Steps Profiled: ${report.stepsProfiled}`);
    console.log(`Avg Step Time: ${report.avgStepMs.toFixed(2)}ms`);
    console.log(`Steps/Second: ${(1000 / report.avgStepMs).toFixed(1)}`);

    console.log("\n--- Timing Breakdown ---");
    console.log(
      "Section".padEnd(25) + "Count".padStart(10) + "Total(ms)".padStart(12) + "Avg(ms)".padStart(10) + "%".padStart(8),
    );
    console.log("-".repeat(65));

    for (const stat of report.timings) {
      console.log(
        stat.name.padEnd(25)
          + stat.count.toString().padStart(10)
          + stat.totalMs.toFixed(1).padStart(12)
          + stat.avgMs.toFixed(2).padStart(10)
          + stat.percentOfTotal.toFixed(1).padStart(7)
          + "%",
      );
    }

    if (report.memory.length > 0) {
      console.log("\n--- Memory Usage ---");
      const lastMem = report.memory.at(-1)!;
      const firstMem = report.memory[0];
      console.log(`Heap: ${lastMem.heapUsedMB.toFixed(1)}MB / ${lastMem.heapTotalMB.toFixed(1)}MB`);
      console.log(`Heap Growth: ${(lastMem.heapUsedMB - firstMem.heapUsedMB).toFixed(1)}MB`);
      console.log(`Tensors: ${lastMem.tensorCount} (${(lastMem.tensorBytes / 1024 / 1024).toFixed(1)}MB)`);
    }

    console.log("=".repeat(80) + "\n");
  }

  /**
   * Reset profiler state
   */
  reset(): void {
    this.timings.clear();
    this.memorySnapshots = [];
    this.totalStepTime = 0;
    this.stepsProfiled = 0;
    this.startTime = nodePerformance.now();
  }
}

/**
 * Create a profiler instance
 */
export function createProfiler(): TrainingProfiler {
  return new TrainingProfiler();
}

// Singleton profiler
let _profiler: TrainingProfiler | null = null;

/**
 * Get the global profiler instance
 */
export function getProfiler(): TrainingProfiler {
  if (!_profiler) {
    _profiler = new TrainingProfiler();
  }
  return _profiler;
}

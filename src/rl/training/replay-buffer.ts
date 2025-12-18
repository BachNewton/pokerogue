/**
 * Experience Replay Buffer for PPO Training
 *
 * Stores trajectories for batch training updates.
 */

import type { Experience } from "./model";

/**
 * Trajectory buffer for collecting experiences during rollouts
 */
export class TrajectoryBuffer {
  private experiences: Experience[] = [];
  private actionMasks: boolean[][] = [];
  private readonly maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  /**
   * Add an experience to the buffer
   */
  add(experience: Experience, actionMask: boolean[]): void {
    this.experiences.push(experience);
    this.actionMasks.push(actionMask);

    // Remove oldest if exceeding max size
    if (this.experiences.length > this.maxSize) {
      this.experiences.shift();
      this.actionMasks.shift();
    }
  }

  /**
   * Get all experiences and action masks
   */
  getAll(): { experiences: Experience[]; actionMasks: boolean[][] } {
    return {
      experiences: [...this.experiences],
      actionMasks: [...this.actionMasks],
    };
  }

  /**
   * Get experiences for a specific episode
   */
  getEpisode(startIdx: number, endIdx: number): { experiences: Experience[]; actionMasks: boolean[][] } {
    return {
      experiences: this.experiences.slice(startIdx, endIdx),
      actionMasks: this.actionMasks.slice(startIdx, endIdx),
    };
  }

  /**
   * Sample a random batch of experiences
   */
  sample(batchSize: number): { experiences: Experience[]; actionMasks: boolean[][] } {
    const indices: number[] = [];
    const len = this.experiences.length;

    for (let i = 0; i < Math.min(batchSize, len); i++) {
      let idx: number;
      do {
        idx = Math.floor(Math.random() * len);
      } while (indices.includes(idx));
      indices.push(idx);
    }

    return {
      experiences: indices.map(i => this.experiences[i]),
      actionMasks: indices.map(i => this.actionMasks[i]),
    };
  }

  /**
   * Get the number of experiences in the buffer
   */
  get size(): number {
    return this.experiences.length;
  }

  /**
   * Check if buffer is empty
   */
  get isEmpty(): boolean {
    return this.experiences.length === 0;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.experiences = [];
    this.actionMasks = [];
  }

  /**
   * Get summary statistics
   */
  getStats(): { size: number; avgReward: number; totalReward: number } {
    const totalReward = this.experiences.reduce((sum, e) => sum + e.reward, 0);
    return {
      size: this.size,
      avgReward: this.size > 0 ? totalReward / this.size : 0,
      totalReward,
    };
  }
}

/**
 * Episode tracker for managing episode boundaries
 */
export class EpisodeTracker {
  private episodeStarts: number[] = [0];
  private episodeRewards: number[] = [];
  private currentEpisodeReward = 0;

  /**
   * Mark the start of a new episode
   */
  startEpisode(bufferIndex: number): void {
    this.episodeStarts.push(bufferIndex);
    this.currentEpisodeReward = 0;
  }

  /**
   * Add reward to current episode
   */
  addReward(reward: number): void {
    this.currentEpisodeReward += reward;
  }

  /**
   * End the current episode
   */
  endEpisode(): number {
    const reward = this.currentEpisodeReward;
    this.episodeRewards.push(reward);
    this.currentEpisodeReward = 0;
    return reward;
  }

  /**
   * Get episode boundaries
   */
  getEpisodeBoundaries(): { start: number; end: number }[] {
    const boundaries: { start: number; end: number }[] = [];
    for (let i = 0; i < this.episodeStarts.length - 1; i++) {
      boundaries.push({
        start: this.episodeStarts[i],
        end: this.episodeStarts[i + 1],
      });
    }
    return boundaries;
  }

  /**
   * Get episode rewards history
   */
  getRewardsHistory(): number[] {
    return [...this.episodeRewards];
  }

  /**
   * Get rolling average reward
   */
  getRollingAverage(window = 100): number {
    if (this.episodeRewards.length === 0) {
      return 0;
    }
    const recent = this.episodeRewards.slice(-window);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.episodeStarts = [0];
    this.episodeRewards = [];
    this.currentEpisodeReward = 0;
  }
}

/**
 * Create a trajectory buffer
 */
export function createTrajectoryBuffer(maxSize?: number): TrajectoryBuffer {
  return new TrajectoryBuffer(maxSize);
}

/**
 * Create an episode tracker
 */
export function createEpisodeTracker(): EpisodeTracker {
  return new EpisodeTracker();
}

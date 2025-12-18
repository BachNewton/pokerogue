/**
 * Visual Controller for AI Playback
 *
 * Hooks into the game UI to enable AI-controlled gameplay with visuals.
 */

import { globalScene } from "#app/global-scene";
import { UiMode } from "#enums/ui-mode";
import type { CommandPhase } from "#phases/command-phase";
import { translateAction } from "../action";
import { extractBattleObservation } from "../observation";
import type { ActionType, BattleObservation } from "../types";
import { createModelPlayer, type ModelPlayer } from "./model-player";

/**
 * Visual Controller configuration
 */
export interface VisualControllerConfig {
  /** Path to the trained model */
  modelPath: string;
  /** Action selection mode */
  mode: "greedy" | "sample";
  /** Temperature for sampling (only used when mode is "sample") */
  temperature: number;
  /** Delay between actions in ms (for watchable speed) */
  actionDelay: number;
  /** Whether to show action probabilities */
  showProbabilities: boolean;
}

/**
 * Default visual controller configuration
 */
export const DEFAULT_VISUAL_CONFIG: VisualControllerConfig = {
  modelPath: "",
  mode: "greedy",
  temperature: 1.0,
  actionDelay: 500,
  showProbabilities: false,
};

/**
 * Visual Controller manages AI playback in the browser
 */
export class VisualController {
  private readonly modelPlayer: ModelPlayer;
  private readonly config: VisualControllerConfig;
  private enabled = false;
  private paused = false;
  private speed = 1.0;
  private lastObservation: BattleObservation | null = null;
  private lastAction: ActionType | null = null;
  private onActionCallback: ((action: ActionType, probs: Float32Array | null) => void) | null = null;

  constructor(config: Partial<VisualControllerConfig> = {}) {
    this.config = { ...DEFAULT_VISUAL_CONFIG, ...config };
    this.modelPlayer = createModelPlayer();
  }

  /**
   * Initialize the controller with a trained model
   */
  async initialize(modelPath: string): Promise<void> {
    this.config.modelPath = modelPath;
    await this.modelPlayer.loadModel(modelPath);
    console.log("VisualController initialized with model:", modelPath);
  }

  /**
   * Check if the controller is ready
   */
  get isReady(): boolean {
    return this.modelPlayer.loaded;
  }

  /**
   * Enable AI control
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`AI control ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Check if AI control is enabled
   */
  get isEnabled(): boolean {
    return this.enabled && this.modelPlayer.loaded;
  }

  /**
   * Pause AI control
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /**
   * Check if AI is paused
   */
  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Set playback speed multiplier
   */
  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(10, speed));
  }

  /**
   * Get current speed
   */
  getSpeed(): number {
    return this.speed;
  }

  /**
   * Set action delay (ms)
   */
  setActionDelay(delay: number): void {
    this.config.actionDelay = Math.max(0, delay);
  }

  /**
   * Set action selection mode
   */
  setMode(mode: "greedy" | "sample"): void {
    this.config.mode = mode;
  }

  /**
   * Set sampling temperature
   */
  setTemperature(temperature: number): void {
    this.config.temperature = Math.max(0.1, temperature);
  }

  /**
   * Register callback for when an action is selected
   */
  onAction(callback: (action: ActionType, probs: Float32Array | null) => void): void {
    this.onActionCallback = callback;
  }

  /**
   * Check if the AI should auto-select during CommandPhase
   */
  shouldAutoSelect(): boolean {
    if (!this.enabled || this.paused || !this.modelPlayer.loaded) {
      return false;
    }

    // Check if we're in CommandPhase with COMMAND UI mode
    const currentPhase = globalScene.phaseManager?.getCurrentPhase();
    const uiMode = globalScene.ui?.getMode();

    return currentPhase?.phaseName === "CommandPhase" && uiMode === UiMode.COMMAND;
  }

  /**
   * Get the auto-selected action
   */
  getAutoAction(): ActionType {
    // Extract current observation
    const currentPhase = globalScene.phaseManager?.getCurrentPhase() as CommandPhase;
    const fieldIndex = currentPhase?.getFieldIndex?.() ?? 0;

    const observation = extractBattleObservation(fieldIndex);
    this.lastObservation = observation;

    // Select action using the model
    let action: ActionType;
    if (this.config.mode === "sample") {
      action = this.modelPlayer.sampleAction(observation, this.config.temperature);
    } else {
      action = this.modelPlayer.selectAction(observation);
    }

    this.lastAction = action;

    // Trigger callback
    if (this.onActionCallback) {
      this.onActionCallback(action, this.modelPlayer.getActionProbabilities());
    }

    return action;
  }

  /**
   * Execute the auto-selected action after a delay
   */
  async executeAutoAction(): Promise<boolean> {
    if (!this.shouldAutoSelect()) {
      return false;
    }

    // Wait for configured delay (adjusted by speed)
    const delay = this.config.actionDelay / this.speed;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Check again in case state changed during delay
    if (!this.shouldAutoSelect()) {
      return false;
    }

    const action = this.getAutoAction();
    const fieldIndex = (globalScene.phaseManager?.getCurrentPhase() as CommandPhase)?.getFieldIndex?.() ?? 0;

    // Translate action to game command
    const translation = translateAction(action, fieldIndex);

    if (!translation.valid || !translation.command) {
      console.warn("Invalid action:", translation.error);
      return false;
    }

    // Execute through the CommandPhase
    const commandPhase = globalScene.phaseManager?.getCurrentPhase() as CommandPhase;
    if (commandPhase && commandPhase.phaseName === "CommandPhase") {
      const cmd = translation.command;
      commandPhase.handleCommand(cmd.command, cmd.cursor, cmd.useMode ?? false);
      return true;
    }

    return false;
  }

  /**
   * Start the auto-play loop
   */
  async startAutoPlay(): Promise<void> {
    this.enabled = true;
    this.paused = false;

    console.log("Starting AI auto-play...");

    while (this.enabled) {
      if (!this.paused) {
        await this.executeAutoAction();
      }

      // Small delay to prevent tight loop
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log("AI auto-play stopped.");
  }

  /**
   * Stop the auto-play loop
   */
  stopAutoPlay(): void {
    this.enabled = false;
  }

  /**
   * Get the last observation
   */
  getLastObservation(): BattleObservation | null {
    return this.lastObservation;
  }

  /**
   * Get the last action
   */
  getLastAction(): ActionType | null {
    return this.lastAction;
  }

  /**
   * Get action probabilities from last decision
   */
  getActionProbabilities(): Float32Array | null {
    return this.modelPlayer.getActionProbabilities();
  }

  /**
   * Get formatted action probabilities
   */
  getFormattedProbabilities(): { action: string; probability: number }[] {
    return this.modelPlayer.getFormattedProbabilities();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.enabled = false;
    this.modelPlayer.dispose();
  }
}

/**
 * Singleton instance for global access
 */
let _visualController: VisualController | null = null;

/**
 * Get the visual controller singleton
 */
export function getVisualController(): VisualController {
  if (!_visualController) {
    _visualController = new VisualController();
  }
  return _visualController;
}

/**
 * Create a new visual controller (for custom use)
 */
export function createVisualController(config?: Partial<VisualControllerConfig>): VisualController {
  return new VisualController(config);
}

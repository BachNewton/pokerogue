/**
 * HeadlessGameManager - Standalone game manager for RL training
 *
 * Provides game initialization and control without vitest dependencies.
 * Enables headless training of RL agents.
 */

import { BattleScene } from "#app/battle-scene";
import { getGameMode } from "#app/game-mode";
import { globalScene, initGlobalScene } from "#app/global-scene";
import { initializeGame } from "#app/init/init";
import { BattleStyle } from "#enums/battle-style";
import { ExpGainsSpeed } from "#enums/exp-gains-speed";
import { ExpNotification } from "#enums/exp-notification";
import { GameModes } from "#enums/game-modes";
import { PlayerGender } from "#enums/player-gender";
import type { SpeciesId } from "#enums/species-id";
import { UiMode } from "#enums/ui-mode";
import { EncounterPhase } from "#phases/encounter-phase";
import { SelectStarterPhase } from "#phases/select-starter-phase";
import { generateStarters } from "#test/test-utils/game-manager-utils";
import { MockFetch } from "#test/test-utils/mocks/mock-fetch";
import { PhaseInterceptor } from "#test/test-utils/phase-interceptor";
import { TextInterceptor } from "#test/test-utils/text-interceptor";
import Phaser from "phaser";
import type { BattleController } from "../battle-controller";
import { createBattleController } from "../battle-controller";
import { RLEnvironment } from "../environment";
import type { EnvironmentConfig } from "../types";
import { type HeadlessMocksConfig, injectHeadlessMocks } from "./headless-mocks";
import { createRuntimeOverrides, type RuntimeOverrides } from "./runtime-overrides";

/**
 * Configuration for HeadlessGameManager
 */
export interface HeadlessGameManagerConfig {
  /** Random seed for reproducibility */
  seed?: string;
  /** Game speed multiplier (higher = faster training) */
  gameSpeed?: number;
  /** Path to assets directory */
  assetsPath?: string;
  /** Whether to log phase transitions (debug mode) */
  debugPhases?: boolean;
}

/**
 * Starter configuration for beginning a battle
 */
export interface StarterConfig {
  /** Species IDs for the starter Pokemon */
  species: SpeciesId[];
  /** Optional starting level override */
  level?: number;
}

/**
 * HeadlessGameManager manages headless game execution for RL training.
 * This is the standalone equivalent of the test framework's GameManager.
 */
export class HeadlessGameManager {
  public game: Phaser.Game;
  public scene: BattleScene;
  public phaseInterceptor: PhaseInterceptor;
  public overrides: RuntimeOverrides;

  private readonly config: HeadlessGameManagerConfig;
  private initialized = false;
  private battleController: BattleController | null = null;

  private constructor(config: HeadlessGameManagerConfig = {}) {
    this.config = {
      seed: config.seed ?? `rl-${Date.now()}`,
      gameSpeed: config.gameSpeed ?? 10,
      assetsPath: config.assetsPath ?? "assets",
      debugPhases: config.debugPhases ?? false,
    };

    this.overrides = createRuntimeOverrides();
  }

  /**
   * Create and initialize a HeadlessGameManager
   */
  static async create(config: HeadlessGameManagerConfig = {}): Promise<HeadlessGameManager> {
    const manager = new HeadlessGameManager(config);
    await manager.initialize();
    return manager;
  }

  /**
   * Initialize the Phaser game and BattleScene in headless mode
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Clear any previous state
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }

    // Create Phaser game in headless mode
    this.game = new Phaser.Game({
      type: Phaser.HEADLESS,
      width: 1920,
      height: 1080,
      audio: {
        noAudio: true,
      },
    });

    // Seed the RNG
    Phaser.Math.RND.sow([this.config.seed!]);

    // Initialize game data (species, moves, abilities, etc.)
    initializeGame();

    // Override BattleScene.randBattleSeedInt for deterministic behavior
    (BattleScene.prototype as any).randBattleSeedInt = (range: number, min = 0) => min + range - 1;

    // Create the BattleScene
    if (globalScene) {
      this.scene = globalScene;
    } else {
      this.scene = new BattleScene();
      initGlobalScene(this.scene);
    }

    // Inject headless mocks
    const mocksConfig: HeadlessMocksConfig = {
      seed: this.config.seed,
      assetsPath: this.config.assetsPath,
    };
    injectHeadlessMocks(this.game, this.scene, mocksConfig);

    // Setup fetch mock (without vitest)
    (global as any).fetch = MockFetch;

    // Create phase interceptor
    this.phaseInterceptor = new PhaseInterceptor(this.scene);

    // Create text interceptor (needed for mock text to work)
    new TextInterceptor(this.scene);

    // Run scene lifecycle
    this.scene.preload?.();
    this.scene.create();

    // Apply default RL overrides
    this.overrides.applyRLDefaults();

    this.initialized = true;
  }

  /**
   * Run the game to the title screen
   */
  async runToTitle(): Promise<void> {
    // Check if we're already at TitlePhase (e.g., after reset)
    const currentPhase = this.scene.phaseManager.getCurrentPhase();
    if (currentPhase?.phaseName === "TitlePhase") {
      // Already at title, just configure settings
    } else {
      // Go to login phase and skip past it
      await this.phaseInterceptor.to("LoginPhase", false);
      this.phaseInterceptor.shiftPhase(true);
      await this.phaseInterceptor.to("TitlePhase");
    }

    // Configure for fast training
    this.scene.gameSpeed = this.config.gameSpeed!;
    this.scene.moveAnimations = false;
    this.scene.showLevelUpStats = false;
    this.scene.expGainsSpeed = ExpGainsSpeed.SKIP;
    this.scene.expParty = ExpNotification.SKIP;
    this.scene.hpBarSpeed = 3;
    this.scene.enableTutorials = false;
    this.scene.gameData.gender = PlayerGender.MALE;
    this.scene.fieldVolume = 0;
    // Set battle style to SET to disable switch prompts at battle start
    this.scene.battleStyle = BattleStyle.SET;
  }

  /**
   * Start a new battle with the given starters
   */
  async startBattle(starters: StarterConfig): Promise<void> {
    // If we're past the title (in a battle), reset first
    const currentPhase = this.scene.phaseManager.getCurrentPhase();
    if (currentPhase && currentPhase.phaseName !== "TitlePhase" && currentPhase.phaseName !== "LoginPhase") {
      await this.reset();
    }

    await this.runToTitle();

    // Setup the battle
    this.onNextPrompt("TitlePhase", UiMode.TITLE, () => {
      this.scene.gameMode = getGameMode(GameModes.CLASSIC);
      // Use the test utils generateStarters which properly creates Starter[] objects
      const starterData = generateStarters(this.scene, starters.species);
      const selectStarterPhase = new SelectStarterPhase();
      this.scene.phaseManager.pushPhase(new EncounterPhase(false));
      selectStarterPhase.initBattle(starterData);
    });

    // Run to first CommandPhase and run it (sets UI to COMMAND mode)
    await this.phaseInterceptor.to("CommandPhase", true);

    if (this.config.debugPhases) {
      console.log("==================[Battle Started]==================");
    }
  }

  /**
   * Add a prompt handler for a specific phase and mode
   */
  onNextPrompt(
    phaseTarget: string,
    mode: UiMode,
    callback: () => void,
    expireFn?: () => void,
    awaitingActionInput = false,
  ): void {
    this.phaseInterceptor.addToNextPrompt(phaseTarget, mode, callback, expireFn, awaitingActionInput);
  }

  /**
   * Run the game to a specific phase
   */
  async runToPhase(phaseName: string, runTarget = true): Promise<void> {
    await this.phaseInterceptor.to(phaseName, runTarget);
  }

  /**
   * Create an RL environment using this game manager
   */
  createRLEnvironment(config: Partial<EnvironmentConfig> = {}): RLEnvironment {
    const env = new RLEnvironment(config);
    return env;
  }

  /**
   * Create a battle controller for this game
   */
  createBattleController(config: Partial<EnvironmentConfig> = {}): BattleController {
    this.battleController = createBattleController(config);
    // Pass the phase interceptor to the battle controller so it can run phases
    this.battleController.setPhaseInterceptor(this.phaseInterceptor);
    return this.battleController;
  }

  /**
   * Get the runtime overrides manager
   */
  getOverrides(): RuntimeOverrides {
    return this.overrides;
  }

  /**
   * Check if we're at a specific phase
   */
  isCurrentPhase(phaseName: string): boolean {
    return this.scene.phaseManager.getCurrentPhase()?.phaseName === phaseName;
  }

  /**
   * Check if we're at a specific UI mode
   */
  isCurrentMode(mode: UiMode): boolean {
    return this.scene.ui?.getMode() === mode;
  }

  /**
   * Set the UI mode
   */
  setMode(mode: UiMode): void {
    this.scene.ui?.setMode(mode);
  }

  /**
   * End the current phase
   */
  endPhase(): void {
    this.scene.phaseManager.getCurrentPhase()?.end();
  }

  /**
   * Reset the game for a new episode
   */
  async reset(): Promise<void> {
    // Clear the phase interceptor's queues
    if (this.phaseInterceptor) {
      const interceptor = this.phaseInterceptor as any;
      if (interceptor.onHold) {
        interceptor.onHold.length = 0;
      }
      if (interceptor.prompts) {
        interceptor.prompts.length = 0;
      }
      interceptor.inProgress = undefined;
    }

    // Reset the scene
    this.scene.reset(false, true);

    // Go back to title
    this.scene.phaseManager.toTitleScreen(true);
    this.scene.phaseManager.shiftPhase();

    // Restore overrides (in case any were modified during episode)
    this.overrides.restore();
    this.overrides.applyRLDefaults();
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.overrides.restore();

    if (this.game) {
      this.game.destroy(true);
    }

    this.initialized = false;
  }

  /**
   * Wait for a tick (used in phase polling)
   */
  async waitTick(ms = 1): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if the player has won the current battle
   */
  isVictory(): boolean {
    return this.scene.currentBattle?.enemyParty?.every(pokemon => pokemon.isFainted()) ?? false;
  }

  /**
   * Check if the player has lost the current battle
   */
  isDefeat(): boolean {
    return this.scene.getPlayerParty()?.every(pokemon => pokemon.isFainted()) ?? false;
  }
}

/**
 * Create a HeadlessGameManager instance
 */
export async function createHeadlessGameManager(config: HeadlessGameManagerConfig = {}): Promise<HeadlessGameManager> {
  return HeadlessGameManager.create(config);
}

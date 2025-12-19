/**
 * BattleController - Core controller for RL battle interaction
 * Manages the game loop and intercepts phases for RL decision making
 */

import { globalScene } from "#app/global-scene";
import { Command } from "#enums/command";
import { MoveUseMode } from "#enums/move-use-mode";
import { UiMode } from "#enums/ui-mode";
import type { CommandPhase } from "#phases/command-phase";
import { translateAction } from "./action";
import { type AutoPilot, createAutoPilot } from "./auto-pilot";
import { extractBattleObservation, isEnemyDefeated, isPlayerDefeated, takeBattleStateSnapshot } from "./observation";
import { calculateReward } from "./reward";
import type { BattleObservation, BattleStateSnapshot, EnvironmentConfig, StepInfo, StepResult } from "./types";
import { type ActionType, DEFAULT_ENV_CONFIG } from "./types";

/**
 * Controller state
 */
export enum ControllerState {
  /** Not initialized */
  UNINITIALIZED = "uninitialized",
  /** Ready for a new episode */
  READY = "ready",
  /** Waiting for player decision in CommandPhase */
  AWAITING_DECISION = "awaiting_decision",
  /** Processing action/running phases */
  PROCESSING = "processing",
  /** Episode ended (win/loss) */
  EPISODE_ENDED = "episode_ended",
  /** Error state */
  ERROR = "error",
}

/**
 * BattleController manages the RL environment's interaction with the game
 */
export class BattleController {
  private readonly config: EnvironmentConfig;
  private readonly autoPilot: AutoPilot;
  private state: ControllerState = ControllerState.UNINITIALIZED;
  private currentFieldIndex = 0;
  private prevStateSnapshot: BattleStateSnapshot | null = null;
  private turnCount = 0;
  private errorMessage: string | null = null;

  constructor(config: Partial<EnvironmentConfig> = {}) {
    this.config = { ...DEFAULT_ENV_CONFIG, ...config };
    this.autoPilot = createAutoPilot({
      modifierStrategy: this.config.modifierStrategy,
      biomeStrategy: this.config.biomeStrategy,
    });
  }

  /**
   * Get the current controller state
   */
  getState(): ControllerState {
    return this.state;
  }

  /**
   * Check if the controller is ready for an action
   */
  isAwaitingDecision(): boolean {
    return this.state === ControllerState.AWAITING_DECISION;
  }

  /**
   * Get the current observation
   */
  getObservation(): BattleObservation {
    return extractBattleObservation(this.currentFieldIndex);
  }

  /**
   * Reset the episode and return initial observation
   */
  async reset(): Promise<BattleObservation> {
    // Reset state
    this.state = ControllerState.PROCESSING;
    this.currentFieldIndex = 0;
    this.prevStateSnapshot = null;
    this.turnCount = 0;
    this.errorMessage = null;

    try {
      // Run until first CommandPhase
      await this.runToNextDecisionPoint();

      // Take initial state snapshot
      this.prevStateSnapshot = takeBattleStateSnapshot();

      return this.getObservation();
    } catch (error) {
      this.state = ControllerState.ERROR;
      this.errorMessage = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Take an action and return the result
   */
  async step(action: ActionType): Promise<StepResult> {
    if (this.state !== ControllerState.AWAITING_DECISION) {
      throw new Error(`Cannot step: controller state is ${this.state}, expected AWAITING_DECISION`);
    }

    const prevSnapshot = this.prevStateSnapshot ?? takeBattleStateSnapshot();

    try {
      // Translate and execute the action
      const translation = translateAction(action, this.currentFieldIndex);
      if (!translation.valid) {
        throw new Error(`Invalid action: ${translation.error}`);
      }

      // Execute the command
      this.executeCommand(translation.command!);

      // Set state to processing
      this.state = ControllerState.PROCESSING;

      // Run until next decision point or episode end
      await this.runToNextDecisionPoint();

      // Take new state snapshot
      const currSnapshot = takeBattleStateSnapshot();

      // Calculate step info
      const info = this.calculateStepInfo(prevSnapshot, currSnapshot);

      // Calculate reward
      const reward = calculateReward(prevSnapshot, currSnapshot, info, this.config.rewardConfig);

      // Determine termination
      const terminated =
        info.battleLost || info.gameOver || (this.config.episodeType === "single_battle" && info.battleWon);
      const truncated =
        this.turnCount >= this.config.maxTurnsPerBattle || currSnapshot.waveIndex > this.config.maxWaves;

      // Update state
      if (terminated || truncated) {
        this.state = ControllerState.EPISODE_ENDED;
      }
      this.prevStateSnapshot = currSnapshot;

      return {
        observation: this.getObservation(),
        reward,
        terminated,
        truncated,
        info,
      };
    } catch (error) {
      this.state = ControllerState.ERROR;
      this.errorMessage = error instanceof Error ? error.message : String(error);

      return {
        observation: this.getObservation(),
        reward: -10, // Large penalty for errors
        terminated: true,
        truncated: false,
        info: {
          waveIndex: globalScene.currentBattle?.waveIndex ?? 0,
          enemyKOs: 0,
          playerFaints: 0,
          battleWon: false,
          battleLost: false,
          gameOver: true,
          error: this.errorMessage,
        },
      };
    }
  }

  /**
   * Execute a game command
   */
  private executeCommand(command: {
    command: Command;
    cursor: number;
    useMode?: MoveUseMode;
    isTera?: boolean;
    isBatonSwitch?: boolean;
  }): void {
    const currentPhase = globalScene.phaseManager.getCurrentPhase();

    if (!currentPhase || currentPhase.phaseName !== "CommandPhase") {
      throw new Error(`Cannot execute command: not in CommandPhase (current: ${currentPhase?.phaseName})`);
    }

    const commandPhase = currentPhase as CommandPhase;

    switch (command.command) {
      case Command.FIGHT:
        commandPhase.handleCommand(Command.FIGHT, command.cursor, command.useMode ?? MoveUseMode.NORMAL);
        break;

      case Command.TERA:
        commandPhase.handleCommand(Command.TERA, command.cursor, command.useMode ?? MoveUseMode.NORMAL);
        break;

      case Command.POKEMON:
        commandPhase.handleCommand(Command.POKEMON, command.cursor, command.isBatonSwitch ?? false);
        break;

      case Command.BALL:
        commandPhase.handleCommand(Command.BALL, command.cursor);
        break;

      case Command.RUN:
        commandPhase.handleCommand(Command.RUN, 0);
        break;

      default:
        throw new Error(`Unknown command type: ${command.command}`);
    }
  }

  /**
   * Run the game until the next decision point (CommandPhase) or episode end
   */
  private async runToNextDecisionPoint(): Promise<void> {
    const maxIterations = 30000; // Safety limit (increased from 10000)
    let iterations = 0;
    let lastPhaseName = "";
    let samePhaseCount = 0;

    while (iterations < maxIterations) {
      iterations++;

      // Check for episode end conditions
      if (isPlayerDefeated()) {
        this.state = ControllerState.EPISODE_ENDED;
        return;
      }

      // Check current phase
      const currentPhase = globalScene.phaseManager.getCurrentPhase();
      if (!currentPhase) {
        // No phase, wait a bit and check again
        await this.waitTick();
        continue;
      }

      const phaseName = currentPhase.phaseName;
      const uiMode = globalScene.ui?.getMode() ?? UiMode.MESSAGE;

      // Track same-phase iterations for debugging
      if (phaseName === lastPhaseName) {
        samePhaseCount++;
        // Log warning if stuck on same phase for too long
        if (samePhaseCount > 5000 && samePhaseCount % 5000 === 0) {
          console.warn(
            `[BattleController] Stuck on phase "${phaseName}" with mode ${UiMode[uiMode]} for ${samePhaseCount} iterations`,
          );
        }
      } else {
        lastPhaseName = phaseName;
        samePhaseCount = 0;
      }

      // Check if we're at a decision point (CommandPhase with COMMAND UI)
      if (phaseName === "CommandPhase" && uiMode === UiMode.COMMAND) {
        // Get the field index from the CommandPhase
        this.currentFieldIndex = (currentPhase as CommandPhase).getFieldIndex();
        this.state = ControllerState.AWAITING_DECISION;
        return;
      }

      // Check for game over phases
      if (phaseName === "GameOverPhase" || phaseName === "PostGameOverPhase") {
        this.state = ControllerState.EPISODE_ENDED;
        return;
      }

      // Try auto-pilot for non-battle phases
      if (this.autoPilot.canHandlePhase(phaseName)) {
        const result = this.autoPilot.handlePhase(phaseName, uiMode);
        if (result.handled) {
          await this.waitTick();
          continue;
        }
      }

      // Handle target selection mode even if not in SelectTargetPhase
      if (uiMode === UiMode.TARGET_SELECT) {
        this.autoPilot.handlePhase("SelectTargetPhase", uiMode);
        await this.waitTick();
        continue;
      }

      // Handle messages
      if (uiMode === UiMode.MESSAGE) {
        this.autoPilot.handleMessage();
      }

      // Advance the phase manager
      await this.waitTick();
    }

    throw new Error(
      `Exceeded maximum iterations (${maxIterations}) waiting for decision point. Last phase: "${lastPhaseName}"`,
    );
  }

  /**
   * Wait for one game tick
   */
  private async waitTick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 1));
  }

  /**
   * Calculate step info from state snapshots
   */
  private calculateStepInfo(prevSnapshot: BattleStateSnapshot, currSnapshot: BattleStateSnapshot): StepInfo {
    const enemyKOs = currSnapshot.enemyFaintCount - prevSnapshot.enemyFaintCount;
    const playerFaints = currSnapshot.playerFaintCount - prevSnapshot.playerFaintCount;
    const battleWon = isEnemyDefeated() && !isPlayerDefeated();
    const battleLost = isPlayerDefeated();
    const gameOver = battleLost;

    // Track turns
    if (currSnapshot.turn > prevSnapshot.turn) {
      this.turnCount += currSnapshot.turn - prevSnapshot.turn;
    }

    return {
      waveIndex: currSnapshot.waveIndex,
      enemyKOs,
      playerFaints,
      battleWon,
      battleLost,
      gameOver,
    };
  }

  /**
   * Get the current error message (if any)
   */
  getError(): string | null {
    return this.errorMessage;
  }

  /**
   * Get the current turn count
   */
  getTurnCount(): number {
    return this.turnCount;
  }

  /**
   * Get the current field index (which Pokemon is deciding)
   */
  getCurrentFieldIndex(): number {
    return this.currentFieldIndex;
  }
}

/**
 * Create a battle controller with the given configuration
 */
export function createBattleController(config: Partial<EnvironmentConfig> = {}): BattleController {
  return new BattleController(config);
}

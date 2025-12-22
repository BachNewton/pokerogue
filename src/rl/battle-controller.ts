/**
 * BattleController - Core controller for RL battle interaction
 * Manages the game loop and intercepts phases for RL decision making
 */

import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { Command } from "#enums/command";
import { MoveUseMode } from "#enums/move-use-mode";
import { UiMode } from "#enums/ui-mode";
import type { CommandPhase } from "#phases/command-phase";
import type { PhaseInterceptor } from "#test/test-utils/phase-interceptor";
import type { ConfirmUiHandler } from "#ui/confirm-ui-handler";
import type { PartyUiHandler } from "#ui/handlers/party-ui-handler";
import type { TargetSelectUiHandler } from "#ui/handlers/target-select-ui-handler";
import { translateAction } from "./action";
import { type AutoPilot, createAutoPilot } from "./auto-pilot";
import { rlDebug, rlWarn } from "./debug";
import { extractBattleObservation, isPlayerDefeated, takeBattleStateSnapshot } from "./observation";
import { calculateReward } from "./reward";
import type { BattleObservation, BattleStateSnapshot, EnvironmentConfig, StepInfo, StepResult } from "./types";
import { type ActionType, DEFAULT_ENV_CONFIG, DecisionType } from "./types";

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
  private phaseInterceptor: PhaseInterceptor | null = null;
  private state: ControllerState = ControllerState.UNINITIALIZED;
  private currentFieldIndex = 0;
  private prevStateSnapshot: BattleStateSnapshot | null = null;
  private turnCount = 0;
  private errorMessage: string | null = null;

  // Decision context
  private currentDecisionType: DecisionType = DecisionType.COMMAND;
  private switchingFieldIndex = 0;
  private validTargets: number[] = [];

  // Track battle victories during phase execution (before new battle starts)
  private battleWonThisStep = false;

  constructor(config: Partial<EnvironmentConfig> = {}) {
    this.config = { ...DEFAULT_ENV_CONFIG, ...config };
    this.autoPilot = createAutoPilot({
      modifierStrategy: this.config.modifierStrategy,
      biomeStrategy: this.config.biomeStrategy,
    });
  }

  /**
   * Set the phase interceptor for running phases
   */
  setPhaseInterceptor(interceptor: PhaseInterceptor): void {
    this.phaseInterceptor = interceptor;
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
    return extractBattleObservation({
      fieldIndex: this.currentFieldIndex,
      decisionType: this.currentDecisionType,
      switchingFieldIndex: this.switchingFieldIndex,
      validTargets: this.validTargets,
    });
  }

  /**
   * Get the current decision type
   */
  getDecisionType(): DecisionType {
    return this.currentDecisionType;
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

    // Reset battle victory flag for this step
    this.battleWonThisStep = false;

    try {
      // Translate the action based on current decision type
      const translation = translateAction(action, this.currentDecisionType, this.currentFieldIndex, this.validTargets);
      if (!translation.valid) {
        throw new Error(`Invalid action: ${translation.error}`);
      }

      // Execute based on decision type
      await this.executeDecision(translation);

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
      // Use battleWonThisStep flag which is set during phase execution,
      // before the game transitions to the next battle
      const terminated =
        info.battleLost || info.gameOver || (this.config.episodeType === "single_battle" && this.battleWonThisStep);
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
        reward: -10,
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
   * Execute a decision based on the current decision type
   */
  private async executeDecision(translation: {
    valid: boolean;
    command?: { command: Command; cursor: number; useMode?: MoveUseMode; isTera?: boolean; isBatonSwitch?: boolean };
    switchSlot?: number;
    targetIndex?: number;
    acceptSwitch?: boolean;
  }): Promise<void> {
    switch (this.currentDecisionType) {
      case DecisionType.COMMAND:
        if (!translation.command) {
          throw new Error("Command decision requires command translation");
        }
        this.executeCommand(translation.command);
        break;

      case DecisionType.SWITCH:
        if (translation.switchSlot === undefined) {
          throw new Error("Switch decision requires switchSlot");
        }
        await this.executeSwitchSlot(translation.switchSlot);
        break;

      case DecisionType.TARGET:
        if (translation.targetIndex === undefined) {
          throw new Error("Target decision requires targetIndex");
        }
        await this.executeTarget(translation.targetIndex);
        break;

      case DecisionType.CHECK_SWITCH:
        if (translation.acceptSwitch === undefined) {
          throw new Error("Check switch decision requires acceptSwitch");
        }
        await this.executeCheckSwitch(translation.acceptSwitch);
        break;

      default:
        throw new Error(`Unknown decision type: ${this.currentDecisionType}`);
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
   * Execute a forced switch to a specific party slot
   */
  private async executeSwitchSlot(slotIndex: number): Promise<void> {
    rlDebug("BC", `executeSwitchSlot(${slotIndex}) - start`);
    const handler = globalScene.ui.getHandler() as PartyUiHandler;
    if (!handler?.active) {
      throw new Error("PartyUiHandler not active for switch");
    }

    // Directly invoke the selectCallback with the slot index and SEND_OUT option
    // This bypasses the UI menu navigation which can get stuck
    const selectCallback = (handler as any).selectCallback;
    rlDebug("BC", `selectCallback exists: ${!!selectCallback}`);
    if (selectCallback) {
      (handler as any).selectCallback = null;
      // PartyOption.SEND_OUT = 1
      rlDebug("BC", `Calling selectCallback(${slotIndex}, 1)`);
      selectCallback(slotIndex, 1);
      rlDebug("BC", "selectCallback returned");
      // Wait for the phase transition to complete
      await new Promise(resolve => setImmediate(resolve));
      rlDebug("BC", `After setImmediate, uiMode=${globalScene.ui.getMode()}`);
    } else {
      // Fallback to processInput if no callback
      rlDebug("BC", "Fallback: using processInput");
      handler.setCursor(slotIndex);
      handler.processInput(Button.ACTION);
      await new Promise(resolve => setImmediate(resolve));
      if (globalScene.ui.getMode() === UiMode.PARTY) {
        handler.processInput(Button.ACTION);
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    rlDebug("BC", "executeSwitchSlot - end");
  }

  /**
   * Execute a target selection
   */
  private async executeTarget(targetIndex: number): Promise<void> {
    const handler = globalScene.ui.getHandler() as TargetSelectUiHandler;
    if (!handler?.active) {
      throw new Error("TargetSelectUiHandler not active for target selection");
    }

    handler.setCursor(targetIndex);
    handler.processInput(Button.ACTION);
    await new Promise(resolve => setImmediate(resolve));
  }

  /**
   * Execute a check switch decision (yes/no)
   */
  private async executeCheckSwitch(accept: boolean): Promise<void> {
    const handler = globalScene.ui.getHandler() as ConfirmUiHandler;
    if (!handler?.active) {
      throw new Error("ConfirmUiHandler not active for check switch");
    }

    if (accept) {
      handler.setCursor(0); // "Yes" option
      handler.processInput(Button.ACTION);
    } else {
      handler.processInput(Button.CANCEL); // Decline
    }
    await new Promise(resolve => setImmediate(resolve));
  }

  /**
   * Run the game until the next decision point or episode end
   */
  private async runToNextDecisionPoint(): Promise<void> {
    const maxIterations = 30000; // Safety limit
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
        // Log at key thresholds
        if (samePhaseCount === 5000) {
          rlDebug("BC", `Waiting on phase: ${phaseName}, uiMode=${uiMode}`);
        } else if (samePhaseCount === 20000 || samePhaseCount === 25000) {
          rlWarn("BC", `Stuck ${samePhaseCount}: ${phaseName}, uiMode=${uiMode}`);
        }
      } else {
        if (samePhaseCount > 1000) {
          rlDebug("BC", `Phase transitioned: ${lastPhaseName} -> ${phaseName} after ${samePhaseCount} iterations`);
        }
        lastPhaseName = phaseName;
        samePhaseCount = 0;
      }

      // === DECISION POINT 1: CommandPhase ===
      if (phaseName === "CommandPhase" && uiMode === UiMode.COMMAND) {
        this.currentFieldIndex = (currentPhase as CommandPhase).getFieldIndex();
        this.currentDecisionType = DecisionType.COMMAND;
        this.state = ControllerState.AWAITING_DECISION;
        rlDebug("BC", `Decision: COMMAND at fieldIndex=${this.currentFieldIndex}`);
        return;
      }

      // === DECISION POINT 2: CheckSwitchPhase (optional switch after KO) ===
      if (phaseName === "CheckSwitchPhase" && uiMode === UiMode.CONFIRM) {
        this.currentDecisionType = DecisionType.CHECK_SWITCH;
        this.state = ControllerState.AWAITING_DECISION;
        rlDebug("BC", "Decision: CHECK_SWITCH");
        return;
      }

      // === DECISION POINT 3: SwitchPhase (forced switch) ===
      if (phaseName === "SwitchPhase" && uiMode === UiMode.PARTY) {
        this.switchingFieldIndex = (currentPhase as any).fieldIndex ?? 0;
        this.currentDecisionType = DecisionType.SWITCH;
        this.state = ControllerState.AWAITING_DECISION;
        rlDebug("BC", `Decision: SWITCH at fieldIndex=${this.switchingFieldIndex}`);
        return;
      }

      // === DECISION POINT 4: SelectTargetPhase (target selection) ===
      if (phaseName === "SelectTargetPhase" && uiMode === UiMode.TARGET_SELECT) {
        this.currentFieldIndex = (currentPhase as any).fieldIndex ?? 0;
        this.validTargets = this.getValidTargetsFromHandler();
        this.currentDecisionType = DecisionType.TARGET;
        this.state = ControllerState.AWAITING_DECISION;
        rlDebug("BC", `Decision: TARGET at fieldIndex=${this.currentFieldIndex}, validTargets=${this.validTargets}`);
        return;
      }

      // Check for game over phases
      if (phaseName === "GameOverPhase" || phaseName === "PostGameOverPhase") {
        this.state = ControllerState.EPISODE_ENDED;
        return;
      }

      // Try auto-pilot for non-battle phases (excludes decision points)
      if (this.autoPilot.canHandlePhase(phaseName)) {
        rlDebug("BC", `AutoPilot checking: ${phaseName}, uiMode=${uiMode}`);
        const result = this.autoPilot.handlePhase(phaseName, uiMode);
        rlDebug("BC", `AutoPilot result: handled=${result.handled}`);
        if (result.handled) {
          await this.runNextPhase();
          continue;
        }
      }

      // Handle messages
      if (uiMode === UiMode.MESSAGE) {
        this.autoPilot.handleMessage();
      }

      // Run the next phase using the phase interceptor
      await this.runNextPhase();
    }

    throw new Error(`Max iterations (${maxIterations}) waiting for decision. Last: "${lastPhaseName}"`);
  }

  /**
   * Get valid targets from the current TargetSelectUiHandler
   */
  private getValidTargetsFromHandler(): number[] {
    const handler = globalScene.ui.getHandler() as TargetSelectUiHandler;
    if (!handler?.active) {
      // Default to enemy targets
      return [2, 3]; // ENEMY, ENEMY_2
    }

    // Try to get valid targets from handler
    // The handler has targets property
    const targets = (handler as any).targets;
    if (Array.isArray(targets)) {
      return targets;
    }

    // Fallback: return all enemy targets
    const isDouble = globalScene.currentBattle?.double ?? false;
    return isDouble ? [2, 3] : [2];
  }

  /**
   * Wait for one game tick
   */
  private async waitTick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 1));
  }

  /**
   * Run the next phase using the PhaseInterceptor
   * This is the key method that actually executes queued phases
   */
  private async runNextPhase(): Promise<void> {
    if (!this.phaseInterceptor) {
      // Fallback to simple tick if no interceptor
      await this.waitTick();
      return;
    }

    // Check if there are phases waiting to be run
    const onHold = (this.phaseInterceptor as any).onHold as Array<{ name: string; call: () => void }>;
    if (onHold && onHold.length > 0) {
      // Run the next phase from the queue and wait for it to complete
      await this.executePhaseFromQueue(onHold);
    } else {
      // No phases queued, just wait a tick
      await this.waitTick();
    }
  }

  /**
   * Execute a phase from the queue and wait for completion
   * Uses polling instead of 10s timeout for faster training
   */
  private async executePhaseFromQueue(onHold: Array<{ name: string; call: () => void }>): Promise<void> {
    const currentPhase = onHold.shift()!;
    const startTime = Date.now();
    // Reduced from 5s to 500ms since most phases complete instantly with mocks
    // SwitchSummonPhase and NextEncounterPhase may still timeout but will recover
    const maxWaitMs = 500;

    // Set up the inProgress tracker
    let completed = false;
    let error: Error | null = null;

    const inProgress = {
      name: currentPhase.name,
      callback: () => {
        rlDebug("BC", `Phase ${currentPhase.name} completed via callback`);
        completed = true;
        (this.phaseInterceptor as any).inProgress = undefined;
      },
      onError: (err: Error) => {
        error = err;
        completed = true;
        (this.phaseInterceptor as any).inProgress = undefined;
      },
    };
    (this.phaseInterceptor as any).inProgress = inProgress;

    // Track battle victory for episode termination detection
    // Must check BEFORE phase executes and transitions to next battle
    if (currentPhase.name === "VictoryPhase" || currentPhase.name === "BattleEndPhase") {
      this.battleWonThisStep = true;
      rlDebug("BC", `Battle victory detected via ${currentPhase.name}`);
    }

    // Execute the phase
    rlDebug("BC", `Executing phase: ${currentPhase.name}`);
    currentPhase.call();

    // Poll for completion
    while (!completed && Date.now() - startTime < maxWaitMs) {
      await this.waitTick();

      // Check if inProgress was cleared (phase completed via setMode)
      if (!(this.phaseInterceptor as any).inProgress) {
        rlDebug("BC", `Phase ${currentPhase.name} completed (inProgress cleared)`);
        completed = true;
        break;
      }

      // Check if phase transitioned
      const currPhase = globalScene.phaseManager.getCurrentPhase();
      if (currPhase && currPhase.phaseName !== currentPhase.name) {
        rlDebug("BC", `Phase transitioned: ${currentPhase.name} -> ${currPhase.phaseName}`);
        (this.phaseInterceptor as any).inProgress = undefined;
        completed = true;
        break;
      }
    }

    if (!completed) {
      rlDebug("BC", `Phase ${currentPhase.name} TIMEOUT after ${Date.now() - startTime}ms`);
    }

    if (error) {
      throw error;
    }

    if (!completed) {
      // Timed out - force complete and continue
      (this.phaseInterceptor as any).inProgress = undefined;
    }
  }

  /**
   * Calculate step info from state snapshots
   */
  private calculateStepInfo(prevSnapshot: BattleStateSnapshot, currSnapshot: BattleStateSnapshot): StepInfo {
    const enemyKOs = currSnapshot.enemyFaintCount - prevSnapshot.enemyFaintCount;
    const playerFaints = currSnapshot.playerFaintCount - prevSnapshot.playerFaintCount;
    // Use battleWonThisStep flag which is set during VictoryPhase/BattleEndPhase,
    // before the game transitions to the next battle
    const battleWon = this.battleWonThisStep;
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

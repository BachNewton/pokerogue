/**
 * Auto-pilot handlers for non-battle phases
 * These allow the RL environment to progress through the game
 * without getting stuck on screens that require player input.
 */

import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { UiMode } from "#enums/ui-mode";

/**
 * Strategy for auto-selecting modifiers
 */
export type ModifierStrategy = "skip" | "first" | "random";

/**
 * Strategy for auto-selecting biomes
 */
export type BiomeStrategy = "first" | "random";

/**
 * Auto-pilot configuration
 * NOTE: CheckSwitchPhase, SwitchPhase, and SelectTargetPhase are now
 * RL decision points and are handled by the agent, not auto-pilot.
 */
export interface AutoPilotConfig {
  modifierStrategy: ModifierStrategy;
  biomeStrategy: BiomeStrategy;
  /** Whether to auto-skip learn move prompts */
  autoSkipLearnMove: boolean;
  /** Whether to let evolutions proceed automatically */
  autoEvolution: boolean;
}

/**
 * Default auto-pilot configuration
 */
export const DEFAULT_AUTO_PILOT_CONFIG: AutoPilotConfig = {
  modifierStrategy: "skip",
  biomeStrategy: "first",
  autoSkipLearnMove: true,
  autoEvolution: true,
};

/**
 * Handler result indicating if the phase was handled
 */
export interface AutoPilotResult {
  handled: boolean;
  error?: string;
}

/**
 * Auto-pilot class that handles non-battle phases
 */
export class AutoPilot {
  private config: AutoPilotConfig;

  constructor(config: Partial<AutoPilotConfig> = {}) {
    this.config = { ...DEFAULT_AUTO_PILOT_CONFIG, ...config };
  }

  /**
   * Update the auto-pilot configuration
   */
  setConfig(config: Partial<AutoPilotConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Handle the current phase if it's a non-battle phase
   * NOTE: CheckSwitchPhase, SwitchPhase, and SelectTargetPhase are now
   * RL decision points and are NOT handled by auto-pilot.
   * @param phaseName - Name of the current phase
   * @param mode - Current UI mode
   * @returns Whether the phase was handled
   */
  handlePhase(phaseName: string, mode: UiMode): AutoPilotResult {
    switch (phaseName) {
      case "SelectModifierPhase":
        return this.handleSelectModifier(mode);
      case "SelectBiomePhase":
        return this.handleSelectBiome(mode);
      case "LearnMovePhase":
        return this.handleLearnMove(mode);
      case "EvolutionPhase":
        return this.handleEvolution(mode);
      case "FormChangePhase":
        return this.handleFormChange(mode);
      // These phases auto-proceed, just acknowledge them
      case "SwitchSummonPhase":
      case "VictoryPhase":
      case "BattleEndPhase":
      case "NextEncounterPhase":
      case "NewBattlePhase":
      case "PostSummonPhase":
        return { handled: true };
      default:
        return { handled: false };
    }
  }

  /**
   * Handle SelectModifierPhase (item selection after battles)
   */
  private handleSelectModifier(mode: UiMode): AutoPilotResult {
    if (mode !== UiMode.MODIFIER_SELECT && mode !== UiMode.CONFIRM) {
      return { handled: false };
    }

    const handler = globalScene.ui.getHandler();
    if (!handler?.active) {
      return { handled: false };
    }

    switch (this.config.modifierStrategy) {
      case "skip":
        // Press CANCEL to skip, then confirm
        if (mode === UiMode.MODIFIER_SELECT) {
          handler.processInput(Button.CANCEL);
        } else if (mode === UiMode.CONFIRM) {
          handler.processInput(Button.ACTION);
        }
        break;

      case "first":
        // Select the first available modifier
        if (mode === UiMode.MODIFIER_SELECT) {
          handler.setCursor?.(0);
          handler.processInput(Button.ACTION);
        }
        break;

      case "random":
        // Select a random modifier
        if (mode === UiMode.MODIFIER_SELECT) {
          const options = (handler as any).options ?? [];
          if (options.length > 0) {
            const randomIndex = Math.floor(Math.random() * options.length);
            handler.setCursor?.(randomIndex);
            handler.processInput(Button.ACTION);
          } else {
            handler.processInput(Button.CANCEL);
          }
        } else if (mode === UiMode.CONFIRM) {
          handler.processInput(Button.ACTION);
        }
        break;
    }

    return { handled: true };
  }

  /**
   * Handle SelectBiomePhase (biome selection)
   */
  private handleSelectBiome(mode: UiMode): AutoPilotResult {
    if (mode !== UiMode.BIOME_SELECT) {
      return { handled: false };
    }

    const handler = globalScene.ui.getHandler();
    if (!handler?.active) {
      return { handled: false };
    }

    switch (this.config.biomeStrategy) {
      case "first":
        handler.setCursor?.(0);
        handler.processInput(Button.ACTION);
        break;

      case "random": {
        const options = (handler as any).biomeSelectOptions ?? [];
        if (options.length > 0) {
          const randomIndex = Math.floor(Math.random() * options.length);
          handler.setCursor?.(randomIndex);
        }
        handler.processInput(Button.ACTION);
        break;
      }
    }

    return { handled: true };
  }

  /**
   * Handle LearnMovePhase (new move learning prompt)
   */
  private handleLearnMove(mode: UiMode): AutoPilotResult {
    if (mode !== UiMode.LEARN_MOVE && mode !== UiMode.CONFIRM) {
      return { handled: false };
    }

    if (!this.config.autoSkipLearnMove) {
      return { handled: false };
    }

    const handler = globalScene.ui.getHandler();
    if (!handler?.active) {
      return { handled: false };
    }

    // Skip learning the move
    if (mode === UiMode.LEARN_MOVE) {
      // Select "Don't learn" option (usually the last option)
      handler.setCursor?.(4); // Skip option
      handler.processInput(Button.ACTION);
    } else if (mode === UiMode.CONFIRM) {
      handler.processInput(Button.ACTION);
    }

    return { handled: true };
  }

  /**
   * Handle EvolutionPhase
   */
  private handleEvolution(_mode: UiMode): AutoPilotResult {
    // Evolution phases usually auto-proceed, but we can skip the animation
    if (!this.config.autoEvolution) {
      return { handled: false };
    }

    // Try to speed through the evolution
    const handler = globalScene.ui.getHandler();
    if (handler?.active) {
      handler.processInput(Button.ACTION);
    }

    return { handled: true };
  }

  /**
   * Handle FormChangePhase
   */
  private handleFormChange(_mode: UiMode): AutoPilotResult {
    // Form changes usually auto-proceed
    const handler = globalScene.ui.getHandler();
    if (handler?.active) {
      handler.processInput(Button.ACTION);
    }

    return { handled: true };
  }

  /**
   * Handle message dismissal
   */
  handleMessage(): AutoPilotResult {
    const mode = globalScene.ui.getMode();
    if (mode !== UiMode.MESSAGE) {
      return { handled: false };
    }

    const handler = globalScene.ui.getHandler();
    if (!handler?.active) {
      return { handled: false };
    }

    // Dismiss the message
    handler.processInput(Button.ACTION);
    return { handled: true };
  }

  /**
   * Check if the current phase is one that auto-pilot can handle
   * NOTE: CheckSwitchPhase, SwitchPhase, and SelectTargetPhase are RL decision points
   */
  canHandlePhase(phaseName: string): boolean {
    const handleablePhases = [
      "SelectModifierPhase",
      "SelectBiomePhase",
      "LearnMovePhase",
      "EvolutionPhase",
      "FormChangePhase",
      "MessagePhase",
      // Auto-proceeding phases
      "SwitchSummonPhase",
      "VictoryPhase",
      "BattleEndPhase",
      "NextEncounterPhase",
      "NewBattlePhase",
      "PostSummonPhase",
    ];
    return handleablePhases.includes(phaseName);
  }
}

/**
 * Create an auto-pilot instance with the given configuration
 */
export function createAutoPilot(config: Partial<AutoPilotConfig> = {}): AutoPilot {
  return new AutoPilot(config);
}

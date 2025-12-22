/**
 * Action system for the RL environment
 * Translates RL actions to game commands
 */

import { globalScene } from "#app/global-scene";
import type { BattlerIndex } from "#enums/battler-index";
import { Command } from "#enums/command";
import { MoveUseMode } from "#enums/move-use-mode";
import { computeActionMask } from "./observation";
import { ACTION_RANGES, ACTION_SPACE_SIZE, ActionType, DecisionType } from "./types";

/**
 * Translated game command from an RL action
 */
export interface GameCommand {
  /** The command type (FIGHT, POKEMON, etc.) */
  command: Command;
  /** Cursor position (move index or party index) */
  cursor: number;
  /** Move use mode */
  useMode?: MoveUseMode;
  /** Whether this is a tera action */
  isTera?: boolean;
  /** For switch commands, whether it's a baton switch */
  isBatonSwitch?: boolean;
}

/**
 * Result of action translation
 */
export interface ActionTranslationResult {
  /** Whether the action is valid */
  valid: boolean;
  /** The translated command (for COMMAND decisions) */
  command?: GameCommand;
  /** For SWITCH decisions: party slot to switch to */
  switchSlot?: number;
  /** For TARGET decisions: target battler index */
  targetIndex?: BattlerIndex;
  /** For CHECK_SWITCH decisions: whether to accept the switch */
  acceptSwitch?: boolean;
  /** Error message (if invalid) */
  error?: string;
}

/**
 * Translate an RL action to a game command
 * @param action - The action index (0-24)
 * @param decisionType - The type of decision being made
 * @param fieldIndex - The field index of the Pokemon taking the action
 * @param validTargets - For TARGET decisions, the valid target indices
 * @returns The translation result
 */
export function translateAction(
  action: ActionType | number,
  decisionType: DecisionType = DecisionType.COMMAND,
  fieldIndex = 0,
  validTargets?: number[],
): ActionTranslationResult {
  // Validate action is in range
  if (action < 0 || action >= ACTION_SPACE_SIZE) {
    return {
      valid: false,
      error: `Action ${action} is out of range [0, ${ACTION_SPACE_SIZE - 1}]`,
    };
  }

  // Check action is valid for decision type
  const range = ACTION_RANGES[decisionType];
  if (action < range.start || action > range.end) {
    return {
      valid: false,
      error: `Action ${action} (${ActionType[action]}) is not valid for decision type ${decisionType}`,
    };
  }

  // Check action mask
  const mask = computeActionMask(decisionType, fieldIndex, validTargets);
  if (!mask[action]) {
    return {
      valid: false,
      error: `Action ${action} (${ActionType[action]}) is masked/invalid in current state`,
    };
  }

  // Translate based on decision type
  switch (decisionType) {
    case DecisionType.COMMAND:
      return translateCommandAction(action, fieldIndex);
    case DecisionType.SWITCH:
      return translateSwitchSlotAction(action);
    case DecisionType.TARGET:
      return translateTargetAction(action);
    case DecisionType.CHECK_SWITCH:
      return translateCheckSwitchAction(action);
    default:
      return {
        valid: false,
        error: `Unknown decision type: ${decisionType}`,
      };
  }
}

/**
 * Translate a COMMAND decision action
 */
function translateCommandAction(action: ActionType | number, fieldIndex: number): ActionTranslationResult {
  // Regular move (0-3)
  if (action >= ActionType.MOVE_0 && action <= ActionType.MOVE_3) {
    const moveIndex = action - ActionType.MOVE_0;
    return {
      valid: true,
      command: {
        command: Command.FIGHT,
        cursor: moveIndex,
        useMode: MoveUseMode.NORMAL,
        isTera: false,
      },
    };
  }

  // Voluntary switch (4-8)
  if (action >= ActionType.SWITCH_1 && action <= ActionType.SWITCH_5) {
    const switchOffset = action - ActionType.SWITCH_1;
    const partyIndex = getSwitchTargetPartyIndex(switchOffset, fieldIndex);

    if (partyIndex === -1) {
      return {
        valid: false,
        error: `No valid switch target for switch offset ${switchOffset}`,
      };
    }

    return {
      valid: true,
      command: {
        command: Command.POKEMON,
        cursor: partyIndex,
        isBatonSwitch: false,
      },
    };
  }

  // Tera + move (9-12)
  if (action >= ActionType.TERA_MOVE_0 && action <= ActionType.TERA_MOVE_3) {
    const moveIndex = action - ActionType.TERA_MOVE_0;
    return {
      valid: true,
      command: {
        command: Command.TERA,
        cursor: moveIndex,
        useMode: MoveUseMode.NORMAL,
        isTera: true,
      },
    };
  }

  return {
    valid: false,
    error: `Unknown command action: ${action}`,
  };
}

/**
 * Translate a SWITCH decision action (forced switch)
 */
function translateSwitchSlotAction(action: ActionType | number): ActionTranslationResult {
  if (action < ActionType.SWITCH_SLOT_0 || action > ActionType.SWITCH_SLOT_5) {
    return {
      valid: false,
      error: `Invalid switch slot action: ${action}`,
    };
  }

  const slotIndex = action - ActionType.SWITCH_SLOT_0;
  return {
    valid: true,
    switchSlot: slotIndex,
  };
}

/**
 * Translate a TARGET decision action
 */
function translateTargetAction(action: ActionType | number): ActionTranslationResult {
  if (action < ActionType.TARGET_PLAYER || action > ActionType.TARGET_ENEMY_2) {
    return {
      valid: false,
      error: `Invalid target action: ${action}`,
    };
  }

  // Map action to BattlerIndex
  const targetIndex = action - ActionType.TARGET_PLAYER;
  return {
    valid: true,
    targetIndex: targetIndex as BattlerIndex,
  };
}

/**
 * Translate a CHECK_SWITCH decision action
 */
function translateCheckSwitchAction(action: ActionType | number): ActionTranslationResult {
  if (action === ActionType.CHECK_SWITCH_NO) {
    return {
      valid: true,
      acceptSwitch: false,
    };
  }

  if (action === ActionType.CHECK_SWITCH_YES) {
    return {
      valid: true,
      acceptSwitch: true,
    };
  }

  return {
    valid: false,
    error: `Invalid check switch action: ${action}`,
  };
}

/**
 * Get the party index for a switch action
 * @param switchOffset - The offset (0-4) representing which available Pokemon to switch to
 * @param fieldIndex - The field index of the Pokemon switching out
 * @returns The party index to switch to, or -1 if invalid
 */
function getSwitchTargetPartyIndex(switchOffset: number, _fieldIndex: number): number {
  const playerParty = globalScene.getPlayerParty();
  const playerField = globalScene.getPlayerField();

  // Get IDs of Pokemon on the field
  const fieldPokemonIds = new Set(playerField.filter(p => p?.isActive()).map(p => p.id));

  // Find available switch targets
  const availableTargets: number[] = [];
  for (let i = 0; i < playerParty.length; i++) {
    const pokemon = playerParty[i];
    if (pokemon && !fieldPokemonIds.has(pokemon.id) && !pokemon.isFainted()) {
      availableTargets.push(i);
    }
  }

  if (switchOffset >= availableTargets.length) {
    return -1;
  }

  return availableTargets[switchOffset];
}

/**
 * Select a random valid action based on the action mask
 * @param decisionType - The type of decision being made
 * @param fieldIndex - The field index of the Pokemon
 * @param validTargets - For TARGET decisions, the valid target indices
 * @returns A random valid action, or -1 if no valid actions
 */
export function selectRandomValidAction(
  decisionType: DecisionType = DecisionType.COMMAND,
  fieldIndex = 0,
  validTargets?: number[],
): ActionType {
  const mask = computeActionMask(decisionType, fieldIndex, validTargets);
  const validActions: ActionType[] = [];

  for (let i = 0; i < ACTION_SPACE_SIZE; i++) {
    if (mask[i]) {
      validActions.push(i as ActionType);
    }
  }

  if (validActions.length === 0) {
    return -1 as ActionType;
  }

  return validActions[Math.floor(Math.random() * validActions.length)];
}

/**
 * Get a human-readable description of an action
 * @param action - The action to describe
 * @returns A string description
 */
export function describeAction(action: ActionType | number): string {
  if (action < 0 || action >= ACTION_SPACE_SIZE) {
    return `Invalid action: ${action}`;
  }

  // COMMAND actions (0-12)
  if (action >= ActionType.MOVE_0 && action <= ActionType.MOVE_3) {
    return `Move ${action - ActionType.MOVE_0 + 1}`;
  }

  if (action >= ActionType.SWITCH_1 && action <= ActionType.SWITCH_5) {
    return `Switch ${action - ActionType.SWITCH_1 + 1}`;
  }

  if (action >= ActionType.TERA_MOVE_0 && action <= ActionType.TERA_MOVE_3) {
    return `Tera+Move ${action - ActionType.TERA_MOVE_0 + 1}`;
  }

  // SWITCH actions (13-18)
  if (action >= ActionType.SWITCH_SLOT_0 && action <= ActionType.SWITCH_SLOT_5) {
    return `Slot ${action - ActionType.SWITCH_SLOT_0}`;
  }

  // TARGET actions (19-22)
  if (action === ActionType.TARGET_PLAYER) {
    return "Target: Player";
  }
  if (action === ActionType.TARGET_PLAYER_2) {
    return "Target: Player2";
  }
  if (action === ActionType.TARGET_ENEMY) {
    return "Target: Enemy";
  }
  if (action === ActionType.TARGET_ENEMY_2) {
    return "Target: Enemy2";
  }

  // CHECK_SWITCH actions (23-24)
  if (action === ActionType.CHECK_SWITCH_NO) {
    return "Decline Switch";
  }
  if (action === ActionType.CHECK_SWITCH_YES) {
    return "Accept Switch";
  }

  return `Unknown: ${action}`;
}

/**
 * Get all valid actions for the current state
 * @param decisionType - The type of decision being made
 * @param fieldIndex - The field index of the Pokemon
 * @param validTargets - For TARGET decisions, the valid target indices
 * @returns Array of valid action indices
 */
export function getValidActions(
  decisionType: DecisionType = DecisionType.COMMAND,
  fieldIndex = 0,
  validTargets?: number[],
): ActionType[] {
  const mask = computeActionMask(decisionType, fieldIndex, validTargets);
  const validActions: ActionType[] = [];

  for (let i = 0; i < ACTION_SPACE_SIZE; i++) {
    if (mask[i]) {
      validActions.push(i as ActionType);
    }
  }

  return validActions;
}

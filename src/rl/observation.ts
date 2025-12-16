/**
 * Observation extraction for the RL environment
 */

import { globalScene } from "#app/global-scene";
import type { PokemonMove } from "#data/moves/pokemon-move";
import { TerrainType } from "#data/terrain";
import { MoveCategory } from "#enums/move-category";
import { PokemonType } from "#enums/pokemon-type";
import { Stat } from "#enums/stat";
import { StatusEffect } from "#enums/status-effect";
import { WeatherType } from "#enums/weather-type";
import type { Pokemon } from "#field/pokemon";
import type { BattleObservation, BattleStateSnapshot, MoveObservation, PokemonObservation } from "./types";
import { ACTION_SPACE_SIZE, ActionType } from "./types";

/**
 * Extract observation for a single Pokemon
 */
export function extractPokemonObservation(pokemon: Pokemon | null): PokemonObservation {
  if (!pokemon) {
    return createEmptyPokemonObservation();
  }

  const moveset = pokemon.getMoveset();
  const moves: MoveObservation[] = [];

  for (const [i, move] of moveset.entries()) {
    if (i < 4 && move) {
      moves.push(extractMoveObservation(move));
    }
  }
  // Pad with empty moves if needed
  while (moves.length < 4) {
    moves.push(createEmptyMoveObservation());
  }

  const types = pokemon.getTypes();
  const type1 = types.length > 0 ? types[0] : PokemonType.UNKNOWN;
  const type2 = types.length > 1 ? types[1] : -1;

  const stats = pokemon.getStats(false);
  const statStages = pokemon.getStatStages();

  // Get tera info
  const teraType = pokemon.getTeraType?.() ?? -1;
  const canTera = canPokemonTera(pokemon);
  const isTerastallized = pokemon.isTerastallized ?? false;

  return {
    speciesId: pokemon.species?.speciesId ?? 0,
    level: pokemon.level,
    types: [type1, type2],
    hpPercent: pokemon.hp / pokemon.getMaxHp(),
    stats: [
      stats[Stat.HP] ?? 0,
      stats[Stat.ATK] ?? 0,
      stats[Stat.DEF] ?? 0,
      stats[Stat.SPATK] ?? 0,
      stats[Stat.SPDEF] ?? 0,
      stats[Stat.SPD] ?? 0,
    ],
    statStages: [
      statStages[Stat.ATK - 1] ?? 0,
      statStages[Stat.DEF - 1] ?? 0,
      statStages[Stat.SPATK - 1] ?? 0,
      statStages[Stat.SPDEF - 1] ?? 0,
      statStages[Stat.SPD - 1] ?? 0,
      statStages[Stat.ACC - 1] ?? 0,
      statStages[Stat.EVA - 1] ?? 0,
    ],
    status: pokemon.status?.effect ?? StatusEffect.NONE,
    moves,
    teraType,
    canTera,
    isTerastallized,
    isFainted: pokemon.isFainted(),
  };
}

/**
 * Extract observation for a single move
 */
export function extractMoveObservation(pokemonMove: PokemonMove | null): MoveObservation {
  if (!pokemonMove) {
    return createEmptyMoveObservation();
  }

  const move = pokemonMove.getMove();

  return {
    moveId: move.id,
    type: move.type,
    category: move.category,
    power: move.power,
    accuracy: move.accuracy,
    ppRemaining: pokemonMove.getMovePp() - pokemonMove.ppUsed,
    ppMax: pokemonMove.getMovePp(),
    priority: move.priority,
  };
}

/**
 * Create an empty Pokemon observation (for padding)
 */
function createEmptyPokemonObservation(): PokemonObservation {
  return {
    speciesId: 0,
    level: 0,
    types: [-1, -1],
    hpPercent: 0,
    stats: [0, 0, 0, 0, 0, 0],
    statStages: [0, 0, 0, 0, 0, 0, 0],
    status: StatusEffect.NONE,
    moves: [
      createEmptyMoveObservation(),
      createEmptyMoveObservation(),
      createEmptyMoveObservation(),
      createEmptyMoveObservation(),
    ],
    teraType: -1,
    canTera: false,
    isTerastallized: false,
    isFainted: true,
  };
}

/**
 * Create an empty move observation (for padding)
 */
function createEmptyMoveObservation(): MoveObservation {
  return {
    moveId: 0,
    type: PokemonType.UNKNOWN,
    category: MoveCategory.STATUS,
    power: 0,
    accuracy: 0,
    ppRemaining: 0,
    ppMax: 0,
    priority: 0,
  };
}

/**
 * Check if a Pokemon can Terastallize
 */
function canPokemonTera(pokemon: Pokemon): boolean {
  if (!globalScene.arena) {
    return false;
  }

  // Check if already terastallized
  if (pokemon.isTerastallized) {
    return false;
  }

  // Check arena tera usage limits
  const maxTeras = 1; // MAX_TERAS_PER_ARENA from the game
  const terasUsed = globalScene.arena.playerTerasUsed ?? 0;

  return terasUsed < maxTeras;
}

/**
 * Extract the full battle observation from the current game state
 */
export function extractBattleObservation(fieldIndex = 0): BattleObservation {
  const playerField = globalScene.getPlayerField();
  const enemyField = globalScene.getEnemyField();
  const playerParty = globalScene.getPlayerParty();
  const enemyParty = globalScene.getEnemyParty();
  const currentBattle = globalScene.currentBattle;
  const arena = globalScene.arena;

  // Extract active Pokemon
  const playerActive: PokemonObservation[] = [];
  for (const pokemon of playerField) {
    if (pokemon?.isActive()) {
      playerActive.push(extractPokemonObservation(pokemon));
    }
  }

  // Extract benched Pokemon (not on field)
  const playerBench: PokemonObservation[] = [];
  for (const pokemon of playerParty) {
    // Check if this Pokemon is on the field
    const isOnField = playerField.some(p => p?.id === pokemon?.id);
    if (!isOnField && pokemon) {
      playerBench.push(extractPokemonObservation(pokemon));
    }
  }

  // Extract enemy active Pokemon
  const enemyActive: PokemonObservation[] = [];
  for (const pokemon of enemyField) {
    if (pokemon?.isActive()) {
      enemyActive.push(extractPokemonObservation(pokemon));
    }
  }

  // Extract enemy bench (limited info - only what's been seen)
  const enemyBench: PokemonObservation[] = [];
  for (const pokemon of enemyParty) {
    const isOnField = enemyField.some(p => p?.id === pokemon?.id);
    if (!isOnField && pokemon) {
      // For enemy bench, we might want to limit info to what's been revealed
      // For now, we'll include full info for training purposes
      enemyBench.push(extractPokemonObservation(pokemon));
    }
  }

  // Get weather and terrain
  const weather = arena?.weather?.weatherType ?? WeatherType.NONE;
  const terrain = arena?.terrain?.terrainType ?? TerrainType.NONE;

  // Compute action mask
  const actionMask = computeActionMask(fieldIndex);

  return {
    playerActive,
    playerBench,
    enemyActive,
    enemyBench,
    weather,
    terrain,
    turn: currentBattle?.turn ?? 0,
    waveIndex: currentBattle?.waveIndex ?? 1,
    isDoubleBattle: currentBattle?.double ?? false,
    activeFieldIndex: fieldIndex,
    actionMask,
  };
}

/**
 * Compute which actions are valid for the current state
 */
export function computeActionMask(fieldIndex = 0): boolean[] {
  const mask = new Array(ACTION_SPACE_SIZE).fill(false);

  const playerField = globalScene.getPlayerField();
  const playerParty = globalScene.getPlayerParty();
  const pokemon = playerField[fieldIndex];

  if (!pokemon || pokemon.isFainted()) {
    return mask; // No valid actions if Pokemon is fainted
  }

  const moveset = pokemon.getMoveset();

  // Check each move (actions 0-3)
  for (let i = 0; i < 4; i++) {
    if (i < moveset.length && moveset[i]) {
      const move = moveset[i];
      // Check if move is usable (has PP and not disabled)
      const [canUse] = move.isUsable(pokemon, false, true);
      mask[ActionType.MOVE_0 + i] = canUse;
    }
  }

  // Check switch actions (actions 4-8)
  // Get Pokemon not on the field that can be switched to
  const fieldPokemonIds = new Set(playerField.filter(p => p?.isActive()).map(p => p.id));

  // Check if Pokemon is trapped
  const isTrapped = pokemon.isTrapped?.() ?? false;

  if (!isTrapped) {
    let switchIndex = 0;
    for (const partyMon of playerParty) {
      if (partyMon && !fieldPokemonIds.has(partyMon.id) && !partyMon.isFainted() && switchIndex < 5) {
        mask[ActionType.SWITCH_1 + switchIndex] = true;
        switchIndex++;
      }
    }
  }

  // Check tera + move actions (actions 9-12)
  const canTera = canPokemonTera(pokemon);
  if (canTera) {
    for (let i = 0; i < 4; i++) {
      if (mask[ActionType.MOVE_0 + i]) {
        mask[ActionType.TERA_MOVE_0 + i] = true;
      }
    }
  }

  return mask;
}

/**
 * Take a snapshot of the current battle state for reward calculation
 */
export function takeBattleStateSnapshot(): BattleStateSnapshot {
  const playerParty = globalScene.getPlayerParty();
  const enemyParty = globalScene.getEnemyParty();
  const currentBattle = globalScene.currentBattle;

  const playerHPs: number[] = [];
  let playerFaintCount = 0;
  for (const pokemon of playerParty) {
    if (pokemon) {
      playerHPs.push(pokemon.hp / pokemon.getMaxHp());
      if (pokemon.isFainted()) {
        playerFaintCount++;
      }
    }
  }

  const enemyHPs: number[] = [];
  let enemyFaintCount = 0;
  for (const pokemon of enemyParty) {
    if (pokemon) {
      enemyHPs.push(pokemon.hp / pokemon.getMaxHp());
      if (pokemon.isFainted()) {
        enemyFaintCount++;
      }
    }
  }

  return {
    playerHPs,
    enemyHPs,
    playerFaintCount,
    enemyFaintCount,
    waveIndex: currentBattle?.waveIndex ?? 1,
    turn: currentBattle?.turn ?? 0,
  };
}

/**
 * Check if all player Pokemon have fainted (battle lost)
 */
export function isPlayerDefeated(): boolean {
  const playerParty = globalScene.getPlayerParty();
  return playerParty.every(p => !p || p.isFainted());
}

/**
 * Check if all enemy Pokemon have fainted (battle won)
 */
export function isEnemyDefeated(): boolean {
  const enemyParty = globalScene.getEnemyParty();
  return enemyParty.every(p => !p || p.isFainted());
}

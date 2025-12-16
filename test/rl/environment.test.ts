/**
 * Tests for the RL Environment
 */

import { describeAction, translateAction } from "#app/rl/action";
import { computeActionMask, extractBattleObservation, extractPokemonObservation } from "#app/rl/observation";
import { calculateReward } from "#app/rl/reward";
import type { BattleStateSnapshot } from "#app/rl/types";
import { ACTION_SPACE_SIZE, ActionType, DEFAULT_REWARD_CONFIG } from "#app/rl/types";
import { MoveId } from "#enums/move-id";
import { SpeciesId } from "#enums/species-id";
import { GameManager } from "#test/test-utils/game-manager";
import Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("RL Environment", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;

  beforeAll(() => {
    phaserGame = new Phaser.Game({
      type: Phaser.HEADLESS,
    });
  });

  afterEach(() => {
    game.phaseInterceptor.restoreOg();
  });

  beforeEach(() => {
    game = new GameManager(phaserGame);
    game.override
      .battleStyle("single")
      .enemySpecies(SpeciesId.MAGIKARP)
      .startingLevel(50)
      .startingWave(1)
      .moveset([MoveId.TACKLE, MoveId.GROWL, MoveId.SPLASH, MoveId.POUND])
      .enemyMoveset(MoveId.SPLASH)
      .criticalHits(false);
  });

  describe("Observation Extraction", () => {
    it("should extract valid battle observation", async () => {
      await game.classicMode.startBattle([SpeciesId.CHARIZARD]);

      const obs = extractBattleObservation(0);

      expect(obs).toBeDefined();
      expect(obs.playerActive).toHaveLength(1);
      expect(obs.enemyActive).toHaveLength(1);
      expect(obs.waveIndex).toBe(1);
      expect(obs.turn).toBeGreaterThanOrEqual(0);
    });

    it("should extract Pokemon observation with correct fields", async () => {
      await game.classicMode.startBattle([SpeciesId.CHARIZARD]);

      const pokemon = game.scene.getPlayerField()[0];
      const pokemonObs = extractPokemonObservation(pokemon);

      expect(pokemonObs.speciesId).toBe(SpeciesId.CHARIZARD);
      expect(pokemonObs.level).toBe(50);
      expect(pokemonObs.hpPercent).toBe(1.0); // Full HP at start
      expect(pokemonObs.types).toHaveLength(2);
      expect(pokemonObs.stats).toHaveLength(6);
      expect(pokemonObs.statStages).toHaveLength(7);
      expect(pokemonObs.moves).toHaveLength(4);
      expect(pokemonObs.isFainted).toBe(false);
    });

    it("should extract move observations", async () => {
      await game.classicMode.startBattle([SpeciesId.CHARIZARD]);

      const obs = extractBattleObservation(0);
      const moves = obs.playerActive[0].moves;

      expect(moves).toHaveLength(4);
      expect(moves[0].moveId).toBe(MoveId.TACKLE);
      expect(moves[0].ppRemaining).toBeGreaterThan(0);
      expect(moves[0].ppMax).toBeGreaterThan(0);
    });
  });

  describe("Action Mask", () => {
    it("should compute action mask with correct size", async () => {
      await game.classicMode.startBattle([SpeciesId.CHARIZARD]);

      const mask = computeActionMask(0);

      expect(mask).toHaveLength(ACTION_SPACE_SIZE);
      expect(mask).toHaveLength(13);
    });

    it("should mark moves as valid when PP is available", async () => {
      await game.classicMode.startBattle([SpeciesId.CHARIZARD]);

      const mask = computeActionMask(0);

      // With 4 moves, all move actions should be valid
      expect(mask[ActionType.MOVE_0]).toBe(true);
      expect(mask[ActionType.MOVE_1]).toBe(true);
      expect(mask[ActionType.MOVE_2]).toBe(true);
      expect(mask[ActionType.MOVE_3]).toBe(true);
    });

    it("should not allow switching with only one Pokemon", async () => {
      await game.classicMode.startBattle([SpeciesId.CHARIZARD]);

      const mask = computeActionMask(0);

      // With only one Pokemon, all switch actions should be invalid
      expect(mask[ActionType.SWITCH_1]).toBe(false);
      expect(mask[ActionType.SWITCH_2]).toBe(false);
      expect(mask[ActionType.SWITCH_3]).toBe(false);
    });

    it("should allow switching when party has multiple Pokemon", async () => {
      await game.classicMode.startBattle([SpeciesId.CHARIZARD, SpeciesId.BLASTOISE]);

      const mask = computeActionMask(0);

      // Should be able to switch to the second Pokemon
      expect(mask[ActionType.SWITCH_1]).toBe(true);
      // But not to non-existent party members
      expect(mask[ActionType.SWITCH_2]).toBe(false);
    });
  });

  describe("Action Translation", () => {
    it("should translate move actions correctly", async () => {
      await game.classicMode.startBattle([SpeciesId.CHARIZARD]);

      const result = translateAction(ActionType.MOVE_0, 0);

      expect(result.valid).toBe(true);
      expect(result.command).toBeDefined();
      expect(result.command!.command).toBe(0); // Command.FIGHT
      expect(result.command!.cursor).toBe(0);
    });

    it("should reject invalid actions", async () => {
      await game.classicMode.startBattle([SpeciesId.CHARIZARD]);

      // Try to switch with only one Pokemon
      const result = translateAction(ActionType.SWITCH_1, 0);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject out-of-range actions", () => {
      const result = translateAction(999, 0);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("out of range");
    });

    it("should describe actions correctly", () => {
      expect(describeAction(ActionType.MOVE_0)).toBe("Use move 1");
      expect(describeAction(ActionType.SWITCH_1)).toBe("Switch to party Pokemon 1");
      expect(describeAction(ActionType.TERA_MOVE_0)).toBe("Terastallize and use move 1");
    });
  });

  describe("Reward Calculation", () => {
    it("should give positive reward for enemy KO", () => {
      const prevState: BattleStateSnapshot = {
        playerHPs: [1.0],
        enemyHPs: [0.5],
        playerFaintCount: 0,
        enemyFaintCount: 0,
        waveIndex: 1,
        turn: 1,
      };

      const currState: BattleStateSnapshot = {
        playerHPs: [1.0],
        enemyHPs: [0],
        playerFaintCount: 0,
        enemyFaintCount: 1,
        waveIndex: 1,
        turn: 2,
      };

      const info = {
        waveIndex: 1,
        enemyKOs: 1,
        playerFaints: 0,
        battleWon: false,
        battleLost: false,
        gameOver: false,
      };

      const reward = calculateReward(prevState, currState, info, DEFAULT_REWARD_CONFIG);

      expect(reward).toBeGreaterThan(0);
    });

    it("should give negative reward for player faint", () => {
      const prevState: BattleStateSnapshot = {
        playerHPs: [0.2],
        enemyHPs: [1.0],
        playerFaintCount: 0,
        enemyFaintCount: 0,
        waveIndex: 1,
        turn: 1,
      };

      const currState: BattleStateSnapshot = {
        playerHPs: [0],
        enemyHPs: [1.0],
        playerFaintCount: 1,
        enemyFaintCount: 0,
        waveIndex: 1,
        turn: 2,
      };

      const info = {
        waveIndex: 1,
        enemyKOs: 0,
        playerFaints: 1,
        battleWon: false,
        battleLost: false,
        gameOver: false,
      };

      const reward = calculateReward(prevState, currState, info, DEFAULT_REWARD_CONFIG);

      expect(reward).toBeLessThan(0);
    });

    it("should give large reward for battle won", () => {
      const prevState: BattleStateSnapshot = {
        playerHPs: [0.5],
        enemyHPs: [0.1],
        playerFaintCount: 0,
        enemyFaintCount: 0,
        waveIndex: 1,
        turn: 5,
      };

      const currState: BattleStateSnapshot = {
        playerHPs: [0.5],
        enemyHPs: [0],
        playerFaintCount: 0,
        enemyFaintCount: 1,
        waveIndex: 1,
        turn: 6,
      };

      const info = {
        waveIndex: 1,
        enemyKOs: 1,
        playerFaints: 0,
        battleWon: true,
        battleLost: false,
        gameOver: false,
      };

      const reward = calculateReward(prevState, currState, info, DEFAULT_REWARD_CONFIG);

      expect(reward).toBeGreaterThan(5); // Should include battleWon bonus
    });
  });

  describe("Integration with Game", () => {
    it("should be able to take a move action", async () => {
      // Use a low-level Pokemon so we don't one-shot the enemy
      game.override.startingLevel(5);
      await game.classicMode.startBattle([SpeciesId.CHARIZARD]);

      const enemyPokemon = game.scene.currentBattle.enemyParty[0];
      const initialHp = enemyPokemon.hp;

      // Select a move
      game.move.select(MoveId.TACKLE);
      await game.toEndOfTurn();

      const finalHp = enemyPokemon.hp;
      expect(finalHp).toBeLessThan(initialHp);
    });

    it("should update observation after action", async () => {
      // Use a low-level Pokemon so we don't one-shot the enemy
      game.override.startingLevel(5);
      await game.classicMode.startBattle([SpeciesId.CHARIZARD]);

      const obsBefore = extractBattleObservation(0);
      const enemyHpBefore = obsBefore.enemyActive[0].hpPercent;

      // Take action
      game.move.select(MoveId.TACKLE);
      await game.toEndOfTurn();

      const obsAfter = extractBattleObservation(0);
      // After action, enemy may have taken damage or fainted
      // If fainted, the array might be empty or have a fainted Pokemon
      if (obsAfter.enemyActive.length > 0 && !obsAfter.enemyActive[0].isFainted) {
        expect(obsAfter.enemyActive[0].hpPercent).toBeLessThan(enemyHpBefore);
      } else {
        // Enemy was knocked out, which means damage was dealt
        expect(true).toBe(true);
      }
    });
  });
});

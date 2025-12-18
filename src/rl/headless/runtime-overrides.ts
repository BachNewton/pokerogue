/**
 * Runtime Overrides System
 *
 * Replaces vitest's vi.spyOn() with Object.defineProperty() for standalone use.
 * Allows dynamic modification of game overrides without test framework dependencies.
 */

import Overrides, { type OverridesType } from "#app/overrides";

type OverridesKeys = keyof InstanceType<OverridesType>;

interface PropertyDescriptorRecord {
  key: string;
  descriptor: PropertyDescriptor | undefined;
}

/**
 * RuntimeOverrides allows modifying game overrides at runtime without vitest.
 * Uses Object.defineProperty to intercept getter calls on the Overrides object.
 */
export class RuntimeOverrides {
  private readonly originalDescriptors: Map<string, PropertyDescriptorRecord> = new Map();

  /**
   * Override a property on the Overrides object
   * @param key The property name to override
   * @param value The value to return when the property is accessed
   * @returns this for chaining
   */
  override<K extends OverridesKeys>(key: K, value: (typeof Overrides)[K]): this {
    // Store original descriptor if not already stored
    if (!this.originalDescriptors.has(key)) {
      const descriptor = Object.getOwnPropertyDescriptor(Overrides, key);
      this.originalDescriptors.set(key, { key, descriptor });
    }

    // Define new getter that returns the override value
    Object.defineProperty(Overrides, key, {
      get: () => value,
      configurable: true,
      enumerable: true,
    });

    return this;
  }

  /**
   * Restore a single property to its original value
   * @param key The property name to restore
   */
  restoreOne<K extends OverridesKeys>(key: K): void {
    const record = this.originalDescriptors.get(key);
    if (record?.descriptor) {
      Object.defineProperty(Overrides, key, record.descriptor);
      this.originalDescriptors.delete(key);
    }
  }

  /**
   * Restore all overridden properties to their original values
   */
  restore(): void {
    for (const [key, record] of this.originalDescriptors) {
      if (record.descriptor) {
        Object.defineProperty(Overrides, key, record.descriptor);
      }
    }
    this.originalDescriptors.clear();
  }

  /**
   * Check if a property is currently overridden
   */
  isOverridden<K extends OverridesKeys>(key: K): boolean {
    return this.originalDescriptors.has(key);
  }

  /**
   * Get the current value of an override (whether original or overridden)
   */
  get<K extends OverridesKeys>(key: K): (typeof Overrides)[K] {
    return Overrides[key];
  }

  /**
   * Batch override multiple properties at once
   * @param overrides Object containing key-value pairs to override
   */
  overrideMany(overrides: Partial<{ [K in OverridesKeys]: (typeof Overrides)[K] }>): this {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) {
        this.override(key as OverridesKeys, value as any);
      }
    }
    return this;
  }

  /**
   * Apply common RL training overrides
   * Sets up the game for fast headless training
   */
  applyRLDefaults(): this {
    return this.overrideMany({
      // Disable slow features
      BYPASS_TUTORIAL_SKIP_OVERRIDE: true,

      // Set starting conditions
      STARTING_WAVE_OVERRIDE: 1,
      STARTING_LEVEL_OVERRIDE: 5,
      STARTING_MONEY_OVERRIDE: 1000,

      // Disable mystery encounters for simpler training
      MYSTERY_ENCOUNTER_RATE_OVERRIDE: null,
    });
  }

  /**
   * Set starter Pokemon for training
   */
  setStarters(speciesId: number, level?: number): this {
    this.override("STARTER_SPECIES_OVERRIDE", speciesId);
    if (level !== undefined) {
      this.override("STARTING_LEVEL_OVERRIDE", level);
    }
    return this;
  }

  /**
   * Set enemy configuration for controlled training
   */
  setEnemy(speciesId: number, level?: number): this {
    this.override("ENEMY_SPECIES_OVERRIDE", speciesId);
    if (level !== undefined) {
      this.override("ENEMY_LEVEL_OVERRIDE", level);
    }
    return this;
  }

  /**
   * Set battle style (single/double)
   */
  setBattleStyle(style: "single" | "double"): this {
    return this.override("BATTLE_STYLE_OVERRIDE", style);
  }

  /**
   * Set a fixed seed for reproducibility
   */
  setSeed(seed: string): this {
    return this.override("SEED_OVERRIDE", seed);
  }
}

/**
 * Create a new RuntimeOverrides instance
 */
export function createRuntimeOverrides(): RuntimeOverrides {
  return new RuntimeOverrides();
}

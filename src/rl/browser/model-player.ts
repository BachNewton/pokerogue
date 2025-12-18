/**
 * Model Player for Browser
 *
 * Loads trained TensorFlow.js models and plays the game in browser.
 */

// biome-ignore lint/performance/noNamespaceImport: TensorFlow.js requires namespace import
import * as tf from "@tensorflow/tfjs";
import { encodeObservation } from "../training/observation-encoder";
import type { BattleObservation } from "../types";
import { ACTION_SPACE_SIZE, ActionType } from "../types";

/**
 * Model Player loads and runs trained models in the browser
 */
export class ModelPlayer {
  private actor: tf.LayersModel | null = null;
  private isLoaded = false;
  private lastActionProbs: Float32Array | null = null;

  /**
   * Load a trained model from a URL or path
   * @param modelPath Path to the model.json file (e.g., "/models/actor/model.json")
   */
  async loadModel(modelPath: string): Promise<void> {
    try {
      console.log(`Loading model from: ${modelPath}`);
      this.actor = await tf.loadLayersModel(modelPath);
      this.isLoaded = true;
      console.log("Model loaded successfully!");
    } catch (error) {
      console.error("Failed to load model:", error);
      throw error;
    }
  }

  /**
   * Check if a model is loaded
   */
  get loaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Select an action given a battle observation
   */
  selectAction(observation: BattleObservation): ActionType {
    if (!this.actor) {
      throw new Error("Model not loaded. Call loadModel() first.");
    }

    return tf.tidy(() => {
      // Encode observation
      const obsEncoded = encodeObservation(observation);
      const obsTensor = tf.tensor2d([Array.from(obsEncoded)]);

      // Get logits from model
      const logits = this.actor!.predict(obsTensor) as tf.Tensor2D;

      // Apply action mask
      const maskTensor = tf.tensor1d(observation.actionMask.map(v => (v ? 0 : -1e9)));
      const maskedLogits = logits.add(maskTensor.expandDims(0));

      // Get probabilities for display
      const probs = tf.softmax(maskedLogits);
      this.lastActionProbs = new Float32Array(probs.dataSync());

      // Select action with highest probability (greedy)
      const action = maskedLogits.argMax(1).dataSync()[0];

      return action as ActionType;
    });
  }

  /**
   * Sample an action (for more varied gameplay)
   */
  sampleAction(observation: BattleObservation, temperature = 1.0): ActionType {
    if (!this.actor) {
      throw new Error("Model not loaded. Call loadModel() first.");
    }

    return tf.tidy(() => {
      // Encode observation
      const obsEncoded = encodeObservation(observation);
      const obsTensor = tf.tensor2d([Array.from(obsEncoded)]);

      // Get logits from model
      const logits = this.actor!.predict(obsTensor) as tf.Tensor2D;

      // Apply action mask
      const maskTensor = tf.tensor1d(observation.actionMask.map(v => (v ? 0 : -1e9)));
      const maskedLogits = logits.add(maskTensor.expandDims(0));

      // Apply temperature
      const scaledLogits = maskedLogits.div(temperature);

      // Get probabilities
      const probs = tf.softmax(scaledLogits);
      this.lastActionProbs = new Float32Array(probs.dataSync());

      // Sample from distribution
      const action = tf.multinomial(probs as tf.Tensor2D, 1).dataSync()[0];

      return action as ActionType;
    });
  }

  /**
   * Get action probabilities from last selectAction/sampleAction call
   */
  getActionProbabilities(): Float32Array | null {
    return this.lastActionProbs;
  }

  /**
   * Get formatted action probabilities for display
   */
  getFormattedProbabilities(): { action: string; probability: number }[] {
    if (!this.lastActionProbs) {
      return [];
    }

    const result: { action: string; probability: number }[] = [];

    for (let i = 0; i < ACTION_SPACE_SIZE; i++) {
      result.push({
        action: describeActionType(i as ActionType),
        probability: this.lastActionProbs[i],
      });
    }

    // Sort by probability descending
    return result.sort((a, b) => b.probability - a.probability);
  }

  /**
   * Dispose of the model to free memory
   */
  dispose(): void {
    if (this.actor) {
      this.actor.dispose();
      this.actor = null;
      this.isLoaded = false;
    }
  }
}

/**
 * Get a human-readable description of an action type
 */
function describeActionType(action: ActionType): string {
  switch (action) {
    case ActionType.MOVE_0:
      return "Move 1";
    case ActionType.MOVE_1:
      return "Move 2";
    case ActionType.MOVE_2:
      return "Move 3";
    case ActionType.MOVE_3:
      return "Move 4";
    case ActionType.SWITCH_1:
      return "Switch to Pokemon 2";
    case ActionType.SWITCH_2:
      return "Switch to Pokemon 3";
    case ActionType.SWITCH_3:
      return "Switch to Pokemon 4";
    case ActionType.SWITCH_4:
      return "Switch to Pokemon 5";
    case ActionType.SWITCH_5:
      return "Switch to Pokemon 6";
    case ActionType.TERA_MOVE_0:
      return "Tera + Move 1";
    case ActionType.TERA_MOVE_1:
      return "Tera + Move 2";
    case ActionType.TERA_MOVE_2:
      return "Tera + Move 3";
    case ActionType.TERA_MOVE_3:
      return "Tera + Move 4";
    default:
      return `Unknown Action ${action}`;
  }
}

/**
 * Create a new ModelPlayer instance
 */
export function createModelPlayer(): ModelPlayer {
  return new ModelPlayer();
}

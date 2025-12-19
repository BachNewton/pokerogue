/**
 * PPO (Proximal Policy Optimization) Agent for PokeRogue
 *
 * Uses TensorFlow.js for neural network operations.
 */

// biome-ignore lint/performance/noNamespaceImport: TensorFlow.js requires namespace import
import * as tf from "@tensorflow/tfjs";
import { getActionSpaceSize, getObservationShape, OBSERVATION_SIZES } from "./observation-encoder";

/**
 * Configuration for the PPO agent
 */
export interface PPOConfig {
  /** Hidden layer sizes */
  hiddenLayers: number[];
  /** Learning rate */
  learningRate: number;
  /** Discount factor (gamma) */
  gamma: number;
  /** GAE lambda for advantage estimation */
  gaeLambda: number;
  /** Clip ratio for PPO objective */
  clipRatio: number;
  /** Value loss coefficient */
  valueLossCoef: number;
  /** Entropy bonus coefficient */
  entropyCoef: number;
  /** Max gradient norm for clipping */
  maxGradNorm: number;
  /** Number of epochs per update */
  epochs: number;
  /** Mini-batch size */
  batchSize: number;
}

/**
 * Default PPO configuration
 */
export const DEFAULT_PPO_CONFIG: PPOConfig = {
  hiddenLayers: [256, 256, 128],
  learningRate: 3e-4,
  gamma: 0.99,
  gaeLambda: 0.95,
  clipRatio: 0.2,
  valueLossCoef: 0.5,
  entropyCoef: 0.01,
  maxGradNorm: 0.5,
  epochs: 4,
  batchSize: 64,
};

/**
 * Experience tuple for training
 */
export interface Experience {
  observation: Float32Array;
  action: number;
  reward: number;
  nextObservation: Float32Array;
  done: boolean;
  logProb: number;
  value: number;
}

/**
 * Trajectory with computed advantages and returns
 */
export interface ProcessedTrajectory {
  observations: tf.Tensor2D;
  actions: tf.Tensor1D;
  oldLogProbs: tf.Tensor1D;
  advantages: tf.Tensor1D;
  returns: tf.Tensor1D;
  actionMasks: tf.Tensor2D;
}

/**
 * PPO Agent for PokeRogue battles
 */
export class PPOAgent {
  private actor: tf.LayersModel;
  private critic: tf.LayersModel;
  private readonly optimizer: tf.Optimizer;
  private config: PPOConfig;
  private readonly actionSize: number;
  private readonly observationSize: number;

  constructor(config: Partial<PPOConfig> = {}) {
    this.config = { ...DEFAULT_PPO_CONFIG, ...config };
    this.observationSize = OBSERVATION_SIZES.TOTAL_SIZE;
    this.actionSize = getActionSpaceSize();

    this.actor = this.buildActor();
    this.critic = this.buildCritic();
    this.optimizer = tf.train.adam(this.config.learningRate);
  }

  /**
   * Build the actor (policy) network
   */
  private buildActor(): tf.LayersModel {
    const input = tf.input({ shape: getObservationShape() });
    let x: tf.SymbolicTensor = input;

    // Hidden layers
    for (const units of this.config.hiddenLayers) {
      x = tf.layers
        .dense({
          units,
          activation: "relu",
          kernelInitializer: "heNormal",
        })
        .apply(x) as tf.SymbolicTensor;
    }

    // Output layer: action logits (no activation - will apply softmax during sampling)
    const output = tf.layers
      .dense({
        units: this.actionSize,
        activation: "linear",
        kernelInitializer: tf.initializers.glorotNormal({}),
      })
      .apply(x) as tf.SymbolicTensor;

    return tf.model({ inputs: input, outputs: output });
  }

  /**
   * Build the critic (value) network
   */
  private buildCritic(): tf.LayersModel {
    const input = tf.input({ shape: getObservationShape() });
    let x: tf.SymbolicTensor = input;

    // Hidden layers
    for (const units of this.config.hiddenLayers) {
      x = tf.layers
        .dense({
          units,
          activation: "relu",
          kernelInitializer: "heNormal",
        })
        .apply(x) as tf.SymbolicTensor;
    }

    // Output layer: single value estimate
    const output = tf.layers
      .dense({
        units: 1,
        activation: "linear",
        kernelInitializer: tf.initializers.glorotNormal({}),
      })
      .apply(x) as tf.SymbolicTensor;

    return tf.model({ inputs: input, outputs: output });
  }

  /**
   * Get action logits from observation
   */
  getLogits(observation: tf.Tensor2D): tf.Tensor2D {
    return this.actor.predict(observation) as tf.Tensor2D;
  }

  /**
   * Get value estimate from observation
   */
  getValue(observation: tf.Tensor2D): tf.Tensor1D {
    const value = this.critic.predict(observation) as tf.Tensor2D;
    return value.squeeze([1]);
  }

  /**
   * Select an action given an observation and action mask
   */
  selectAction(observation: Float32Array, actionMask: boolean[]): { action: number; logProb: number; value: number } {
    return tf.tidy(() => {
      const obsTensor = tf.tensor2d([Array.from(observation)]);

      // Get logits and apply mask
      const logits = this.getLogits(obsTensor);
      const maskTensor = tf.tensor1d(actionMask.map(v => (v ? 0 : -1e9)));
      const maskedLogits = logits.add(maskTensor.expandDims(0));

      // Sample from categorical distribution
      const probs = tf.softmax(maskedLogits);
      const action = tf.multinomial(probs as tf.Tensor2D, 1).dataSync()[0];

      // Compute log probability
      const logProbs = tf.logSoftmax(maskedLogits);
      const logProb = logProbs.gather([action], 1).dataSync()[0];

      // Get value estimate
      const value = this.getValue(obsTensor).dataSync()[0];

      return { action, logProb, value };
    });
  }

  /**
   * Get the action with highest probability (for evaluation)
   */
  selectBestAction(observation: Float32Array, actionMask: boolean[]): number {
    return tf.tidy(() => {
      const obsTensor = tf.tensor2d([Array.from(observation)]);

      // Get logits and apply mask
      const logits = this.getLogits(obsTensor);
      const maskTensor = tf.tensor1d(actionMask.map(v => (v ? 0 : -1e9)));
      const maskedLogits = logits.add(maskTensor.expandDims(0));

      // Return argmax
      return maskedLogits.argMax(1).dataSync()[0];
    });
  }

  /**
   * Get action probabilities for all actions
   */
  getActionProbabilities(observation: Float32Array, actionMask: boolean[]): Float32Array {
    return tf.tidy(() => {
      const obsTensor = tf.tensor2d([Array.from(observation)]);
      const logits = this.getLogits(obsTensor);
      const maskTensor = tf.tensor1d(actionMask.map(v => (v ? 0 : -1e9)));
      const maskedLogits = logits.add(maskTensor.expandDims(0));
      const probs = tf.softmax(maskedLogits);
      return new Float32Array(probs.dataSync());
    });
  }

  /**
   * Compute Generalized Advantage Estimation (GAE)
   */
  computeGAE(
    rewards: number[],
    values: number[],
    dones: boolean[],
    lastValue: number,
  ): { advantages: number[]; returns: number[] } {
    const { gamma, gaeLambda } = this.config;
    const advantages: number[] = [];
    const returns: number[] = [];

    let gae = 0;
    let nextValue = lastValue;

    // Process in reverse order
    for (let t = rewards.length - 1; t >= 0; t--) {
      const mask = dones[t] ? 0 : 1;
      const delta = rewards[t] + gamma * nextValue * mask - values[t];
      gae = delta + gamma * gaeLambda * mask * gae;

      advantages.unshift(gae);
      returns.unshift(gae + values[t]);

      nextValue = values[t];
    }

    return { advantages, returns };
  }

  /**
   * Update the policy and value networks using PPO
   */
  async update(
    experiences: Experience[],
    actionMasks: boolean[][],
  ): Promise<{ policyLoss: number; valueLoss: number; entropy: number }> {
    // Compute advantages and returns
    const rewards = experiences.map(e => e.reward);
    const values = experiences.map(e => e.value);
    const dones = experiences.map(e => e.done);
    // Handle edge case where arrays could be empty or .at(-1) returns undefined
    const lastDone = dones.at(-1) ?? true;
    const lastVal = values.at(-1) ?? 0;
    const lastValue = lastDone ? 0 : lastVal;

    const { advantages, returns } = this.computeGAE(rewards, values, dones, lastValue);

    // Normalize advantages
    const advMean = advantages.reduce((a, b) => a + b, 0) / advantages.length;
    const advStd = Math.sqrt(advantages.reduce((sum, a) => sum + (a - advMean) ** 2, 0) / advantages.length) + 1e-8;
    const normalizedAdvantages = advantages.map(a => (a - advMean) / advStd);

    // Prepare tensors
    const observations = tf.tensor2d(experiences.map(e => Array.from(e.observation)));
    const actions = tf.tensor1d(
      experiences.map(e => e.action),
      "int32",
    );
    const oldLogProbs = tf.tensor1d(experiences.map(e => e.logProb));
    const advantagesTensor = tf.tensor1d(normalizedAdvantages);
    const returnsTensor = tf.tensor1d(returns);
    const masksTensor = tf.tensor2d(actionMasks.map(m => m.map(v => (v ? 0 : -1e9))));

    let totalPolicyLoss = 0;
    let totalValueLoss = 0;
    let totalEntropy = 0;
    let updateCount = 0;

    // Multiple epochs of updates
    for (let epoch = 0; epoch < this.config.epochs; epoch++) {
      // Shuffle indices
      const indices = tf.util.createShuffledIndices(experiences.length);

      // Mini-batch updates
      for (let i = 0; i < experiences.length; i += this.config.batchSize) {
        const batchIndices = Array.from(indices.slice(i, Math.min(i + this.config.batchSize, experiences.length)));
        if (batchIndices.length === 0) {
          continue;
        }

        const losses = tf.tidy(() => {
          const batchObs = tf.gather(observations, batchIndices);
          const batchActions = tf.gather(actions, batchIndices);
          const batchOldLogProbs = tf.gather(oldLogProbs, batchIndices);
          const batchAdvantages = tf.gather(advantagesTensor, batchIndices);
          const batchReturns = tf.gather(returnsTensor, batchIndices);
          const batchMasks = tf.gather(masksTensor, batchIndices);

          // Compute gradients
          const { grads } = tf.variableGrads(() => {
            // Get current policy logits
            const logits = this.actor.predict(batchObs) as tf.Tensor2D;
            const maskedLogits = logits.add(batchMasks);
            const logProbs = tf.logSoftmax(maskedLogits);

            // Get log probs for taken actions
            const actionOneHot = tf.oneHot(batchActions, this.actionSize);
            const selectedLogProbs = logProbs.mul(actionOneHot).sum(1);

            // PPO objective
            const ratio = tf.exp(selectedLogProbs.sub(batchOldLogProbs));
            const clippedRatio = tf.clipByValue(ratio, 1 - this.config.clipRatio, 1 + this.config.clipRatio);

            const surrogate1 = ratio.mul(batchAdvantages);
            const surrogate2 = clippedRatio.mul(batchAdvantages);
            const policyLoss = tf.minimum(surrogate1, surrogate2).mean().neg();

            // Value loss
            const predictedValues = (this.critic.predict(batchObs) as tf.Tensor2D).squeeze([1]);
            const valueLoss = tf.losses.meanSquaredError(batchReturns, predictedValues);

            // Entropy bonus
            const probs = tf.softmax(maskedLogits);
            const entropy = probs.mul(logProbs).sum(1).mean().neg();

            // Total loss
            const totalLoss = policyLoss
              .add(valueLoss.mul(this.config.valueLossCoef))
              .sub(entropy.mul(this.config.entropyCoef));

            return totalLoss;
          });

          // Apply gradients
          this.optimizer.applyGradients(grads);

          // Compute individual losses for logging
          const logits = this.actor.predict(batchObs) as tf.Tensor2D;
          const maskedLogits = logits.add(batchMasks);
          const logProbs = tf.logSoftmax(maskedLogits);
          const probs = tf.softmax(maskedLogits);

          const actionOneHot = tf.oneHot(batchActions, this.actionSize);
          const selectedLogProbs = logProbs.mul(actionOneHot).sum(1);

          const ratio = tf.exp(selectedLogProbs.sub(batchOldLogProbs));
          const clippedRatio = tf.clipByValue(ratio, 1 - this.config.clipRatio, 1 + this.config.clipRatio);
          const surrogate1 = ratio.mul(batchAdvantages);
          const surrogate2 = clippedRatio.mul(batchAdvantages);
          const policyLoss = tf.minimum(surrogate1, surrogate2).mean().neg();

          const criticValues = (this.critic.predict(batchObs) as tf.Tensor2D).squeeze([1]);
          const valueLoss = tf.losses.meanSquaredError(batchReturns, criticValues);

          const entropy = probs.mul(logProbs).sum(1).mean().neg();

          return {
            policyLoss: policyLoss.dataSync()[0],
            valueLoss: (valueLoss as tf.Tensor).dataSync()[0],
            entropy: entropy.dataSync()[0],
          };
        });

        totalPolicyLoss += losses.policyLoss;
        totalValueLoss += losses.valueLoss;
        totalEntropy += losses.entropy;
        updateCount++;
      }
    }

    // Cleanup tensors
    observations.dispose();
    actions.dispose();
    oldLogProbs.dispose();
    advantagesTensor.dispose();
    returnsTensor.dispose();
    masksTensor.dispose();

    return {
      policyLoss: totalPolicyLoss / updateCount,
      valueLoss: totalValueLoss / updateCount,
      entropy: totalEntropy / updateCount,
    };
  }

  /**
   * Save the model to disk
   */
  async save(path: string): Promise<void> {
    const { pathToFileURL } = await import("node:url");
    const fs = await import("node:fs");

    // Ensure directories exist
    fs.mkdirSync(`${path}/actor`, { recursive: true });
    fs.mkdirSync(`${path}/critic`, { recursive: true });

    // Use pathToFileURL for cross-platform compatibility (Windows drive letters, etc.)
    const actorUrl = pathToFileURL(`${path}/actor`).href;
    const criticUrl = pathToFileURL(`${path}/critic`).href;

    await this.actor.save(actorUrl);
    await this.critic.save(criticUrl);

    // Save config
    fs.writeFileSync(`${path}/config.json`, JSON.stringify(this.config, null, 2));
  }

  /**
   * Load the model from disk
   */
  async load(path: string): Promise<void> {
    const { pathToFileURL } = await import("node:url");

    // Use pathToFileURL for cross-platform compatibility
    const actorUrl = pathToFileURL(`${path}/actor/model.json`).href;
    const criticUrl = pathToFileURL(`${path}/critic/model.json`).href;

    this.actor = await tf.loadLayersModel(actorUrl);
    this.critic = await tf.loadLayersModel(criticUrl);

    // Load config
    const fs = await import("node:fs");
    if (fs.existsSync(`${path}/config.json`)) {
      const configJson = fs.readFileSync(`${path}/config.json`, "utf-8");
      this.config = { ...DEFAULT_PPO_CONFIG, ...JSON.parse(configJson) };
    }
  }

  /**
   * Get model summary
   */
  summary(): void {
    console.log("=== Actor Network ===");
    this.actor.summary();
    console.log("\n=== Critic Network ===");
    this.critic.summary();
  }

  /**
   * Dispose of the model to free memory
   */
  dispose(): void {
    this.actor.dispose();
    this.critic.dispose();
  }
}

/**
 * Create a new PPO agent
 */
export function createPPOAgent(config: Partial<PPOConfig> = {}): PPOAgent {
  return new PPOAgent(config);
}

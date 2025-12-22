#!/usr/bin/env node
/**
 * Training CLI
 *
 * Command-line interface for training PokeRogue RL agents.
 *
 * Usage:
 *   npm run train -- --steps 100000 --checkpoint-interval 10000
 *   npm run train -- --resume checkpoints/checkpoint-50000
 *   npm run train -- --gpu
 */

import type { SpeciesId } from "#enums/species-id";
import { Command } from "commander";
import { setRLDebug } from "../debug";
import { createTrainer, type TrainerConfig } from "./trainer";

const program = new Command();

program.name("pokerogue-train").description("Train a PokeRogue RL agent").version("1.0.0");

program
  .option("-s, --steps <number>", "Total training steps", "100000")
  .option("-u, --update-interval <number>", "Steps between policy updates", "2048")
  .option("-c, --checkpoint-interval <number>", "Steps between checkpoints", "10000")
  .option("-d, --checkpoint-dir <path>", "Directory for checkpoints", "./checkpoints")
  .option("-r, --resume <path>", "Resume from checkpoint")
  .option("-g, --gpu", "Use GPU for training (requires CUDA)")
  .option("--seed <string>", "Random seed for reproducibility")
  .option("--lr <number>", "Learning rate", "0.0003")
  .option("--gamma <number>", "Discount factor", "0.99")
  .option("--clip-ratio <number>", "PPO clip ratio", "0.2")
  .option("--epochs <number>", "PPO epochs per update", "4")
  .option("--batch-size <number>", "Mini-batch size", "64")
  .option("--log-interval <number>", "Steps between log outputs", "100")
  .option("--no-curriculum", "Disable curriculum learning")
  .option("--starters <ids>", "Starter Pokemon species IDs (comma-separated)", "6,9,3")
  .option("-v, --verbose", "Enable verbose output")
  .option("--debug", "Enable verbose RL debug logging")
  .option("--tensorboard-dir <path>", "TensorBoard log directory", "./tensorboard_logs")
  .option("--no-tensorboard", "Disable TensorBoard logging")
  .option("--profile", "Enable performance profiling");

export async function main() {
  program.parse();
  const opts = program.opts();

  // Enable debug logging if requested
  if (opts.debug) {
    setRLDebug(true);
  }

  // Setup TensorFlow backend
  if (opts.gpu) {
    try {
      await import("@tensorflow/tfjs-node-gpu");
    } catch {
      try {
        await import("@tensorflow/tfjs-node");
      } catch {
        console.warn("Native TF unavailable, using pure JS");
        await import("@tensorflow/tfjs");
      }
    }
  } else {
    try {
      await import("@tensorflow/tfjs-node");
    } catch {
      console.warn("Native TF unavailable, using pure JS");
      await import("@tensorflow/tfjs");
    }
  }

  // Parse starter Pokemon
  const starters = opts.starters.split(",").map((id: string) => {
    const num = Number.parseInt(id.trim(), 10);
    return num as SpeciesId;
  });

  // Build trainer config
  const config: Partial<TrainerConfig> = {
    totalSteps: Number.parseInt(opts.steps, 10),
    updateInterval: Number.parseInt(opts.updateInterval, 10),
    checkpointInterval: Number.parseInt(opts.checkpointInterval, 10),
    checkpointDir: opts.checkpointDir,
    seed: opts.seed,
    useCurriculum: opts.curriculum !== false,
    logInterval: Number.parseInt(opts.logInterval, 10),
    starters,
    ppoConfig: {
      learningRate: Number.parseFloat(opts.lr),
      gamma: Number.parseFloat(opts.gamma),
      clipRatio: Number.parseFloat(opts.clipRatio),
      epochs: Number.parseInt(opts.epochs, 10),
      batchSize: Number.parseInt(opts.batchSize, 10),
    },
    tensorboard: {
      enabled: opts.tensorboard !== false,
      logDir: opts.tensorboardDir,
    },
    profile: opts.profile ?? false,
  };

  if (opts.verbose) {
    console.log("Configuration:", JSON.stringify(config, null, 2));
  }

  // Create trainer
  const trainer = createTrainer(config);

  // Resume from checkpoint if specified
  if (opts.resume) {
    console.log(`Resuming from checkpoint: ${opts.resume}`);
    await trainer.loadCheckpoint(opts.resume);
  }

  // Handle graceful shutdown
  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    console.log("\nShutting down...");
    try {
      await (trainer as any).saveCheckpoint();
    } catch (error) {
      console.error("Checkpoint save failed:", error);
    }

    trainer.dispose();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start training
  try {
    await trainer.train();
  } catch (error) {
    console.error("Training failed:", error);
    process.exit(1);
  }

  trainer.dispose();
}

// Run if executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("cli.ts")) {
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

/**
 * Training Module Exports
 *
 * Provides all training-related functionality for PokeRogue RL.
 */

// Curriculum
// biome-ignore lint/performance/noBarrelFile: Intentional re-export module
export {
  CurriculumManager,
  type CurriculumStage,
  createCurriculumManager,
  DEFAULT_CURRICULUM,
  type EpisodeResult,
  type GraduationCriteria,
} from "./curriculum";
// Metrics
export {
  createMetricsLogger,
  formatDuration,
  type MetricsConfig,
  MetricsLogger,
  type StepMetrics,
} from "./metrics";
// Model
export {
  createPPOAgent,
  DEFAULT_PPO_CONFIG,
  type Experience,
  PPOAgent,
  type PPOConfig,
  type ProcessedTrajectory,
} from "./model";
// Observation Encoder
export {
  describeAction,
  encodeActionMask,
  encodeActionMaskBinary,
  encodeBattleState,
  encodeMove,
  encodeObservation,
  encodePokemon,
  getActionSpaceSize,
  getObservationShape,
  OBSERVATION_SIZES,
} from "./observation-encoder";
// Replay Buffer
export {
  createEpisodeTracker,
  createTrajectoryBuffer,
  EpisodeTracker,
  TrajectoryBuffer,
} from "./replay-buffer";
// Trainer
export {
  type Checkpoint,
  createTrainer,
  DEFAULT_TRAINER_CONFIG,
  RLTrainer,
  type TrainerConfig,
  train,
} from "./trainer";

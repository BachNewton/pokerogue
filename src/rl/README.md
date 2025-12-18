# PokeRogue RL Environment

A complete reinforcement learning infrastructure for training AI agents to play PokeRogue.

## Features

- **Headless Training**: Train models without rendering using TensorFlow.js
- **PPO Algorithm**: Proximal Policy Optimization with action masking
- **Curriculum Learning**: Gradual difficulty progression from single battles to full runs
- **Visual Playback**: Watch trained models play in the browser
- **Console Metrics**: Real-time training progress logging
- **Checkpointing**: Save and resume training

## Quick Start

### Installation

```bash
# Install dependencies
pnpm install
```

### Training

```bash
# Start training with default settings
pnpm train

# Train with GPU acceleration (requires CUDA)
pnpm train:gpu

# Custom training configuration
pnpm train -- --steps 100000 --checkpoint-interval 10000

# Resume from checkpoint
pnpm train -- --resume checkpoints/checkpoint-50000
```

### CLI Options

```
Options:
  -s, --steps <number>             Total training steps (default: "100000")
  -u, --update-interval <number>   Steps between policy updates (default: "2048")
  -c, --checkpoint-interval <n>    Steps between checkpoints (default: "10000")
  -d, --checkpoint-dir <path>      Directory for checkpoints (default: "./checkpoints")
  -r, --resume <path>              Resume from checkpoint
  -g, --gpu                        Use GPU for training (requires CUDA)
  --seed <string>                  Random seed for reproducibility
  --lr <number>                    Learning rate (default: "0.0003")
  --gamma <number>                 Discount factor (default: "0.99")
  --clip-ratio <number>            PPO clip ratio (default: "0.2")
  --epochs <number>                PPO epochs per update (default: "4")
  --batch-size <number>            Mini-batch size (default: "64")
  --log-interval <number>          Steps between log outputs (default: "100")
  --no-curriculum                  Disable curriculum learning
  --starters <ids>                 Starter Pokemon species IDs (default: "6,9,3")
  -v, --verbose                    Enable verbose output
```

## Architecture

```
src/rl/
├── headless/                      # Headless game infrastructure
│   ├── runtime-overrides.ts       # Override system (replaces vitest mocks)
│   ├── headless-mocks.ts          # Phaser/audio/tween mocks
│   ├── headless-game-manager.ts   # Main headless manager
│   └── index.ts                   # Exports
├── training/                      # Training infrastructure
│   ├── cli.ts                     # Command-line interface
│   ├── trainer.ts                 # Main training loop
│   ├── model.ts                   # PPO neural network
│   ├── observation-encoder.ts     # Obs → Float32Array
│   ├── replay-buffer.ts           # Experience storage
│   ├── curriculum.ts              # Stage progression
│   ├── metrics.ts                 # Logging utilities
│   └── index.ts                   # Exports
├── browser/                       # Visual playback
│   ├── model-player.ts            # Load & run trained model
│   ├── visual-controller.ts       # Game UI integration
│   └── index.ts                   # Exports
├── types.ts                       # Type definitions
├── observation.ts                 # State extraction
├── action.ts                      # Action translation
├── reward.ts                      # Reward calculation
├── auto-pilot.ts                  # Non-battle phase handlers
├── battle-controller.ts           # Core RL loop
├── environment.ts                 # Gym-like API
└── index.ts                       # Public API
```

## Curriculum Learning Stages

1. **basic_single_battle**: Fixed opponent, 80% win rate to advance (1000 episodes)
2. **varied_opponents**: Random starters, 70% win rate to advance (5000 episodes)
3. **wave_progression**: Full runs up to wave 10, avg 8 waves to advance (10000 episodes)
4. **full_run**: Full runs up to wave 200, avg 50 waves to advance (50000 episodes)

## Observation Space

The agent observes:
- 6 player Pokemon × 55 features each (stats, moves, status, tera, etc.)
- 6 enemy Pokemon × 55 features each
- Battle state (weather, terrain, turn, wave)
- Total: 668 features

## Action Space

13 discrete actions:
- `MOVE_0` to `MOVE_3`: Use move at index
- `SWITCH_1` to `SWITCH_5`: Switch to party Pokemon
- `TERA_MOVE_0` to `TERA_MOVE_3`: Terastallize + use move

Invalid actions are masked with action masking.

## Visual Playback (Browser)

After training, load the model in the browser:

```typescript
import { getVisualController } from "#app/rl/browser";

// Initialize with trained model
const controller = getVisualController();
await controller.initialize("/path/to/model/actor/model.json");

// Enable AI control
controller.setEnabled(true);
controller.setSpeed(1.0); // 1x speed

// Start auto-play
await controller.startAutoPlay();
```

## API Usage

### Programmatic Training

```typescript
import { createTrainer } from "#app/rl/training";

const trainer = createTrainer({
  totalSteps: 100000,
  checkpointInterval: 10000,
  starters: [6, 9, 3], // Charizard, Blastoise, Venusaur
});

await trainer.train();

// Get the trained agent
const agent = trainer.getAgent();
await agent.save("./my-model");
```

### Using the Environment Directly

```typescript
import { createHeadlessGameManager } from "#app/rl/headless";
import { encodeObservation } from "#app/rl/training";

const manager = await createHeadlessGameManager();
const controller = manager.createBattleController();

await manager.startBattle({ species: [6, 9, 3] });
const obs = await controller.reset();

while (controller.isAwaitingDecision()) {
  const encoded = encodeObservation(obs);
  const action = selectAction(encoded, obs.actionMask);
  const result = await controller.step(action);

  if (result.terminated || result.truncated) break;
}
```

## Requirements

- Node.js >= 24.9.0
- pnpm
- TensorFlow.js (CPU or GPU)
- For GPU training: NVIDIA GPU with CUDA

## Training Output

During training, you'll see console output like:

```
================================================================================
🚀 Starting PokeRogue RL Training
================================================================================
Total Steps: 100,000
Log Interval: 100
Rolling Window: 100
================================================================================

Step:      100 | Ep:      5 | Stage: basic_single_battle  | Reward:     1.23 | WinRate:  20.0% | Waves:   1.0 | SPS:   150
Step:      200 | Ep:     10 | Stage: basic_single_battle  | Reward:     2.45 | WinRate:  40.0% | Waves:   1.0 | SPS:   148
...
💾 Checkpoint saved: ./checkpoints/checkpoint-10000 (step 10000)
...
🎓 Graduated from "basic_single_battle" to "varied_opponents"!
```

## Reward Configuration

Default rewards:
- Enemy KO: +1.0
- Player faint: -1.0
- Battle won: +5.0
- Battle lost: -5.0
- Wave progression: +0.5
- Turn penalty: -0.01
- Damage dealt: +0.01 per % HP
- Damage taken: -0.01 per % HP

Customize via `RewardShaping` presets:
- `RewardShaping.survivalFocused()`: Emphasizes staying alive
- `RewardShaping.aggressiveFocused()`: Emphasizes KOs
- `RewardShaping.efficiencyFocused()`: Emphasizes quick wins
- `RewardShaping.sparse()`: Only win/lose matters

## Development Status

### Completed
- Headless infrastructure (runtime-overrides, headless-mocks, headless-game-manager)
- Training infrastructure (model, trainer, observation-encoder, curriculum, metrics, cli)
- Environment setup with browser globals (JSDOM, Phaser mocks, rex-plugins mocks)
- ESM loader for Vite import transforms (`?raw`, `?url`)
- TensorFlow.js integration (CPU backend, GPU optional)
- BattleStyle.SET to skip switch prompts during training

### In Progress
- Full training loop execution and debugging
- Action execution within CommandPhase

### Known Issues
- `i18next.use()` warning during initialization (non-blocking)
- TensorFlow.js native binding not available (falls back to pure JS, slower)
- Many "variant icon does not exist" warnings (cosmetic, doesn't affect training)

### Next Steps
1. Debug and fix the `runToNextDecisionPoint` loop if actions aren't executing
2. Verify training completes 100 steps successfully
3. Test curriculum stage progression
4. Add model checkpointing verification
5. Browser visual playback integration testing

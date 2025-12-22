# PokeRogue RL Environment

A complete reinforcement learning infrastructure for training AI agents to play PokeRogue.

## Features

- **Headless Training**: Train models without rendering using TensorFlow.js
- **PPO Algorithm**: Proximal Policy Optimization with action masking
- **Curriculum Learning**: Gradual difficulty progression from single battles to full runs
- **Visual Playback**: Watch trained models play in the browser (F10 overlay)
- **TensorBoard Logging**: Track training metrics (loss, reward, win rate)
- **Performance Profiling**: Identify bottlenecks with `--profile` flag
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
  --tensorboard-dir <path>         TensorBoard log directory (default: "./tensorboard_logs")
  --no-tensorboard                 Disable TensorBoard logging
  --profile                        Enable performance profiling
  --debug                          Enable verbose RL debug logging
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
│   ├── tensorboard.ts             # TensorBoard logging
│   ├── profiler.ts                # Performance profiling
│   └── index.ts                   # Exports
├── browser/                       # Visual playback
│   ├── model-player.ts            # Load & run trained model
│   ├── visual-controller.ts       # Game UI integration
│   ├── ai-overlay.ts              # Browser UI overlay (F10)
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
- Battle state (weather, terrain, turn, wave, decision type)
- Total: 672 features

## Decision Types

The agent handles 4 distinct decision points during battle:

| Type | Phase | Description |
|------|-------|-------------|
| `COMMAND` | CommandPhase | Choose move, switch, or tera+move |
| `CHECK_SWITCH` | CheckSwitchPhase | Optional switch after KO (yes/no) |
| `SWITCH` | SwitchPhase | Forced switch - select replacement Pokemon |
| `TARGET` | SelectTargetPhase | Choose target in doubles battles |

## Action Space

25 discrete actions across 4 decision types:

**COMMAND (0-12)** - Regular battle commands:
- `MOVE_0` to `MOVE_3`: Use move at index
- `SWITCH_1` to `SWITCH_5`: Switch to party Pokemon
- `TERA_MOVE_0` to `TERA_MOVE_3`: Terastallize + use move

**SWITCH (13-18)** - Forced switch slot selection:
- `SWITCH_SLOT_0` to `SWITCH_SLOT_5`: Select party slot

**TARGET (19-22)** - Target selection in doubles:
- `TARGET_PLAYER`: Target ally slot 0
- `TARGET_PLAYER_2`: Target ally slot 1
- `TARGET_ENEMY`: Target enemy slot 0
- `TARGET_ENEMY_2`: Target enemy slot 1

**CHECK_SWITCH (23-24)** - Optional switch prompt:
- `CHECK_SWITCH_NO`: Decline optional switch
- `CHECK_SWITCH_YES`: Accept switch (triggers SWITCH decision)

Invalid actions are masked per decision type.

## Visual Playback (Browser)

After training, you can watch the AI play in the browser using the normal game UI.

### Using the AI Overlay (Recommended)

Press **F10** during gameplay to toggle the AI playback overlay. The overlay provides:
- **Load Model**: Load a trained model.json file
- **Start/Stop AI**: Toggle AI control on/off
- **Speed Control**: Adjust playback speed (0.25x to 5x)

The AI plays through the normal game interface - you'll see all moves, switches, and animations just like human gameplay.

### Programmatic Control

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

## TensorBoard Logging

Training metrics are logged to `./tensorboard_logs/` by default. View the logs:

```bash
# Using a simple JSON viewer (logs are in JSONL format)
cat tensorboard_logs/run-*/scalars.jsonl

# Or use the built-in chart printer
node -e "const {readScalarEvents, printScalarChart, groupEventsByTag} = require('./src/rl/training/tensorboard'); const events = readScalarEvents('./tensorboard_logs/run-1234/scalars.jsonl'); const grouped = groupEventsByTag(events); printScalarChart('reward/mean', grouped.get('reward/mean'));"
```

Tracked metrics:
- `reward/mean` - Rolling average episode reward
- `performance/win_rate` - Win rate percentage
- `performance/avg_waves` - Average waves reached
- `loss/policy` - Policy gradient loss
- `loss/value` - Value function loss
- `loss/entropy` - Entropy bonus
- `curriculum/stage` - Current curriculum stage index

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

## Performance Profiling

Run training with the `--profile` flag to collect timing statistics:

```bash
pnpm train --steps 1000 --profile
```

At the end of training, you'll see a report like:

```
================================================================================
PROFILING REPORT
================================================================================

Total Time: 120.5s
Steps Profiled: 1000
Avg Step Time: 120.50ms
Steps/Second: 8.3

--- Timing Breakdown ---
Section                      Count   Total(ms)   Avg(ms)       %
-----------------------------------------------------------------
env_step                      1000     95000.0     95.00    78.8%
action_selection              1000     15000.0     15.00    12.4%
encode_observation            1000      8000.0      8.00     6.6%
policy_update                    5      2500.0    500.00     2.1%

--- Memory Usage ---
Heap: 512.3MB / 1024.0MB
Heap Growth: 50.2MB
Tensors: 150 (25.5MB)
================================================================================
```

This helps identify bottlenecks for optimization.

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

Step:       25 | Ep:      5 | Stage: basic_single_battle  | Reward:     5.94 | WinRate: 100.0% | Waves:   2.2 | SPS:     3
Step:       50 | Ep:     10 | Stage: basic_single_battle  | Reward:     5.65 | WinRate: 100.0% | Waves:   2.4 | SPS:     3
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
- TensorFlow.js integration with native addon (CPU backend working, GPU optional)
- BattleStyle.SET to skip switch prompts during training
- Full training loop execution (actions execute correctly)
- Episode retry logic and graceful error handling
- Cross-platform file path handling for checkpoints (Windows compatible)
- PhaseInterceptor integration for proper phase execution in headless mode
- Node.js 24+ compatibility (util.isNullOrUndefined polyfill)
- Action masking with fallback validation to prevent invalid action selection
- Moveset generation via STARTER_SPECIES_OVERRIDE
- TensorBoard logging (basic scalars: loss, reward, win rate, curriculum stage)
- Browser AI playback overlay (load models, start/stop AI, speed control via F10 key)
- Performance profiling instrumentation (`--profile` CLI flag)
- **Multi-decision architecture**: 4 decision types (COMMAND, CHECK_SWITCH, SWITCH, TARGET)
- **25-action space**: Expanded from 13 to support all decision types
- **Phase timeout fix**: Fast polling replaces 10s timeouts (100-300x speedup)
- CheckSwitchPhase, SwitchPhase, SelectTargetPhase as RL decision points
- **Episode completion**: Proper victory detection and episode reset
- **Debug logging system**: `--debug` flag for verbose phase/action logging

### Known Issues
- `i18next.use()` warning during initialization (non-blocking)
- "Texture not found" warnings (cosmetic, doesn't affect training)
- Some phase timeouts (500ms) on SwitchSummonPhase/NextEncounterPhase limit SPS to ~3

### Next Steps
1. Test curriculum stage progression with extended training runs
2. Browser visual playback integration testing with trained models
3. Hyperparameter tuning for better learning
4. Performance optimization based on profiling results
5. Double battle support testing

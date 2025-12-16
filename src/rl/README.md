# PokeRogue RL Environment - Development Status

## Current State

The core RL infrastructure is complete and tested. The following components are working:

### Completed Components

| File | Description | Status |
|------|-------------|--------|
| `types.ts` | Type definitions for observations, actions, rewards, configs | Done |
| `observation.ts` | Extracts game state into structured observations | Done |
| `action.ts` | Translates RL actions (0-12) to game commands | Done |
| `reward.ts` | Calculates rewards based on state changes | Done |
| `auto-pilot.ts` | Handles non-battle phases automatically | Done |
| `battle-controller.ts` | Core controller for RL interaction loop | Done |
| `environment.ts` | Gym-like API (reset/step) | Done |
| `index.ts` | Public exports | Done |

### Test Coverage

All 16 tests pass in `test/rl/environment.test.ts`:
- Observation extraction (Pokemon, moves, battle state)
- Action masking (valid/invalid actions)
- Action translation
- Reward calculation
- Integration with game

## What Needs To Be Done Next

### 1. HeadlessGameManager (High Priority)

**Goal**: Create a standalone game manager that can initialize and run PokeRogue without the test framework.

**Current Limitation**: The `BattleController` assumes it's running within an existing headless Phaser context (like vitest tests). To train RL agents independently, we need to:

1. **Adapt `test/test-utils/game-wrapper.ts`** for non-test use:
   - Remove vitest (`vi.spyOn`) dependencies
   - Create standalone mocks for Phaser rendering, sound, tweens
   - Handle asset loading without vitest mocks

2. **Adapt `test/test-utils/phase-interceptor.ts`**:
   - Remove vitest dependencies
   - Create standalone phase interception mechanism
   - Expose clean async API for waiting on phases

3. **Create `src/rl/headless-game-manager.ts`**:
   ```typescript
   class HeadlessGameManager {
     async initialize(): Promise<void>
     async startBattle(starters: number[]): Promise<void>
     async reset(config: ResetConfig): Promise<BattleObservation>
     onNextPrompt(phase, mode, callback): void
   }
   ```

**Key files to reference**:
- `test/test-utils/game-manager.ts` - Main template
- `test/test-utils/game-wrapper.ts` - Phaser mocking
- `test/test-utils/phase-interceptor.ts` - Phase control
- `test/test-utils/helpers/overrides-helper.ts` - Game configuration

### 2. Wire Up BattleController to HeadlessGameManager

Once HeadlessGameManager exists:

1. Update `BattleController.reset()` to:
   - Initialize fresh game instance
   - Configure starters and game mode
   - Run to first `CommandPhase`

2. Update `BattleController.runToNextDecisionPoint()` to:
   - Use phase interceptor for proper async phase handling
   - Handle edge cases (double battles, forced switches)

### 3. Python Bindings (Optional)

For integration with Python RL frameworks (Stable-Baselines3, RLlib):

**Option A: Subprocess with JSON IPC**
```python
# Python side
import subprocess
import json

class PokeRogueEnv:
    def __init__(self):
        self.process = subprocess.Popen(['node', 'rl-server.js'], ...)

    def step(self, action):
        self.process.stdin.write(json.dumps({'action': action}))
        return json.loads(self.process.stdout.readline())
```

**Option B: WebSocket Server**
- Create `src/rl/server.ts` that exposes WebSocket API
- Python client connects and sends/receives JSON messages

**Option C: Direct Node.js Training**
- Use TensorFlow.js or ONNX Runtime for training in Node.js
- Export trained model to Python later if needed

### 4. Performance Optimization

For fast training:

1. **Disable all unnecessary processing**:
   - Animations (already mocked)
   - Sound (already mocked)
   - UI updates where possible

2. **Batch environment resets**:
   - Reuse game instances when possible
   - Only do full reset periodically

3. **Vectorized environments**:
   - `VectorizedRLEnvironment` class exists but needs testing
   - May need process isolation for true parallelism

### 5. Training Infrastructure

1. **Logging and metrics**:
   - Episode rewards
   - Win rate
   - Average episode length
   - Action distribution

2. **Checkpointing**:
   - Save/load model weights
   - Resume training from checkpoint

3. **Curriculum learning**:
   - Start with weak enemies
   - Gradually increase difficulty
   - Use `RewardShaping` presets

## Quick Start (Current State)

The RL components work within the test framework:

```typescript
// In a vitest test file
import { GameManager } from "#test/test-utils/game-manager";
import { extractBattleObservation, computeActionMask, ActionType } from "#app/rl/observation";

const game = new GameManager(phaserGame);
await game.classicMode.startBattle([SpeciesId.CHARIZARD]);

// Get observation
const obs = extractBattleObservation(0);

// Get valid actions
const mask = computeActionMask(0);
const validActions = mask.map((v, i) => v ? i : -1).filter(i => i >= 0);

// Execute action using game helpers
game.move.select(MoveId.TACKLE);
await game.toEndOfTurn();

// Get new observation
const newObs = extractBattleObservation(0);
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Training Script                          │
│  (Python with Stable-Baselines3 or Node.js with TF.js)      │
└─────────────────────────┬───────────────────────────────────┘
                          │ reset() / step(action)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    RLEnvironment                             │
│  - Gym-like API                                              │
│  - Episode management                                        │
│  - Observation/action space definitions                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   BattleController                           │
│  - Phase interception                                        │
│  - Command execution                                         │
│  - Auto-pilot for non-battle phases                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              HeadlessGameManager (TODO)                      │
│  - Headless Phaser initialization                           │
│  - Game state management                                     │
│  - Phase interceptor integration                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 PokeRogue Game Logic                         │
│  - BattleScene, PhaseManager                                │
│  - Pokemon, Moves, Abilities                                │
│  - All existing game code (unmodified)                      │
└─────────────────────────────────────────────────────────────┘
```

## File Locations

```
src/rl/
├── README.md              # This file
├── index.ts               # Public exports
├── types.ts               # Type definitions
├── observation.ts         # State extraction
├── action.ts              # Action translation
├── reward.ts              # Reward calculation
├── auto-pilot.ts          # Non-battle phase handlers
├── battle-controller.ts   # Core RL loop
└── environment.ts         # Gym-like API

test/rl/
└── environment.test.ts    # Unit tests

# Key reference files:
test/test-utils/
├── game-manager.ts        # Template for HeadlessGameManager
├── game-wrapper.ts        # Phaser mocking reference
└── phase-interceptor.ts   # Phase control reference
```

/**
 * Headless Mocks for RL Training
 *
 * Provides mock implementations for Phaser components to enable headless game execution.
 * Ported from test/test-utils without vitest dependencies.
 */

import { BattleScene } from "#app/battle-scene";
import { MoveAnim } from "#data/battle-anims";
import { Pokemon } from "#field/pokemon";
import { version } from "#package.json";
// Import existing mock classes from test utilities (they don't depend on vitest)
import { MockClock } from "#test/test-utils/mocks/mock-clock";
import { MockGameObjectCreator } from "#test/test-utils/mocks/mock-game-object-creator";
import { MockLoader } from "#test/test-utils/mocks/mock-loader";
import { MockTextureManager } from "#test/test-utils/mocks/mock-texture-manager";
import { MockTimedEventManager } from "#test/test-utils/mocks/mock-timed-event-manager";
import { MockContainer } from "#test/test-utils/mocks/mocks-container/mock-container";
import { PokedexMonContainer } from "#ui/pokedex-mon-container";
import fs from "node:fs";
import Phaser from "phaser";

const InputManager = Phaser.Input.InputManager;
const KeyboardManager = Phaser.Input.Keyboard.KeyboardManager;
const KeyboardPlugin = Phaser.Input.Keyboard.KeyboardPlugin;
const GamepadPlugin = Phaser.Input.Gamepad.GamepadPlugin;
const EventEmitter = Phaser.Events.EventEmitter;
const UpdateList = Phaser.GameObjects.UpdateList;

/**
 * Configuration for headless game initialization
 */
export interface HeadlessMocksConfig {
  /** Random seed for reproducibility */
  seed?: string;
  /** Base path for assets */
  assetsPath?: string;
}

/**
 * Injects all required mocks into a BattleScene for headless operation.
 * This is the standalone equivalent of GameWrapper.injectMandatory().
 */
export function injectHeadlessMocks(game: Phaser.Game, scene: BattleScene, config: HeadlessMocksConfig = {}): void {
  const seed = config.seed ?? "rl-training";
  const assetsPath = config.assetsPath ?? "assets";

  // Seed the RNG for reproducibility
  Phaser.Math.RND.sow([seed]);

  // Mock prototype methods that would cause issues in headless mode
  MoveAnim.prototype.getAnim = () => ({
    frames: {},
  });
  Pokemon.prototype.enableMask = () => null;
  Pokemon.prototype.updateFusionPalette = () => null;
  Pokemon.prototype.cry = () => null;
  Pokemon.prototype.faintCry = cb => {
    if (cb) {
      cb();
    }
  };
  (BattleScene.prototype as any).addPokemonIcon = function () {
    return new Phaser.GameObjects.Container(this);
  };

  // Mock PokedexMonContainer.remove
  PokedexMonContainer.prototype.remove = MockContainer.prototype.remove;

  // Configure the game
  (game.config as any) = {
    seed: [seed],
    gameVersion: version,
  };

  scene.game = game;

  // Mock renderer (WebGL stub)
  (game as any).renderer = {
    maxTextures: -1,
    gl: {},
    deleteTexture: () => null,
    canvasToTexture: () => ({}),
    createCanvasTexture: () => ({}),
    pipelines: {
      add: () => null,
    },
  };
  (scene as any).renderer = game.renderer;

  // Mock children
  (scene as any).children = {
    removeAll: () => null,
  };

  // Mock sound system (completely disabled)
  (scene as any).sound = {
    play: () => null,
    pause: () => null,
    setRate: () => null,
    add: () => scene.sound,
    get: () => ({ ...(scene.sound as any), totalDuration: 0 }),
    getAllPlaying: () => [],
    manager: {
      game,
    },
    destroy: () => null,
    setVolume: () => null,
    stop: () => null,
    stopByKey: () => null,
    on: (_evt: string, callback: () => void) => callback(),
    key: "",
  };

  // Mock cameras
  (scene as any).cameras = {
    main: {
      setPostPipeline: () => null,
      removePostPipeline: () => null,
    },
  };

  // Mock tweens (instant completion for fast training)
  // Use setImmediate to schedule callbacks so they don't block synchronously
  (scene as any).tweens = {
    add: (data: any) => {
      // Schedule callback to run on next tick to allow phase state to settle
      if (data.onComplete) {
        setImmediate(() => data.onComplete());
      }
      return { isPlaying: () => false };
    },
    getTweensOf: () => [],
    killTweensOf: () => [],
    chain: (data: any) => {
      setImmediate(() => {
        data?.tweens?.forEach((tween: any) => {
          if (tween.onComplete) {
            tween.onComplete();
          }
        });
        if (data.onComplete) {
          data.onComplete();
        }
      });
      return { isPlaying: () => false };
    },
    addCounter: (data: any) => {
      if (data.onComplete) {
        setImmediate(() => data.onComplete());
      }
      return { isPlaying: () => false };
    },
  };

  // Copy game properties to scene
  scene.anims = game.anims;
  scene.cache = game.cache;
  scene.plugins = game.plugins;
  scene.registry = game.registry;
  scene.scale = game.scale;
  scene.textures = game.textures as any;
  scene.events = game.events;

  // Setup input manager
  (scene as any).manager = new InputManager(game, {});
  (scene.manager as any).keyboard = new KeyboardManager(scene as any);
  scene.pluginEvents = new EventEmitter();
  (scene as any).domContainer = {} as HTMLDivElement;
  (scene as any).spritePipeline = {};
  (scene as any).fieldSpritePipeline = {};

  // Setup loader
  scene.load = new MockLoader(scene) as any;

  // Setup sys object
  (scene as any).sys = {
    queueDepthSort: () => null,
    anims: game.anims,
    game,
    textures: {
      addCanvas: () => ({
        get: () => ({
          source: {},
          setSize: () => null,
          glTexture: () => ({
            spectorMetadata: {},
          }),
        }),
      }),
    },
    cache: (scene.load as any).cacheManager,
    scale: game.scale,
    events: new EventEmitter(),
    settings: {
      loader: {
        key: "battle",
      },
    },
    input: game.input,
  };

  // Setup texture manager
  const mockTextureManager = new MockTextureManager(scene);
  scene.add = mockTextureManager.add as any;
  scene.textures = mockTextureManager as any;
  (scene.sys as any).displayList = scene.add.displayList;
  (scene.sys as any).updateList = new UpdateList(scene);
  (scene as any).systems = scene.sys;
  scene.input = game.input as any;
  (scene as any).scene = scene;

  // Setup input plugins
  scene.input.keyboard = new KeyboardPlugin(scene as any);
  scene.input.gamepad = new GamepadPlugin(scene as any);

  // Setup cached fetch for loading assets
  scene.cachedFetch = async (url: string, _init?: RequestInit): Promise<Response> => {
    // Replace battle anim fetches with tackle to save loading time
    const newUrl = url.includes("./battle-anims/")
      ? prependPath("./battle-anims/tackle.json", assetsPath)
      : prependPath(url, assetsPath);

    try {
      const raw = fs.readFileSync(newUrl, { encoding: "utf8", flag: "r" });
      return createFetchResponse(JSON.parse(raw));
    } catch {
      return createFetchBadResponse({});
    }
  };

  // Setup make object
  scene.make = new MockGameObjectCreator(mockTextureManager) as any;

  // Setup clock with immediate execution for delayedCall
  const mockClock = new MockClock(scene) as any;

  // Override delayedCall to execute callback immediately via setImmediate
  // This bypasses the Phaser game loop timing which doesn't work well in headless mode
  const _originalDelayedCall = mockClock.delayedCall.bind(mockClock);
  mockClock.delayedCall = (_delay: number, callback: () => void, args?: any[], callbackScope?: any) => {
    // Execute immediately on next tick instead of waiting for delay
    setImmediate(() => {
      if (callback) {
        callback.apply(callbackScope, args || []);
      }
    });
    // Return a fake timer event
    return { remove: () => {} };
  };

  scene.time = mockClock;

  // Setup remove function
  (scene as any).remove = () => {};

  // Disable timed events
  scene.eventManager = new MockTimedEventManager() as any;
}

/**
 * Prepend the assets path to a relative path
 */
function prependPath(originalPath: string, assetsPath: string): string {
  if (originalPath.startsWith("./")) {
    return originalPath.replace("./", `${assetsPath}/`);
  }
  return originalPath;
}

/**
 * Create a successful fetch response
 */
function createFetchResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

/**
 * Create a failed fetch response
 */
function createFetchBadResponse(data: unknown): Response {
  return {
    ok: false,
    status: 404,
    headers: new Headers(),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

/**
 * Bypass login by setting the appropriate constant.
 * In headless mode, we don't want to authenticate.
 */
export function setupBypassLogin(): void {
  // The bypassLogin constant is checked during game initialization
  // In headless mode, we need to ensure it's true
  // This is handled by the RuntimeOverrides system if needed
}

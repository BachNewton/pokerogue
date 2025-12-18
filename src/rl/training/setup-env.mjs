/**
 * Environment setup for headless training
 *
 * This file is imported before the application code to set up:
 * - Vite-specific globals like import.meta.env
 * - Browser globals (window, document, localStorage, etc.) via JSDOM
 * - CommonJS module interop storage
 *
 * Loaded via: node --import ./src/rl/training/setup-env.mjs
 */

import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

// Set up CommonJS module storage for ESM interop
// This is needed because the ESM loader can't easily pass modules to generated code
const require = createRequire(import.meta.url);
globalThis.__CJS_MODULES__ = globalThis.__CJS_MODULES__ || {};

// Pre-load CommonJS modules that need ESM interop
const cjsModules = ["crypto-js", "i18next-korean-postposition-processor"];
for (const mod of cjsModules) {
  try {
    globalThis.__CJS_MODULES__[mod] = require(mod);
  } catch (e) {
    console.warn(`[Training] Could not pre-load ${mod}:`, e.message);
  }
}

// Create a JSDOM instance to provide browser globals
const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true,
  runScripts: "dangerously",
});

// Helper to safely set globals (some may have only getters)
function setGlobal(name, value) {
  try {
    globalThis[name] = value;
  } catch {
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
    });
  }
}

// Add missing window APIs
dom.window.matchMedia = query => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
});

// Set up browser globals on globalThis
setGlobal("window", dom.window);
setGlobal("self", dom.window); // self === window in browsers
setGlobal("document", dom.window.document);
// Extend navigator with gamepad API
const navigatorProxy = new Proxy(dom.window.navigator, {
  get(target, prop) {
    if (prop === "getGamepads") {
      return () => [];
    }
    if (prop === "vibrate") {
      return () => true;
    }
    return target[prop];
  },
});
setGlobal("navigator", navigatorProxy);
setGlobal("localStorage", dom.window.localStorage);
setGlobal("sessionStorage", dom.window.sessionStorage);

// DOM element classes
setGlobal("Element", dom.window.Element);
setGlobal("HTMLElement", dom.window.HTMLElement);

// Use DOM's Event and EventTarget for compatibility with custom events
setGlobal("Event", dom.window.Event);
setGlobal("EventTarget", dom.window.EventTarget);
setGlobal("CustomEvent", dom.window.CustomEvent);
setGlobal("HTMLCanvasElement", dom.window.HTMLCanvasElement);
setGlobal("HTMLImageElement", dom.window.HTMLImageElement);
setGlobal("HTMLVideoElement", dom.window.HTMLVideoElement);
setGlobal("HTMLDivElement", dom.window.HTMLDivElement);
setGlobal("HTMLInputElement", dom.window.HTMLInputElement);
setGlobal("HTMLButtonElement", dom.window.HTMLButtonElement);
setGlobal("Node", dom.window.Node);
setGlobal("Text", dom.window.Text);
setGlobal("Event", dom.window.Event);
setGlobal("CustomEvent", dom.window.CustomEvent);
setGlobal("MouseEvent", dom.window.MouseEvent);
setGlobal("KeyboardEvent", dom.window.KeyboardEvent);
setGlobal("TouchEvent", dom.window.TouchEvent || class TouchEvent extends dom.window.Event {});

// Constructors and utilities
setGlobal("Image", dom.window.Image);
setGlobal("XMLHttpRequest", dom.window.XMLHttpRequest);
setGlobal("DOMParser", dom.window.DOMParser);
setGlobal("URL", dom.window.URL);
setGlobal("Blob", dom.window.Blob);
setGlobal("FileReader", dom.window.FileReader);
setGlobal("requestAnimationFrame", cb => setTimeout(cb, 16));
setGlobal("cancelAnimationFrame", id => clearTimeout(id));
setGlobal("performance", dom.window.performance);
// Use custom btoa/atob that handle unicode properly (JSDOM's btoa doesn't handle non-ASCII)
setGlobal("btoa", str => {
  try {
    return Buffer.from(str, "binary").toString("base64");
  } catch {
    return Buffer.from(str, "utf-8").toString("base64");
  }
});
setGlobal("atob", str => {
  return Buffer.from(str, "base64").toString("binary");
});
setGlobal("fetch", dom.window.fetch || globalThis.fetch);
setGlobal("Headers", dom.window.Headers || globalThis.Headers);
setGlobal("Request", dom.window.Request || globalThis.Request);
setGlobal("Response", dom.window.Response || globalThis.Response);

// Mock FontFace API
class MockFontFace {
  constructor(family, source, descriptors = {}) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
    this.status = "unloaded";
  }
  async load() {
    this.status = "loaded";
    return this;
  }
}
setGlobal("FontFace", MockFontFace);

// Mock AudioContext
class MockAudioContext {
  constructor() {
    this.state = "running";
    this.destination = {};
    this.sampleRate = 44100;
  }
  createGain() {
    return { gain: { value: 1 }, connect: () => {} };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect: () => {},
      start: () => {},
      stop: () => {},
      addEventListener: () => {},
    };
  }
  createOscillator() {
    return { connect: () => {}, start: () => {}, stop: () => {} };
  }
  createAnalyser() {
    return { connect: () => {}, getByteFrequencyData: () => {} };
  }
  decodeAudioData() {
    return Promise.resolve({});
  }
  close() {
    return Promise.resolve();
  }
  resume() {
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
}
setGlobal("AudioContext", MockAudioContext);
setGlobal("webkitAudioContext", MockAudioContext);

// Mock WebAudio API
class MockGainNode {
  constructor() {
    this.gain = { value: 1 };
  }
  connect() {}
}
setGlobal("GainNode", MockGainNode);

// Mock PointerEvent
setGlobal(
  "PointerEvent",
  dom.window.PointerEvent
    || class PointerEvent extends dom.window.Event {
      constructor(type, init = {}) {
        super(type, init);
        this.pointerId = init.pointerId || 0;
      }
    },
);

// Mock screen object for Phaser's ScaleManager
setGlobal("screen", {
  width: 1920,
  height: 1080,
  availWidth: 1920,
  availHeight: 1080,
  colorDepth: 24,
  pixelDepth: 24,
  orientation: {
    angle: 0,
    type: "landscape-primary",
    addEventListener: () => {},
    removeEventListener: () => {},
  },
});

// Create a mock canvas that returns mock contexts (for headless rendering)
dom.window.HTMLCanvasElement.prototype.getContext = function (type, ..._args) {
  if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") {
    // Return a mock WebGL context
    return createMockWebGLContext();
  }
  if (type === "2d") {
    // Return a mock 2D context
    return createMock2DContext(this);
  }
  return null;
};

// Mock 2D canvas context
function createMock2DContext(canvas) {
  return {
    canvas,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    miterLimit: 10,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    direction: "ltr",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low",
    shadowBlur: 0,
    shadowColor: "rgba(0, 0, 0, 0)",
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    filter: "none",

    // Methods
    save: () => {},
    restore: () => {},
    scale: () => {},
    rotate: () => {},
    translate: () => {},
    transform: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    createLinearGradient: () => ({
      addColorStop: () => {},
    }),
    createRadialGradient: () => ({
      addColorStop: () => {},
    }),
    createPattern: () => ({}),
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    arc: () => {},
    arcTo: () => {},
    ellipse: () => {},
    rect: () => {},
    fill: () => {},
    stroke: () => {},
    clip: () => {},
    isPointInPath: () => false,
    isPointInStroke: () => false,
    fillText: () => {},
    strokeText: () => {},
    measureText: text => ({
      width: text.length * 10,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 10,
      fontBoundingBoxAscent: 10,
      fontBoundingBoxDescent: 2,
    }),
    drawImage: () => {},
    createImageData: (w, h) => ({
      width: w,
      height: h || w,
      data: new Uint8ClampedArray(w * (h || w) * 4),
    }),
    getImageData: (_x, _y, w, h) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData: () => {},
    setLineDash: () => {},
    getLineDash: () => [],
    lineDashOffset: 0,
    getTransform: () => ({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
      is2D: true,
      isIdentity: true,
    }),
    drawFocusIfNeeded: () => {},
    scrollPathIntoView: () => {},
  };
}

// Mock WebGL context
function createMockWebGLContext() {
  const noop = () => {};
  const noopReturn = val => () => val;

  return new Proxy(
    {},
    {
      get(_target, prop) {
        // Constants
        if (typeof prop === "string" && prop.match(/^[A-Z_]+$/)) {
          return 0;
        }
        // Methods that return values
        if (prop === "getParameter") {
          return noopReturn(null);
        }
        if (prop === "getExtension") {
          return noopReturn(null);
        }
        if (prop === "createBuffer") {
          return noopReturn({});
        }
        if (prop === "createTexture") {
          return noopReturn({});
        }
        if (prop === "createProgram") {
          return noopReturn({});
        }
        if (prop === "createShader") {
          return noopReturn({});
        }
        if (prop === "createFramebuffer") {
          return noopReturn({});
        }
        if (prop === "createRenderbuffer") {
          return noopReturn({});
        }
        if (prop === "getShaderPrecisionFormat") {
          return noopReturn({ precision: 23, rangeMin: 127, rangeMax: 127 });
        }
        if (prop === "getAttribLocation") {
          return noopReturn(0);
        }
        if (prop === "getUniformLocation") {
          return noopReturn({});
        }
        if (prop === "getProgramParameter") {
          return noopReturn(true);
        }
        if (prop === "getShaderParameter") {
          return noopReturn(true);
        }
        if (prop === "getActiveAttrib") {
          return noopReturn({ name: "", size: 0, type: 0 });
        }
        if (prop === "getActiveUniform") {
          return noopReturn({ name: "", size: 0, type: 0 });
        }
        if (prop === "getSupportedExtensions") {
          return noopReturn([]);
        }
        if (prop === "getContextAttributes") {
          return noopReturn({
            alpha: true,
            antialias: true,
            depth: true,
            failIfMajorPerformanceCaveat: false,
            powerPreference: "default",
            premultipliedAlpha: true,
            preserveDrawingBuffer: false,
            stencil: false,
          });
        }
        if (prop === "isContextLost") {
          return noopReturn(false);
        }
        if (prop === "drawingBufferWidth") {
          return 800;
        }
        if (prop === "drawingBufferHeight") {
          return 600;
        }
        if (prop === "canvas") {
          return { width: 800, height: 600, style: {} };
        }
        // Default: return a no-op function
        return noop;
      },
    },
  );
}

// Default import.meta.env values for headless training
const env = {
  DEV: false,
  PROD: true,
  MODE: "production",
  NODE_ENV: "production",
  VITE_BYPASS_LOGIN: "1",
  VITE_BYPASS_TUTORIAL: "1",
  VITE_SERVER_URL: "",
  VITE_I18N_DEBUG: "",
};

// Store in globalThis for all modules to access
globalThis.__VITE_ENV__ = env;

// Initialize i18next with minimal config for headless mode
import i18next from "i18next";

i18next.init({
  lng: "en",
  fallbackLng: "en",
  debug: false,
  resources: {},
  returnEmptyString: false,
  returnNull: false,
  // Return the key if translation is missing
  parseMissingKeyHandler: key => key.split(":").pop() || key,
  missingKeyHandler: () => {},
});

// Now import Phaser (must be dynamic since it needs window to be set up first)
const Phaser = (await import("phaser")).default;
setGlobal("Phaser", Phaser);

// Mock phaser3-rex-plugins (BBCodeText, InputText)
// Must be dynamic import since Phaser global must be set first
const BBCodeText = (await import("phaser3-rex-plugins/plugins/bbcodetext.js")).default;
const InputText = (await import("phaser3-rex-plugins/plugins/inputtext.js")).default;

if (BBCodeText?.prototype) {
  // Mock BBCodeText to avoid rendering operations
  BBCodeText.prototype.destroy = () => null;
  BBCodeText.prototype.resize = () => null;
  BBCodeText.prototype.setText = function (text) {
    this._text = text;
    return this;
  };
  BBCodeText.prototype.setLineSpacing = function () {
    return this;
  };
  BBCodeText.prototype.updateText = function () {
    return this;
  };
  BBCodeText.prototype.setScale = function () {
    return this;
  };
  BBCodeText.prototype.setShadow = function () {
    return this;
  };
  BBCodeText.prototype.setMaxLines = function () {
    return this;
  };
  BBCodeText.prototype.setWrapMode = function () {
    return this;
  };
  BBCodeText.prototype.setFontSize = function () {
    return this;
  };
  BBCodeText.prototype.setColor = function () {
    return this;
  };
  BBCodeText.prototype.setOrigin = function () {
    return this;
  };
  BBCodeText.prototype.setAlpha = function () {
    return this;
  };
  BBCodeText.prototype.setDepth = function () {
    return this;
  };
  BBCodeText.prototype.setPosition = function () {
    return this;
  };
  BBCodeText.prototype.setVisible = function () {
    return this;
  };
  BBCodeText.prototype.setX = function () {
    return this;
  };
  BBCodeText.prototype.setY = function () {
    return this;
  };
}
if (InputText?.prototype) {
  InputText.prototype.setElement = () => null;
  InputText.prototype.resize = () => null;
}

// Mock SoundFade from phaser3-rex-plugins
const SoundFade = (await import("phaser3-rex-plugins/plugins/soundfade.js")).default;
if (SoundFade) {
  // Provide no-op implementations for sound fade operations
  SoundFade.fadeOut = (_scene, sound, _duration, destroy) => {
    // Immediately "complete" the fade - just stop the sound if destroy is true
    if (destroy && sound && typeof sound.stop === "function") {
      sound.stop();
    }
    return sound;
  };
  SoundFade.fadeIn = (_scene, sound, _duration, _endVolume, _startVolume) => {
    // Immediately "complete" the fade
    return sound;
  };
}

// Add document.fonts mock
Object.defineProperty(document, "fonts", {
  writable: true,
  value: {
    add: () => {},
    check: () => true,
    load: () => Promise.resolve([]),
  },
});

console.log("[Training] Environment setup complete (JSDOM + Vite env + i18next + rex-plugins)");

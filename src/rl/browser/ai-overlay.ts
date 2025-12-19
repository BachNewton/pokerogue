/**
 * AI Playback Overlay
 *
 * A minimal floating UI panel for controlling AI model playback in the browser.
 * Toggle with F10 key. The AI plays through the normal game UI - this overlay
 * just provides controls for loading models, starting/stopping, and speed control.
 */

import { globalScene } from "#app/global-scene";
import { TextStyle } from "#enums/text-style";
import { addTextObject } from "#ui/text";
import { addWindow, WindowVariant } from "#ui/ui-theme";
import { getVisualController } from "./visual-controller";

/**
 * AI Overlay configuration
 */
export interface AIOverlayConfig {
  /** X position (from right edge) */
  x: number;
  /** Y position (from top) */
  y: number;
  /** Default model path */
  defaultModelPath: string;
}

const DEFAULT_CONFIG: AIOverlayConfig = {
  x: 10,
  y: 10,
  defaultModelPath: "",
};

/**
 * AI Playback Overlay Component
 */
export class AIPlaybackOverlay {
  private container: Phaser.GameObjects.Container;
  private background: Phaser.GameObjects.NineSlice;
  private titleText: Phaser.GameObjects.Text;
  private statusText: Phaser.GameObjects.Text;
  private modelText: Phaser.GameObjects.Text;
  private speedText: Phaser.GameObjects.Text;
  private toggleButton: Phaser.GameObjects.Container;
  private toggleButtonBg: Phaser.GameObjects.NineSlice;
  private toggleButtonText: Phaser.GameObjects.Text;
  private loadButton: Phaser.GameObjects.Container;
  private loadButtonBg: Phaser.GameObjects.NineSlice;
  private loadButtonText: Phaser.GameObjects.Text;
  private speedSliderBg: Phaser.GameObjects.Rectangle;
  private speedSliderThumb: Phaser.GameObjects.Rectangle;
  private minimizeButton: Phaser.GameObjects.Text;

  private config: AIOverlayConfig;
  private isVisible = false;
  private isMinimized = false;
  private modelLoaded = false;
  private isRunning = false;
  private currentSpeed = 1.0;
  private autoPlayLoop = false;

  private readonly WIDTH = 140;
  private readonly HEIGHT = 100;
  private readonly MINIMIZED_HEIGHT = 20;

  constructor(config: Partial<AIOverlayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create the overlay UI
   */
  create(): void {
    const scene = globalScene;
    const canvasWidth = scene.scaledCanvas.width;

    // Position in top-right corner
    const x = canvasWidth - this.WIDTH - this.config.x;
    const y = this.config.y;

    // Create container
    this.container = scene.add.container(x, y);
    this.container.setDepth(1000); // Above other UI

    // Background window
    this.background = addWindow(0, 0, this.WIDTH, this.HEIGHT, false, false, 0, 0, WindowVariant.THIN);
    this.container.add(this.background);

    // Title bar
    this.titleText = addTextObject(4, 2, "AI Playback", TextStyle.SETTINGS_LABEL);
    this.titleText.setScale(0.8);
    this.container.add(this.titleText);

    // Minimize button
    this.minimizeButton = addTextObject(this.WIDTH - 14, 2, "-", TextStyle.SETTINGS_LABEL);
    this.minimizeButton.setScale(0.8);
    this.minimizeButton.setInteractive({ useHandCursor: true });
    this.minimizeButton.on("pointerdown", () => this.toggleMinimize());
    this.container.add(this.minimizeButton);

    // Model status
    this.modelText = addTextObject(4, 18, "Model: None", TextStyle.TOOLTIP_CONTENT);
    this.modelText.setScale(0.7);
    this.container.add(this.modelText);

    // Status
    this.statusText = addTextObject(4, 30, "Status: Stopped", TextStyle.TOOLTIP_CONTENT);
    this.statusText.setScale(0.7);
    this.container.add(this.statusText);

    // Load button
    this.loadButton = scene.add.container(8, 44);
    this.loadButtonBg = addWindow(0, 0, 56, 14, false, false, 0, 0, WindowVariant.XTHIN);
    this.loadButtonText = addTextObject(28, 7, "Load", TextStyle.TOOLTIP_CONTENT);
    this.loadButtonText.setOrigin(0.5, 0.5);
    this.loadButtonText.setScale(0.7);
    this.loadButton.add(this.loadButtonBg);
    this.loadButton.add(this.loadButtonText);
    this.loadButtonBg.setInteractive({ useHandCursor: true });
    this.loadButtonBg.on("pointerdown", () => this.onLoadClick());
    this.loadButtonBg.on("pointerover", () => this.loadButtonBg.setTint(0xbbbbbb));
    this.loadButtonBg.on("pointerout", () => this.loadButtonBg.clearTint());
    this.container.add(this.loadButton);

    // Toggle button
    this.toggleButton = scene.add.container(70, 44);
    this.toggleButtonBg = addWindow(0, 0, 62, 14, false, false, 0, 0, WindowVariant.XTHIN);
    this.toggleButtonText = addTextObject(31, 7, "Start AI", TextStyle.TOOLTIP_CONTENT);
    this.toggleButtonText.setOrigin(0.5, 0.5);
    this.toggleButtonText.setScale(0.7);
    this.toggleButton.add(this.toggleButtonBg);
    this.toggleButton.add(this.toggleButtonText);
    this.toggleButtonBg.setInteractive({ useHandCursor: true });
    this.toggleButtonBg.on("pointerdown", () => this.onToggleClick());
    this.toggleButtonBg.on("pointerover", () => this.toggleButtonBg.setTint(0xbbbbbb));
    this.toggleButtonBg.on("pointerout", () => this.toggleButtonBg.clearTint());
    this.container.add(this.toggleButton);

    // Speed label
    const speedLabel = addTextObject(4, 64, "Speed:", TextStyle.TOOLTIP_CONTENT);
    speedLabel.setScale(0.7);
    this.container.add(speedLabel);

    // Speed slider background
    this.speedSliderBg = scene.add.rectangle(40, 70, 80, 8, 0x333333);
    this.speedSliderBg.setOrigin(0, 0.5);
    this.speedSliderBg.setInteractive({ useHandCursor: true });
    this.speedSliderBg.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.onSpeedSliderClick(pointer));
    this.container.add(this.speedSliderBg);

    // Speed slider thumb
    this.speedSliderThumb = scene.add.rectangle(40 + 16, 70, 8, 12, 0xffffff);
    this.speedSliderThumb.setOrigin(0.5, 0.5);
    this.container.add(this.speedSliderThumb);

    // Speed value text
    this.speedText = addTextObject(124, 64, "1.0x", TextStyle.TOOLTIP_CONTENT);
    this.speedText.setScale(0.7);
    this.container.add(this.speedText);

    // Help text
    const helpText = addTextObject(4, 84, "Press F10 to toggle", TextStyle.TOOLTIP_CONTENT);
    helpText.setScale(0.5);
    helpText.setAlpha(0.7);
    this.container.add(helpText);

    // Initially hidden
    this.container.setVisible(false);

    // Register F10 keybinding
    scene.input.keyboard?.on("keydown-F10", () => {
      this.toggle();
    });
  }

  /**
   * Toggle overlay visibility
   */
  toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.setVisible(this.isVisible);
    if (this.isVisible) {
      this.updateDisplay();
    }
  }

  /**
   * Show the overlay
   */
  show(): void {
    this.isVisible = true;
    this.container.setVisible(true);
    this.updateDisplay();
  }

  /**
   * Hide the overlay
   */
  hide(): void {
    this.isVisible = false;
    this.container.setVisible(false);
  }

  /**
   * Toggle minimized state
   */
  private toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;

    if (this.isMinimized) {
      this.background.setSize(this.WIDTH, this.MINIMIZED_HEIGHT);
      this.minimizeButton.setText("+");
      // Hide other elements
      this.modelText.setVisible(false);
      this.statusText.setVisible(false);
      this.loadButton.setVisible(false);
      this.toggleButton.setVisible(false);
      this.speedSliderBg.setVisible(false);
      this.speedSliderThumb.setVisible(false);
      this.speedText.setVisible(false);
    } else {
      this.background.setSize(this.WIDTH, this.HEIGHT);
      this.minimizeButton.setText("-");
      // Show other elements
      this.modelText.setVisible(true);
      this.statusText.setVisible(true);
      this.loadButton.setVisible(true);
      this.toggleButton.setVisible(true);
      this.speedSliderBg.setVisible(true);
      this.speedSliderThumb.setVisible(true);
      this.speedText.setVisible(true);
    }
  }

  /**
   * Handle load button click
   */
  private async onLoadClick(): Promise<void> {
    try {
      const modelPath = await this.promptForModelPath();
      if (modelPath) {
        await this.loadModel(modelPath);
      }
    } catch (error) {
      console.error("Failed to load model:", error);
      this.statusText.setText("Status: Load Error");
    }
  }

  /**
   * Prompt user for model path
   */
  private async promptForModelPath(): Promise<string | null> {
    // Create file input element
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.style.display = "none";
      document.body.appendChild(input);

      input.onchange = async () => {
        const file = input.files?.[0];
        document.body.removeChild(input);

        if (file) {
          // Create object URL for the model file
          const url = URL.createObjectURL(file);
          resolve(url);
        } else {
          resolve(null);
        }
      };

      input.oncancel = () => {
        document.body.removeChild(input);
        resolve(null);
      };

      input.click();
    });
  }

  /**
   * Load a model from path
   */
  async loadModel(modelPath: string): Promise<void> {
    const controller = getVisualController();

    this.statusText.setText("Status: Loading...");
    this.modelText.setText("Model: Loading...");

    try {
      await controller.initialize(modelPath);
      this.modelLoaded = true;

      // Extract filename from path
      const filename = modelPath.split("/").pop()?.split("\\").pop() ?? "model";
      this.modelText.setText(`Model: ${filename.substring(0, 15)}`);
      this.statusText.setText("Status: Ready");
    } catch (error) {
      this.modelLoaded = false;
      this.modelText.setText("Model: Error");
      this.statusText.setText("Status: Load Failed");
      throw error;
    }
  }

  /**
   * Handle toggle button click
   */
  private onToggleClick(): void {
    if (!this.modelLoaded) {
      this.statusText.setText("Status: No Model");
      return;
    }

    const controller = getVisualController();

    if (this.isRunning) {
      // Stop AI
      controller.stopAutoPlay();
      this.isRunning = false;
      this.autoPlayLoop = false;
      this.toggleButtonText.setText("Start AI");
      this.statusText.setText("Status: Stopped");
    } else {
      // Start AI
      this.isRunning = true;
      this.autoPlayLoop = true;
      this.toggleButtonText.setText("Stop AI");
      this.statusText.setText("Status: Running");

      // Start auto-play loop
      this.runAutoPlayLoop();
    }
  }

  /**
   * Run the auto-play loop
   */
  private async runAutoPlayLoop(): Promise<void> {
    const controller = getVisualController();
    controller.setEnabled(true);
    controller.setSpeed(this.currentSpeed);

    while (this.autoPlayLoop && this.isRunning) {
      try {
        const executed = await controller.executeAutoAction();
        if (executed) {
          // Update status to show last action
          const action = controller.getLastAction();
          if (action !== null) {
            this.updateDisplay();
          }
        }
      } catch (error) {
        console.error("Auto-play error:", error);
      }

      // Small delay to prevent tight loop
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    controller.setEnabled(false);
  }

  /**
   * Handle speed slider click
   */
  private onSpeedSliderClick(pointer: Phaser.Input.Pointer): void {
    const localX = pointer.x - this.container.x - 40;
    const normalizedX = Math.max(0, Math.min(1, localX / 80));

    // Map to speed range: 0.25x to 5x (logarithmic scale for better UX)
    this.currentSpeed = 0.25 * Math.pow(20, normalizedX);
    this.currentSpeed = Math.round(this.currentSpeed * 10) / 10;

    // Clamp to reasonable values
    this.currentSpeed = Math.max(0.25, Math.min(5, this.currentSpeed));

    // Update UI
    this.speedSliderThumb.setX(40 + normalizedX * 80);
    this.speedText.setText(`${this.currentSpeed.toFixed(1)}x`);

    // Update controller
    const controller = getVisualController();
    controller.setSpeed(this.currentSpeed);
  }

  /**
   * Update display state
   */
  private updateDisplay(): void {
    const controller = getVisualController();

    if (controller.isReady && !this.modelLoaded) {
      this.modelLoaded = true;
      this.modelText.setText("Model: Loaded");
    }

    if (this.isRunning) {
      if (controller.shouldAutoSelect()) {
        this.statusText.setText("Status: Deciding...");
      } else {
        this.statusText.setText("Status: Waiting...");
      }
    }
  }

  /**
   * Destroy the overlay
   */
  destroy(): void {
    this.autoPlayLoop = false;
    this.isRunning = false;
    this.container.destroy();
  }
}

// Singleton instance
let _overlay: AIPlaybackOverlay | null = null;

/**
 * Get or create the AI overlay singleton
 */
export function getAIOverlay(): AIPlaybackOverlay {
  if (!_overlay) {
    _overlay = new AIPlaybackOverlay();
  }
  return _overlay;
}

/**
 * Create and show the AI overlay
 * Call this after the scene is created
 */
export function createAIOverlay(): AIPlaybackOverlay {
  const overlay = getAIOverlay();
  overlay.create();
  return overlay;
}

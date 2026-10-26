import {
  SceneKey,
  type BattleRenderer,
  type BattleSceneData,
  type HudLayout,
  type InputSource,
  type RenderView,
  type ResultSceneData,
  type Unsubscribe,
  type WaveOutcome,
  type WaveStartParams,
} from '../contracts';
import { getRuntime, setBattle } from '../core/app';
import { setupCamera, viewSize } from '../core/camera';
import { computeHudLayout, readSafeInsets } from '../core/layout';
import { SimRunner } from '../core/SimRunner';
import { findEntity } from '../core/world';

const CAMERA = {
  /** Ash sits at this fraction of the view width */
  ashAnchor: 0.42,
  /** exponential follow speed (1/s) */
  follow: 8,
  /** real ms between the wave ending and the result screen */
  resultDelayMs: 1400,
} as const;

/**
 * Battle scene shell (core-owned). Wires sim runner + controls + renderers.
 * Gameplay, controls and visuals live in their own folders.
 */
export class Battle extends Phaser.Scene {
  private params!: WaveStartParams;
  private runner!: SimRunner;
  private inputSource!: InputSource;
  private renderers: BattleRenderer[] = [];
  private layout!: HudLayout;
  private view!: RenderView & { cameraX: number; paused: boolean; speed: 1 | 2; layout: HudLayout };
  private unsubs: Unsubscribe[] = [];
  private ended = false;

  constructor() {
    super(SceneKey.Battle);
  }

  init(data: BattleSceneData): void {
    this.params = data.params;
    this.renderers = [];
    this.unsubs = [];
    this.ended = false;
  }

  create(): void {
    const rt = getRuntime();
    const app = rt.app;
    const cam = setupCamera(this, app.renderScale);
    this.layout = this.computeLayout();

    this.inputSource = rt.modules.controls.createInputSource();
    this.runner = new SimRunner(app, this.params, rt.modules.systems, rt.modules.gameplay, () => this.inputSource.poll());

    const world = this.runner.world;
    this.view = {
      world,
      aim: this.inputSource.aim,
      layout: this.layout,
      data: app.data,
      get settings() {
        return app.profile.settings;
      },
      paused: false,
      speed: 1,
      cameraX: 0,
      t: app.t,
    };

    this.inputSource.attach(this, this.layout, world, app.bus, {
      toView: (p) => ({ x: p.x / app.renderScale, y: p.y / app.renderScale }),
      toWorldX: (viewX) => viewX + this.view.cameraX,
    });

    this.renderers = rt.modules.render.createBattleRenderers();
    for (const r of this.renderers) r.create(this, this.view, app.bus);

    this.unsubs.push(
      app.bus.on('ui:pause', ({ paused }) => {
        this.runner.paused = paused;
        this.view.paused = paused;
      }),
      app.bus.on('ui:speed', ({ speed }) => {
        this.runner.speed = speed;
        this.view.speed = speed;
      }),
      app.bus.on('wave:ended', (outcome) => this.onWaveEnded(outcome)),
    );

    const onResize = () => {
      setupCamera(this, app.renderScale);
      this.layout = this.computeLayout();
      this.view.layout = this.layout;
      this.inputSource.relayout(this.layout);
      for (const r of this.renderers) r.relayout(this.layout);
      app.bus.emit('ui:layout', this.layout);
    };
    this.scale.on('resize', onResize);

    const onVisibility = () => {
      if (document.hidden && !this.runner.paused) app.bus.emit('ui:pause', { paused: true });
    };
    document.addEventListener('visibilitychange', onVisibility);

    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const off of this.unsubs) off();
      for (const r of this.renderers) r.destroy();
      this.inputSource.detach();
      this.runner.dispose();
      setBattle(null);
    });

    this.runner.start();
    setBattle({ runner: this.runner, scene: this });
    cam.setScroll(this.targetCameraX(0), 0);
    this.view.cameraX = cam.scrollX;
  }

  update(_time: number, delta: number): void {
    const alpha = this.runner.frame(delta);
    const target = this.targetCameraX(alpha);
    const k = 1 - Math.exp((-CAMERA.follow * Math.min(delta, 100)) / 1000);
    this.view.cameraX += (target - this.view.cameraX) * k;
    this.cameras.main.setScroll(this.view.cameraX, 0);
    for (const r of this.renderers) r.frame(this.view, alpha, delta);
  }

  private computeLayout(): HudLayout {
    const { w } = viewSize(this, getRuntime().app.renderScale);
    return computeHudLayout(w, readSafeInsets(w));
  }

  private targetCameraX(alpha: number): number {
    const world = this.runner.world;
    const ash = findEntity(world, world.ashId);
    const worldW = getRuntime().app.data.balance.world.width;
    const viewW = this.layout.viewW;
    if (!ash) return this.view?.cameraX ?? 0;
    const x = ash.prevX + (ash.x - ash.prevX) * alpha;
    return Math.max(0, Math.min(worldW - viewW, x - viewW * CAMERA.ashAnchor));
  }

  private onWaveEnded(outcome: WaveOutcome): void {
    if (this.ended) return;
    this.ended = true;
    const app = getRuntime().app;
    app.progression.applyOutcome(app.profile, outcome);
    app.commitProfile();
    this.time.delayedCall(CAMERA.resultDelayMs, () => {
      if (this.scene.get(SceneKey.Result)) {
        const data: ResultSceneData = { outcome, params: this.params };
        this.scene.start(SceneKey.Result, data);
      } else {
        // phase 2 fallback until render/ provides menus: replay the same wave
        this.scene.restart({ params: this.params } satisfies BattleSceneData);
      }
    });
  }
}

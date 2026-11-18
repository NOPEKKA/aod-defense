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
import { terrainAt } from '../core/terrain';
import { findEntity } from '../core/world';
import { attachHostBattle, createRemoteRunner, detachHostBattle, remoteBattleClosed, type HostBattleLink, type RemoteRunner } from '../net';

const CAMERA = {
  /** Ash sits at this fraction of the view width */
  ashAnchor: 0.42,
  /** exponential follow speed (1/s) */
  follow: 8,
  /** real ms between the wave ending and the result screen */
  resultDelayMs: 1400,
  /** online guest: camera pan speed (px/s) with A/D or the touch move zones */
  panSpeed: 900,
  /** online guest: seconds without panning before the camera drifts back to Ash */
  panHold: 2.5,
} as const;

/**
 * Battle scene shell (core-owned). Wires sim runner + controls + renderers.
 * Gameplay, controls and visuals live in their own folders.
 */
export class Battle extends Phaser.Scene {
  private params!: WaveStartParams;
  private runner!: SimRunner | RemoteRunner;
  /** online: set when hosting (streams the battle) / when this is the guest's mirror */
  private hostLink: HostBattleLink | null = null;
  private remote: RemoteRunner | null = null;
  private panX = 0;
  private panIdle = 0;
  private inputSource!: InputSource;
  private renderers: BattleRenderer[] = [];
  private layout!: HudLayout;
  private view!: RenderView & { cameraX: number; cameraY: number; paused: boolean; speed: 1 | 2; layout: HudLayout };
  private unsubs: Unsubscribe[] = [];
  private ended = false;
  private lastFrameAt = -1;
  private remoteRequested = false;

  constructor() {
    super(SceneKey.Battle);
  }

  init(data: BattleSceneData): void {
    this.params = data.params;
    this.remote = null;
    this.hostLink = null;
    this.panX = 0;
    this.panIdle = 0;
    this.remoteRequested = !!data.remote;
    this.renderers = [];
    this.unsubs = [];
    this.ended = false;
    this.lastFrameAt = -1;
  }

  preload(): void {
    // render queues the sprite atlases / background this wave needs
    getRuntime().modules.render.preloadBattle?.(this, this.params);
  }

  create(): void {
    const rt = getRuntime();
    const app = rt.app;
    const cam = setupCamera(this, app.renderScale);
    this.layout = this.computeLayout();

    this.inputSource = rt.modules.controls.createInputSource();
    if (this.remoteRequested) {
      this.remote = createRemoteRunner(this.params, app.bus);
      if (!this.remote) {
        // the link dropped while this battle was loading
        this.scene.start(SceneKey.Title);
        return;
      }
      this.runner = this.remote;
    } else {
      const poll = () => this.inputSource.poll();
      const sim = new SimRunner(app, this.params, rt.modules.systems, rt.modules.gameplay, () => (this.hostLink ? this.hostLink.merge(poll()) : poll()));
      this.runner = sim;
      this.hostLink = attachHostBattle(app.bus, sim.world, this.params, () => sim.paused);
    }

    const world = this.runner.world;
    this.view = {
      world,
      params: this.params,
      aim: this.inputSource.aim,
      layout: this.layout,
      data: app.data,
      get settings() {
        return app.profile.settings;
      },
      paused: false,
      speed: 1,
      cameraX: 0,
      cameraY: 0,
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
      // the online guest looking away must not pause the host's battle
      if (document.hidden && !this.runner.paused && !this.remote) app.bus.emit('ui:pause', { paused: true });
    };
    document.addEventListener('visibilitychange', onVisibility);

    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const off of this.unsubs) off();
      for (const r of this.renderers) r.destroy();
      this.inputSource.detach();
      this.runner.dispose();
      if (this.hostLink) detachHostBattle(this.hostLink, this.ended);
      if (this.remote && !this.ended) remoteBattleClosed();
      setBattle(null);
    });

    this.runner.start();
    setBattle({ runner: this.runner, scene: this });
    cam.setScroll(this.targetCameraX(0), 0);
    this.view.cameraX = cam.scrollX;
    this.view.cameraY = terrainAt(app.data, this.view.cameraX + this.layout.viewW * 0.5);
    cam.setScroll(this.view.cameraX, this.view.cameraY);
  }

  update(_time: number, smoothedDelta: number): void {
    // Real wall-clock delta: Phaser's smoothed delta is capped at 1000/fps.target for
    // 120 frames after a focus event, which ran the sim in slow motion (QA BUG-C1).
    if (this.remoteRequested && !this.remote) return; // leaving: the link dropped while loading
    const now = performance.now();
    const delta = this.lastFrameAt < 0 ? smoothedDelta : now - this.lastFrameAt;
    this.lastFrameAt = now;
    const alpha = this.runner.frame(delta);
    if (this.remote) this.guestInput(delta);
    else this.hostLink?.frame(now);
    const target = this.targetCameraX(alpha);
    const k = 1 - Math.exp((-CAMERA.follow * Math.min(delta, 100)) / 1000);
    this.view.cameraX += (target - this.view.cameraX) * k;
    // the field runs downhill: the camera sinks with the ground under the middle of the view
    const ty = terrainAt(getRuntime().app.data, this.view.cameraX + this.layout.viewW * 0.5);
    this.view.cameraY += (ty - this.view.cameraY) * k;
    this.cameras.main.setScroll(this.view.cameraX, this.view.cameraY);
    for (const r of this.renderers) r.frame(this.view, alpha, delta);
  }

  /** online guest: send army commands to the host; A/D (or the move zones) pan the camera */
  private guestInput(deltaMs: number): void {
    const f = this.inputSource.poll();
    this.remote!.forwardInput(f);
    const dt = Math.min(deltaMs, 100) / 1000;
    if (f.move !== 0) {
      this.panX += f.move * CAMERA.panSpeed * dt;
      this.panIdle = 0;
    } else if ((this.panIdle += dt) > CAMERA.panHold) {
      this.panX *= Math.exp(-2.5 * dt);
    }
    const worldW = getRuntime().app.data.balance.world.width;
    this.panX = Math.max(-worldW, Math.min(worldW, this.panX));
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
    const x = ash.prevX + (ash.x - ash.prevX) * alpha + this.panX;
    return Math.max(0, Math.min(worldW - viewW, x - viewW * CAMERA.ashAnchor));
  }

  private onWaveEnded(outcome: WaveOutcome): void {
    if (this.ended) return;
    this.ended = true;
    const app = getRuntime().app;
    // the online guest only watches the host's result; its own save is untouched
    if (!this.remote) {
      app.progression.applyOutcome(app.profile, outcome);
      app.commitProfile();
    }
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

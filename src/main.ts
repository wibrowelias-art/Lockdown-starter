import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/styles.css';
import { Game } from './game/game';
import { buildLibrary } from './game/materials';
import type { Preset } from './game/render';

const params = new URLSearchParams(location.search);
const speed = Math.max(0.25, Math.min(40, Number(params.get('speed')) || 1));
const canvas = document.getElementById('view') as HTMLCanvasElement;
const app = document.getElementById('app') as HTMLElement;

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!webglAvailable()) {
  app.innerHTML = '<p style="padding:2em;font:16px system-ui;color:#ddd">Sorry: this demo needs WebGL, which is not available in this browser.</p>';
} else {
  void start();
}

async function start(): Promise<void> {
  // canvas textures (board, answer sheet, poster) need the rounded font loaded first
  try {
    await Promise.race([
      Promise.all(['500', '600', '700'].map((w) => document.fonts.load(`${w} 40px Fredoka`))),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  // loading screen while the procedural textures are generated
  const load = document.createElement('div');
  load.className = 'loading';
  load.dataset.testid = 'loading';
  load.innerHTML = '<div class="ld-title">ROOM 214</div><div class="ld-bar"><span></span></div><div class="ld-label">Preparing the room...</div>';
  app.append(load);
  const bar = load.querySelector('span') as HTMLElement;
  const label = load.querySelector('.ld-label') as HTMLElement;
  const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
  const forced = (params.get('preset') as Preset | null) ?? (params.has('lowq') ? 'low' : null);
  const lib = await buildLibrary((p, what) => {
    bar.style.width = `${Math.round(p * 100)}%`;
    label.textContent = `Preparing the room: ${what}`;
  }, forced === 'low' || coarse ? 'low' : 'high');
  const game = new Game(canvas, app, speed, { noLock: params.has('nolock'), preset: forced ?? undefined, lib });
  load.remove();
  // Hooks for automated playthroughs (Playwright) and debugging.
  (window as unknown as { __lockdown: unknown }).__lockdown = {
    state: () => JSON.parse(JSON.stringify(game.store.state)),
    scene: () => game.store.state.scene,
    setSpeed: (n: number) => (game.clock.speed = n),
    getSpeed: () => game.clock.speed,
    audioLog: () => game.audio.log.slice(),
    player: () => ({ x: game.player.x, z: game.player.z, stance: game.player.stance, yaw: game.player.yaw, pitch: game.player.pitch, travelled: game.player.travelled }),
    aim: (id: string) => game.aim(id),
    screenPos: (id: string) => game.screenPos(id),
    walkTo: (x: number, z: number) => game.walkTo(x, z),
    breath: () => ({ ...game.breath }),
    lightsOn: () => game.world.lightsOn,
    frames: () => game.frames,
    fps: () => game.fps,
    simTime: () => game.clock.time,
    momReply: () => (window as unknown as { __momReply?: () => void }).__momReply?.(),
    quality: () => game.renderer.preset,
    lookAt: (x: number, y: number, z: number) => game.lookAtPoint(x, y, z),
    holdUse: (down: boolean) => (game.input.holdingUse = down),
    holdingSheet: () => game.flags.holdingSheet,
    guidance: () => ({ ...game.guidance.state }),
    setGuidance: (m: 'full' | 'minimal' | 'off') => {
      game.settings.guidance = m;
      game.applySettings(game.settings);
    },
    navTo: (x: number, z: number, within = 0.15) => game.navTo(x, z, within),
    danger: () => game.flags.danger,
    pass: (name: 'ao' | 'bloom' | 'smaa' | 'grade', on: boolean) => game.renderer.toggle(name, on),
    setPreset: (p: Preset) => {
      game.settings.quality = p;
      game.applySettings(game.settings);
    },
    world: () => game.world,
    setYaw: (y: number) => {
      game.player.yaw = y;
      game.player.pitch = 0;
    },
    yawTo: (id: string) => {
      const p = game.targetPos(id);
      return p ? Math.atan2(-(p.x - game.player.x), -(p.z - game.player.z)) : null;
    },
    navToTarget: (id: string, within = 1.0) => {
      const p = game.targetPos(id);
      return p ? game.navTo(p.x, p.z, within) : Promise.resolve(false);
    },
    theoFollowing: () => game.flags.theoFollowing || game.store.state.tasks.theoDown,
    people: () => Object.fromEntries([...game.world.people].map(([n, p]) => [n, [+p.root.position.x.toFixed(2), +p.root.position.z.toFixed(2), p.pose]])),
  };
}

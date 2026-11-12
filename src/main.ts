import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/styles.css';
import { Game } from './game/game';

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
  const game = new Game(canvas, app, speed, { noLock: params.has('nolock'), lowQuality: params.has('lowq') });
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
    quality: () => (game.renderer.high ? 'high' : 'low'),
    lookAt: (x: number, y: number, z: number) => game.lookAtPoint(x, y, z),
    holdUse: (down: boolean) => (game.input.holdingUse = down),
    people: () => Object.fromEntries([...game.world.people].map(([n, p]) => [n, [+p.root.position.x.toFixed(2), +p.root.position.z.toFixed(2), p.pose]])),
  };
}

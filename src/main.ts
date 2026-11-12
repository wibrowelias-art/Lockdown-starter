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
  const game = new Game(canvas, app, speed);
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
    simTime: () => game.clock.time,
  };
}

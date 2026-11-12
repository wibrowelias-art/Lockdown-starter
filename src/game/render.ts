import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { OUTLINE_LAYER } from './toon';

/** Depth + normal edge detection for the room (cartoon ink lines). */
class EdgePass extends Pass {
  private target: THREE.WebGLRenderTarget;
  private normalMat = new THREE.MeshNormalMaterial();
  private quad: FullScreenQuad;
  private mat: THREE.ShaderMaterial;

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {
    super();
    this.target = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tNormal: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        lineColor: { value: new THREE.Color(0x14151c) },
        strength: { value: 0.9 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tDiffuse, tNormal, tDepth;
        uniform vec2 resolution;
        uniform float cameraNear, cameraFar, strength;
        uniform vec3 lineColor;
        varying vec2 vUv;
        float lin(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec2 px = 1.25 / resolution;
          float d = lin(vUv);
          vec3 n = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
          float de = 0.0, ne = 0.0;
          vec2 offs[4];
          offs[0] = vec2(px.x, 0.0); offs[1] = vec2(-px.x, 0.0); offs[2] = vec2(0.0, px.y); offs[3] = vec2(0.0, -px.y);
          for (int i = 0; i < 4; i++) {
            de += abs(lin(vUv + offs[i]) - d);
            ne += 1.0 - dot(n, texture2D(tNormal, vUv + offs[i]).xyz * 2.0 - 1.0);
          }
          float e = max(step(0.035 * d + 0.01, de), step(0.55, ne));
          gl_FragColor = vec4(mix(base.rgb, lineColor, e * strength), base.a);
        }`,
    });
    this.quad = new FullScreenQuad(this.mat);
  }

  setSize(w: number, h: number): void {
    this.target.setSize(w, h);
    this.mat.uniforms.resolution.value.set(w, h);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const cam = this.camera;
    const mask = cam.layers.mask;
    cam.layers.set(0);
    const over = this.scene.overrideMaterial;
    const bg = this.scene.background;
    this.scene.overrideMaterial = this.normalMat;
    this.scene.background = null;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.scene, cam);
    this.scene.overrideMaterial = over;
    this.scene.background = bg;
    cam.layers.mask = mask;
    this.mat.uniforms.tDiffuse.value = readBuffer.texture;
    this.mat.uniforms.cameraNear.value = cam.near;
    this.mat.uniforms.cameraFar.value = cam.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

const LensShader = {
  uniforms: {
    tDiffuse: { value: null },
    k: { value: 0.3 },
    aspect: { value: 1 },
    vignette: { value: 0.55 },
    panic: { value: 0 },
    time: { value: 0 },
    grain: { value: 0.045 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float k, aspect, vignette, panic, time, grain;
    uniform vec2 resolution;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      vec2 q = vec2(p.x * aspect, p.y);
      float r2 = dot(q, q) / (aspect * aspect + 1.0);
      float kk = k + panic * 0.08;
      vec2 src = p * (1.0 + kk * r2) / (1.0 + kk);
      vec3 c = texture2D(tDiffuse, src * 0.5 + 0.5).rgb;
      float vr = length(p);
      float vig = smoothstep(0.8 - panic * 0.45, 1.5 - panic * 0.45, vr);
      c *= 1.0 - vig * (vignette + panic * 0.35);
      float n = fract(sin(dot(floor(vUv * resolution) + time * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Renderer {
  three: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private edge: EdgePass;
  private bloom: UnrealBloomPass;
  private lens: ShaderPass;
  high = true;
  baseFov = 100;
  panic = 0;
  private time = 0;

  constructor(
    canvas: HTMLCanvasElement,
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {
    this.three = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.three.toneMapping = THREE.NeutralToneMapping;
    this.three.toneMappingExposure = 1.0;
    this.composer = new EffectComposer(this.three);
    this.composer.addPass(new RenderPass(scene, camera));
    this.edge = new EdgePass(scene, camera);
    this.composer.addPass(this.edge);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.35, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.lens = new ShaderPass(LensShader);
    this.composer.addPass(this.lens);
    camera.layers.enable(OUTLINE_LAYER);
  }

  setQuality(high: boolean): void {
    this.high = high;
    this.edge.enabled = high;
    this.bloom.enabled = high;
    if (high) this.camera.layers.enable(OUTLINE_LAYER);
    else this.camera.layers.disable(OUTLINE_LAYER);
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.high ? 1.5 : 1);
    this.three.setPixelRatio(pr);
    this.three.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.lens.uniforms.aspect.value = aspect;
    this.lens.uniforms.resolution.value.set(w * pr, h * pr);
    // landscape: 75 deg vertical (~106 deg across); portrait: 100 deg vertical. The lens pass then bends it.
    this.baseFov = aspect >= 1 ? 75 : THREE.MathUtils.lerp(100, 75, THREE.MathUtils.clamp((aspect - 0.5) / 0.5, 0, 1));
    this.updateFov();
  }

  private updateFov(): void {
    const fov = this.baseFov - this.panic * 7;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  render(dt: number): void {
    this.time += dt;
    this.lens.uniforms.time.value = this.time;
    this.lens.uniforms.panic.value = this.panic;
    this.updateFov();
    this.composer.render(dt);
  }
}

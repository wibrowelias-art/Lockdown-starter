import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type Preset = 'low' | 'medium' | 'high' | 'ultra';

export interface PresetSpec {
  pixelRatio: number;
  shadows: boolean;
  shadowSize: number;
  ao: boolean;
  bloom: boolean;
  smaa: boolean;
  dof: boolean;
  rectLights: boolean;
  dust: number;
  sirenShadows: boolean;
}

export function presetSpec(p: Preset): PresetSpec {
  const dpr = window.devicePixelRatio || 1;
  switch (p) {
    case 'low':
      return { pixelRatio: Math.min(dpr, 1) * 0.8, shadows: false, shadowSize: 512, ao: false, bloom: false, smaa: false, dof: false, rectLights: false, dust: 0, sirenShadows: false };
    case 'medium':
      return { pixelRatio: Math.min(dpr, 1), shadows: true, shadowSize: 1024, ao: false, bloom: true, smaa: true, dof: false, rectLights: true, dust: 140, sirenShadows: false };
    case 'high':
      return { pixelRatio: Math.min(dpr, 1.5), shadows: true, shadowSize: 2048, ao: true, bloom: true, smaa: true, dof: true, rectLights: true, dust: 260, sirenShadows: true };
    case 'ultra':
      return { pixelRatio: Math.min(dpr, 2), shadows: true, shadowSize: 4096, ao: true, bloom: true, smaa: true, dof: true, rectLights: true, dust: 400, sirenShadows: true };
  }
}

/** Grade + vignette + grain + optional fisheye ("Video lens"), after tone mapping. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    k: { value: 0 },
    aspect: { value: 1 },
    vignette: { value: 0.32 },
    panic: { value: 0 },
    mood: { value: 0 },
    time: { value: 0 },
    grain: { value: 0.018 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float k, aspect, vignette, panic, mood, time, grain;
    uniform vec2 resolution;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      vec2 src = p;
      if (k > 0.0) {
        vec2 q = vec2(p.x * aspect, p.y);
        float r2 = dot(q, q) / (aspect * aspect + 1.0);
        src = p * (1.0 + k * r2) / (1.0 + k);
      }
      vec3 c = texture2D(tDiffuse, src * 0.5 + 0.5).rgb;
      // grade: warm and bright for the exam, cold navy for the lockdown
      vec3 gain = mix(vec3(1.035, 1.0, 0.94), vec3(0.74, 0.86, 1.25), mood);
      vec3 lift = mix(vec3(0.0), vec3(0.01, 0.016, 0.07), mood);
      c = c * gain + lift * (1.0 - c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, mix(1.05, 1.08, mood));
      float vr = length(p * vec2(1.0, 0.92));
      float vig = smoothstep(0.75 - panic * 0.4, 1.55 - panic * 0.4, vr);
      c *= 1.0 - vig * (vignette + panic * 0.3);
      float n = fract(sin(dot(floor(vUv * resolution) + time * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Renderer {
  three: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private ao: GTAOPass;
  private bloom: UnrealBloomPass;
  private dofPass: BokehPass;
  private smaa: SMAAPass;
  private grade: ShaderPass;
  preset: Preset = 'high';
  spec: PresetSpec = presetSpec('high');
  videoLens = false;
  baseFov = 75;
  panic = 0;
  /** 0 warm .. 1 cold (from the world) */
  mood = 0;
  /** phone close-up: depth of field on */
  closeUp = false;
  /** eye adaptation */
  exposure = 1;
  targetExposure = 1;
  private time = 0;
  /** kept for the v2 test hook */
  get high(): boolean {
    return this.preset !== 'low';
  }

  constructor(
    canvas: HTMLCanvasElement,
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {
    this.three = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.three.toneMapping = THREE.AgXToneMapping;
    this.three.toneMappingExposure = 1;
    this.three.shadowMap.type = THREE.PCFShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.three);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.composer = new EffectComposer(this.three);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new GTAOPass(scene, camera, 512, 512);
    this.ao.blendIntensity = 0.9;
    this.ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 12 });
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.35, 2.6);
    this.composer.addPass(this.bloom);
    this.dofPass = new BokehPass(scene, camera, { focus: 0.35, aperture: 0.0035, maxblur: 0.008 });
    this.composer.addPass(this.dofPass);
    this.composer.addPass(new OutputPass());
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setPreset(p: Preset): void {
    this.preset = p;
    this.spec = presetSpec(p);
    this.three.shadowMap.enabled = this.spec.shadows;
    this.three.shadowMap.needsUpdate = true;
    this.ao.enabled = this.spec.ao;
    this.bloom.enabled = this.spec.bloom;
    this.smaa.enabled = this.spec.smaa;
    this.resize();
  }

  /** Debug/test: switch single passes. */
  toggle(name: 'ao' | 'bloom' | 'smaa' | 'grade', on: boolean): void {
    ({ ao: this.ao, bloom: this.bloom, smaa: this.smaa, grade: this.grade })[name].enabled = on;
  }

  /** v2 compatibility: high = 'high', low = 'low'. */
  setQuality(high: boolean): void {
    this.setPreset(high ? 'high' : 'low');
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = this.spec.pixelRatio;
    this.three.setPixelRatio(pr);
    this.three.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.grade.uniforms.aspect.value = aspect;
    this.grade.uniforms.resolution.value.set(w * pr, h * pr);
    // ~75 degree lens; on portrait screens keep at least ~60 degrees across
    const minH = THREE.MathUtils.degToRad(60);
    const vForH = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minH / 2) / aspect));
    this.baseFov = this.videoLens ? (aspect >= 1 ? 75 : 100) : Math.max(75 * (aspect >= 1 ? 1 : 1), Math.min(100, vForH));
    this.updateFov();
  }

  private updateFov(): void {
    const fov = this.baseFov - this.panic * 6;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  render(dt: number): void {
    this.time += dt;
    // eye adaptation: exposure follows the target over ~3 s
    this.exposure += (this.targetExposure - this.exposure) * (1 - Math.exp(-dt / 1.0));
    this.three.toneMappingExposure = this.exposure;
    const g = this.grade.uniforms;
    g.time.value = this.time;
    g.panic.value = this.panic;
    g.mood.value = this.mood;
    g.k.value = this.videoLens ? 0.3 + this.panic * 0.08 : 0;
    g.vignette.value = this.videoLens ? 0.5 : 0.32;
    this.dofPass.enabled = this.spec.dof && this.closeUp;
    this.updateFov();
    this.composer.render(dt);
  }
}

import * as THREE from "three";
import { Effect } from "postprocessing";

export interface RainLensState {
  time: number;
  rain: number;
  wetness: number;
  speed: number;
  enabled: boolean;
}

const FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uRain;
uniform float uWetness;
uniform float uSpeed;
uniform float uAspect;
uniform float uStrength;
uniform float uFogRadius;
uniform float uSeed;
uniform vec2 uTexel;
uniform vec2 uFlow;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 dropLayer(vec2 uv, float scale, float layerSeed, float slideChance, float sizeMul) {
  vec2 g = uv * vec2(scale * uAspect, scale);
  vec2 cell = floor(g);
  vec2 local = fract(g) - 0.5;
  vec2 key = cell + layerSeed * 31.7 + uSeed;
  float period = mix(5.0, 14.0, hash21(key));
  float t = uTime / period + hash21(key + 7.7);
  float cycle = floor(t);
  float life = fract(t);
  vec2 id = key + cycle * 17.31;
  float seed = hash21(id);
  float present = smoothstep(seed, seed + 0.12, uRain * 0.8);
  vec2 jitter = vec2(hash21(id + 0.13), hash21(id + 0.71)) - 0.5;
  vec2 center = jitter * 0.26;
  float slider = step(1.0 - slideChance, hash21(id + 5.3));
  float travel = slider * (0.12 + hash21(id + 9.1) * 0.18) * (0.6 + uRain * 0.4);
  float slideStart = 0.35 + hash21(id + 3.9) * 0.3;
  float u = clamp((life - slideStart) / (1.0 - slideStart), 0.0, 1.0);
  float x = u * 5.0;
  float prog = (floor(x) + smoothstep(0.0, 0.35, fract(x))) / 5.0;
  float grow = smoothstep(0.0, 0.05, life) * (1.0 + 0.25 * (1.0 - smoothstep(0.05, 0.16, life)));
  float fade = 1.0 - smoothstep(0.88, 1.0, life);
  float radius = (0.06 + hash21(id + 2.4) * 0.08) * sizeMul * (0.85 + uRain * 0.3)
               * grow * fade * (1.0 - 0.3 * prog * slider) * present;
  radius = max(radius, 1e-4);
  vec2 f = normalize(uFlow);
  vec2 pp = vec2(-f.y, f.x);
  vec2 start = center - f * travel * 0.5;
  vec2 pos = start + f * travel * prog;
  vec2 rel = local - pos;
  vec2 s = vec2(dot(rel, pp), dot(rel, f));
  float pathLen = travel * prog;
  float behind = -s.y;
  float trail = 0.0;
  if (s.y < 0.0) {
    trail = (1.0 - smoothstep(0.6 * pathLen, pathLen + 1e-4, behind))
          * (1.0 - smoothstep(0.0, radius * 0.35 + 1e-4, abs(s.x)))
          * step(0.01, pathLen) * fade * step(0.001, present);
    s.y /= 1.0 + uSpeed * 0.3;
  }
  float d = length(s);
  float inside = (1.0 - smoothstep(radius * 0.85, radius, d)) * step(0.001, present);
  float nd = clamp(d / radius, 0.0, 1.0);
  vec3 n = normalize(vec3(rel / radius, sqrt(max(0.0, 1.0 - nd * nd)) + 0.05));
  float spec = pow(max(dot(n, normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 24.0) * inside;
  vec2 offsetUv = -rel * uStrength * inside / vec2(scale * uAspect, scale);
  return vec4(offsetUv, clamp(inside + trail * 0.6, 0.0, 1.0), spec);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uRain <= 0.001 && uWetness <= 0.001) {
    outputColor = inputColor;
    return;
  }
  vec4 a = dropLayer(uv, 4.0, 1.0, 0.60, 1.3);
  vec4 b = dropLayer(uv, 7.0, 2.0, 0.50, 1.0);
  vec4 c = dropLayer(uv, 13.0, 3.0, 0.25, 0.9);
  vec4 d = dropLayer(uv, 30.0, 4.0, 0.0, 0.55);
  vec2 offset = a.xy + b.xy + c.xy + d.xy;
  float clarity = clamp(a.z + b.z + c.z + d.z, 0.0, 1.0);
  float spec = a.w + b.w + c.w + d.w;
  float fog = uWetness * (1.0 - clarity);
  vec2 r = uTexel * uFogRadius * fog;
  vec2 sampleUv = uv + offset;
  vec2 lo = vec2(0.001);
  vec2 hi = vec2(0.999);
  vec4 color = texture2D(inputBuffer, clamp(sampleUv, lo, hi)) * 0.4;
  color += texture2D(inputBuffer, clamp(sampleUv + vec2( r.x,  r.y), lo, hi)) * 0.15;
  color += texture2D(inputBuffer, clamp(sampleUv + vec2(-r.x,  r.y), lo, hi)) * 0.15;
  color += texture2D(inputBuffer, clamp(sampleUv + vec2( r.x, -r.y), lo, hi)) * 0.15;
  color += texture2D(inputBuffer, clamp(sampleUv + vec2(-r.x, -r.y), lo, hi)) * 0.15;
  color.rgb *= 1.0 - fog * 0.08;
  color.rgb += vec3(0.12, 0.16, 0.19) * spec * 0.8;
  outputColor = color;
}
`;

const FLOW_REST = new THREE.Vector2(0, -1);
const FLOW_FAST = new THREE.Vector2(0.35, 0.65).normalize();

export class RainLensEffect extends Effect {
  private state: RainLensState = { time: 0, rain: 0, wetness: 0, speed: 0, enabled: false };

  constructor() {
    super("RainLensEffect", FRAGMENT_SHADER, {
      uniforms: new Map<string, THREE.Uniform>([
        ["uTime", new THREE.Uniform(0)],
        ["uRain", new THREE.Uniform(0)],
        ["uWetness", new THREE.Uniform(0)],
        ["uSpeed", new THREE.Uniform(0)],
        ["uAspect", new THREE.Uniform(1)],
        ["uStrength", new THREE.Uniform(1.5)],
        ["uFogRadius", new THREE.Uniform(6)],
        ["uSeed", new THREE.Uniform(Math.random() * 100)],
        ["uTexel", new THREE.Uniform(new THREE.Vector2(1, 1))],
        ["uFlow", new THREE.Uniform(FLOW_REST.clone())],
      ]),
    });
  }

  setState(state: RainLensState): void {
    this.state = state;
  }

  override update(_renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget): void {
    const uniforms = this.uniforms;
    const speed = this.state.enabled ? Math.min(1, Math.max(0, this.state.speed) / 90) : 0;
    uniforms.get("uTime")!.value = Math.max(0, this.state.time);
    uniforms.get("uRain")!.value = this.state.enabled ? Math.min(1, Math.max(0, this.state.rain)) : 0;
    uniforms.get("uWetness")!.value = this.state.enabled ? Math.min(1, Math.max(0, this.state.wetness)) : 0;
    uniforms.get("uSpeed")!.value = speed;
    uniforms.get("uAspect")!.value = inputBuffer.width / Math.max(1, inputBuffer.height);
    (uniforms.get("uTexel")!.value as THREE.Vector2).set(1 / inputBuffer.width, 1 / inputBuffer.height);
    (uniforms.get("uFlow")!.value as THREE.Vector2).copy(FLOW_REST).lerp(FLOW_FAST, speed).normalize();
  }
}

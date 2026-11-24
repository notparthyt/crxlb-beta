import * as THREE from "three";
import type { BuiltTrackData } from "@/lib/track-data";
import type { FloodlitNightLook } from "./golden-hour-environment";

/*
 * The lamps a circuit's own model already has (street lamps, light poles, portable light towers, mast heads): at night
 * they glow and light the ground round them (venue-night-lighting.ts draws the light). Nothing here changes a hosted
 * file: the lamps are found in the loaded model by their material names, listed per circuit below, and measured once
 * at load.
 *
 * Each list names only materials checked in the game to be lamp heads or lamp poles. Matching by pattern would catch
 * asphalt ("Asphalt_Light"), start lights, marshal lights and billboards, which must not glow.
 *
 * A circuit with no entry has no lamps of its own: at night it is lit by the moon and the cars' headlights.
 */

export type CircuitNightMode = "floodlit" | "lamps";

export interface CircuitLampGroup {
  /** Exact material names of these lamps in the circuit's model */
  materials: readonly string[];
  /** Light colour (sRGB hex): sodium street lamps are warm, LED and metal-halide floodlights near white */
  color: number;
  /**
   * The material itself glows at night (a lamp head or lens). False for a material that is the whole pole: then only
   * a glow point at the top of each pole shows the lamp
   */
  glowMaterial: boolean;
  /** Emissive strength of a glowing material at full night */
  glow?: number;
  /** Strength of each lamp's pool of light on the ground, 0 for lamps that only glow (far floodlights, garden lamps) */
  pool: number;
  /** Size of each glow point (m); 0 for none */
  glowSizeM: number;
  /** Optional real spotlight beam, aimed toward the road from each detected fixture */
  beam?: CircuitLampBeam;
}

export interface CircuitLampBeam {
  intensity: number;
  distanceM: number;
  angleRad: number;
  penumbra: number;
}

export interface CircuitNightSpec {
  /**
   * "floodlit": raced under lights, the whole lap lit (the night's key light becomes the floodlight, as at Qiddiya).
   * "lamps": a moonlit night, with the lamps' pools of light where the model has lamps.
   */
  mode: CircuitNightMode;
  lamps: readonly CircuitLampGroup[];
  /** Architectural and vessel surfaces that glow at night */
  emissiveSurfaces?: readonly CircuitEmissiveSurfaceGroup[];
  /** Optional venue-specific ambient fill for shadowed areas at night */
  nightLook?: Partial<FloodlitNightLook>;
}

export interface CircuitEmissiveSurfaceGroup {
  /** Exact material names in the circuit model */
  materials: readonly string[];
  color: number;
  glow: number;
}

const SODIUM = 0xffc27a;
const WARM_WHITE = 0xfff0d8;
const COOL_WHITE = 0xf1f4ff;
const HOTEL_VIOLET = 0xb197ff;

const RISE: CircuitNightSpec = {
  mode: "floodlit",
  lamps: [{ materials: ["Light_Lamp"], color: COOL_WHITE, glowMaterial: true, glow: 6, pool: 0.8, glowSizeM: 4.2 }],
};
const YAS_MARINA: CircuitNightSpec = {
  mode: "floodlit",
  nightLook: { fillColor: 0x64738a, fillIntensity: 0.55, environmentIntensity: 0.42, nightStars: 0, shadowIntensity: 0.1 },
  lamps: [
    {
      materials: ["focos_altos_luces"],
      color: COOL_WHITE,
      glowMaterial: true,
      glow: 10,
      pool: 1.35,
      glowSizeM: 6.5,
    },
    {
      materials: ["focos_altos_gradas_luces"],
      color: COOL_WHITE,
      glowMaterial: true,
      glow: 12,
      pool: 1.75,
      glowSizeM: 7.2,
      beam: { intensity: 260, distanceM: 125, angleRad: 0.68, penumbra: 0.45 },
    },
    {
      materials: ["focos_exit_pits_luces"],
      color: COOL_WHITE,
      glowMaterial: true,
      glow: 9,
      pool: 1.35,
      glowSizeM: 4.2,
    },
    {
      materials: ["focos_bajos_luces", "tunnel_light_light"],
      color: COOL_WHITE,
      glowMaterial: true,
      glow: 8,
      pool: 1.05,
      glowSizeM: 3.6,
    },
  ],
  emissiveSurfaces: [
    {
      materials: [
        "abu_building_marinahotel_a_01",
        "abu_building_marinahotel_a_02",
        "abu_building_marinahotel_b_01",
        "abu_building_marinahotelbridge_a_01",
        "abu_building_marinahotelbridge_a_03",
        "abu_building_marinahotelbottom_a_01",
        "abu_building_marinahotelbottom_a_02",
        "abu_building_marinahotelbase_a_01",
        "abu_building_marinahotelbase_a_02",
        "abu_building_marinahotelbase_a_03",
        "abu_building_pittower_a_01",
        "abu_building_pittower_a_02",
      ],
      color: COOL_WHITE,
      glow: 0.65,
    },
    {
      materials: ["abu_building_marinahotel_roof_a_01"],
      color: HOTEL_VIOLET,
      glow: 0.9,
    },
    {
      materials: ["core_veh_boat_liner_01_a_02", "core_veh_boat_motor_04_b_02"],
      color: COOL_WHITE,
      glow: 1.1,
    },
  ],
};
const WATKINS: CircuitNightSpec = {
  mode: "lamps",
  lamps: [
    // Portable light towers along the lap
    { materials: ["portablelight.lights"], color: COOL_WHITE, glowMaterial: true, glow: 6, pool: 1, glowSizeM: 3.6 },
    // Lamps of the car parks and the paddock roads
    { materials: ["TSO3.light"], color: SODIUM, glowMaterial: true, glow: 5, pool: 0.7, glowSizeM: 2.4 },
  ],
};
const SACHSENRING: CircuitNightSpec = {
  mode: "lamps",
  // The pit garages' strip lights
  lamps: [{ materials: ["GarageLampNeonTube"], color: COOL_WHITE, glowMaterial: true, glow: 4, pool: 0.45, glowSizeM: 0 }],
};

/** Circuit id (and layouts sharing its model) to its night lighting */
const CIRCUIT_NIGHT_SPECS: Readonly<Record<string, CircuitNightSpec>> = {
  rwanda_official: RISE,
  rwanda_official_short: RISE,
  yas_marina_2021: YAS_MARINA,
  speedvegas: {
    mode: "lamps",
    lamps: [{ materials: ["lightpole_emitter"], color: WARM_WHITE, glowMaterial: true, glow: 6, pool: 1, glowSizeM: 3.2 }],
  },
  le_mans_82: {
    mode: "lamps",
    lamps: [
      // Spot lamps on poles round the lap
      { materials: ["VT_SPOT"], color: SODIUM, glowMaterial: true, glow: 5, pool: 0.9, glowSizeM: 2.6 },
      // The main grandstand's floodlights over the pit straight
      { materials: ["VT_FENCEDG_trib_lights"], color: WARM_WHITE, glowMaterial: true, glow: 4, pool: 1, glowSizeM: 4 },
    ],
  },
  norisring: {
    mode: "lamps",
    lamps: [
      // Street lamps: the lens under each head
      { materials: ["lamp03"], color: SODIUM, glowMaterial: true, glow: 6, pool: 0.9, glowSizeM: 2.6 },
      // The stadium's floodlight towers beyond the circuit
      { materials: ["floodlights", "floodlightsa"], color: COOL_WHITE, glowMaterial: true, glow: 8, pool: 0, glowSizeM: 9 },
      // Garden lamps of the park
      { materials: ["glamp01", "glamp03", "glamp04", "glamp05"], color: WARM_WHITE, glowMaterial: true, glow: 3, pool: 0.25, glowSizeM: 1.2 },
    ],
  },
  monaco: {
    mode: "lamps",
    lamps: [
      // Street lamps over the road
      { materials: ["lightin"], color: SODIUM, glowMaterial: true, glow: 6, pool: 0.95, glowSizeM: 2.6 },
      // Lamps along the harbour front
      { materials: ["ha_lamp."], color: WARM_WHITE, glowMaterial: true, glow: 5, pool: 0.6, glowSizeM: 1.8 },
    ],
  },
  istanbul_park: {
    mode: "lamps",
    // Tall light poles of the paddock and the car parks (the material is the whole pole)
    lamps: [{ materials: ["lightpole_lrg_e_01"], color: COOL_WHITE, glowMaterial: false, pool: 1, glowSizeM: 4.5 }],
  },
  watkins_glen: WATKINS,
  watkins_glen_short: WATKINS,
  willow_springs: {
    mode: "lamps",
    // Light poles by the paddock and the pit road (the material is the whole pole)
    lamps: [{ materials: ["TRACK_LIGHT"], color: WARM_WHITE, glowMaterial: false, pool: 0.9, glowSizeM: 3.2 }],
  },
  sachsenring: SACHSENRING,
  sachsenring_short: SACHSENRING,
};

/** The night lighting of a circuit's own lamps, or null for a circuit without any */
export function circuitNightSpec(trackId: string | undefined): CircuitNightSpec | null {
  return (trackId && CIRCUIT_NIGHT_SPECS[trackId]) || null;
}

/** Every circuit id with lamps of its own (for the checks) */
export const CIRCUITS_WITH_LAMPS: readonly string[] = Object.keys(CIRCUIT_NIGHT_SPECS);

/** One lamp found in the model */
export interface ModelLamp {
  /** The lamp head (world): the top of its cluster of geometry */
  x: number;
  y: number;
  z: number;
  /** Height of the head above the road beside it (m) */
  heightM: number;
  /** Level unit vector from the lamp toward the road */
  towardX: number;
  towardZ: number;
  /** Distance to the middle of the road (m) */
  roadDistM: number;
  /** Distance along the lap used to distribute the limited real spotlight count */
  s: number;
  /** Its group's light colour, pool strength and glow-point size */
  color: number;
  pool: number;
  glowSizeM: number;
  beam?: CircuitLampBeam;
}

/** A material that glows at night (venue-night-lighting.ts reads it from `userData.nightEmissive`) */
export interface NightEmissiveSpec {
  day: number;
  night: number;
  vertexColor?: boolean;
  /** False: the lamp throws its light through its pool, not as glow gathered from above */
  spill?: boolean;
}

/** Grid cell (m) that joins one lamp's geometry into one cluster */
const CLUSTER_CELL_M = 2.5;
/** Most vertices read per mesh when measuring (larger meshes are thinned) */
const MAX_VERTS_PER_MESH = 40000;
/** A cluster lower than this above the road is not a lamp (a kerb light, a sign) */
const MIN_LAMP_HEIGHT_M = 1.6;

/**
 * Finds a circuit's lamps in its loaded model, makes the glowing ones glow at night (`userData.nightEmissive`) and
 * returns where each lamp is. Call before `createVenueNightLighting`, which picks the glowing materials up.
 */
export function applyCircuitNightLights(
  root: THREE.Object3D,
  track: Pick<BuiltTrackData, "projectWorldToTrack">,
  spec: CircuitNightSpec
): { lamps: ModelLamp[] } {
  const lamps: ModelLamp[] = [];
  root.updateWorldMatrix(true, true);
  const v = new THREE.Vector3();
  const instanceMatrix = new THREE.Matrix4();
  for (const group of spec.lamps) {
    const names = new Set(group.materials);
    const pts: number[] = [];
    const tagged = new Set<THREE.Material>();
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const geo = mesh.geometry;
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
      const pos = geo.getAttribute("position");
      const index = geo.getIndex();
      if (!pos) return;
      for (const g of groups) {
        const mat = mats[g.materialIndex ?? 0] as THREE.MeshStandardMaterial | undefined;
        if (!mat || !names.has(mat.name)) continue;
        if (group.glowMaterial && !tagged.has(mat)) {
          tagged.add(mat);
          makeLampGlow(mat, group.color, group.glow ?? 5);
        }
        const total = index ? index.count : pos.count;
        const count = Math.min(g.count, total - g.start);
        const step = Math.max(1, Math.floor(count / MAX_VERTS_PER_MESH));
        const inst = mesh as THREE.InstancedMesh;
        const instanced = inst.isInstancedMesh === true;
        for (let k = 0; k < (instanced ? inst.count : 1); k++) {
          if (instanced) inst.getMatrixAt(k, instanceMatrix);
          for (let i = g.start; i < g.start + count; i += step) {
            v.fromBufferAttribute(pos, index ? index.getX(i) : i);
            if (instanced) v.applyMatrix4(instanceMatrix);
            v.applyMatrix4(mesh.matrixWorld);
            pts.push(v.x, v.y, v.z);
          }
        }
      }
    });
    for (const cluster of clusterPoints(pts)) {
      const lamp = lampOf(pts, cluster, track, group);
      if (lamp) lamps.push(lamp);
    }
  }
  for (const surface of spec.emissiveSurfaces ?? []) {
    const names = new Set(surface.materials);
    const tagged = new Set<THREE.Material>();
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!mats.some((mat) => names.has(mat.name))) return;
      for (const mat of mats) {
        if (names.has(mat.name) && !tagged.has(mat)) {
          tagged.add(mat);
          makeLampGlow(mat, surface.color, surface.glow);
        }
      }
    });
  }
  return { lamps };
}

/** The material glows in its lamp's colour at night: where it has a texture, by that texture (a lens, a lit panel) */
function makeLampGlow(mat: THREE.Material, color: number, glow: number): void {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  const standard = mat;
  standard.emissive.setHex(color);
  if (!standard.emissiveMap && standard.map) standard.emissiveMap = standard.map;
  standard.emissiveIntensity = 0;
  const spec: NightEmissiveSpec = { day: 0, night: glow, spill: false };
  standard.userData.nightEmissive = spec;
  standard.needsUpdate = true;
}

/** Point indices grouped by touching grid cells (one lamp each) */
function clusterPoints(pts: number[]): number[][] {
  const cells = new Map<string, number[]>();
  const n = pts.length / 3;
  for (let i = 0; i < n; i++) {
    const key = `${Math.floor(pts[i * 3] / CLUSTER_CELL_M)},${Math.floor(pts[i * 3 + 2] / CLUSTER_CELL_M)}`;
    let c = cells.get(key);
    if (!c) cells.set(key, (c = []));
    c.push(i);
  }
  const seen = new Set<string>();
  const clusters: number[][] = [];
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const stack = [start];
    const members: number[] = [];
    while (stack.length) {
      const key = stack.pop()!;
      for (const i of cells.get(key)!) members.push(i);
      const [cx, cz] = key.split(",").map(Number);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const nk = `${cx + dx},${cz + dz}`;
          if (cells.has(nk) && !seen.has(nk)) {
            seen.add(nk);
            stack.push(nk);
          }
        }
      }
    }
    clusters.push(members);
  }
  return clusters;
}

/** A cluster's lamp: its head is the middle of its topmost metre */
function lampOf(
  pts: number[],
  members: number[],
  track: Pick<BuiltTrackData, "projectWorldToTrack">,
  group: CircuitLampGroup
): ModelLamp | null {
  let top = -Infinity;
  for (const i of members) top = Math.max(top, pts[i * 3 + 1]);
  let sx = 0;
  let sz = 0;
  let k = 0;
  for (const i of members) {
    if (pts[i * 3 + 1] < top - 1) continue;
    sx += pts[i * 3];
    sz += pts[i * 3 + 2];
    k++;
  }
  const x = sx / k;
  const z = sz / k;
  const near = track.projectWorldToTrack(x, z);
  const road = near.sample.position;
  const heightM = top - road.y;
  if (!(heightM >= MIN_LAMP_HEIGHT_M)) return null;
  const dx = road.x - x;
  const dz = road.z - z;
  const d = Math.hypot(dx, dz);
  return {
    x,
    y: top,
    z,
    heightM,
    towardX: d > 1e-3 ? dx / d : 0,
    towardZ: d > 1e-3 ? dz / d : 0,
    roadDistM: d,
    s: near.s,
    color: group.color,
    pool: group.pool,
    glowSizeM: group.glowSizeM,
    beam: group.beam,
  };
}

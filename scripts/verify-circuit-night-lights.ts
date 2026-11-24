import assert from "node:assert/strict";
import * as THREE from "three";
import type { BuiltTrackData } from "@/lib/track-data";
import { createTrackSampleBuffer } from "@/lib/track-data";
import { applyCircuitNightLights, circuitNightSpec } from "@/lib/render/circuit-night-lights";

const spec = circuitNightSpec("yas_marina_2021");
assert.ok(spec?.emissiveSurfaces?.length, "Yas Marina has emissive architecture surfaces");
assert.equal(spec.nightLook?.nightStars, 0, "Yas Marina night sky omits the distracting white star points");
assert.equal(spec.nightLook?.shadowIntensity, 0.1, "Yas Marina floodlit shadows retain only 10% darkness");
assert.ok(
  !spec.emissiveSurfaces.some((surface) => surface.materials.some((name) => name.includes("stand") || name.includes("grandstand"))),
  "Grandstands are lit by fixtures rather than self-emissive surfaces"
);
const unrelated = new THREE.MeshStandardMaterial();
unrelated.name = "unlit_material";
const root = new THREE.Group();
const surfaceMaterials = spec.emissiveSurfaces.map((surface, index) => {
  const material = new THREE.MeshStandardMaterial();
  material.name = surface.materials[0];
  material.map = new THREE.Texture();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 8), [material, unrelated]);
  mesh.position.set(index * 20, 3, 4);
  root.add(mesh);
  return material;
});
const floodlight = new THREE.MeshStandardMaterial();
floodlight.name = "focos_altos_gradas_luces";
for (const x of [0, 30, 60]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), floodlight);
  mesh.position.set(x, 20, 0);
  root.add(mesh);
}

const sample = createTrackSampleBuffer();
const track: Pick<BuiltTrackData, "projectWorldToTrack"> = {
  projectWorldToTrack(worldX, worldZ) {
    sample.position.set(worldX, 0, worldZ + 30);
    return { sample, s: worldX, lateralOffset: 0, distSq: 900 };
  },
};
const result = applyCircuitNightLights(root, track, {
  mode: "floodlit",
  lamps: spec.lamps,
  emissiveSurfaces: spec.emissiveSurfaces,
});

spec.emissiveSurfaces.forEach((surface, index) => {
  const material = surfaceMaterials[index];
  assert.equal(material.userData.nightEmissive.night, surface.glow);
  assert.equal(material.emissive.getHex(), surface.color);
  assert.equal(material.emissiveMap, material.map);
});
assert.equal(unrelated.userData.nightEmissive, undefined);
assert.equal(result.lamps.length, 3);
assert.ok(result.lamps.every((lamp) => lamp.beam?.intensity === 260));
assert.ok(!("glows" in result), "No architectural particle points are generated");

console.log("PASS Yas Marina surfaces stay emissive, grandstands use floodlight beams, and no particle points are generated");

import * as THREE from "three";
import { buildRB22Car, loadRB22Template, RB22_URL, STEERING_RATIO, type RB22Visual } from "@/f1/rb22.mjs";
import type { Lc26ModelInstance } from "@/lib/lc26-car-model";
import type { SimCarRig } from "@/lib/car-builder-2026";
import { cornerRoadHeight, type RigCorner, type WheelSeating } from "@/lib/render/corner-rig";
import { moveToDriverHeadLayer } from "@/lib/render/layers";
import { assetProgress, type AssetTaskId } from "@/lib/loading/asset-progress";
import { withBasePath } from "@/lib/base-path";
import type { CarTelemetry, LiveryConfig, TireCompound } from "@/types/f1";

const DRIVER_HEAD_MESH_NAMES = new Set([
  "F1_1_M_Eyes_0",
  "F1_2_M_Head_0",
  "F1_6_M_Helmet_0",
  "Glass_M_Glass_0",
]);

// Offsets are metres in car space: +X left, +Y up, +Z forward.
const RB22_CAMERA_TUNING = {
  cockpit: { offset: new THREE.Vector3(0, 0, 0), pitchDeg: 0, fovDeg: 58 },
  tcam: { offset: new THREE.Vector3(0.12, 0.1, -0.25), pitchDeg: -20, fovDeg: 60 },
};

interface RB22Chassis {
  wheelbase: number;
  frontWeightFraction: number;
  maxRoadWheelDeg: number;
}

interface RB22Corner {
  wheel: RB22Visual["wheels"][number];
  seat: RigCorner;
}

let templateLoad: Promise<THREE.Group> | null = null;

function loadTemplate(): Promise<THREE.Group> {
  if (!templateLoad) {
    templateLoad = loadRB22Template(withBasePath(RB22_URL)).catch((error: unknown) => {
      templateLoad = null;
      throw error;
    });
  }
  return templateLoad;
}

function cameraAnchor(pos: THREE.Vector3, pitchDeg: number, fovDeg: number): Lc26ModelInstance["cameraAnchors"]["cockpit"] {
  return { pos, pitchRad: THREE.MathUtils.degToRad(pitchDeg), fovDeg };
}

export function createRB22CarRig(
  chassis: RB22Chassis,
  initialLivery: LiveryConfig,
  assetTask: AssetTaskId = "car",
): SimCarRig {
  const root = new THREE.Group();
  root.name = "RB22_RIG";
  const modelOrientation = new THREE.Group();
  modelOrientation.rotation.y = -Math.PI / 2;
  root.add(modelOrientation);
  const chassisGroup = new THREE.Group();
  chassisGroup.name = "RB22_SPRUNG_BODY";
  root.add(chassisGroup);
  const helmetGroup = new THREE.Group();
  helmetGroup.name = "RB22_DRIVER";
  chassisGroup.add(helmetGroup);

  const maxRoadWheelRad = THREE.MathUtils.degToRad(chassis.maxRoadWheelDeg);
  let livery = initialLivery;
  let compound: TireCompound = "medium";
  let visual: RB22Visual | null = null;
  let armSteeringAngle = Number.NaN;
  let elapsedSeconds = 0;
  let corners: RB22Corner[] = [];
  let cameraAnchors: Lc26ModelInstance["cameraAnchors"] | null = null;
  let disposed = false;

  const applyLivery = (next: LiveryConfig) => {
    if (!visual) return;
    const primary = new THREE.Color(next.primary);
    const accent = new THREE.Color(next.accent);
    visual.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        if (material.name.startsWith("redbull_paint")) material.color.copy(primary);
        else if (material.name.startsWith("redbull_color")) material.color.copy(accent);
      }
    });
  };

  const installVisual = (template: THREE.Group) => {
    const built = buildRB22Car(
      template,
      { wheelbase: chassis.wheelbase, frontWeight: chassis.frontWeightFraction },
      { originalLivery: true }
    );
    built.group.name = "RB22_MODEL";
    modelOrientation.add(built.group);
    root.updateMatrixWorld(true);
    chassisGroup.attach(built.body);
    for (const driver of built.driver) {
      helmetGroup.attach(driver);
      driver.traverse((object) => {
        if (DRIVER_HEAD_MESH_NAMES.has(object.name)) moveToDriverHeadLayer(object);
      });
    }
    built.setDriverVisible(true);
    built.setTireCompound(compound);
    root.updateMatrixWorld(true);
    built.updateArms();
    armSteeringAngle = built.steeringWheel.rotation.x;

    const orderedWheels = [
      { wheel: built.wheels[1], isFront: true, isLeft: false },
      { wheel: built.wheels[0], isFront: true, isLeft: true },
      { wheel: built.wheels[3], isFront: false, isLeft: false },
      { wheel: built.wheels[2], isFront: false, isLeft: true },
    ];
    corners = orderedWheels.map(({ wheel, isFront, isLeft }) => {
      const position = wheel.pivot.getWorldPosition(new THREE.Vector3());
      root.worldToLocal(position);
      const seat = new THREE.Group();
      seat.position.copy(position);
      return {
        wheel,
        seat: { steer: seat, spin: wheel.spin, isFront, isLeft, restY: position.y, tyre: null },
      };
    });

    const correction = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
    const eye = new THREE.Vector3(...built.eye).applyQuaternion(correction);
    const cockpit = eye.clone().add(RB22_CAMERA_TUNING.cockpit.offset);
    const tcam = eye.clone().add(RB22_CAMERA_TUNING.tcam.offset);
    cameraAnchors = {
      cockpit: cameraAnchor(
        cockpit,
        RB22_CAMERA_TUNING.cockpit.pitchDeg,
        RB22_CAMERA_TUNING.cockpit.fovDeg
      ),
      shoulder: cameraAnchor(eye.clone().add(new THREE.Vector3(0, 0.18, -0.3)), -8, 61),
      tcam: cameraAnchor(tcam, RB22_CAMERA_TUNING.tcam.pitchDeg, RB22_CAMERA_TUNING.tcam.fovDeg),
      dash: cameraAnchor(eye.clone().add(new THREE.Vector3(0, -0.12, 0.08)), -10, 55),
      bumper: cameraAnchor(new THREE.Vector3(0, 0.28, 2.15), -2, 55),
      nearChase: cameraAnchor(new THREE.Vector3(0, 1.1, -3.5), -8, 55),
      farChase: cameraAnchor(new THREE.Vector3(0, 1.8, -6.5), -8, 52),
    };
    visual = built;
    applyLivery(livery);
  };

  assetProgress.begin(assetTask);
  void loadTemplate()
    .then((template) => {
      assetProgress.done(assetTask);
      if (!disposed) installVisual(template);
    })
    .catch((error: unknown) => {
      assetProgress.fail(assetTask);
      if (!disposed) console.error("RB22 car model failed to load:", error);
    });

  const updateFromTelemetry = (
    telemetry: CarTelemetry,
    pitchRad: number,
    rollRad: number,
    wheelRotationRad: number,
    dtSeconds?: number,
    wheels?: WheelSeating
  ) => {
    chassisGroup.rotation.x = pitchRad;
    chassisGroup.rotation.z = rollRad;
    if (!visual) return;

    const roadWheelRad = -telemetry.steering * maxRoadWheelRad;
    for (const { wheel, seat } of corners) {
      if (seat.isFront) {
        const inside = (roadWheelRad > 0) === seat.isLeft;
        wheel.pivot.rotation.y = roadWheelRad * (inside ? 1.06 : 0.94);
      }
      wheel.spin.rotation.z = wheelRotationRad;
      if (wheels) wheel.pivot.position.y = seat.restY + cornerRoadHeight(seat, wheels);
    }
    visual.updateSuspension();

    const aero = telemetry.activeAeroMode === "X_MODE" ? 1 : 0;
    const drsFlap = visual.drsFlap;
    const rearTarget =
      Number(drsFlap.userData.closedRotation ?? 0) +
      Number(drsFlap.userData.openingDirection ?? 1) *
        Number(drsFlap.userData.openAngle ?? 0) *
        aero;
    drsFlap.rotation.x = THREE.MathUtils.lerp(drsFlap.rotation.x, rearTarget, 0.24);
    if (visual.frontWingFlap) {
      const frontTarget = Number(visual.frontWingFlap.userData.closedRotation ?? visual.frontWingFlap.rotation.x) + 0.2 * aero;
      visual.frontWingFlap.rotation.x = THREE.MathUtils.lerp(visual.frontWingFlap.rotation.x, frontTarget, 0.24);
    }
    visual.steeringWheel.rotation.x = -roadWheelRad * STEERING_RATIO;
    if (Math.abs(visual.steeringWheel.rotation.x - armSteeringAngle) > 1e-4) {
      root.updateMatrixWorld(true);
      visual.updateArms();
      armSteeringAngle = visual.steeringWheel.rotation.x;
    }

    elapsedSeconds += Math.min(Math.max(dtSeconds ?? 1 / 60, 0), 0.1);
    visual.updateHead({
      ax: telemetry.longitudinalG * 9.81,
      ay: telemetry.lateralG * 9.81,
      steer: telemetry.steering,
      speed: telemetry.speedMs,
      time: elapsedSeconds,
    });
  };

  return {
    root,
    chassisGroup,
    helmetGroup,
    hasDriverInHelmetGroup: true,
    setLivery: (next) => {
      livery = next;
      applyLivery(next);
    },
    setTireCompound: (next) => {
      compound = next;
      visual?.setTireCompound(next);
    },
    getCameraAnchors: () => cameraAnchors,
    getLc26Body: () => null,
    updateFromTelemetry,
    dispose: () => {
      disposed = true;
      root.removeFromParent();
    },
  };
}

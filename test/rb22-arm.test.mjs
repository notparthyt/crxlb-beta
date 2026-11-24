import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { buildRB22Car, loadRB22Template, STEERING_RATIO } from "../src/f1/rb22.mjs";

const bytes = await fs.readFile(new URL("../public/cars/hyper-rb22/model/redbull22.glb", import.meta.url));
const template = await loadRB22Template(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

test("RB22 original livery preserves the model's authored paint and driver suit", () => {
  const car = buildRB22Car(template, { wheelbase: 3.6, frontWeight: 0.45 }, { originalLivery: true });
  const sourceMaterials = new Set();
  template.traverse((object) => {
    if (object.isMesh && /redbull_paint|redbull_decals|M_Clothes/i.test(object.material?.name ?? "")) {
      sourceMaterials.add(object.material);
    }
  });
  let authoredMeshes = 0;
  car.group.traverse((object) => {
    if (!object.isMesh || !/redbull_paint|redbull_decals|M_Clothes/i.test(object.material?.name ?? "")) return;
    assert.ok(sourceMaterials.has(object.material), `${object.material.name} stays authored`);
    authoredMeshes++;
  });
  assert.ok(authoredMeshes > 0);
});

test("RB22 arms stay within their authored length during steering and chassis pitch", () => {
  const car = buildRB22Car(template, { wheelbase: 3.6, frontWeight: 0.45 });
  const handPosition = (hand) => hand.getWorldPosition(new THREE.Vector3());

  car.group.updateMatrixWorld(true);
  car.updateArms();
  car.group.updateMatrixWorld(true);

  const forearmLengths = car.driverElbows.map((forearm, index) =>
    forearm.getWorldPosition(new THREE.Vector3()).distanceTo(handPosition(car.driverHands[index]))
  );
  const maxRoadWheelRad = THREE.MathUtils.degToRad(26);

  for (const pitch of [-0.02, 0.02]) {
    for (const steering of [-0.12, 0.12]) {
      car.body.rotation.x = pitch;
      const roadWheelRad = -steering * maxRoadWheelRad;
      car.steeringWheel.rotation.x = -roadWheelRad * STEERING_RATIO;
      car.updateArms();
      car.group.updateMatrixWorld(true);

      car.driverHands.forEach((hand, index) => {
        const forearm = car.driverElbows[index];
        const forearmLength = forearm
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(handPosition(hand));
        assert.ok(forearmLength <= forearmLengths[index] + 1e-4, `forearm ${index} stays within its rest length`);
      });
    }
  }
});

test("RB22 hands follow the wheel at normal steering angles", () => {
  const car = buildRB22Car(template, { wheelbase: 3.6, frontWeight: 0.45 });
  const gripPosition = (hand) =>
    car.steeringWheel.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));

  car.group.updateMatrixWorld(true);
  car.updateArms();
  car.group.updateMatrixWorld(true);
  const grips = car.driverHands.map((hand) => gripPosition(hand).clone());

  for (const angle of [-0.2, 0.2]) {
    car.steeringWheel.rotation.x = angle;
    car.updateArms();
    car.group.updateMatrixWorld(true);
    car.driverHands.forEach((hand, index) => {
      assert.ok(gripPosition(hand).distanceTo(grips[index]) < 0.01, `hand ${index} stays near the wheel grip`);
    });
  }
});

test("RB22 hands stay at their wheel grips through repeated chassis movement", () => {
  const car = buildRB22Car(template, { wheelbase: 3.6, frontWeight: 0.45 });
  const gripPosition = (hand) =>
    car.steeringWheel.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));

  car.group.updateMatrixWorld(true);
  car.steeringWheel.rotation.x = 0.2;
  car.updateArms();
  car.group.updateMatrixWorld(true);
  const grips = car.driverHands.map((hand) => gripPosition(hand).clone());

  for (let frame = 0; frame < 40; frame++) {
    car.body.rotation.x = Math.sin(frame * 0.17) * 0.04;
    car.body.rotation.z = Math.cos(frame * 0.11) * 0.025;
    car.updateArms();
    car.group.updateMatrixWorld(true);
    car.driverHands.forEach((hand, index) => {
      const offset = gripPosition(hand).distanceTo(grips[index]);
      assert.ok(offset < 1e-4, `hand ${index} stays at its wheel grip (offset ${offset})`);
    });
  }
});

test("RB22 front steering links and wishbones follow wheel steering and bumps, then return to neutral", () => {
  const car = buildRB22Car(template, { wheelbase: 3.6, frontWeight: 0.45 });
  const links = [
    { name: "Object_42045", wheel: car.wheels[0] },
    { name: "Object_41985", wheel: car.wheels[1] },
    { name: "Suspension_Lower_Left", wheel: car.wheels[0] },
    { name: "Suspension_Lower_Right", wheel: car.wheels[1] },
    { name: "Object_42358", wheel: car.wheels[1] },
    { name: "Object_42540", wheel: car.wheels[0] },
    { name: "Object_42470", wheel: car.wheels[1] },
    { name: "Object_42670", wheel: car.wheels[0] },
  ];
  const meshes = links.map(({ name }) => car.group.getObjectByName(name));
  assert.ok(meshes.every((mesh) => mesh?.isMesh));
  car.updateSuspension();
  const rest = meshes.map((mesh) => mesh.geometry.attributes.position.array.slice());

  car.wheels[0].pivot.rotation.y = 0.3;
  car.wheels[1].pivot.rotation.y = -0.3;
  car.wheels[0].pivot.position.y += 0.04;
  car.wheels[1].pivot.position.y -= 0.025;
  car.updateSuspension();
  meshes.forEach((mesh, index) => {
    const position = mesh.geometry.attributes.position.array;
    assert.ok(position.some((value, i) => Math.abs(value - rest[index][i]) > 1e-5), `link ${links[index].name} follows its wheel`);
  });

  for (const { wheel } of links) {
    wheel.pivot.rotation.y = 0;
  }
  car.wheels[0].pivot.position.y -= 0.04;
  car.wheels[1].pivot.position.y += 0.025;
  car.updateSuspension();
  meshes.forEach((mesh, index) => {
    const position = mesh.geometry.attributes.position.array;
    position.forEach((value, i) => assert.ok(Math.abs(value - rest[index][i]) < 1e-6, `${links[index].name} restores vertex ${i}`));
  });
});

test("RB22 intermediate and wet tires show shallow tread grooves on every wheel", () => {
  const car = buildRB22Car(template, { wheelbase: 3.6, frontWeight: 0.45 });
  const treads = car.wheels.map((_, index) => car.group.getObjectByName(`tire-tread-${index}`));
  const sidewalls = car.wheels.map((_, index) => [
    ...car.group.getObjectsByProperty("name", `tire-outline-${index}`),
  ]);
  assert.ok(treads.every((tread) => tread?.isMesh));
  assert.ok(sidewalls.every((pair) => pair.length === 2));

  for (const compound of ["intermediate", "wet"]) {
    car.setTireCompound(compound);
    treads.forEach((tread) => {
      assert.equal(tread.visible, true);
      assert.ok(tread.geometry.drawRange.count > 0, `${compound} groove pattern is drawn`);
    });
  }

  car.setTireCompound("medium");
  treads.forEach((tread) => assert.equal(tread.visible, false));
});

test("RB22 hands do not react to chassis physics between steering updates", () => {
  const car = buildRB22Car(template, { wheelbase: 3.6, frontWeight: 0.45 }, { originalLivery: true });
  const rigRoot = new THREE.Group();
  const modelOrientation = new THREE.Group();
  const chassisGroup = new THREE.Group();
  const helmetGroup = new THREE.Group();
  modelOrientation.rotation.y = -Math.PI / 2;
  rigRoot.add(modelOrientation, chassisGroup);
  chassisGroup.add(helmetGroup);
  modelOrientation.add(car.group);
  rigRoot.updateMatrixWorld(true);
  chassisGroup.attach(car.body);
  car.driver.forEach((driver) => helmetGroup.attach(driver));

  const gripPosition = (hand) =>
    car.steeringWheel.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
  rigRoot.updateMatrixWorld(true);
  car.steeringWheel.rotation.x = 0.2;
  rigRoot.updateMatrixWorld(true);
  car.updateArms();
  rigRoot.updateMatrixWorld(true);
  const grips = car.driverHands.map((hand) => gripPosition(hand).clone());

  for (let frame = 0; frame < 40; frame++) {
    rigRoot.position.set(Math.sin(frame * 0.04) * 2, 0.3, Math.cos(frame * 0.04) * 2);
    rigRoot.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), frame * 0.003);
    chassisGroup.rotation.x = Math.sin(frame * 0.17) * 0.04;
    chassisGroup.rotation.z = Math.cos(frame * 0.11) * 0.025;
    rigRoot.updateMatrixWorld(true);
    car.driverHands.forEach((hand, index) => {
      assert.ok(
        gripPosition(hand).distanceTo(grips[index]) < 1e-4,
        `hand ${index} stays fixed while chassis physics moves`
      );
    });
  }
});

test("RB22 head animation responds to driving forces and returns to rest", () => {
  const car = buildRB22Car(template, { wheelbase: 3.6, frontWeight: 0.45 }, { originalLivery: true });
  const { driverHead, driverNeck, driverRest } = car;
  assert.ok(driverHead && driverNeck && driverRest.head && driverRest.neck && driverRest.headPosition);
  const initialPosition = driverHead.position.clone();

  car.updateHead({ ax: 8, ay: -6, steer: 0.7, speed: 70, time: 1.2 });
  assert.ok(driverHead.position.distanceTo(initialPosition) > 1e-4);
  assert.ok(1 - Math.abs(driverHead.quaternion.dot(driverRest.head)) > 1e-4);
  assert.ok(1 - Math.abs(driverNeck.quaternion.dot(driverRest.neck)) > 1e-5);

  car.updateHead();
  assert.ok(driverHead.position.distanceTo(driverRest.headPosition) < 1e-8);
  assert.ok(1 - Math.abs(driverHead.quaternion.dot(driverRest.head)) < 1e-8);
  assert.ok(1 - Math.abs(driverNeck.quaternion.dot(driverRest.neck)) < 1e-8);
});

test("RB22 hand-over-hand transfer starts after 150 degrees in either direction", () => {
  const car = buildRB22Car(template, { wheelbase: 3.6, frontWeight: 0.45 });
  const gripPosition = (hand) =>
    car.steeringWheel.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));

  car.group.updateMatrixWorld(true);
  for (const side of [-1, 1]) {
    car.steeringWheel.rotation.x = THREE.MathUtils.degToRad(side * 149);
    car.updateArms();
    car.group.updateMatrixWorld(true);
    const beforeThreshold = car.driverHands.map((hand) => gripPosition(hand).clone());

    car.steeringWheel.rotation.x = THREE.MathUtils.degToRad(side * 150);
    car.updateArms();
    car.group.updateMatrixWorld(true);
    car.driverHands.forEach((hand, index) => {
      assert.ok(
        gripPosition(hand).distanceTo(beforeThreshold[index]) < 0.01,
        `hand ${index} has not transferred at 150 degrees`
      );
    });

    car.steeringWheel.rotation.x = THREE.MathUtils.degToRad(side * 160);
    car.updateArms();
    car.group.updateMatrixWorld(true);
    const movement = car.driverHands.map((hand, index) =>
      gripPosition(hand).distanceTo(beforeThreshold[index])
    );
    assert.ok(movement.some((distance) => distance > 0.02), `a hand transfers past 150 degrees on side ${side}`);
  }
});

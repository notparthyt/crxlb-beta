import type * as THREE from "three";

export interface RB22Wheel {
  pivot: THREE.Group;
  spin: THREE.Group;
  front: boolean;
}

export interface RB22Visual {
  group: THREE.Group;
  body: THREE.Group;
  wheels: RB22Wheel[];
  driver: THREE.Object3D[];
  steeringWheel: THREE.Object3D;
  drsFlap: THREE.Object3D;
  frontWingFlap?: THREE.Object3D | null;
  eye: [number, number, number];
  setDriverVisible(visible: boolean): void;
  setTireCompound(compound: "soft" | "medium" | "hard" | "intermediate" | "wet"): string;
  updateArms(): void;
  updateSuspension(): void;
  updateHead(input?: { ax?: number; ay?: number; steer?: number; speed?: number; time?: number }): void;
}

export declare const RB22_URL: string;
export declare const STEERING_RATIO: number;
export declare function loadRB22Template(source?: string): Promise<THREE.Group>;
export declare function buildRB22Car(
  template: THREE.Group,
  config: { wheelbase: number; frontWeight: number; [key: string]: unknown },
  options?: { paint?: number; accent?: number; helmet?: number; index?: number; suitIndex?: number; originalLivery?: boolean },
): RB22Visual;

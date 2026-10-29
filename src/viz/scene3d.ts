import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Raycaster,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  CylinderGeometry,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { bendAt, partlyRolled, traceProfile } from "../domain/profile";
import { eccentricPoint } from "../domain/eccentric";
import { coneAlongRolls, placeConeOnMachine } from "./conePlacement";
import { feedLength } from "./sceneModel";
import { buildFrame, housingDepth } from "./machine3d";
import type { SceneModel } from "./sceneModel";

// Model is built in metres to keep camera and depth precision comfortable.
const MM = 0.001;

/*
 * The plate roll itself (housings, tower, yoke, ejector, supports, feed table) is a model built to the
 * machine's layout drawing, in metres with the pinch line at the origin and the rolls along z. It is
 * fetched once; until it arrives, or if it cannot be loaded, the simple frame from machine3d stands in.
 */
let machineModel: Promise<Group | null> | null = null;

function loadMachineModel(): Promise<Group | null> {
  machineModel ??= new GLTFLoader()
    .loadAsync(`${import.meta.env.BASE_URL}models/machine.glb`)
    .then((gltf) => gltf.scene)
    .catch(() => null);
  return machineModel;
}

/** Machine parts the viewer can hide when they block the view. */
export type ViewPreset = "iso" | "front" | "side" | "top";

// Camera directions for the preset views, from the part towards the camera.
const PRESETS: Record<ViewPreset, Vector3> = {
  iso: new Vector3(0.55, 0.38, 1.3),
  front: new Vector3(0, 0.12, 1),
  side: new Vector3(1, 0.12, 0),
  // Slightly off vertical so the orbit controls keep a defined "up".
  top: new Vector3(0.001, 1, 0.02),
};

export type MachinePart =
  "housings" | "tower" | "ejector" | "supports" | "posts" | "table" | "rolls";

/** Which part a node of the machine model belongs to, from its name. */
function partOf(name: string): MachinePart {
  if (/^Tower/.test(name)) return "tower";
  if (/^Post/.test(name)) return "posts";
  if (/^Ejector/.test(name)) return "ejector";
  if (/^Support/.test(name)) return "supports";
  if (/^Table/.test(name)) return "table";
  return "housings";
}

/**
 * Work roll along z: barrel with a slight crown (it offsets the deflection under load), chamfered
 * shoulders, and journals that run into the housings.
 */
function rollGeometry(r: number, barrel: number, back: number, front: number): LatheGeometry {
  const h = barrel / 2;
  const pts: Vector2[] = [];
  const add = (rad: number, y: number) => pts.push(new Vector2(rad, y));
  add(0, -h - back);
  add(r * 0.48, -h - back);
  add(r * 0.48, -h - back * 0.35);
  add(r * 0.6, -h - back * 0.35);
  add(r * 0.6, -h);
  add(r * 0.97, -h);
  add(r, -h + r * 0.06);
  for (let i = 1; i < 12; i++) {
    const u = -1 + (2 * i) / 12;
    add(r * (1 + 0.004 * (1 - u * u)), u * (h - r * 0.06));
  }
  add(r, h - r * 0.06);
  add(r * 0.97, h);
  add(r * 0.6, h);
  add(r * 0.6, h + front * 0.35);
  add(r * 0.48, h + front * 0.35);
  add(r * 0.48, h + front);
  add(0, h + front);
  const geo = new LatheGeometry(pts, 72);
  geo.rotateX(Math.PI / 2);
  return geo;
}

export interface ScenePalette {
  plate: string;
  roll: string;
  accent: string;
}

/** Rendered on demand: nothing is drawn unless the model, view or animation changes. */
export class RollingScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(35, 1, 0.01, 500);
  private controls: OrbitControls;
  private root = new Group();
  private plate: Mesh | null = null;
  private rolls: Mesh[] = [];
  private sidePivot = new Group();
  /** Swinging arms that carry the side rolls in the front frame, as in the assembly drawings. */
  private levers = new Group();
  private plateMat = new MeshStandardMaterial({
    metalness: 0.55,
    roughness: 0.42,
    side: DoubleSide,
  });
  private rollMat = new MeshStandardMaterial({ metalness: 0.7, roughness: 0.35 });
  private accentMat = new MeshStandardMaterial({ metalness: 0.4, roughness: 0.5 });
  // Machine paint stays the same in both themes, like the real machine.
  private frameMat = new MeshStandardMaterial({ color: 0xb3261e, metalness: 0.15, roughness: 0.6 });
  private collarMat = new MeshStandardMaterial({ color: 0x1b2a5c, metalness: 0.3, roughness: 0.5 });
  private yokeMat = new MeshStandardMaterial({ color: 0x8c1d17, metalness: 0.15, roughness: 0.6 });
  private machineGroup = new Group();
  private machineTemplate: Group | null = null;
  private hidden = new Set<MachinePart>();
  private model: SceneModel | null = null;
  private progress = 1;
  private frame = 0;
  private resizeObserver: ResizeObserver;
  private lastRollAngle = 0;

  constructor(private host: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Filmic tone mapping and a studio environment give metal and paint believable reflections.
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.append(this.renderer.domElement);
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.add(this.root);
    this.scene.add(new HemisphereLight(0xffffff, 0x404040, 0.45));
    this.scene.add(new AmbientLight(0xffffff, 0.1));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const rim = new DirectionalLight(0xffffff, 0.8);
    rim.position.set(-4, 2, -3);
    this.scene.add(rim);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    // Zoom towards the point under the cursor, pan in the screen plane, never below the floor.
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = true;
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.addEventListener("change", () => this.requestRender());
    // Double-click centres the view on the clicked part and moves closer to it.
    this.renderer.domElement.addEventListener("dblclick", (e) => this.focusAt(e));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    void loadMachineModel().then((model) => {
      this.machineTemplate = model;
      if (model) {
        this.rebuildRolls();
        this.requestRender();
      }
    });
  }

  setPalette(p: ScenePalette) {
    this.plateMat.color = new Color(p.plate);
    this.rollMat.color = new Color(p.roll);
    this.accentMat.color = new Color(p.accent);
    this.requestRender();
  }

  setModel(model: SceneModel | null) {
    const refit =
      !this.model ||
      !model ||
      this.model.shape !== model.shape ||
      scaleOf(this.model) !== scaleOf(model);
    this.model = model;
    this.rebuildRolls();
    this.rebuildPlate();
    this.fit(!refit);
    this.requestRender();
  }

  setProgress(p: number) {
    this.progress = Math.min(1, Math.max(0, p));
    this.rebuildPlate();
    this.placeSideRoll();
    this.spinRolls();
    this.requestRender();
  }

  /** Hides machine parts that block the view; the plate always stays visible. */
  setHidden(parts: Iterable<MachinePart>) {
    this.hidden = new Set(parts);
    this.applyVisibility();
    this.requestRender();
  }

  private applyVisibility() {
    for (const roll of this.rolls) roll.visible = !this.hidden.has("rolls");
    this.levers.visible = !this.hidden.has("housings");
    for (const child of this.machineGroup.children)
      child.visible = !this.hidden.has(partOf(child.name));
  }

  resetView() {
    this.fit();
    this.requestRender();
  }

  /** Looks at the part from a fixed side: front = from the yoke end, side = from the feed table. */
  setViewPreset(preset: ViewPreset) {
    this.fit(false, PRESETS[preset]);
    this.requestRender();
  }

  private focusAt(e: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.root, true).find((h) => h.object.visible);
    if (!hit) return;
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(0.6);
    this.controls.target.copy(hit.point);
    this.camera.position.copy(hit.point).add(offset);
    this.controls.update();
    this.requestRender();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      // Damping keeps moving after the gesture ends; keep rendering until it settles.
      if (this.controls.update()) this.requestRender();
      this.renderer.render(this.scene, this.camera);
    });
  }

  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /**
   * Frames everything currently in the scene. While rolling, the flat tail shrinks, so the view follows
   * the part; an existing orbit direction is kept unless the view is reset.
   */
  private fit(keepDirection = false, direction?: Vector3) {
    if (!this.model) return;
    // Frame the whole run, flat blank to finished part, with the rolls, so the camera can stay put
    // while rolling. The frame and feed table may run out of view.
    const box = new Box3();
    for (const o of this.rolls) box.expandByObject(o);
    for (const p of [0, 1]) {
      const geo = plateGeometry(this.model, p);
      geo.computeBoundingBox();
      if (geo.boundingBox) box.union(geo.boundingBox);
      geo.dispose();
    }
    const sphere = box.getBoundingSphere(new Sphere());
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return;
    const dist = (sphere.radius / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.15;
    // Default: mostly along the roll axis, so the bending profile reads clearly.
    const dir = keepDirection
      ? this.camera.position.clone().sub(this.controls.target).normalize()
      : (direction ?? PRESETS.iso).clone().normalize();
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.near = dist / 200;
    this.camera.far = dist * 20;
    this.controls.minDistance = dist * 0.04;
    this.controls.maxDistance = dist * 4;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(sphere.center);
    this.controls.update();
  }

  private clear(mesh: Mesh | null) {
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }

  private rebuildRolls() {
    this.rolls.forEach((r) => this.clear(r));
    this.rolls = [];
    this.sidePivot.removeFromParent();
    this.levers.removeFromParent();
    this.levers.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.levers = new Group();
    this.root.remove(this.machineGroup);
    // Clones of the loaded model share its geometry, which must outlive them.
    if (!this.machineGroup.userData.shared)
      this.machineGroup.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    this.machineGroup = new Group();
    const m = this.model;
    if (!m) return;
    const mv = m.machine;
    const t = m.thickness;
    const rt = mv.rolls.top / 2,
      rb = mv.rolls.bottom / 2,
      rs = mv.rolls.side / 2;
    // Journals run into both housings, so it shows where the rolls are carried.
    // With the machine model only the top roll's journal reaches into the yoke; the others end inside
    // the front frame. The simple frame uses short journals throughout. Back journals (−z) run into
    // the drive housing.
    const short = (housingDepth(mv) + 20) * MM;
    const model = this.machineTemplate !== null;
    const back = model ? MODEL_JOURNAL_BACK : short;
    const add = (
      r: number,
      x: number,
      y: number,
      mat: MeshStandardMaterial,
      front = model ? MODEL_JOURNAL_FRONT : short,
    ) => {
      const mesh = new Mesh(rollGeometry(r * MM, mv.rollLength * MM, back, front), mat);
      mesh.position.set(x * MM, y * MM, 0);
      // Dark seal collars where the barrel meets the journals, as on the machine.
      for (const end of [-1, 1]) {
        const collar = new Mesh(
          new CylinderGeometry(r * MM * 0.82, r * MM * 0.82, 0.07, 48),
          this.collarMat,
        );
        collar.rotation.x = Math.PI / 2;
        collar.position.z = end * ((mv.rollLength / 2) * MM + 0.035);
        mesh.add(collar);
      }
      this.root.add(mesh);
      this.rolls.push(mesh);
    };
    // Pinch point at the origin: top roll inside the shell, bottom roll below the plate.
    add(rt, 0, t / 2 + rt, this.rollMat, model ? MODEL_JOURNAL_TOP : short);
    add(rb, 0, -t / 2 - rb, this.rollMat);
    // Exit-side roll is placed by placeSideRoll through a pivot, which can also tilt it for cones;
    // the roll itself only spins about its own axis. Entry-side roll waits under the flat plate.
    add(rs, 0, 0, this.rollMat);
    this.sidePivot = new Group();
    this.root.add(this.sidePivot);
    this.sidePivot.add(this.rolls[2]!);
    add(rs, (rb + rs) * 1.08, -t / 2 - rs - rb * 0.18, this.rollMat);
    this.placeSideRoll();

    if (this.machineTemplate) {
      this.buildLevers(rs);
      this.machineGroup = this.machineTemplate.clone();
      this.machineGroup.userData.shared = true;
      this.root.add(this.machineGroup);
      this.applyVisibility();
      this.liftTower();
      this.dropPosts();
      return;
    }
    const blank = feedLength(m);
    this.machineGroup = buildFrame(
      mv,
      t,
      Math.min(3000, Math.max(800, blank * 0.5)),
      { frame: this.frameMat, yoke: this.yokeMat, steel: this.rollMat },
      MM,
    );
    this.root.add(this.machineGroup);
    this.applyVisibility();
  }

  /**
   * The exit-side roll bends the plate: it rests on the outer surface of the bend being formed, or
   * stays low, mirrored to the entry roll, while a straight passes.
   */
  private placeSideRoll() {
    const m = this.model;
    const roll = this.rolls[2];
    if (!m || !roll) return;
    const t = m.thickness;
    const rb = m.machine.rolls.bottom / 2,
      rs = m.machine.rolls.side / 2;
    // A cone bends with a radius that grows along the generator. The roll's drive end stays put and
    // the yoke end is raised, so the roll runs askew: low at the large end by the drive housing,
    // higher at the small end towards the yoke.
    if (m.shape === "cone") {
      const at = coneAlongRolls(m);
      const large = this.sideRollAt(m.rOuter * Math.tan(m.alpha), t, rb, rs);
      const small = this.sideRollAt(m.rInner * Math.tan(m.alpha), t, rb, rs);
      const dz = at.small - at.large;
      // The roll is centred on z = 0; place it on the line through both contact points.
      const k = -at.large / dz;
      this.sidePivot.position.set(
        (large.x + (small.x - large.x) * k) * MM,
        (large.y + (small.y - large.y) * k) * MM,
        0,
      );
      const axis = new Vector3((small.x - large.x) * MM, (small.y - large.y) * MM, dz * MM);
      this.sidePivot.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), axis.normalize());
      this.updateLevers();
      return;
    }
    this.sidePivot.quaternion.identity();
    const R =
      m.shape === "cylinder"
        ? m.radius
        : m.shape === "profile"
          ? bendAt(m.profile, m.dev, this.progress * m.dev.length)
          : m.result.rtMin * t + m.result.k * t;
    const p = this.sideRollAt(R, t, rb, rs);
    this.sidePivot.position.set(p.x * MM, p.y * MM, 0);
    this.updateLevers();
  }

  /** Two arms, one per side roll, each a beam from its pivot to an eye round the roll journal. */
  private buildLevers(rs: number) {
    for (let i = 0; i < 2; i++) {
      const arm = new Mesh(new BoxGeometry(1, 1, 1), this.yokeMat);
      const eye = new Mesh(
        new CylinderGeometry(rs * MM * 0.85, rs * MM * 0.85, 0.12, 40),
        this.yokeMat,
      );
      eye.rotation.x = Math.PI / 2;
      const hub = new Mesh(new CylinderGeometry(0.07, 0.07, 0.16, 24), this.collarMat);
      hub.rotation.x = Math.PI / 2;
      const g = new Group();
      g.add(arm, eye, hub);
      this.levers.add(g);
    }
    this.root.add(this.levers);
    this.updateLevers();
  }

  /** Points each arm from its fixed pivot to where its roll's axis crosses the front frame. */
  private updateLevers() {
    const m = this.model;
    if (!m || this.levers.children.length !== 2) return;
    const z = (m.machine.rollLength / 2) * MM + LEVER_Z;
    const exit = this.sidePivot;
    const dir = new Vector3(0, 0, 1).applyQuaternion(exit.quaternion);
    const k = (z - exit.position.z) / dir.z;
    const exitAt = exit.position.clone().addScaledVector(dir, k);
    const entry = this.rolls[3]?.position;
    if (!entry) return;
    const ends: [number, Vector3][] = [
      [-1, exitAt],
      [1, new Vector3(entry.x, entry.y, z)],
    ];
    ends.forEach(([side, at], i) => {
      const g = this.levers.children[i]!;
      const [arm, eye, hub] = g.children as Mesh[];
      const px = side * LEVER_PIVOT_X,
        py = LEVER_PIVOT_Y;
      const dx = at.x - px,
        dy = at.y - py;
      arm!.position.set((px + at.x) / 2, (py + at.y) / 2, z);
      arm!.rotation.z = Math.atan2(dy, dx);
      arm!.scale.set(Math.hypot(dx, dy), 0.11, 0.09);
      eye!.position.set(at.x, at.y, z);
      hub!.position.set(px, py, z);
    });
  }

  /**
   * Exit-side roll centre [mm] for a bend of neutral radius R: resting on the outer surface of the
   * bend, or low, mirrored to the entry roll, while a straight (R null) passes.
   */
  private sideRollAt(R: number | null, t: number, rb: number, rs: number) {
    if (R === null) return { x: -(rb + rs) * 1.08, y: -t / 2 - rs - rb * 0.18 };
    const reach = R + t / 2 + rs;
    const beta = Math.asin(Math.min(0.95, ((rb + rs) * 1.08) / reach));
    return { x: -reach * Math.sin(beta), y: R - reach * Math.cos(beta) };
  }

  private spinRolls() {
    const m = this.model;
    if (!m) return;
    // Rolls turn with the plate feed so the motion reads as rolling, not sliding.
    const fed = this.progress * feedLength(m);
    const delta = fed - this.lastRollAngle;
    this.lastRollAngle = fed;
    const sizes = m.machine.rolls;
    this.rolls.forEach((roll, i) => {
      const r = i === 0 ? sizes.top / 2 : i === 1 ? sizes.bottom / 2 : sizes.side / 2;
      const dir = i === 0 ? 1 : -1;
      roll.rotation.z += (dir * delta) / r;
    });
  }

  private rebuildPlate() {
    this.clear(this.plate);
    this.plate = null;
    const m = this.model;
    if (!m) return;
    this.plate = new Mesh(plateGeometry(m, this.progress), this.plateMat);
    this.root.add(this.plate);
    this.liftTower();
    this.dropPosts();
  }

  /**
   * Guide posts FL/RL/FR/RR retract below their table wherever the plate would run into them, as the
   * CNC lowers them; otherwise they stand up at the table corners.
   */
  private dropPosts() {
    if (!this.plate) return;
    const plate = new Box3().setFromObject(this.plate);
    for (const node of this.machineGroup.children) {
      if (!/^Post/.test(node.name)) continue;
      node.userData.baseY ??= node.position.y;
      node.position.y = node.userData.baseY as number;
      const post = new Box3().setFromObject(node);
      if (post.intersectsBox(plate)) node.position.y -= POST_TRAVEL;
    }
  }

  /**
   * The vertical support's carriage and arm ride up the column above the rolled part, as the V axis
   * does on the machine, so a large shell never runs into the arm. The column itself stays put.
   */
  private liftTower() {
    if (!this.plate) return;
    const geo = this.plate.geometry;
    geo.computeBoundingBox();
    const shift = towerLift(geo.boundingBox?.max.y ?? 0);
    for (const node of this.machineGroup.children) {
      if (!/^Tower(Carriage|Arm|Pad)/.test(node.name)) continue;
      node.userData.baseY ??= node.position.y;
      node.position.y = (node.userData.baseY as number) + shift;
    }
  }
}

// Vertical support travel [m], from the machine model: arm underside above the pinch line at rest,
// clearance kept above the part, and how far the carriage can climb the column.
const TOWER_ARM_BOTTOM = 0.823;
const TOWER_CLEARANCE = 0.03;
const TOWER_TRAVEL = 2.5;
// Journal lengths beyond the barrel with the machine model [m]: the top roll ends inside the yoke
// bearing (yoke face at 0.64 m), the others inside the front frame (outer plate face at 0.43 m), and
// all of them inside the drive housing at the back.
const MODEL_JOURNAL_TOP = 0.6;
const MODEL_JOURNAL_FRONT = 0.4;
const MODEL_JOURNAL_BACK = 0.5;
// Side-roll arms: plane between the front frame plates, beyond the barrel end [m], and pivot point.
const LEVER_Z = 0.25;
const LEVER_PIVOT_X = 0.42;
const LEVER_PIVOT_Y = -0.877 + 0.32;
// How far a guide post drops to clear the plate [m]: its full height above the table.
const POST_TRAVEL = 0.62;

/** How far the vertical support's arm rises [m] to clear a part whose top is at `top` [m]. */
export function towerLift(top: number): number {
  return Math.min(TOWER_TRAVEL, Math.max(0, top + TOWER_CLEARANCE - TOWER_ARM_BOTTOM));
}

export function plateGeometry(m: SceneModel, progress: number): BufferGeometry {
  const geometry =
    m.shape === "cylinder"
      ? cylinderPlate(m, progress)
      : m.shape === "cone"
        ? conePlate(m, progress)
        : m.shape === "eccentric"
          ? eccentricPlate(m, progress)
          : profilePlate(m, progress);
  return m.shape === "cone" || m.shape === "eccentric"
    ? placeConeOnMachine(geometry, m, progress)
    : geometry;
}

function scaleOf(m: SceneModel): number {
  return m.shape === "cylinder"
    ? Math.round(Math.log2(m.radius * m.width))
    : m.shape === "cone"
      ? Math.round(Math.log2(m.rOuter * Math.sin(m.alpha) * (m.rOuter - m.rInner)))
      : m.shape === "eccentric"
        ? Math.round(Math.log2(m.result.large.dNeutral))
        : Math.round(Math.log2(m.dev.length * m.width));
}

/**
 * Eccentric cone formed up to the share `progress` of its circumference, starting at the shortest
 * generator. Both constant-normal-thickness walls are trimmed by the end planes.
 */
function eccentricPlate(
  m: Extract<SceneModel, { shape: "eccentric" }>,
  progress: number,
): BufferGeometry {
  const r = m.result;
  const nU = 6,
    nPhi = Math.max(2, Math.round(160 * Math.max(0.02, progress)));
  const end = 2 * Math.PI * Math.max(0.02, Math.min(1, progress));
  const layerSize = (nU + 1) * (nPhi + 1);
  const pos = new Float32Array(2 * layerSize * 3);
  let o = 0;
  for (const surface of ["inner", "outer"] as const)
    for (let j = 0; j <= nPhi; j++) {
      for (let i = 0; i <= nU; i++) {
        const [x, y, z] = eccentricPoint(r, (end * j) / nPhi, i / nU, surface);
        pos[o++] = x * MM;
        pos[o++] = (y - r.offset / 2) * MM;
        pos[o++] = (z - r.height / 2) * MM;
      }
    }
  const index: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => index.push(a, b, c, b, d, c);
  for (let j = 0; j < nPhi; j++)
    for (let i = 0; i < nU; i++) {
      const a = j * (nU + 1) + i,
        b = a + nU + 1;
      quad(a, b, a + 1, b + 1);
      quad(a + layerSize, a + 1 + layerSize, b + layerSize, b + 1 + layerSize);
    }
  // Flat end faces and the exposed seam edges of a partly formed shell.
  for (let j = 0; j < nPhi; j++) {
    const a = j * (nU + 1),
      b = a + nU + 1;
    quad(a, a + layerSize, b, b + layerSize);
    quad(a + nU, b + nU, a + nU + layerSize, b + nU + layerSize);
  }
  if (progress < 0.9999)
    for (let i = 0; i < nU; i++) {
      const last = nPhi * (nU + 1) + i;
      quad(i, i + 1, i + layerSize, i + 1 + layerSize);
      quad(last, last + layerSize, last + 1, last + 1 + layerSize);
    }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Any profile part-way through the rolls: straight tail on the entry side, formed part beyond the
 * pinch at the origin, laid out like the cylinder (tail along +x, forming curls upwards).
 */
function profilePlate(
  m: Extract<SceneModel, { shape: "profile" }>,
  progress: number,
): BufferGeometry {
  const walk = partlyRolled(m.profile, m.dev, progress * m.dev.length);
  const tail = m.dev.length * (1 - Math.min(1, Math.max(0, progress)));
  // The walk starts at the free end heading +x; turning it half round puts the tail on +x.
  const place = ([x, y]: [number, number]) => new Vector2((tail - x) * MM, -y * MM);
  return plateStrip(
    traceProfile(walk, 0).map(place),
    traceProfile(walk, 1).map(place),
    m.width * MM,
  );
}

/**
 * Plate of width `width` (along z) between two matching fibre polylines. Built directly as quads, so
 * no polygon triangulation runs per animation frame. Each face group has its own vertices, which keeps
 * the faces' edges sharp while the bent surfaces shade smoothly.
 */
function plateStrip(a: Vector2[], b: Vector2[], width: number): BufferGeometry {
  const n = Math.min(a.length, b.length);
  const z0 = -width / 2,
    z1 = width / 2;
  const pos: number[] = [];
  const index: number[] = [];
  // A band of quads between two point rows; `flip` reverses the winding.
  const band = (
    rowA: [number, number, number][],
    rowB: [number, number, number][],
    flip: boolean,
  ) => {
    const base = pos.length / 3;
    for (const p of rowA) pos.push(...p);
    for (const p of rowB) pos.push(...p);
    const m = rowA.length;
    for (let i = 0; i + 1 < m; i++) {
      const p0 = base + i,
        p1 = base + i + 1,
        q0 = base + m + i,
        q1 = base + m + i + 1;
      if (flip) index.push(p0, q0, p1, p1, q0, q1);
      else index.push(p0, p1, q0, p1, q1, q0);
    }
  };
  const row = (pts: Vector2[], z: number) =>
    pts.slice(0, n).map((p): [number, number, number] => [p.x, p.y, z]);
  band(row(a, z0), row(a, z1), false);
  band(row(b, z0), row(b, z1), true);
  band(row(a, z1), row(b, z1), false);
  band(row(a, z0), row(b, z0), true);
  // The two ends of the strip.
  const end = (i: number, flip: boolean) =>
    band(
      [
        [a[i]!.x, a[i]!.y, z0],
        [a[i]!.x, a[i]!.y, z1],
      ],
      [
        [b[i]!.x, b[i]!.y, z0],
        [b[i]!.x, b[i]!.y, z1],
      ],
      flip,
    );
  end(0, true);
  end(n - 1, false);
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Plate profile through the pinch point: flat on the entry side, wrapped on radius R on the exit side. */
function cylinderPlate(
  m: Extract<SceneModel, { shape: "cylinder" }>,
  progress: number,
): BufferGeometry {
  const { radius: R, thickness: t, length: L } = m;
  const rolled = progress * L;
  const flat = L - rolled;
  const steps = Math.max(8, Math.ceil((rolled / (2 * Math.PI * R)) * 180));
  const neutral: { p: Vector2; n: Vector2 }[] = [];
  neutral.push({ p: new Vector2(flat, 0), n: new Vector2(0, 1) });
  for (let i = 0; i <= steps; i++) {
    const b = (rolled / R) * (i / steps);
    neutral.push({
      p: new Vector2(-R * Math.sin(b), R - R * Math.cos(b)),
      // Normal points towards the centre of curvature (inner side).
      n: new Vector2(Math.sin(b), Math.cos(b)),
    });
  }
  const fibre = (side: number) =>
    neutral.map(({ p, n }) =>
      p
        .clone()
        .addScaledVector(n, (side * t) / 2)
        .multiplyScalar(MM),
    );
  return plateStrip(fibre(-1), fibre(1), m.width * MM);
}

/**
 * Sector partly wrapped onto the cone. Rolled part: development angle φ maps to azimuth φ / sin α.
 * Remaining part continues in the tangent plane at the roll line, which is the cone's isometric unfold.
 */
function conePlate(m: Extract<SceneModel, { shape: "cone" }>, progress: number): BufferGeometry {
  const { rOuter, rInner, angle, alpha } = m;
  const sinA = Math.sin(alpha),
    cosA = Math.cos(alpha);
  const nR = 12,
    nPhi = 160;
  const phiEdge = progress * angle;
  const psiEdge = phiEdge / sinA;
  const yShift = ((rOuter + rInner) / 2) * cosA;
  const pos = new Float32Array((nR + 1) * (nPhi + 1) * 3);
  let o = 0;
  for (let j = 0; j <= nPhi; j++) {
    const phi = (angle * j) / nPhi;
    for (let i = 0; i <= nR; i++) {
      const rho = rInner + ((rOuter - rInner) * i) / nR;
      let x: number, y: number, z: number;
      if (phi <= phiEdge) {
        const psi = phi / sinA;
        x = rho * sinA * Math.cos(psi);
        y = -rho * cosA;
        z = rho * sinA * Math.sin(psi);
      } else {
        const d = phi - phiEdge;
        const gx = sinA * Math.cos(psiEdge),
          gy = -cosA,
          gz = sinA * Math.sin(psiEdge);
        const tx = -Math.sin(psiEdge),
          tz = Math.cos(psiEdge);
        x = rho * (Math.cos(d) * gx + Math.sin(d) * tx);
        y = rho * Math.cos(d) * gy;
        z = rho * (Math.cos(d) * gz + Math.sin(d) * tz);
      }
      pos[o++] = x * MM;
      pos[o++] = (y + yShift) * MM;
      pos[o++] = z * MM;
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nPhi; j++) {
    for (let i = 0; i < nR; i++) {
      const a = j * (nR + 1) + i,
        b = a + nR + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

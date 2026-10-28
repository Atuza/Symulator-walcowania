import {
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Shape,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { partlyRolled, traceProfile } from "../domain/profile";
import type { SceneModel } from "./sceneModel";

// Model is built in metres to keep camera and depth precision comfortable.
const MM = 0.001;

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
  private plateMat = new MeshStandardMaterial({
    metalness: 0.55,
    roughness: 0.42,
    side: DoubleSide,
  });
  private rollMat = new MeshStandardMaterial({ metalness: 0.7, roughness: 0.35 });
  private accentMat = new MeshStandardMaterial({ metalness: 0.4, roughness: 0.5 });
  private model: SceneModel | null = null;
  private progress = 1;
  private frame = 0;
  private resizeObserver: ResizeObserver;
  private lastRollAngle = 0;

  constructor(private host: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.append(this.renderer.domElement);
    this.scene.add(this.root);
    this.scene.add(new HemisphereLight(0xffffff, 0x404040, 1.2));
    this.scene.add(new AmbientLight(0xffffff, 0.25));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const rim = new DirectionalLight(0xffffff, 0.8);
    rim.position.set(-4, 2, -3);
    this.scene.add(rim);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener("change", () => this.requestRender());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
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
    this.spinRolls();
    this.fit(true);
    this.requestRender();
  }

  resetView() {
    this.fit();
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
  private fit(keepDirection = false) {
    if (!this.model) return;
    const sphere = new Box3().setFromObject(this.root).getBoundingSphere(new Sphere());
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return;
    const dist = (sphere.radius / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.08;
    // Default: mostly along the roll axis, so the bending profile reads clearly.
    const dir = keepDirection
      ? this.camera.position.clone().sub(this.controls.target).normalize()
      : new Vector3(0.55, 0.38, 1.3).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.near = dist / 100;
    this.camera.far = dist * 10;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(sphere.center);
    this.controls.update();
  }

  private clear(mesh: Mesh | null) {
    if (!mesh) return;
    this.root.remove(mesh);
    mesh.geometry.dispose();
  }

  private rebuildRolls() {
    this.rolls.forEach((r) => this.clear(r));
    this.rolls = [];
    const m = this.model;
    if (!m || m.shape !== "cylinder") return;
    const { radius: R, thickness: t, rolls } = m;
    const len = m.width * MM * 1.15;
    const rt = rolls.top / 2,
      rb = rolls.bottom / 2,
      rs = rolls.side / 2;
    const add = (r: number, x: number, y: number, mat: MeshStandardMaterial) => {
      const geo = new CylinderGeometry(r * MM, r * MM, len, 48, 1);
      geo.rotateX(Math.PI / 2);
      const mesh = new Mesh(geo, mat);
      mesh.position.set(x * MM, y * MM, 0);
      this.root.add(mesh);
      this.rolls.push(mesh);
    };
    // Pinch point at the origin: top roll inside the shell, bottom roll below the plate.
    add(rt, 0, t / 2 + rt, this.rollMat);
    add(rb, 0, -t / 2 - rb, this.rollMat);
    // Exit-side roll rests on the rolled outer surface, entry-side roll under the flat plate.
    const reach = R + t / 2 + rs;
    const sinB = Math.min(0.95, ((rb + rs) * 1.08) / reach);
    const beta = Math.asin(sinB);
    add(rs, -reach * Math.sin(beta), R - reach * Math.cos(beta), this.accentMat);
    add(rs, (rb + rs) * 1.08, -t / 2 - rs - rb * 0.18, this.rollMat);
  }

  private spinRolls() {
    const m = this.model;
    if (!m || m.shape !== "cylinder") return;
    // Rolls turn with the plate feed so the motion reads as rolling, not sliding.
    const fed = this.progress * m.length;
    const delta = fed - this.lastRollAngle;
    this.lastRollAngle = fed;
    this.rolls.forEach((roll, i) => {
      const r = i === 0 ? m.rolls.top / 2 : i === 1 ? m.rolls.bottom / 2 : m.rolls.side / 2;
      const dir = i === 0 ? 1 : -1;
      roll.rotation.z += (dir * delta) / r;
    });
  }

  private rebuildPlate() {
    this.clear(this.plate);
    this.plate = null;
    const m = this.model;
    if (!m) return;
    const geo =
      m.shape === "cylinder"
        ? cylinderPlate(m, this.progress)
        : m.shape === "cone"
          ? conePlate(m, this.progress)
          : profilePlate(m, this.progress);
    this.plate = new Mesh(geo, this.plateMat);
    this.root.add(this.plate);
  }
}

function scaleOf(m: SceneModel): number {
  return m.shape === "cylinder"
    ? Math.round(Math.log2(m.radius * m.width))
    : m.shape === "cone"
      ? Math.round(Math.log2(m.rOuter))
      : Math.round(Math.log2(m.dev.length * m.width));
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
  const a = traceProfile(walk, 0).map(place);
  const b = traceProfile(walk, 1).map(place).reverse();
  const geo = new ExtrudeGeometry(new Shape([...a, ...b]), {
    depth: m.width * MM,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geo.translate(0, 0, (-m.width * MM) / 2);
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
  const outer = neutral.map(({ p, n }) =>
    p
      .clone()
      .addScaledVector(n, -t / 2)
      .multiplyScalar(MM),
  );
  const inner = neutral
    .map(({ p, n }) =>
      p
        .clone()
        .addScaledVector(n, t / 2)
        .multiplyScalar(MM),
    )
    .reverse();
  const shape = new Shape([...outer, ...inner]);
  const geo = new ExtrudeGeometry(shape, {
    depth: m.width * MM,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geo.translate(0, 0, (-m.width * MM) / 2);
  geo.computeVertexNormals();
  return geo;
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

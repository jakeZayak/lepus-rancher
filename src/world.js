// Scene construction: ground, fences, pens, buildings, trees, sky and day/night lighting.
import * as THREE from "../vendor/three.module.min.js";
import { PENS, PEN_SIZE, HOPPER, LAB, GARDEN_CENTER, R_MEADOW, R_HILLS, R_WORLD } from "./data.js";

export function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HALF = PEN_SIZE / 2;
const DOOR = 3.6;
const WALL_H = 1.3;
const T = 0.16; // wall half-thickness

export const walls = []; // {x0,x1,z0,z1} AABBs, height WALL_H
export const circles = []; // {x,z,r} solid cylinders (trees, hopper)
export const labBox = { x0: LAB.x - 2.6, x1: LAB.x + 2.6, z0: LAB.z - 2.1, z1: LAB.z + 2.1 };
export const penRects = PENS.map((p) => ({ x0: p.cx - HALF, x1: p.cx + HALF, z0: p.cz - HALF, z1: p.cz + HALF }));
export const WALL_HEIGHT = WALL_H;

export function inPen(x, z, margin = 0) {
  for (let i = 0; i < penRects.length; i++) {
    const r = penRects[i];
    if (x > r.x0 - margin && x < r.x1 + margin && z > r.z0 - margin && z < r.z1 + margin) return i;
  }
  return -1;
}

function woodTexture(repX = 1, repY = 1) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 16;
  const g = c.getContext("2d");
  const cols = ["#9c6b3a", "#8a5c30", "#a8763f", "#7e5429"];
  for (let i = 0; i < 4; i++) { g.fillStyle = cols[i]; g.fillRect(0, i * 4, 32, 4); g.fillStyle = "#5e3d1c"; g.fillRect(0, i * 4 + 3, 32, 1); }
  for (let i = 0; i < 20; i++) { g.fillStyle = "rgba(60,35,15,0.35)"; g.fillRect((i * 13) % 32, (i * 7) % 16, 3, 1); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(repX, repY);
  return t;
}

function label(text, w, h, bg = "#3b2a18", fg = "#ffe9a8") {
  const c = document.createElement("canvas");
  c.width = 128; c.height = Math.round((128 * h) / w);
  const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(3, 3, c.width - 6, c.height - 6);
  g.fillStyle = fg; g.font = `bold ${Math.floor(c.height * 0.5)}px monospace`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

function groundTexture() {
  const N = 512, span = (R_WORLD + 12) * 2;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d");
  const img = g.createImageData(N, N);
  const rnd = mulberry(7);
  const pal = {
    meadow: [[84, 170, 72], [92, 180, 78], [78, 160, 66], [98, 188, 84]],
    hills: [[186, 170, 78], [196, 180, 84], [174, 158, 70], [204, 188, 92]],
    crater: [[104, 90, 132], [114, 100, 144], [94, 80, 120], [124, 108, 154]],
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const wx = (x / N - 0.5) * span, wz = (y / N - 0.5) * span;
      const r = Math.hypot(wx, wz);
      const z = r < R_MEADOW ? "meadow" : r < R_HILLS ? "hills" : "crater";
      let col = pal[z][(rnd() * 4) | 0];
      // dirt paths from the plaza to the hopper, lab, garden and pens
      const nearPath = pathDist(wx, wz) < 1.4;
      if (nearPath) col = [168 + ((rnd() * 14) | 0), 132 + ((rnd() * 10) | 0), 88];
      const i = (y * N + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, span };
}

const PATHS = [
  [[0, 0], [-7, 6]], [[0, 0], [8, 7]], [[0, 0], [0, 17]], [[0, 0], [0, -20]], [[0, -4], [-10, -14]], [[0, -4], [10, -14]],
];
function pathDist(x, z) {
  let best = 1e9;
  for (const [[ax, az], [bx, bz]] of PATHS) {
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

function addWall(group, x0, x1, z0, z1, mat) {
  walls.push({ x0, x1, z0, z1 });
  const w = x1 - x0, d = z1 - z0;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), mat.clone());
  m.material.map = woodTexture(Math.max(w, d) / 1.6, 1);
  m.position.set((x0 + x1) / 2, WALL_H / 2, (z0 + z1) / 2);
  group.add(m);
  // posts
  const len = Math.max(w, d), n = Math.max(2, Math.round(len / 2.4));
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, WALL_H + 0.35, 0.34), mat);
    post.position.set(w > d ? x0 + w * f : (x0 + x1) / 2, (WALL_H + 0.35) / 2, w > d ? (z0 + z1) / 2 : z0 + d * f);
    group.add(post);
  }
}

export function buildWorld(scene) {
  const world = {};
  const rnd = mulberry(1234);

  // lights
  const hemi = new THREE.HemisphereLight(0xdff2ff, 0x6a8a55, 1.0);
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.2);
  scene.add(hemi, sun);

  // ground
  const gt = groundTexture();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gt.span, gt.span), new THREE.MeshLambertMaterial({ map: gt.tex }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // pens
  const wood = new THREE.MeshLambertMaterial({ map: woodTexture(), color: 0xffffff });
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
  const fenceGroup = new THREE.Group();
  scene.add(fenceGroup);
  PENS.forEach((p, i) => {
    const r = penRects[i];
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(PEN_SIZE, PEN_SIZE), new THREE.MeshLambertMaterial({ color: 0xa57c52 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(p.cx, 0.02, p.cz);
    scene.add(floor);
    const gap = DOOR / 2;
    const seg = (x0, x1, z0, z1) => addWall(fenceGroup, x0, x1, z0, z1, wood);
    // north / south
    for (const [side, z] of [["n", r.z0], ["s", r.z1]]) {
      if (p.door === side) { seg(r.x0 - T, p.cx - gap, z - T, z + T); seg(p.cx + gap, r.x1 + T, z - T, z + T); }
      else seg(r.x0 - T, r.x1 + T, z - T, z + T);
    }
    for (const [side, x] of [["w", r.x0], ["e", r.x1]]) {
      if (p.door === side) { seg(x - T, x + T, r.z0 + T, p.cz - gap); seg(x - T, x + T, p.cz + gap, r.z1 - T); }
      else seg(x - T, x + T, r.z0 + T, r.z1 - T);
    }
    const sign = label("PEN " + (i + 1), 1.6, 0.6);
    const dx = p.door === "e" ? r.x1 + 0.5 : p.door === "w" ? r.x0 - 0.5 : p.cx + 3;
    const dz = p.door === "s" ? r.z1 + 0.5 : p.door === "n" ? r.z0 - 0.5 : p.cz + 3;
    sign.position.set(dx, 1.9, dz);
    sign.rotation.y = p.door === "e" ? Math.PI / 2 : p.door === "w" ? -Math.PI / 2 : 0;
    scene.add(sign);
  });

  // hopper (egg market)
  const hop = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.8, 1.1, 14), new THREE.MeshLambertMaterial({ color: 0x2aa6a0 }));
  body.position.y = 0.55;
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.0, 0.45, 14, 1, true), new THREE.MeshLambertMaterial({ color: 0x1d7e79, side: THREE.DoubleSide }));
  funnel.position.y = 1.3;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1.0, 14), new THREE.MeshBasicMaterial({ color: 0x0a2a28 }));
  hole.rotation.x = -Math.PI / 2; hole.position.y = 1.12;
  const glow = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.07, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  glow.rotation.x = Math.PI / 2; glow.position.y = 1.53;
  hop.add(body, funnel, hole, glow);
  const hsign = label("SELL EGGS", 2.2, 0.7);
  hsign.position.set(0, 2.5, 0);
  const hpost = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 0.15), postMat);
  hpost.position.y = 1.8;
  hop.add(hpost, hsign);
  hop.position.set(HOPPER.x, 0, HOPPER.z);
  scene.add(hop);
  circles.push({ x: HOPPER.x, z: HOPPER.z, r: 1.15 });
  world.hopperGlow = glow;
  world.hopperSign = hsign;

  // lab
  const lab = new THREE.Group();
  const lw = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3, 4.2), new THREE.MeshLambertMaterial({ color: 0xe8d9b8 }));
  lw.position.y = 1.5;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.8, 4), new THREE.MeshLambertMaterial({ color: 0x9b3b3b }));
  roof.position.y = 3.9; roof.rotation.y = Math.PI / 4;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.0), new THREE.MeshBasicMaterial({ color: 0x5b3a1e }));
  door.position.set(-1.0, 1.0, 2.11);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.0), new THREE.MeshBasicMaterial({ color: 0x9fe4ff }));
  win.position.set(1.2, 1.8, 2.11);
  const lsign = label("UPGRADE LAB", 3.2, 0.7);
  lsign.position.set(0, 3.25, 2.15);
  lab.add(lw, roof, door, win, lsign);
  lab.position.set(LAB.x, 0, LAB.z);
  scene.add(lab);
  world.labWin = win;

  // ring fences (gates) around hills and crater
  const ringMat = new THREE.MeshLambertMaterial({ color: 0x8a3a3a });
  const rails = new THREE.MeshLambertMaterial({ color: 0xb85a5a });
  world.rings = [R_MEADOW, R_HILLS].map((R) => {
    const g = new THREE.Group();
    const n = Math.ceil((2 * Math.PI * R) / 3);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 2.6, 0.4), ringMat, n);
    const rl = new THREE.InstancedMesh(new THREE.BoxGeometry(3.1, 0.22, 0.14), rails, n * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, a2 = ((i + 0.5) / n) * Math.PI * 2;
      m.compose(new THREE.Vector3(Math.cos(a) * R, 1.3, Math.sin(a) * R), q.identity(), s);
      posts.setMatrixAt(i, m);
      for (let k = 0; k < 2; k++) {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a2 - Math.PI / 2);
        m.compose(new THREE.Vector3(Math.cos(a2) * R, 0.9 + k * 0.9, Math.sin(a2) * R), q, s);
        rl.setMatrixAt(i * 2 + k, m);
      }
    }
    g.add(posts, rl);
    scene.add(g);
    return g;
  });

  // trees and rocks
  const trunkG = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 6);
  const crownG = new THREE.IcosahedronGeometry(1.5, 0);
  const NT = 300;
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x6b4a2a }), NT);
  const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: 0xffffff }), NT);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  let nt = 0;
  const inCompound = (x, z) => x > -28 && x < 28 && z > -36 && z < 28;
  while (nt < NT) {
    const a = rnd() * Math.PI * 2, r = 8 + Math.sqrt(rnd()) * (R_WORLD - 12);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inCompound(x, z)) continue;
    if (Math.abs(r - R_MEADOW) < 3 || Math.abs(r - R_HILLS) < 3) continue;
    const sc = 0.8 + rnd() * 0.9;
    m4.compose(new THREE.Vector3(x, 1.1 * sc, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc));
    trunks.setMatrixAt(nt, m4);
    m4.compose(new THREE.Vector3(x, 2.9 * sc, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6), new THREE.Vector3(sc * 1.1, sc * 1.25, sc * 1.1));
    crowns.setMatrixAt(nt, m4);
    const zone = r < R_MEADOW ? [0.2 + rnd() * 0.08, 0.55, 0.32] : r < R_HILLS ? [0.12 + rnd() * 0.05, 0.6, 0.42] : [0.75 + rnd() * 0.06, 0.4, 0.3];
    crowns.setColorAt(nt, col.setHSL(zone[0], zone[1], zone[2]));
    circles.push({ x, z, r: 0.5 * sc });
    nt++;
  }
  scene.add(trunks, crowns);

  const NR = 140;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.7, 0), new THREE.MeshLambertMaterial({ color: 0x9a9a9a }), NR);
  let nr = 0;
  while (nr < NR) {
    const a = rnd() * Math.PI * 2, r = 6 + Math.sqrt(rnd()) * (R_WORLD - 8);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inCompound(x, z)) continue;
    const sc = 0.5 + rnd() * 1.1;
    m4.compose(new THREE.Vector3(x, 0.3 * sc, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 1, 0).normalize(), rnd() * 6), new THREE.Vector3(sc * 1.2, sc * 0.8, sc));
    rocks.setMatrixAt(nr, m4);
    rocks.setColorAt(nr, col.setHSL(0.1, 0.05, 0.4 + rnd() * 0.25));
    circles.push({ x, z, r: 0.7 * sc });
    nr++;
  }
  scene.add(rocks);

  // distant mountains ring
  const mtn = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), new THREE.MeshLambertMaterial({ color: 0x7c88a8 }), 40);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, r = R_WORLD + 22 + rnd() * 14, h = 30 + rnd() * 30;
    m4.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(26 + rnd() * 14, h, 26 + rnd() * 14));
    mtn.setMatrixAt(i, m4);
  }
  scene.add(mtn);

  // sky: sun, moon, stars, clouds
  const orb = (color, size) => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    g.fillStyle = color; g.beginPath(); g.arc(16, 16, 12, 0, 7); g.fill();
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, depthWrite: false }));
    s.scale.set(size, size, 1);
    s.renderOrder = -2;
    scene.add(s);
    return s;
  };
  const sunS = orb("#fff1a0", 60), moonS = orb("#e8eeff", 40);
  const starPos = new Float32Array(600 * 3);
  for (let i = 0; i < 600; i++) {
    const a = rnd() * Math.PI * 2, e = Math.acos(rnd()) * 0.5 + 0.05;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * 400; starPos[i * 3 + 1] = Math.sin(e) * 400; starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 400;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.renderOrder = -3;
  scene.add(stars);
  world.cloudList = [];
  world.makeClouds = (cloudTex) => {
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
      const a = rnd() * 6.28, r = 40 + rnd() * 260;
      s.position.set(Math.cos(a) * r, 60 + rnd() * 40, Math.sin(a) * r);
      s.scale.set(70 + rnd() * 60, 26 + rnd() * 14, 1);
      scene.add(s);
      world.cloudList.push(s);
    }
  };

  const day = new THREE.Color(0x8ed6ff), dusk = new THREE.Color(0xf59b6e), night = new THREE.Color(0x0b1233);
  const sky = new THREE.Color();
  scene.fog = new THREE.Fog(0x8ed6ff, 45, 230);
  scene.background = sky.clone();
  const dirv = new THREE.Vector3();
  world.bright = 1;

  world.updateSky = (phase, cam, dt) => {
    const a = phase * Math.PI * 2 - Math.PI / 2;
    const h = Math.sin(a);
    if (h > 0.2) sky.copy(day);
    else if (h > -0.05) sky.copy(dusk).lerp(day, (h + 0.05) / 0.25);
    else if (h > -0.3) sky.copy(night).lerp(dusk, (h + 0.3) / 0.25);
    else sky.copy(night);
    scene.background.copy(sky);
    scene.fog.color.copy(sky);
    scene.fog.far = 230 - (h < 0 ? Math.min(1, -h * 2) * 90 : 0);
    dirv.set(Math.cos(a), Math.sin(a), 0.25).normalize();
    sun.position.copy(dirv).multiplyScalar(100);
    sun.intensity = Math.max(0.12, Math.min(1.2, 0.25 + h * 1.2));
    sun.color.setHex(h > 0.25 ? 0xfff2d0 : h > -0.05 ? 0xffb070 : 0x6070c0);
    hemi.intensity = Math.max(0.6, Math.min(1.7, 0.9 + h * 0.9));
    world.bright = Math.max(0.55, Math.min(1, 0.7 + h * 0.8));
    sunS.position.copy(cam.position).addScaledVector(dirv, 330);
    moonS.position.copy(cam.position).addScaledVector(dirv, -330);
    sunS.visible = h > -0.15; moonS.visible = h < 0.15;
    stars.position.copy(cam.position);
    stars.material.opacity = Math.max(0, Math.min(1, -h * 3));
    for (const c of world.cloudList) {
      c.position.x += dt * 1.5;
      if (c.position.x > 320) c.position.x = -320;
      c.material.color.setScalar(Math.max(0.35, world.bright));
    }
    world.hopperGlow.material.color.setHSL(0.13, 1, 0.55 + 0.1 * Math.sin(performance.now() / 300));
  };

  world.setGate = (idx, open) => { world.rings[idx].visible = !open; };
  return world;
}

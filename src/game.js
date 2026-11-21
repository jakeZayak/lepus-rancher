// Game simulation: player, vacpack, Lepus AI, eggs, market, garden, saving.
import * as THREE from "../vendor/three.module.min.js";
import {
  SPECIES, SPECIES_ORDER, EGGS, FOODS, UPGRADES, TANK_CAP, PEN_CAP, GARDEN_N, CUDDLE, SPA, SLOTS, PENS, PEN_SIZE, HOPPER, LAB,
  GARDEN_CENTER, R_MEADOW, R_HILLS, R_WORLD, ZONES, keyName,
} from "./data.js";
import { sheets } from "./sprites.js";
import { walls, circles, penRects, inPen, labBox, WALL_HEIGHT, mulberry } from "./world.js";
import { sfx, vacHum } from "./audio.js";

export const DAY = 600;
const SAVE_KEY = "lepusRancher.v1";
const rnd = Math.random;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const S = {
  coins: 30,
  up: {},
  slots: Array(SLOTS).fill(null),
  sel: 0,
  dex: {},
  market: {},
  time: DAY * 0.3,
  sold: 0,
};
export const player = { x: 0, y: 0, z: 2, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, grounded: true };
export const input = { f: 0, b: 0, l: 0, r: 0, sprint: 0, jump: 0, vac: 0, shoot: 0 };
export const opts = { cosMin: 0.8 };
export const lepus = [];
export const items = [];
export const patches = [];
const fx = [];

let scene, world, camera, hooks = {};
export const lvl = (id) => S.up[id] || 0;
export const tankCap = () => TANK_CAP[lvl("tank")];
export const penCap = () => PEN_CAP[lvl("pen")];
export const power = () => 1 + lvl("vac");
export const accessR = () => (lvl("gate2") ? R_WORLD - 1.5 : lvl("gate1") ? R_HILLS - 1.5 : R_MEADOW - 1.5);

function toast(msg) { hooks.toast && hooks.toast(msg); }

// ---------- sprites ----------
function mkSprite(sheetName, scale, flip = false) {
  const sh = sheets[sheetName];
  const mat = new THREE.SpriteMaterial({ map: (flip ? sh.framesF : sh.frames)[0], alphaTest: 0.5, transparent: false });
  const sp = new THREE.Sprite(mat);
  sp.center.set(0.5, 0);
  sp.scale.set(sh.w * scale, sh.h * scale, 1);
  scene.add(sp);
  return sp;
}
function setFrame(sp, sheetName, frame, flip) {
  const sh = sheets[sheetName];
  const t = (flip ? sh.framesF : sh.frames)[Math.min(frame, sh.n - 1)];
  if (sp.material.map !== t) sp.material.map = t;
}
let shadowGeo, shadowMat;
function mkShadow(size) {
  shadowGeo ||= new THREE.PlaneGeometry(1, 1);
  shadowMat ||= new THREE.MeshBasicMaterial({ map: sheets.shadow.frames[0], transparent: true, depthWrite: false });
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(size, size, 1);
  m.renderOrder = -1;
  scene.add(m);
  return m;
}
function dispose(e) {
  scene.remove(e.sprite);
  e.sprite.material.dispose();
  if (e.shadow) scene.remove(e.shadow);
  if (e.icon) { scene.remove(e.icon); e.icon.material.dispose(); }
}

// ---------- effects ----------
function addFx(sheetName, x, y, z, vx, vy, vz, life, scale = 0.05, grav = 0) {
  const sp = mkSprite(sheetName, scale);
  sp.material.alphaTest = 0;
  sp.material.transparent = true;
  sp.center.set(0.5, 0.5);
  sp.position.set(x, y, z);
  fx.push({ sp, vx, vy, vz, life, max: life, grav });
}
function poof(x, y, z, n = 6) {
  for (let i = 0; i < n; i++) addFx("sparkle", x, y, z, (rnd() - 0.5) * 3, rnd() * 3, (rnd() - 0.5) * 3, 0.6, 0.06);
}

// ---------- discovery ----------
function discover(sp) {
  if (S.dex[sp]) return;
  S.dex[sp] = 1;
  toast(`New in your Lepusdex: ${SPECIES[sp].name}!`);
  sfx("unlock");
}

// ---------- lepus ----------
function sizeOf(e) {
  return e.baby < 1 ? "small_lepus" : SPECIES[e.sp].sheet;
}
export function spawnLepus(sp, x, z, mode = "wild", baby = 1, pen = -1) {
  const spec = SPECIES[sp];
  const e = {
    t: "lepus", sp, x, y: 0, z, vx: 0, vy: 0, vz: 0, mode, pen, baby, hunger: 0, digest: [], timer: rnd() * 2, anim: rnd() * 5,
    face: rnd() < 0.5, pulled: false, zone: zoneAt(x, z), sheet: null, ph: rnd() * 6,
  };
  e.sheet = sizeOf(e);
  e.sprite = mkSprite(e.sheet, e.baby < 1 ? 0.028 : spec.scale, e.face);
  e.shadow = mkShadow(1.5);
  lepus.push(e);
  syncSprite(e);
  return e;
}
function zoneAt(x, z) {
  const r = Math.hypot(x, z);
  return r < R_MEADOW ? "meadow" : r < R_HILLS ? "hills" : "crater";
}
function spriteScale(e) {
  return e.baby < 1 ? 0.024 + 0.006 * e.baby : SPECIES[e.sp].scale;
}
function syncSprite(e) {
  const sh = sheets[e.sheet];
  const sc = spriteScale(e);
  e.sprite.scale.set(sh.w * sc, sh.h * sc, 1);
  e.sprite.position.set(e.x, e.y, e.z);
  const grounded = e.y <= 0.02;
  let frame = 0;
  if (e.sheet === "small_lepus") frame = Math.floor(e.anim * 6) % sh.n;
  else if (e.sheet === "lepuszilla") frame = 0;
  else if (e.sheet === "bunny") frame = grounded ? 0 : 1;
  else frame = grounded ? [0, 1, 2, 3][Math.floor(e.anim * 5) % 4] : e.vy > 0 ? 4 : 5;
  const sp = e.sprite;
  setFrame(sp, e.sheet, frame, e.face);
  sp.material.color.setScalar(world.bright);
  const w = sh.w * sc;
  e.shadow.position.set(e.x, 0.03, e.z);
  const s = Math.max(0.2, w * 0.9) * (1 - Math.min(0.6, e.y * 0.12));
  e.shadow.scale.set(s, s, 1);
  if (e.icon) { e.icon.position.set(e.x, e.y + sh.h * sc + 0.15 + Math.sin(performance.now() / 300 + e.ph) * 0.06, e.z); }
}
function setIcon(e, name) {
  if (!name) { if (e.icon) e.icon.visible = false; return; }
  if (!e.icon) {
    e.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: sheets[name].frames[0], depthWrite: false, fog: false }));
    e.icon.scale.set(0.45, 0.4, 1);
    scene.add(e.icon);
  }
  e.icon.visible = true;
  if (e.iconName !== name) { e.icon.material.map = sheets[name].frames[0]; e.iconName = name; }
}

function pushOutCircle(e, cx, cz, r) {
  const dx = e.x - cx, dz = e.z - cz, d = Math.hypot(dx, dz);
  if (d < r) { const k = d > 1e-4 ? r / d : 1; e.x = cx + (d > 1e-4 ? dx * k : r); e.z = cz + (d > 1e-4 ? dz * k : 0); return true; }
  return false;
}
function collideWalls(e, r) {
  if (e.y >= WALL_HEIGHT) return;
  for (const w of walls) {
    const cx = clamp(e.x, w.x0, w.x1), cz = clamp(e.z, w.z0, w.z1);
    const dx = e.x - cx, dz = e.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
      e.x = cx + nx * r; e.z = cz + nz * r;
      const vn = e.vx * nx + e.vz * nz;
      if (vn < 0) { e.vx -= 1.4 * vn * nx; e.vz -= 1.4 * vn * nz; }
    } else {
      // centre is inside the wall: exit via the nearest face
      const opts = [[e.x - w.x0, -1, 0], [w.x1 - e.x, 1, 0], [e.z - w.z0, 0, -1], [w.z1 - e.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
      e.x += opts[1] * (opts[0] + r); e.z += opts[2] * (opts[0] + r);
    }
  }
}
function collideLab(e, r) {
  const b = labBox;
  if (e.x > b.x0 - r && e.x < b.x1 + r && e.z > b.z0 - r && e.z < b.z1 + r && e.y < 3) {
    const opts = [[e.x - b.x0, -1, 0], [b.x1 - e.x, 1, 0], [e.z - b.z0, 0, -1], [b.z1 - e.z, 0, 1]].sort((a, c) => a[0] - c[0])[0];
    e.x += opts[1] * (opts[0] + r); e.z += opts[2] * (opts[0] + r);
    return true;
  }
  return false;
}

function land(e) {
  const p = inPen(e.x, e.z);
  if (p >= 0) { e.mode = "pen"; e.pen = p; }
  else {
    e.mode = "wild"; e.pen = -1;
    e.zone = zoneAt(e.x, e.z);
  }
  e.vx = e.vz = 0;
  e.timer = 0.4 + rnd() * 0.8;
}

function penAdults(p) {
  return lepus.filter((l) => l.mode === "pen" && l.pen === p);
}

function nearestFood(e) {
  let best = null, bd = 1e9;
  for (const it of items) {
    if (it.kind !== "food" || it.mode !== "free" || it.y > 0.6) continue;
    if (e.mode === "pen" ? inPen(it.x, it.z) !== e.pen : false) continue;
    const d = Math.hypot(it.x - e.x, it.z - e.z);
    if (d < bd && d < 11) { bd = d; best = it; }
  }
  return best;
}

function chooseHop(e) {
  const spec = SPECIES[e.sp];
  let ang = rnd() * Math.PI * 2, fast = 1;
  const pdx = e.x - player.x, pdz = e.z - player.z, pd = Math.hypot(pdx, pdz);
  if (e.baby >= 1 && e.mode === "wild" && spec.flee && pd < spec.flee) {
    ang = Math.atan2(pdz, pdx) + (rnd() - 0.5) * 0.9; fast = 1.5; e.timer = 0.15 + rnd() * 0.2;
  } else {
    const food = e.baby >= 1 && e.mode === "pen" ? nearestFood(e) : null;
    if (food) { ang = Math.atan2(food.z - e.z, food.x - e.x) + (rnd() - 0.5) * 0.3; e.timer = 0.25 + rnd() * 0.25; fast = Math.min(1.2, Math.hypot(food.x - e.x, food.z - e.z) / 2.5 + 0.4); }
    else {
      e.timer = 0.6 + rnd() * 2.2;
      if (rnd() < 0.22) { e.timer += 2.5; return; } // laze about
      if (e.mode === "wild") {
        // drift back toward the middle of the zone
        const z = ZONES[e.zone], r = Math.hypot(e.x, e.z), mid = (z.rmin + z.rmax) / 2;
        if (Math.abs(r - mid) > (z.rmax - z.rmin) * 0.4) {
          const inward = r > mid ? 1 : -1;
          ang = Math.atan2(-e.z * inward, -e.x * inward) + (rnd() - 0.5) * 1.5;
        }
      }
    }
  }
  const sp = spec.hop * fast * (e.baby < 1 ? 0.8 : 1);
  e.vx = Math.cos(ang) * sp; e.vz = Math.sin(ang) * sp;
  e.vy = spec.jump * (e.baby < 1 ? 0.7 : 1);
  e.y = 0.001;
  e.face = (e.vx * Math.cos(player.yaw) - e.vz * Math.sin(player.yaw)) > 0;
  if (pd < 14 && rnd() < 0.35) sfx("hop", clamp(0.35 - pd * 0.02, 0.05, 0.3), 0.9 + rnd() * 0.5);
}

function eat(e, it) {
  const food = FOODS[it.id];
  removeItem(it);
  sfx("eat", 0.5, 0.9 + rnd() * 0.3);
  e.hunger = 0;
  for (let i = 0; i < food.eggs; i++) e.digest.push(2.2 + rnd() * 1.5 + i * 0.7);
  addFx("heart", e.x, e.y + 1.1, e.z, 0, 1.2, 0, 1.0, 0.05);
  if (e.mode === "pen" && e.baby >= 1) {
    const mates = penAdults(e.pen).filter((l) => l.baby >= 1);
    const total = penAdults(e.pen).length;
    if (mates.length >= 2 && total < penCap() && rnd() < CUDDLE[lvl("cuddle")]) {
      const kinds = [...new Set(mates.map((l) => l.sp))];
      let sp = mates[(rnd() * mates.length) | 0].sp;
      if (kinds.length >= 2 && rnd() < 0.2) {
        const top = Math.max(...kinds.map((k) => SPECIES_ORDER.indexOf(k)));
        if (top < SPECIES_ORDER.indexOf("epic")) sp = SPECIES_ORDER[top + 1];
      }
      const b = spawnLepus(sp, e.x + (rnd() - 0.5), e.z + (rnd() - 0.5), "pen", 0, e.pen);
      b.vy = 4;
      for (let k = 0; k < 4; k++) addFx("heart", b.x + (rnd() - 0.5), 1 + rnd(), b.z + (rnd() - 0.5), 0, 1, 0, 1.2, 0.06);
      toast(`A baby ${SPECIES[sp].name} was born!`);
      sfx("merge", 0.6);
      discover(sp);
    }
  }
}

function updateLepus(e, dt) {
  if (e.mode === "sucked") {
    if (e.pulled) { e.pulled = false; e.anim += dt; syncSprite(e); return; }
    e.mode = "free"; // let go
  }
  const spec = SPECIES[e.sp];
  e.anim += dt;
  if (e.baby < 1) {
    e.baby = Math.min(1, e.baby + dt / 90);
    if (e.baby >= 1) { e.sheet = sizeOf(e); poof(e.x, 0.8, e.z, 8); }
  }
  // lay eggs
  for (let i = e.digest.length - 1; i >= 0; i--) {
    e.digest[i] -= dt;
    if (e.digest[i] <= 0) {
      e.digest.splice(i, 1);
      const a = rnd() * 6.28;
      spawnItem("egg", spec.egg, e.x + Math.cos(a) * 0.5, 0.5, e.z + Math.sin(a) * 0.5, Math.cos(a) * 1.4, 4, Math.sin(a) * 1.4);
      sfx("tick", 0.25, 1.4);
    }
  }
  if (e.mode === "pen") {
    e.hunger += dt;
    setIcon(e, e.baby >= 1 && e.hunger > 100 ? "hungry" : null);
  } else setIcon(e, null);

  if (e.mode === "free") {
    const n = Math.max(1, Math.ceil(dt * 90)), h = dt / n;
    for (let i = 0; i < n; i++) {
      e.vy -= 22 * h;
      e.x += e.vx * h; e.z += e.vz * h; e.y += e.vy * h;
      collideWalls(e, 0.45);
      if (e.y <= 0 && e.vy < 0) {
        e.y = 0;
        if (e.vy < -4) { e.vy = -e.vy * 0.3; e.vx *= 0.6; e.vz *= 0.6; }
        else { e.vy = 0; }
      }
      if (e.y <= 0.001 && e.vy === 0) {
        const f = Math.pow(0.002, h);
        e.vx *= f; e.vz *= f;
        if (Math.hypot(e.vx, e.vz) < 0.9) { land(e); break; }
      }
    }
  } else {
    // hopping AI
    if (e.y > 0.001 || e.vy > 0) {
      e.vy -= 22 * dt;
      e.x += e.vx * dt; e.z += e.vz * dt; e.y += e.vy * dt;
      if (e.y <= 0 && e.vy < 0) { e.y = 0; e.vy = 0; e.vx = e.vz = 0; e.timer = Math.max(e.timer, 0.15); }
    } else {
      e.timer -= dt;
      if (e.timer <= 0) chooseHop(e);
    }
    if (e.mode === "pen") {
      const r = penRects[e.pen];
      e.x = clamp(e.x, r.x0 + 0.7, r.x1 - 0.7);
      e.z = clamp(e.z, r.z0 + 0.7, r.z1 - 0.7);
      if (e.baby >= 1 && e.y < 0.6) {
        for (const it of items) {
          if (it.kind === "food" && it.mode === "free" && Math.abs(it.x - e.x) < 0.9 + spec.scale * 20 && Math.abs(it.z - e.z) < 0.9 + spec.scale * 20 && inPen(it.x, it.z) === e.pen) { eat(e, it); break; }
        }
      }
    } else {
      const z = ZONES[e.zone];
      const r = Math.hypot(e.x, e.z);
      const lo = z.rmin + 1.5, hi = z.rmax - 1.5;
      if (r > hi || r < lo) { const k = clamp(r, lo, hi) / (r || 1); e.x *= k; e.z *= k; }
      for (let i = 0; i < penRects.length; i++) {
        const q = penRects[i], m = 1.2;
        if (e.x > q.x0 - m && e.x < q.x1 + m && e.z > q.z0 - m && e.z < q.z1 + m) {
          const opts = [[e.x - q.x0 + m, -1, 0], [q.x1 + m - e.x, 1, 0], [e.z - q.z0 + m, 0, -1], [q.z1 + m - e.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
          e.x += opts[1] * opts[0]; e.z += opts[2] * opts[0];
        }
      }
      pushOutCircle(e, HOPPER.x, HOPPER.z, HOPPER.r + 1.2);
      collideLab(e, 1.2);
    }
  }
  syncSprite(e);
}

// ---------- items ----------
export function spawnItem(kind, id, x, y, z, vx = 0, vy = 0, vz = 0) {
  const sheet = kind === "egg" ? EGGS[id].sheet : id === "golden" ? "golden" : "carrot";
  const it = { t: "item", kind, id, x, y, z, vx, vy, vz, mode: "free", age: 0, pulled: false };
  it.sprite = mkSprite(sheet, kind === "egg" ? 0.03 : 0.028);
  it.shadow = mkShadow(0.7);
  items.push(it);
  if (items.length > 220) {
    const old = items.findIndex((i) => i.mode === "free");
    if (old >= 0) removeItem(items[old]);
  }
  syncItem(it);
  return it;
}
function removeItem(it) {
  const i = items.indexOf(it);
  if (i >= 0) items.splice(i, 1);
  dispose(it);
}
function syncItem(it) {
  it.sprite.position.set(it.x, it.y, it.z);
  it.sprite.material.color.setScalar(world.bright);
  it.shadow.position.set(it.x, 0.03, it.z);
}

export const price = (id) => Math.max(1, Math.round(EGGS[id].base * S.market[id].m * SPA[lvl("spa")]));

function sellEgg(it) {
  const p = price(it.id);
  S.coins += p; S.sold++;
  S.market[it.id].m = Math.max(0.5, S.market[it.id].m * 0.97);
  removeItem(it);
  sfx("coin", 0.6, 0.9 + rnd() * 0.3);
  poof(HOPPER.x, 1.6, HOPPER.z, 5);
  hooks.sold && hooks.sold(p, EGGS[it.id].name);
}

function updateItem(it, dt) {
  it.age += dt;
  if (it.mode === "sucked") {
    if (it.pulled) { it.pulled = false; syncItem(it); return; }
    it.mode = "free";
  }
  const n = Math.max(1, Math.ceil(dt * 90)), h = dt / n;
  for (let i = 0; i < n; i++) {
    it.vy -= 22 * h;
    it.x += it.vx * h; it.z += it.vz * h; it.y += it.vy * h;
    collideWalls(it, 0.3);
    if (it.y <= 0 && it.vy < 0) {
      it.y = 0;
      if (it.vy < -3) { it.vy = -it.vy * 0.35; it.vx *= 0.7; it.vz *= 0.7; } else it.vy = 0;
    }
    if (it.y <= 0.001 && it.vy === 0) { const f = Math.pow(0.0005, h); it.vx *= f; it.vz *= f; }
  }
  collideLab(it, 0.3);
  const hd = Math.hypot(it.x - HOPPER.x, it.z - HOPPER.z);
  if (hd < HOPPER.r + 0.9 && it.y < 2.0) {
    if (it.kind === "egg") { sellEgg(it); return; }
    pushOutCircle(it, HOPPER.x, HOPPER.z, HOPPER.r + 0.9);
  }
  const lim = accessR() + 8;
  const r = Math.hypot(it.x, it.z);
  if (r > lim) { it.x *= lim / r; it.z *= lim / r; }
  if (it.age > 600 && it.y < 0.1) { removeItem(it); return; }
  syncItem(it);
}

// ---------- tank ----------
function slotFor(key) {
  const cap = tankCap();
  for (let i = 0; i < SLOTS; i++) if (S.slots[i] && S.slots[i].key === key && S.slots[i].n < cap) return i;
  for (let i = 0; i < SLOTS; i++) if (!S.slots[i]) return i;
  return -1;
}
function addToSlot(key) {
  const i = slotFor(key);
  if (i < 0) return false;
  if (!S.slots[i]) S.slots[i] = { key, n: 0 };
  S.slots[i].n++;
  return true;
}

// ---------- vac & shoot ----------
const tmpV = new THREE.Vector3();
let lastDeny = 0, vacOn = false, shootCd = 0, fxCd = 0;
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), muzzle = new THREE.Vector3();

function camVectors() {
  const cp = Math.cos(player.pitch);
  fwd.set(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp);
  right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  muzzle.set(player.x, player.y + 1.65, player.z).addScaledVector(fwd, 0.8).addScaledVector(right, 0.28);
  muzzle.y -= 0.3;
}
function deny(msg) {
  const now = performance.now();
  if (now - lastDeny > 1800) { lastDeny = now; toast(msg); sfx("denied", 0.4); }
}

function absorb(e) {
  if (e.t === "lepus") {
    const key = "L:" + e.sp;
    if (!addToSlot(key)) return false;
    discover(e.sp);
    lepus.splice(lepus.indexOf(e), 1);
    dispose(e);
  } else {
    const key = (e.kind === "egg" ? "E:" : "F:") + e.id;
    if (!addToSlot(key)) return false;
    removeItem(e);
  }
  sfx("grab", 0.5, 0.9 + rnd() * 0.3);
  return true;
}

function vacuum(dt) {
  const on = !!input.vac && hooks.playing;
  if (on !== vacOn) { vacOn = on; vacHum(on); }
  if (!on) return;
  camVectors();
  const range = 9 + 2.5 * lvl("vac"), cosMin = opts.cosMin;
  const org = tmpV.set(player.x, player.y + 1.65, player.z);
  const ox = org.x, oy = org.y, oz = org.z;
  const consider = (e, ex, ey, ez, key, heavy, baby) => {
    const dx = ex - ox, dy = ey - oy, dz = ez - oz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > range || dist < 0.01) return false;
    if ((dx * fwd.x + dy * fwd.y + dz * fwd.z) / dist < cosMin) return false;
    if (baby) { deny("Too little to pick up! Wait until it grows."); return false; }
    if (heavy > power()) { deny(`Needs Power Vac Mk ${["I", "II", "III"][heavy - 1]}!`); return false; }
    if (slotFor(key) < 0) { deny("Tank full! Shoot something out (right click)."); return false; }
    return dist;
  };
  const pull = (e, ey) => {
    const dx = muzzle.x - e.x, dy = muzzle.y - (e.y + ey), dz = muzzle.z - e.z;
    const d = Math.hypot(dx, dy, dz);
    const heavy = e.t === "lepus" ? SPECIES[e.sp].power : 1;
    const sp = (9 + 14 * (1 - Math.min(1, d / range))) / (heavy > 1 ? 1 + 0.3 * (heavy - 1) : 1);
    e.mode = "sucked"; e.pulled = true; e.vx = e.vy = e.vz = 0; e.y = Math.max(0, e.y);
    const k = Math.min(d, sp * dt) / (d || 1);
    e.x += dx * k; e.z += dz * k; e.y += dy * k;
    if (d < 1.1) return absorb(e);
    return false;
  };
  for (let i = lepus.length - 1; i >= 0; i--) {
    const e = lepus[i];
    const ey = e.y + 0.6;
    const was = e.mode === "sucked";
    const d = consider(e, e.x, ey, e.z, "L:" + e.sp, SPECIES[e.sp].power, e.baby < 1);
    if (d === false) continue;
    if (!was) e.mode = "sucked";
    pull(e, 0.5);
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const key = (it.kind === "egg" ? "E:" : "F:") + it.id;
    const d = consider(it, it.x, it.y + 0.3, it.z, key, 1, false);
    if (d === false) continue;
    pull(it, 0.3);
  }
  for (const p of patches) {
    if (!p.ripe || !p.visible) continue;
    const d = consider(p, p.x, 0.4, p.z, "F:" + p.kind, 1, false);
    if (d === false) continue;
    p.ripe = false; p.timer = p.kind === "golden" ? 45 : 20;
    const it = spawnItem("food", p.kind, p.x, 0.4, p.z);
    it.mode = "sucked"; it.pulled = true;
    syncPatch(p);
  }
  // swirl particles
  fxCd -= dt;
  if (fxCd <= 0) {
    fxCd = 0.03;
    const dist = 3 + rnd() * (range - 3), spread = 0.35 * dist * 0.6;
    const px = ox + fwd.x * dist + (rnd() - 0.5) * spread * 2, py = oy + fwd.y * dist + (rnd() - 0.5) * spread, pz = oz + fwd.z * dist + (rnd() - 0.5) * spread * 2;
    addFx("sparkle", px, py, pz, (muzzle.x - px) * 3, (muzzle.y - py) * 3, (muzzle.z - pz) * 3, 0.33, 0.04);
  }
}

function shoot(dt) {
  shootCd -= dt;
  if (!input.shoot || !hooks.playing || shootCd > 0) return;
  const s = S.slots[S.sel];
  if (!s) return;
  shootCd = 0.17;
  camVectors();
  const [t, id] = s.key.split(":");
  const vx = fwd.x * 18 + player.vx * 0.6, vy = fwd.y * 18 + 1.5, vz = fwd.z * 18 + player.vz * 0.6;
  if (t === "L") {
    const e = spawnLepus(id, muzzle.x, muzzle.z, "free");
    e.y = Math.max(0.1, muzzle.y - 0.2); e.vx = vx; e.vy = vy; e.vz = vz; e.face = true;
    e.mode = "free";
  } else {
    spawnItem(t === "E" ? "egg" : "food", id, muzzle.x, muzzle.y, muzzle.z, vx, vy, vz);
  }
  s.n--;
  if (s.n <= 0) S.slots[S.sel] = null;
  sfx("click", 0.4, 1.1 + rnd() * 0.2);
}

// ---------- garden ----------
function syncPatch(p) {
  p.sprite.visible = p.visible;
  if (!p.visible) return;
  setFrame(p.sprite, p.ripe ? (p.kind === "golden" ? "patch_golden" : "patch_ripe") : "patch_empty", 0, false);
  p.sprite.material.map = sheets[p.ripe ? (p.kind === "golden" ? "patch_golden" : "patch_ripe") : "patch_empty"].frames[0];
  p.sprite.material.color.setScalar(world.bright);
}
function buildPatches() {
  const spots = [];
  for (let i = 0; i < 16; i++) {
    const c = i % 4, r = Math.floor(i / 4);
    spots.push({ x: GARDEN_CENTER.x + (c - 1.5) * 3.2, z: GARDEN_CENTER.z + (r - 1.5) * 3.0 });
  }
  spots.sort((a, b) => Math.hypot(a.x - GARDEN_CENTER.x, a.z - GARDEN_CENTER.z) - Math.hypot(b.x - GARDEN_CENTER.x, b.z - GARDEN_CENTER.z));
  spots.forEach((s, i) => addPatch("carrot", s.x, s.z, i));
  const r2 = mulberry(55);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r2() * 0.5, r = R_MEADOW + 8 + r2() * 24;
    addPatch("golden", Math.cos(a) * r, Math.sin(a) * r, -1);
  }
}
function addPatch(kind, x, z, idx) {
  const sprite = mkSprite("patch_empty", 0.05);
  sprite.position.set(x, 0, z);
  const p = { kind, x, z, idx, ripe: true, timer: 0, sprite, visible: true };
  patches.push(p);
  syncPatch(p);
}
function updatePatches(dt) {
  const n = GARDEN_N[lvl("garden")];
  for (const p of patches) {
    const vis = p.kind === "golden" ? true : p.idx < n;
    if (vis !== p.visible) { p.visible = vis; if (vis) { p.ripe = true; } syncPatch(p); }
    if (!p.visible) continue;
    if (!p.ripe) { p.timer -= dt; if (p.timer <= 0) { p.ripe = true; syncPatch(p); } }
    else p.sprite.material.color.setScalar(world.bright);
  }
}

// ---------- market ----------
let marketTick = 0;
function updateMarket(dt) {
  marketTick -= dt;
  if (marketTick > 0) return;
  marketTick = 20;
  for (const id of Object.keys(EGGS)) {
    const m = S.market[id];
    m.prev = m.m;
    m.m = clamp(m.m + (1 - m.m) * 0.12 + (rnd() - 0.5) * 0.16, 0.55, 1.6);
  }
}

// ---------- wild spawning ----------
let spawnCd = 0;
function randomWildPos(zone) {
  const z = ZONES[zone];
  for (let k = 0; k < 40; k++) {
    const a = rnd() * 6.283, r = z.rmin + 4 + rnd() * (z.rmax - z.rmin - 8);
    const x = Math.cos(a) * r, zz = Math.sin(a) * r;
    if (x > -30 && x < 30 && zz > -38 && zz < 30) continue;
    if (Math.hypot(x - player.x, zz - player.z) < 22) continue;
    return [x, zz];
  }
  return null;
}
function maintainWild(dt, initial = false) {
  spawnCd -= dt;
  if (spawnCd > 0 && !initial) return;
  spawnCd = 1.5;
  for (const zone of Object.keys(ZONES)) {
    for (const [sp, target] of Object.entries(ZONES[zone].pop)) {
      let have = 0;
      for (const l of lepus) if (l.mode !== "pen" && l.sp === sp && l.zone === zone && l.baby >= 1) have++;
      let need = target - have;
      if (!initial) need = Math.min(need, 1);
      while (need-- > 0) {
        const pos = randomWildPos(zone);
        if (!pos) break;
        const e = spawnLepus(sp, pos[0], pos[1], "wild");
        if (!initial) poof(pos[0], 0.8, pos[1], 6);
      }
    }
  }
}

// ---------- player ----------
function updatePlayer(dt) {
  const boots = lvl("boots");
  const speed = (input.sprint ? 9.5 : 5.8) * (1 + 0.12 * boots);
  let mx = 0, mz = 0;
  const f = (input.f || 0) - (input.b || 0), r = (input.r || 0) - (input.l || 0);
  if (hooks.playing) {
    mx = -Math.sin(player.yaw) * f + Math.cos(player.yaw) * r;
    mz = -Math.cos(player.yaw) * f - Math.sin(player.yaw) * r;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
  }
  const k = Math.min(1, (player.grounded ? 14 : 4) * dt);
  player.vx += (mx * speed - player.vx) * k;
  player.vz += (mz * speed - player.vz) * k;
  if (input.jump && player.grounded && hooks.playing) { player.vy = 7.2 + 0.8 * boots; player.grounded = false; }
  player.vy -= 22 * dt;
  const n = Math.max(1, Math.ceil(dt * 90)), h = dt / n;
  for (let i = 0; i < n; i++) {
    player.x += player.vx * h; player.z += player.vz * h; player.y += player.vy * h;
    if (player.y <= 0) { player.y = 0; if (player.vy < 0) player.vy = 0; player.grounded = true; }
    else if (player.y > 0.02) player.grounded = false;
    collideWalls(player, 0.42);
    pushOutCircle(player, HOPPER.x, HOPPER.z, HOPPER.r + 0.45);
    collideLab(player, 0.42);
  }
  for (const c of circles) {
    const dx = player.x - c.x;
    if (dx > 3 || dx < -3) continue;
    pushOutCircle(player, c.x, c.z, c.r + 0.4);
  }
  const R = accessR(), rr = Math.hypot(player.x, player.z);
  if (rr > R) { player.x *= R / rr; player.z *= R / rr; }
}

// ---------- public API ----------
export function initGame(sc, wd, cam, h) {
  scene = sc; world = wd; camera = cam; hooks = h;
  for (const id of Object.keys(EGGS)) S.market[id] = { m: 1, prev: 1 };
  buildPatches();
}

export function nearLab() {
  const b = labBox;
  const dx = Math.max(b.x0 - player.x, 0, player.x - b.x1), dz = Math.max(b.z0 - player.z, 0, player.z - b.z1);
  return Math.hypot(dx, dz) < 3.2;
}
export function nearHopper() {
  return Math.hypot(player.x - HOPPER.x, player.z - HOPPER.z) < 9;
}

export function buyUpgrade(id) {
  const u = UPGRADES.find((x) => x.id === id);
  const l = lvl(id);
  if (!u || l >= u.levels.length) return false;
  const cost = u.levels[l][0];
  if (S.coins < cost) { sfx("denied", 0.5); return false; }
  S.coins -= cost;
  S.up[id] = l + 1;
  sfx(id.startsWith("gate") ? "unlock" : "buy", 0.8);
  applyUpgrades();
  save();
  return true;
}
function applyUpgrades() {
  world.setGate(0, !!lvl("gate1"));
  world.setGate(1, !!lvl("gate2"));
}

export function selectSlot(i) { S.sel = ((i % SLOTS) + SLOTS) % SLOTS; }

let saveCd = 10;
export function save() {
  try {
    const data = {
      v: 1, coins: S.coins, up: S.up, slots: S.slots, sel: S.sel, dex: S.dex, time: S.time, sold: S.sold,
      market: Object.fromEntries(Object.entries(S.market).map(([k, v]) => [k, v.m])),
      lepus: lepus.filter((l) => l.mode === "pen").map((l) => ({ sp: l.sp, pen: l.pen, baby: l.baby, hunger: l.hunger })),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {}
}
export function load() {
  let d;
  try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch { d = null; }
  if (!d) return false;
  S.coins = d.coins ?? 30; S.up = d.up || {}; S.slots = (d.slots || []).concat(Array(SLOTS).fill(null)).slice(0, SLOTS);
  S.sel = d.sel || 0; S.dex = d.dex || {}; S.time = d.time ?? S.time; S.sold = d.sold || 0;
  for (const [k, m] of Object.entries(d.market || {})) if (S.market[k]) S.market[k] = { m, prev: m };
  for (const l of d.lepus || []) {
    const r = penRects[l.pen];
    if (!r) continue;
    const e = spawnLepus(l.sp, r.x0 + 1 + rnd() * (PEN_SIZE - 2), r.z0 + 1 + rnd() * (PEN_SIZE - 2), "pen", l.baby ?? 1, l.pen);
    e.hunger = l.hunger || 0;
  }
  return true;
}
export function exportCode() {
  if (hooks.started) save();
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  return btoa(unescape(encodeURIComponent(raw)));
}
export function importCode(code) {
  try {
    const raw = decodeURIComponent(escape(atob(code.trim())));
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return false;
    localStorage.setItem(SAVE_KEY, raw);
    return true;
  } catch { return false; }
}
export function resetSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

export function start(loaded) {
  applyUpgrades();
  maintainWild(0, true);
  if (!loaded) {
    // a friendly starter: one Bunny already living in Pen 1
    const e = spawnLepus("bunny", penRects[0].x0 + 6, penRects[0].z0 + 6, "pen", 1, 0);
    discover("bunny");
    S.dex.bunny = 1;
    toast("Welcome to the ranch! Vacuum carrots in the garden, then shoot them to the Bunny in Pen 1.");
  }
}

export function update(dt) {
  dt = Math.min(dt, 0.05);
  S.time += dt;
  updatePlayer(dt);
  vacuum(dt);
  shoot(dt);
  for (let i = lepus.length - 1; i >= 0; i--) updateLepus(lepus[i], dt);
  for (let i = items.length - 1; i >= 0; i--) if (items[i]) updateItem(items[i], dt);
  updatePatches(dt);
  updateMarket(dt);
  maintainWild(dt);
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life -= dt;
    if (f.life <= 0) { scene.remove(f.sp); f.sp.material.dispose(); fx.splice(i, 1); continue; }
    f.vy -= f.grav * dt;
    f.sp.position.x += f.vx * dt; f.sp.position.y += f.vy * dt; f.sp.position.z += f.vz * dt;
    f.sp.material.opacity = Math.min(1, f.life / f.max * 1.5);
  }
  saveCd -= dt;
  if (saveCd <= 0) { saveCd = 10; save(); }
}

export function syncCamera() {
  camera.position.set(player.x, player.y + 1.65, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
}

export const vacActive = () => vacOn;
export const keyLabel = keyName;

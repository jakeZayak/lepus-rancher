// LEPUS Rancher: boot, input, HUD, shop and the render loop.
import * as THREE from "../vendor/three.module.min.js";
import { loadSprites, sheets, iconURL } from "./sprites.js";
import { buildWorld } from "./world.js";
import * as G from "./game.js";
import { SPECIES, SPECIES_ORDER, EGGS, UPGRADES, SLOTS, keyName } from "./data.js";
import { initAudio, sfx, setMusic, isMusicOn, pauseMusic, vacHum } from "./audio.js";

const $ = (id) => document.getElementById(id);
const hooks = { playing: false, toast: null, sold: null, started: false };
const PAGES_URL = "https://jakezayak.github.io/lepus-rancher/";
const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
let renderer, scene, camera, world;
let shopOpen = false, started = false, locked = false, debugNoLock = false;

function slotIcon(key) {
  const [t, id] = key.split(":");
  if (t === "L") return iconURL(SPECIES[id].sheet, 0);
  if (t === "E") return iconURL(EGGS[id].sheet, 0);
  return iconURL(id === "golden" ? "golden" : "carrot", 0);
}

// ---------- toasts ----------
const toasts = [];
hooks.toast = (msg) => {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $("toasts").appendChild(el);
  toasts.push(el);
  if (toasts.length > 4) toasts.shift().remove();
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 500); }, 4200);
};
let coinPop = 0;
hooks.sold = (p, name) => {
  coinPop = 0.4;
  const el = document.createElement("div");
  el.className = "sale";
  el.textContent = `+${p} ◉ ${name}`;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 1400);
};

// ---------- HUD ----------
function buildHud() {
  const slots = $("slots");
  slots.innerHTML = "";
  for (let i = 0; i < SLOTS; i++) {
    const d = document.createElement("div");
    d.className = "slot";
    d.innerHTML = `<span class="num">${i + 1}</span><img alt=""><span class="cnt"></span>`;
    d.onmousedown = (e) => e.stopPropagation();
    slots.appendChild(d);
  }
  const mk = $("market");
  mk.innerHTML = "<h4>Egg Market</h4>" + Object.keys(EGGS).map((id) => `<div class="mrow" data-id="${id}"><img src="${iconURL(EGGS[id].sheet, 0)}"><span class="mp"></span><span class="ma"></span></div>`).join("");
}
let lastSig = "";
function updateHud() {
  const S = G.S;
  $("coins").textContent = Math.floor(S.coins).toLocaleString();
  $("coinbox").classList.toggle("pop", coinPop > 0);
  const cap = G.tankCap();
  const els = $("slots").children;
  for (let i = 0; i < SLOTS; i++) {
    const s = S.slots[i], el = els[i];
    el.classList.toggle("sel", i === S.sel);
    const img = el.querySelector("img"), cnt = el.querySelector(".cnt");
    if (s) {
      const src = slotIcon(s.key);
      if (img.dataset.k !== s.key) { img.src = src; img.dataset.k = s.key; }
      img.style.visibility = "visible";
      cnt.textContent = s.n + (s.n >= cap ? " MAX" : "");
      el.title = keyName(s.key);
    } else { img.style.visibility = "hidden"; img.dataset.k = ""; cnt.textContent = ""; el.title = ""; }
  }
  const sel = S.slots[S.sel];
  $("selname").textContent = sel ? keyName(sel.key) : "";
  for (const row of $("market").querySelectorAll(".mrow")) {
    const id = row.dataset.id, m = S.market[id];
    row.querySelector(".mp").textContent = G.price(id);
    const a = row.querySelector(".ma");
    const diff = m.m - m.prev;
    a.textContent = diff > 0.01 ? "▲" : diff < -0.01 ? "▼" : "–";
    a.className = "ma " + (diff > 0.01 ? "mup" : diff < -0.01 ? "mdown" : "");
  }
  // prompt
  let p = "";
  if (G.nearLab()) p = isTouch ? "Tap LAB to upgrade" : "Press E: Upgrade Lab";
  else if (G.nearHopper() && S.slots.some((s) => s && s.key.startsWith("E:"))) p = isTouch ? "Pick your eggs, then hold SHOOT at the hopper" : "Select eggs (1-5) and shoot them into the hopper (right click)";
  $("prompt").textContent = p;
  if (isTouch) {
    $("touch").classList.toggle("hidden", !hooks.playing);
    $("tUse").classList.toggle("hidden", !G.nearLab());
  }
  const t = (S.time / G.DAY) % 1;
  $("clock").textContent = t < 0.22 || t > 0.78 ? "Night" : t < 0.32 ? "Dawn" : t < 0.7 ? "Day" : "Dusk";
}

// ---------- shop ----------
function renderShop() {
  const S = G.S;
  $("shopCoins").textContent = Math.floor(S.coins).toLocaleString();
  const list = $("upgrades");
  list.innerHTML = "";
  for (const u of UPGRADES) {
    const l = G.lvl(u.id), maxed = l >= u.levels.length;
    const row = document.createElement("div");
    row.className = "up" + (maxed ? " maxed" : "");
    const pips = u.levels.map((_, i) => `<i class="${i < l ? "on" : ""}"></i>`).join("");
    const next = maxed ? "MAX" : `${u.levels[l][0].toLocaleString()} ◉`;
    row.innerHTML = `<div class="ut"><b>${u.name}</b><span class="pips">${pips}</span><p>${u.desc}${maxed ? "" : ` <em>Next: ${u.levels[l][1]}</em>`}</p></div>`;
    const btn = document.createElement("button");
    btn.textContent = next;
    btn.disabled = maxed || S.coins < u.levels[l][0];
    btn.onclick = () => { if (G.buyUpgrade(u.id)) renderShop(); };
    row.appendChild(btn);
    list.appendChild(row);
  }
  $("dex").innerHTML = SPECIES_ORDER.map((id) => {
    const got = !!S.dex[id];
    return `<div class="dexc ${got ? "got" : ""}"><img src="${iconURL(SPECIES[id].sheet, 0)}"><span>${got ? SPECIES[id].name : "???"}</span></div>`;
  }).join("");
}
function openShop() {
  shopOpen = true;
  hooks.playing = false;
  G.input.vac = G.input.shoot = 0;
  vacHum(false);
  renderShop();
  $("shop").classList.remove("hidden");
  if (document.pointerLockElement) document.exitPointerLock();
  sfx("click", 0.5);
}
function closeShop() {
  shopOpen = false;
  $("shop").classList.add("hidden");
  resume();
}

// ---------- start / pause ----------
function resume() {
  if (!debugNoLock && !isTouch) renderer.domElement.requestPointerLock?.();
  hooks.playing = true;
  $("overlay").classList.add("hidden");
  pauseMusic(false);
}
function pause() {
  hooks.playing = false;
  G.input.vac = G.input.shoot = 0;
  vacHum(false);
  if (!shopOpen) {
    $("overlayTitle").textContent = "Paused";
    $("overlay").classList.remove("hidden");
    $("playBtn").textContent = "Resume";
  }
}
function begin(newGame) {
  initAudio();
  if (!started) {
    started = true;
    hooks.started = true;
    if (newGame) G.resetSave();
    const loaded = newGame ? false : G.load();
    G.start(loaded);
  }
  resume();
}

// ---------- viewmodel (the vacpack nozzle) ----------
let nozzle, ring;
function buildViewmodel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.6, 10), new THREE.MeshBasicMaterial({ color: 0x3b8fd6 }));
  body.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.09, 0.18, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x9be4ff, side: THREE.DoubleSide }));
  tip.rotation.x = Math.PI / 2; tip.position.z = -0.38;
  ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 16), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  ring.position.z = -0.47;
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.24), new THREE.MeshBasicMaterial({ color: 0x2a5f93 }));
  tank.position.set(0.0, -0.16, 0.1);
  g.add(body, tip, ring, tank);
  g.position.set(0.32, -0.3, -0.62); g.scale.setScalar(0.7);
  g.rotation.set(0.04, 0.1, 0);
  camera.add(g);
  nozzle = g;
}

// ---------- input ----------
const KEYS = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r", ShiftLeft: "sprint", ShiftRight: "sprint", Space: "jump" };
function bindInput() {
  addEventListener("keydown", (e) => {
    if (KEYS[e.code] && hooks.playing) { G.input[KEYS[e.code]] = 1; e.preventDefault(); }
    if (e.repeat) return;
    if (e.code === "KeyE") {
      if (shopOpen) closeShop();
      else if (hooks.playing && G.nearLab()) openShop();
    } else if (e.code === "Escape" && shopOpen) closeShop();
    else if (e.code === "KeyM") { setMusic(!isMusicOn()); hooks.toast(isMusicOn() ? "Music on" : "Music off"); }
    else if (e.code === "KeyQ" && hooks.playing) G.input.shoot = 1;
    else if (/^Digit[1-5]$/.test(e.code)) G.selectSlot(Number(e.code.slice(5)) - 1);
  });
  addEventListener("keyup", (e) => {
    if (KEYS[e.code]) G.input[KEYS[e.code]] = 0;
    if (e.code === "KeyQ") G.input.shoot = 0;
  });
  addEventListener("mousedown", (e) => {
    if (!hooks.playing) return;
    if (e.button === 0) G.input.vac = 1;
    if (e.button === 2) G.input.shoot = 1;
  });
  addEventListener("mouseup", (e) => {
    if (e.button === 0) G.input.vac = 0;
    if (e.button === 2) G.input.shoot = 0;
  });
  addEventListener("contextmenu", (e) => e.preventDefault());
  addEventListener("mousemove", (e) => {
    if (!hooks.playing || (!locked && !debugNoLock)) return;
    G.player.yaw -= e.movementX * 0.0022;
    G.player.pitch = Math.max(-1.5, Math.min(1.5, G.player.pitch - e.movementY * 0.0022));
  });
  addEventListener("wheel", (e) => { if (hooks.playing) G.selectSlot(G.S.sel + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });
  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === renderer.domElement;
    if (!locked && hooks.playing && !debugNoLock) pause();
  });
  addEventListener("blur", () => { if (hooks.playing && !debugNoLock) pause(); });
  if (isTouch) bindTouch();
  $("playBtn").onclick = () => begin(false);
  $("newBtn").onclick = () => { if (confirm("Start a brand new ranch? This erases your saved game.")) { G.resetSave(); location.reload(); } };
  $("shopClose").onclick = closeShop;
  $("expBtn").onclick = async () => {
    const code = G.exportCode();
    if (!code) { alert("No saved game yet. Play a bit first."); return; }
    const link = PAGES_URL + "#save=" + code;
    try { await navigator.clipboard.writeText(link); alert("Transfer link copied! Open it on the other device or site to bring your ranch over."); }
    catch { prompt("Copy this transfer link:", link); }
  };
  $("impBtn").onclick = () => {
    const v = prompt("Paste a transfer link or save code:");
    if (!v) return;
    const code = v.includes("#save=") ? v.split("#save=")[1] : v;
    if (G.importCode(code)) { alert("Save imported!"); location.reload(); } else alert("That didn't look like a valid save.");
  };
  addEventListener("beforeunload", () => started && G.save());
}

// ---------- touch ----------
function bindTouch() {
  document.body.classList.add("touch");
  G.opts.cosMin = 0.68; // wider vacuum cone for thumbs
  const I = G.input;
  [...$("slots").children].forEach((el, i) => el.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); G.selectSlot(i); }, { passive: false }));
  let sId = null, sx = 0, sy = 0;
  const stick = $("stick"), knob = $("knob"), R = 55;
  const zl = $("zoneL"), zr = $("zoneR");
  const setStick = (dx, dy) => {
    const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
    dx *= k; dy *= k;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const ax = dx / R, ay = dy / R;
    I.f = Math.max(0, -ay); I.b = Math.max(0, ay); I.r = Math.max(0, ax); I.l = Math.max(0, -ax);
    I.sprint = Math.hypot(ax, ay) > 0.92 ? 1 : 0;
  };
  zl.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (sId !== null) return;
    const t = e.changedTouches[0];
    sId = t.identifier; sx = t.clientX; sy = t.clientY;
    stick.style.left = sx - 70 + "px"; stick.style.top = sy - 70 + "px"; stick.classList.add("on");
    setStick(0, 0);
  }, { passive: false });
  zl.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === sId) setStick(t.clientX - sx, t.clientY - sy);
  }, { passive: false });
  const endStick = (e) => {
    for (const t of e.changedTouches) if (t.identifier === sId) { sId = null; stick.classList.remove("on"); I.f = I.b = I.l = I.r = I.sprint = 0; }
  };
  zl.addEventListener("touchend", endStick); zl.addEventListener("touchcancel", endStick);
  let lId = null, lx = 0, ly = 0;
  zr.addEventListener("touchstart", (e) => { e.preventDefault(); if (lId !== null) return; const t = e.changedTouches[0]; lId = t.identifier; lx = t.clientX; ly = t.clientY; }, { passive: false });
  zr.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === lId) {
      G.player.yaw -= (t.clientX - lx) * 0.006;
      G.player.pitch = Math.max(-1.5, Math.min(1.5, G.player.pitch - (t.clientY - ly) * 0.006));
      lx = t.clientX; ly = t.clientY;
    }
  }, { passive: false });
  const endLook = (e) => { for (const t of e.changedTouches) if (t.identifier === lId) lId = null; };
  zr.addEventListener("touchend", endLook); zr.addEventListener("touchcancel", endLook);
  const hold = (id, key) => {
    const b = $(id);
    b.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); I[key] = 1; b.classList.add("down"); }, { passive: false });
    const up = (e) => { e.preventDefault(); I[key] = 0; b.classList.remove("down"); };
    b.addEventListener("touchend", up); b.addEventListener("touchcancel", up);
  };
  hold("tVac", "vac"); hold("tShoot", "shoot"); hold("tJump", "jump");
  $("tUse").addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); if (hooks.playing && G.nearLab()) openShop(); }, { passive: false });
  $("tPause").addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); pause(); }, { passive: false });
  // block page scroll/zoom, but let the shop and menu cards scroll
  document.addEventListener("touchmove", (e) => { if (!e.target.closest(".card")) e.preventDefault(); }, { passive: false });
  $("hint").style.display = "none";
}

// ---------- loop ----------
let last = performance.now(), hudT = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  if (started && hooks.playing) G.update(dt);
  if (started) {
    G.syncCamera();
    ring.scale.setScalar(G.vacActive() ? 1 + 0.15 * Math.sin(now / 60) : 1);
    ring.material.color.setHex(G.vacActive() ? 0xffffff : 0xffe066);
    nozzle.position.z = -0.6 + (G.vacActive() ? 0.03 * Math.sin(now / 40) : 0);
  }
  world.updateSky(((G.S.time / G.DAY) % 1), camera, started && hooks.playing ? dt : 0);
  renderer.render(scene, camera);
  coinPop = Math.max(0, coinPop - dt);
  hudT -= dt;
  if (hudT <= 0 && started) { hudT = 0.1; updateHud(); }
  requestAnimationFrame(frame);
}

function importFromHash() {
  const m = /^#save=(.+)$/.exec(location.hash);
  if (!m) return;
  let has = false;
  try { has = !!localStorage.getItem("lepusRancher.v1"); } catch {}
  if (!has || confirm("Replace the saved ranch on this device with the one from the transfer link?")) {
    if (G.importCode(m[1])) alert("Your ranch was carried over!");
    else alert("That transfer link was not valid.");
  }
  history.replaceState(null, "", location.pathname);
}

// One-time hand-off: the first time the old localhost copy is opened with a save, send it to the live site.
function autoMigrate() {
  if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  try {
    if (localStorage.getItem("lepusRancher.migrated") || !localStorage.getItem("lepusRancher.v1")) return;
    const code = G.exportCode();
    if (!code) return;
    localStorage.setItem("lepusRancher.migrated", "1");
    location.replace(PAGES_URL + "#save=" + code);
  } catch {}
}

async function main() {
  importFromHash();
  autoMigrate();
  const canvas = $("game");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, 1, 0.1, 700);
  scene.add(camera);
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize);
  resize();

  await loadSprites();
  world = buildWorld(scene);
  world.makeClouds(sheets.cloud.frames[0]);
  G.initGame(scene, world, camera, hooks);
  buildViewmodel();
  buildHud();
  bindInput();
  let hasSave = false;
  try { hasSave = !!localStorage.getItem("lepusRancher.v1"); } catch {}
  $("newBtn").style.display = hasSave ? "" : "none";
  $("playBtn").textContent = hasSave ? "Continue" : "Play";
  $("playBtn").disabled = false;
  $("loading").remove();
  requestAnimationFrame(frame);

  window.__r = {
    G, scene, camera, world, hooks,
    begin: (opts = {}) => { debugNoLock = !!opts.noLock; begin(!!opts.fresh); },
  };
}
main().catch((e) => {
  console.error(e);
  const l = document.getElementById("loading");
  if (l) l.textContent = "Failed to load: " + e.message;
});

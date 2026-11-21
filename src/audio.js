// SFX (vanilla Terraria wavs via WebAudio, <audio> fallback), looping Lepus theme, procedural vac hum.
const NAMES = ["buy", "click", "coin", "denied", "eat", "grab", "hop", "merge", "roar", "tick", "unlock"];
let ctx = null, master = null;
const buffers = {};
const fallback = {};
let musicEl = null, musicOn = true, vacNodes = null;
let sfxVol = 0.6;

export function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && !ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    for (const n of NAMES)
      fetch(`assets/sfx/${n}.wav`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((d) => (buffers[n] = d)).catch(() => {});
  } else if (!AC) {
    for (const n of NAMES) fallback[n] = new Audio(`assets/sfx/${n}.wav`);
  }
  if (ctx && ctx.state === "suspended") ctx.resume();
  if (!musicEl) {
    musicEl = new Audio("assets/music/lepus.mp3");
    musicEl.loop = true;
    musicEl.volume = 0.35;
  }
  if (musicOn) musicEl.play().catch(() => {});
}

export function sfx(name, vol = 1, rate = 1) {
  if (ctx && buffers[name]) {
    const s = ctx.createBufferSource();
    s.buffer = buffers[name];
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vol * sfxVol;
    s.connect(g).connect(master);
    s.start();
  } else if (fallback[name]) {
    const a = fallback[name].cloneNode();
    a.volume = Math.min(1, vol * sfxVol);
    a.play().catch(() => {});
  }
}

export function setMusic(on) {
  musicOn = on;
  if (!musicEl) return;
  if (on) musicEl.play().catch(() => {});
  else musicEl.pause();
}
export const isMusicOn = () => musicOn;

export function pauseMusic(p) {
  if (!musicEl || !musicOn) return;
  if (p) musicEl.pause();
  else musicEl.play().catch(() => {});
}

// Vacuum hum: low saw + filtered noise, faded in/out.
export function vacHum(on) {
  if (!ctx) return;
  if (!vacNodes) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 70;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 12;
    lfo.connect(lfoG).connect(osc.frequency);
    osc.connect(lp).connect(g).connect(master);
    osc.start(); lfo.start();
    vacNodes = { g };
  }
  const t = ctx.currentTime;
  vacNodes.g.gain.cancelScheduledValues(t);
  vacNodes.g.gain.linearRampToValueAtTime(on ? 0.09 * sfxVol : 0, t + 0.12);
}

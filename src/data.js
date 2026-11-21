// Static game data: species, items, upgrades, world layout.

export const SPECIES = {
  bunny: { name: "Bunny", sheet: "bunny", scale: 0.021, egg: "small", power: 1, baby: "small_lepus", hop: 3.2, jump: 5.5, flee: 7, color: "#ffe9b0" },
  lepus: { name: "Lepus", sheet: "lepus", scale: 0.017, egg: "big", power: 1, hop: 3.4, jump: 6, flee: 0, color: "#fff" },
  epic: { name: "Epic Lepus", sheet: "lepus_epic", scale: 0.019, egg: "choc", power: 2, hop: 4.5, jump: 7, flee: 9, color: "#ffd24a" },
  zilla: { name: "Lepuszilla", sheet: "lepuszilla", scale: 0.05, egg: "sus", power: 3, hop: 2.4, jump: 4.5, flee: 0, color: "#b48cff" },
};
export const SPECIES_ORDER = ["bunny", "lepus", "epic", "zilla"];

export const EGGS = {
  small: { name: "Small Egg", sheet: "small_egg", base: 6 },
  big: { name: "Big Egg", sheet: "big_egg", base: 20 },
  choc: { name: "Choc Egg", sheet: "choc_egg", base: 70 },
  sus: { name: "Suspicious Egg", sheet: "suspicious_egg", base: 260 },
};

export const FOODS = {
  carrot: { name: "Carrot", eggs: 1 },
  golden: { name: "Golden Carrot", eggs: 2 },
};

// Slot keys look like "L:bunny" (Lepus), "E:small" (egg) or "F:carrot" (food).
export function keyName(key) {
  const [t, id] = key.split(":");
  return t === "L" ? SPECIES[id].name : t === "E" ? EGGS[id].name : FOODS[id].name;
}

export const UPGRADES = [
  { id: "tank", name: "Bigger Tank", desc: "Each tank slot holds more.", levels: [[150, "35 per slot"], [500, "50 per slot"], [1500, "80 per slot"]] },
  { id: "vac", name: "Power Vac", desc: "Stronger, longer suction. Epic Lepus need Mk II, Lepuszilla needs Mk III.", levels: [[300, "Mk II"], [1500, "Mk III"]] },
  { id: "pen", name: "Roomier Pens", desc: "More Lepus fit in each pen.", levels: [[200, "12 per pen"], [700, "18 per pen"], [2000, "26 per pen"]] },
  { id: "boots", name: "Hop Boots", desc: "Run faster and jump higher.", levels: [[120, "Lvl 1"], [600, "Lvl 2"], [2000, "Lvl 3"]] },
  { id: "garden", name: "Bigger Garden", desc: "More carrot patches at the ranch.", levels: [[250, "9 patches"], [800, "12 patches"], [2200, "16 patches"]] },
  { id: "cuddle", name: "Cuddle Crate", desc: "Happy Lepus have babies more often.", levels: [[400, "20%"], [1400, "30%"], [4000, "40%"]] },
  { id: "spa", name: "Lepus Spa", desc: "Egg market pays more.", levels: [[800, "+15%"], [2500, "+30%"], [8000, "+45%"]] },
  { id: "gate1", name: "Open Hilltop Gate", desc: "Unlocks the Golden Hills: Lepus, Epic Lepus and Golden Carrots.", levels: [[400, "Open"]] },
  { id: "gate2", name: "Open Crater Gate", desc: "Unlocks the Lepus Crater: Epic Lepus and Lepuszilla.", levels: [[2500, "Open"]] },
];

export const TANK_CAP = [20, 35, 50, 80];
export const PEN_CAP = [8, 12, 18, 26];
export const GARDEN_N = [6, 9, 12, 16];
export const CUDDLE = [0.12, 0.2, 0.3, 0.4];
export const SPA = [1, 1.15, 1.3, 1.45];
export const SLOTS = 5;

// World layout (x, z). Camera looks down -z at spawn.
export const R_MEADOW = 45, R_HILLS = 80, R_WORLD = 118;
export const PEN_SIZE = 12;
export const PENS = [
  { cx: -16, cz: -14, door: "e" },
  { cx: 0, cz: -26, door: "s" },
  { cx: 16, cz: -14, door: "w" },
];
export const HOPPER = { x: -7, z: 6, r: 1.1 };
export const LAB = { x: 8, z: 7, r: 4.2 };
export const GARDEN_CENTER = { x: 0, z: 17 };

export const ZONES = {
  meadow: { rmin: 0, rmax: R_MEADOW, pop: { bunny: 14, lepus: 3 } },
  hills: { rmin: R_MEADOW, rmax: R_HILLS, pop: { lepus: 8, epic: 3 } },
  crater: { rmin: R_HILLS, rmax: R_WORLD, pop: { epic: 4, zilla: 2 } },
};

// Synthesises Cuyco's 28 UI sounds into sounds/*.wav. No dependencies and no
// sampled audio: every file is generated here, so the fork ships its own audio
// instead of the original app's reserved WAVs.
//
//   node scripts/gen-sounds.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "sounds");
const SR = 22050;

/** One swept tone with an attack/decay envelope. */
function tone({
  f0, f1 = f0, dur, wave = "sine", noise = 0,
  gain = 0.9, attack = 0.005, release = 3,
}) {
  const n = Math.max(1, Math.round(dur * SR));
  const out = new Float32Array(n);
  let phase = 0;
  const atk = Math.max(1, attack * SR);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = f0 + (f1 - f0) * t;
    phase += (2 * Math.PI * f) / SR;
    let s = Math.sin(phase);
    if (wave === "tri") s = 2 * Math.abs(2 * ((phase / (2 * Math.PI)) % 1) - 1) - 1;
    else if (wave === "square") s = Math.sin(phase) >= 0 ? 1 : -1;
    if (noise > 0) s = s * (1 - noise) + (Math.random() * 2 - 1) * noise;
    const env = i < atk ? i / atk : Math.pow(1 - t, release);
    out[i] = s * gain * env;
  }
  return out;
}

function silence(dur) {
  return new Float32Array(Math.max(0, Math.round(dur * SR)));
}

/** Plays the given tones one after another, with a short gap between them. */
function sequence(...parts) {
  const chunks = parts.map((p) => (p instanceof Float32Array ? p : tone(p)));
  const gap = silence(0.012);
  const total = chunks.reduce((n, c) => n + c.length + gap.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length + gap.length;
  }
  return out;
}

/** Soft sine swell, the shape used for most of the calm events. */
const soft = (f0, f1, dur) => ({ f0, f1, dur, gain: 0.7, release: 2.6 });

const SPECS = {
  peek: sequence(soft(620, 940, 0.09)),
  open: sequence(soft(420, 840, 0.15)),
  close: sequence(soft(820, 400, 0.14)),
  hover: sequence({ f0: 980, dur: 0.045, gain: 0.4, release: 4 }),
  blip: sequence({ f0: 1180, dur: 0.06, gain: 0.55, release: 3.5 }),
  slap: sequence(
    { f0: 220, f1: 120, dur: 0.08, wave: "square", noise: 0.55, gain: 0.85, release: 5 },
    { f0: 90, f1: 60, dur: 0.1, gain: 0.55, release: 4 },
  ),
  annoyed: sequence(soft(560, 480, 0.09), soft(460, 380, 0.12)),
  dizzy: sequence({ f0: 520, f1: 300, dur: 0.55, wave: "tri", gain: 0.5, release: 1.4, attack: 0.02 }),
  greet: sequence(soft(560, 700, 0.11), soft(840, 1000, 0.18)),
  work: sequence(soft(500, 560, 0.13)),
  finish: sequence(soft(620, 640, 0.1), soft(780, 800, 0.1), soft(1040, 1060, 0.22)),
  error: sequence({ f0: 300, f1: 170, dur: 0.24, wave: "square", gain: 0.5, release: 2.2 }),
  approval: sequence(soft(700, 720, 0.1), soft(1050, 1080, 0.22)),
  question: sequence(soft(500, 920, 0.18)),
  approve: sequence({ f0: 900, dur: 0.2, wave: "tri", gain: 0.6, release: 2.4 }),
  gulp: sequence({ f0: 520, f1: 170, dur: 0.22, wave: "tri", gain: 0.6, release: 2 }),
  tick: sequence({ f0: 1400, dur: 0.03, gain: 0.45, release: 6 }),
  send: sequence(soft(400, 1000, 0.16)),
  love: sequence(soft(600, 620, 0.14), soft(800, 820, 0.24)),
  pop: sequence({ f0: 700, dur: 0.07, gain: 0.6, release: 6 }),
  proud: sequence(soft(600, 620, 0.09), soft(880, 900, 0.09), soft(1180, 1200, 0.26)),
  wink: sequence({ f0: 1000, dur: 0.08, gain: 0.5, release: 4 }),
  yawn: sequence({ f0: 300, f1: 520, dur: 0.4, gain: 0.5, release: 1.2, attack: 0.03 }, { f0: 520, f1: 250, dur: 0.45, gain: 0.5, release: 1.5 }),
  attach: sequence({ f0: 1500, dur: 0.03, gain: 0.4, release: 6 }, soft(700, 900, 0.13)),
  think: sequence(soft(540, 560, 0.1), soft(680, 700, 0.16)),
  search: sequence({ f0: 420, f1: 1080, dur: 0.26, gain: 0.5, release: 2 }),
  rate: sequence({ f0: 820, f1: 320, dur: 0.3, gain: 0.55, release: 1.8 }),
  sleep: sequence({ f0: 280, f1: 260, dur: 0.5, gain: 0.5, release: 1.6, attack: 0.04 }),
};

function normalize(samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak === 0) return samples;
  const k = 0.9 / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= k;
  return samples;
}

function encodeWAV(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

mkdirSync(OUT, { recursive: true });
for (const [name, samples] of Object.entries(SPECS)) {
  const wav = encodeWAV(normalize(samples));
  writeFileSync(join(OUT, `${name}.wav`), wav);
}
console.log(`${Object.keys(SPECS).length} sounds written to ${OUT}`);

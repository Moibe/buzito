// Procedural 8-bit chiptune, synthesized live with the Web Audio API — no audio
// files. Two hand-composed loops in A minor: a CALM one for the menus and a
// livelier, drum-driven one for the arena. Autoplay is blocked until the first
// user gesture, so playback starts then; mute is persisted per-player.

// Reactive UI state (the mute button binds to this).
export const musicState = $state({ muted: false, started: false });
if (typeof localStorage !== 'undefined' && localStorage.getItem('buzito.muted') === '1') {
  musicState.muted = true;
}

// --- Note name → frequency (equal temperament, A4 = 440) ---
const SEMI: Record<string, number> = {
  C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2,
};
function noteFreq(n: string): number {
  const m = /^([A-G]#?)(-?\d)$/.exec(n);
  if (!m) return 0;
  const semis = SEMI[m[1]] + (Number(m[2]) - 4) * 12;
  return 440 * Math.pow(2, semis / 12);
}

// A voice is a sequence of [note|null, durationInSteps]; null = rest.
type Ev = [string | null, number];
type VoiceDef = { wave: OscillatorType; gain: number; seq: Ev[] };
type TrackDef = { bpm: number; stepsPerBeat: number; drums: boolean; voices: VoiceDef[] };
type StepNote = { freq: number; dur: number; wave: OscillatorType; gain: number };
type Track = { stepDur: number; loopSteps: number; steps: StepNote[][]; drums: boolean };

function buildTrack(def: TrackDef): Track {
  const stepDur = 60 / def.bpm / def.stepsPerBeat;
  let loopSteps = 0;
  for (const v of def.voices) loopSteps = Math.max(loopSteps, v.seq.reduce((s, [, d]) => s + d, 0));
  const steps: StepNote[][] = Array.from({ length: loopSteps }, () => []);
  for (const v of def.voices) {
    let pos = 0;
    for (const [note, dur] of v.seq) {
      if (note && pos < loopSteps) {
        steps[pos].push({ freq: noteFreq(note), dur: dur * stepDur, wave: v.wave, gain: v.gain });
      }
      pos += dur;
    }
  }
  return { stepDur, loopSteps, steps, drums: def.drums };
}

// --- Compositions (A minor) ---
// Calm: sparse square lead over a gentle triangle bass. Am – F – C – G.
const CALM: TrackDef = {
  bpm: 80,
  stepsPerBeat: 4,
  drums: false,
  voices: [
    {
      wave: 'square',
      gain: 0.15,
      seq: [
        ['E4', 4], ['A4', 4], ['C5', 4], ['B4', 4], // Am
        ['C5', 4], ['A4', 4], ['F4', 8], // F
        ['E4', 4], ['G4', 4], ['C5', 8], // C
        ['D5', 4], ['B4', 4], ['G4', 4], ['D4', 4], // G
      ],
    },
    {
      wave: 'triangle',
      gain: 0.26,
      seq: [
        ['A2', 8], ['E3', 8], // Am
        ['F2', 8], ['C3', 8], // F
        ['C2', 8], ['G2', 8], // C
        ['G2', 8], ['D3', 8], // G
      ],
    },
  ],
};

// Lively: fast 16th arpeggios + eighth-note octave bass + drums. Am – F – G – Am.
const LIVELY: TrackDef = {
  bpm: 132,
  stepsPerBeat: 4,
  drums: true,
  voices: [
    {
      wave: 'square',
      gain: 0.13,
      seq: [
        ['A4', 2], ['C5', 2], ['E5', 2], ['A5', 2], ['E5', 2], ['C5', 2], ['A4', 2], ['E4', 2], // Am
        ['F4', 2], ['A4', 2], ['C5', 2], ['F5', 2], ['C5', 2], ['A4', 2], ['F4', 2], ['C4', 2], // F
        ['G4', 2], ['B4', 2], ['D5', 2], ['G5', 2], ['D5', 2], ['B4', 2], ['G4', 2], ['D4', 2], // G
        ['A4', 2], ['C5', 2], ['E5', 2], ['A5', 2], ['C6', 2], ['A5', 2], ['E5', 2], ['C5', 2], // Am
      ],
    },
    {
      wave: 'triangle',
      gain: 0.28,
      seq: [
        ['A2', 2], ['A3', 2], ['A2', 2], ['A3', 2], ['A2', 2], ['A3', 2], ['A2', 2], ['A3', 2], // Am
        ['F2', 2], ['F3', 2], ['F2', 2], ['F3', 2], ['F2', 2], ['F3', 2], ['F2', 2], ['F3', 2], // F
        ['G2', 2], ['G3', 2], ['G2', 2], ['G3', 2], ['G2', 2], ['G3', 2], ['G2', 2], ['G3', 2], // G
        ['A2', 2], ['A3', 2], ['A2', 2], ['A3', 2], ['A2', 2], ['A3', 2], ['A2', 2], ['A3', 2], // Am
      ],
    },
  ],
};

const calmTrack = buildTrack(CALM);
const livelyTrack = buildTrack(LIVELY);

// --- Web Audio engine ---
const VOLUME = 0.34;
const LOOKAHEAD = 0.12; // seconds scheduled ahead
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let current: Track = calmTrack;
let step = 0;
let nextTime = 0;

function makeNoise(c: AudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate * 0.4);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function playNote(n: StepNote, time: number) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = n.wave;
  osc.frequency.setValueAtTime(n.freq, time);
  const gate = Math.max(0.05, n.dur * 0.85);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(n.gain, time + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, time + gate);
  osc.connect(g).connect(master);
  osc.start(time);
  osc.stop(time + gate + 0.03);
}

function playKick(time: number) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
  g.gain.setValueAtTime(0.55, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
  osc.connect(g).connect(master);
  osc.start(time);
  osc.stop(time + 0.2);
}

function playNoise(time: number, dur: number, hp: number, vol: number) {
  if (!ctx || !master || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(time);
  src.stop(time + dur + 0.02);
}

function tick() {
  if (!ctx || !current) return;
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    const t = current;
    if (step < t.steps.length) for (const n of t.steps[step]) playNote(n, nextTime);
    if (t.drums) {
      const s = step % 16;
      if (s === 0 || s === 8) playKick(nextTime); // kick on beats 1 & 3
      if (s === 4 || s === 12) playNoise(nextTime, 0.12, 1400, 0.26); // snare on 2 & 4
      if (s % 2 === 0) playNoise(nextTime, 0.028, 8000, 0.09); // hats on eighths
    }
    nextTime += t.stepDur;
    step = (step + 1) % t.loopSteps;
  }
}

function ensureCtx() {
  if (ctx || typeof window === 'undefined') return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = musicState.muted ? 0 : VOLUME;
  const comp = ctx.createDynamicsCompressor(); // tame peaks so stacked notes don't clip
  master.connect(comp).connect(ctx.destination);
  noiseBuf = makeNoise(ctx);
}

// Start playback (call on a user gesture). Idempotent.
export function startMusic() {
  if (typeof window === 'undefined') return;
  ensureCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  musicState.started = true;
  if (!timer) {
    step = 0;
    nextTime = ctx.currentTime + 0.05;
    timer = setInterval(tick, 25);
  }
}

// Wire up: start on the first pointer/key gesture (autoplay policy).
export function initMusic() {
  if (typeof window === 'undefined') return;
  const start = () => {
    startMusic();
    window.removeEventListener('pointerdown', start);
    window.removeEventListener('keydown', start);
  };
  window.addEventListener('pointerdown', start);
  window.addEventListener('keydown', start);
}

// Pick the track for the current screen: lively in the arena, calm elsewhere.
export function setMusicForScreen(screen: string) {
  const next = screen === 'play' ? livelyTrack : calmTrack;
  if (next === current) return;
  current = next;
  step = 0; // restart the fresh loop at bar 1
  if (ctx) nextTime = ctx.currentTime + 0.03;
}

export function toggleMute() {
  musicState.muted = !musicState.muted;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('buzito.muted', musicState.muted ? '1' : '0');
  }
  if (ctx && master) {
    master.gain.setTargetAtTime(musicState.muted ? 0 : VOLUME, ctx.currentTime, 0.02);
  }
}

let ctx: AudioContext | null = null;
let drone: OscillatorNode | null = null;
let gain: GainNode | null = null;
let wind: AudioBufferSourceNode | null = null;
let windGain: GainNode | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function unlockAudio(): void {
  const ac = context();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  if (!drone) {
    drone = ac.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 52;
    gain = ac.createGain();
    gain.gain.value = 0;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    drone.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    drone.start();

    const buffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    wind = ac.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    windGain = ac.createGain();
    windGain.gain.value = 0.012;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 500;
    wind.connect(hp);
    hp.connect(windGain);
    windGain.connect(ac.destination);
    wind.start();
  }
}

export function syncKiln(pressure: number, running: boolean, surge: boolean, muted: boolean): void {
  if (!gain || !drone || !ctx) return;
  const target = muted || !running ? 0 : 0.02 + pressure * 0.008 + (surge ? 0.01 : 0);
  const freq = 46 + pressure * 7 + (surge ? 18 : 0);
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.linearRampToValueAtTime(target, now + 0.3);
  drone.frequency.linearRampToValueAtTime(freq, now + 0.4);
  if (windGain) {
    windGain.gain.linearRampToValueAtTime(muted ? 0 : 0.015, now + 0.3);
  }
}

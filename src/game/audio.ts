let ctx: AudioContext | null = null;
let drone: OscillatorNode | null = null;
let gain: GainNode | null = null;
let wind: AudioBufferSourceNode | null = null;
let windGain: GainNode | null = null;
let windBand: BiquadFilterNode | null = null;
let howl: AudioBufferSourceNode | null = null;
let howlGain: GainNode | null = null;
let howlBand: BiquadFilterNode | null = null;

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
    windGain.gain.value = 0;
    // The steady hiss of wind: band-passed noise whose centre moves with the gusts.
    windBand = ac.createBiquadFilter();
    windBand.type = "bandpass";
    windBand.frequency.value = 520;
    windBand.Q.value = 0.7;
    wind.connect(windBand);
    windBand.connect(windGain);
    windGain.connect(ac.destination);
    wind.start();

    // The howl: the same noise through a narrow band that sweeps up with each gust.
    howl = ac.createBufferSource();
    howl.buffer = buffer;
    howl.loop = true;
    howl.playbackRate.value = 0.83;
    howlBand = ac.createBiquadFilter();
    howlBand.type = "bandpass";
    howlBand.frequency.value = 340;
    howlBand.Q.value = 9;
    howlGain = ac.createGain();
    howlGain.gain.value = 0;
    howl.connect(howlBand);
    howlBand.connect(howlGain);
    howlGain.connect(ac.destination);
    howl.start();
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
}

/**
 * Wind sound for the weather: a soft hiss on a calm day, a roar and a rising howl through
 * the Hush. `storm` and `gust` are 0..1, as in the scene's weather.
 */
export function syncWeather(storm: number, gust: number, muted: boolean): void {
  if (!ctx || !windGain || !windBand || !howlGain || !howlBand) return;
  const now = ctx.currentTime;
  const ramp = (p: AudioParam, v: number) => {
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(v, now + 0.25);
  };
  ramp(windGain.gain, muted ? 0 : 0.012 + storm * 0.05 + gust * 0.05);
  ramp(windBand.frequency, 420 + storm * 180 + gust * 650);
  ramp(howlGain.gain, muted ? 0 : storm * storm * 0.05 + gust * 0.09);
  ramp(howlBand.frequency, 300 + gust * 520 + storm * 60);
}

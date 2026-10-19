/* Grok Botパズル — tiny original WebAudio synth effects */
(function () {
  'use strict';
  let ac = null;
  const S = { on: true };
  function ctx() {
    if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, dur, type = 'sine', vol = 0.12, slideTo = 0, delay = 0) {
    if (!S.on) return; const a = ctx(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.15) {
    if (!S.on) return; const a = ctx(); if (!a) return;
    const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 600; src.buffer = buf; g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination); src.start();
  }
  S.unlock = ctx;
  S.move = () => tone(520, 0.03, 'square', 0.025);
  S.rotate = () => tone(820, 0.05, 'triangle', 0.06, 1100);
  S.drop = () => tone(220, 0.1, 'sine', 0.16, 110);
  S.clear = (chain) => {
    const f = 440 * Math.pow(2, (Math.min(chain, 12) - 1) * 2 / 12);
    tone(f, 0.12, 'triangle', 0.12); tone(f * 1.5, 0.16, 'triangle', 0.1, 0, 0.07); tone(f * 2, 0.2, 'sine', 0.06, 0, 0.13);
  };
  S.garbage = () => { noise(0.25, 0.25); tone(90, 0.2, 'sine', 0.2, 50); };
  S.win = () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, 0, i * 0.11));
  S.lose = () => [440, 349, 294, 220].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.05, 0, i * 0.16));
  window.GBSound = S;
})();

/**
 * Basketball Hoops — sound effects (Web Audio API, synthesised)
 *
 * No asset files — all sounds are generated on the fly with the
 * Web Audio API. Avoids dependency on bundled audio files for v0.
 * Each sound is a short oscillator or noise burst with a quick
 * envelope. Cheap to play, low memory.
 *
 * Browsers require an AudioContext to be created or resumed in
 * response to user interaction — use ensureAudioContext() once a
 * user gesture has happened (first shot fired is fine).
 *
 * Every play* function is wrapped via `safeAudio` so an internal
 * Web Audio failure can NEVER throw into the caller. Audio glitches
 * (mobile context suspension, resource limits, browser quirks) are
 * common and never essential to gameplay — swallowing them is the
 * right trade. Without this, an audio throw inside _fireBallEvents
 * would terminate the per-ball render loop and freeze the rack
 * (the "next ball won't flick" stuck-bug Fish kept hitting).
 */

let _ctx = null;

/**
 * Lazily create the AudioContext on first call. Must be invoked from
 * a user gesture handler (click / touch / keypress) or browsers will
 * keep the context suspended.
 */
export function ensureAudioContext() {
    if (_ctx) {
        if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
        return _ctx;
    }
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        _ctx = new Ctx();
        return _ctx;
    } catch {
        return null;
    }
}

function makeEnvelope(ctx, peak, attack, decay) {
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, now + attack + decay);
    return gain;
}

/**
 * Wrap a Web Audio function so any internal failure becomes a silent
 * no-op. Audio is never essential to gameplay; a throw here used to
 * kill the per-ball render loop downstream (rack-empty stuck bug).
 */
function safeAudio(fn) {
    return function (...args) {
        try { return fn.apply(this, args); } catch { /* silent — audio is non-critical */ }
    };
}

/**
 * Short white-noise burst, high-pass filtered → the "sshhh" of a
 * basketball passing through a net.
 */
export const playSwish = safeAudio(function playSwish() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const duration = 0.4;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 0.7);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1500;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 8000;
    const gain = makeEnvelope(ctx, 0.35, 0.01, duration);
    source.connect(hp);
    hp.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    source.stop(ctx.currentTime + duration + 0.05);
});

/**
 * Metallic "ping" — short triangle-wave tone with very fast decay.
 * Used for ball-on-rim contacts.
 */
export const playRimClang = safeAudio(function playRimClang() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.15);
    const gain = makeEnvelope(ctx, 0.18, 0.002, 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
});

/**
 * Thumpy backboard bank — low-frequency sine with quick fade.
 */
export const playBank = safeAudio(function playBank() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.18);
    const gain = makeEnvelope(ctx, 0.4, 0.003, 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
});

/**
 * Air-whoosh on shot release — short noise sweep.
 */
export const playWhoosh = safeAudio(function playWhoosh() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const duration = 0.22;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(600, ctx.currentTime);
    bp.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + duration);
    bp.Q.value = 2;
    const gain = makeEnvelope(ctx, 0.18, 0.005, duration);
    source.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    source.stop(ctx.currentTime + duration + 0.02);
});

/**
 * Dull thud — ball hits the floor / bounces away.
 */
export const playBounce = safeAudio(function playBounce() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.12);
    const gain = makeEnvelope(ctx, 0.25, 0.002, 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
});

/**
 * Short high beep — fired once per second during the final 5 s of the
 * game clock. Sharp electronic chirp at 880 Hz.
 */
export const playFinalBeep = safeAudio(function playFinalBeep() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 880;
    const gain = makeEnvelope(ctx, 0.18, 0.003, 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
});

/**
 * Long final-buzzer / shot-clock horn — the "BZZZT" when the game
 * clock hits 0. Low square wave with a slight pitch drop, ~0.7 s.
 */
export const playBuzzer = safeAudio(function playBuzzer() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const duration = 0.7;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + duration);
    const tremolo = ctx.createOscillator();
    tremolo.type = 'sine';
    tremolo.frequency.value = 10;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.08;
    tremolo.connect(tremGain);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 0.02);
    gain.gain.setValueAtTime(0.32, ctx.currentTime + duration - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    tremGain.connect(gain.gain);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    tremolo.start();
    osc.stop(ctx.currentTime + duration + 0.05);
    tremolo.stop(ctx.currentTime + duration + 0.05);
});

/**
 * Crowd-cheer approximation — a layered noise burst plus a quick
 * rising chord. No audio asset, so it won't sound like a real crowd;
 * reads as "a happy whoosh + ascending chime" celebrating a streak.
 * Drop in a real cheering WAV in /assets later for a richer cue.
 */
export const playCheer = safeAudio(function playCheer() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const duration = 0.6;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        const env = Math.sin(Math.PI * (i / bufferSize));
        data[i] = last * env * 6;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.18;
    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + duration + 0.05);

    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 — major triad
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const start = ctx.currentTime + i * 0.06;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.16, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.5);
    });
});

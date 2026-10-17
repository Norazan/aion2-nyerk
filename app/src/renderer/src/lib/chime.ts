/**
 * The timers' alert sounds, made with Web Audio so there is no sound file to ship. Each timer picks
 * one (shared/timers.ts ALARM_SOUNDS); every note rises in a few ms and fades out.
 */
import { DEFAULT_SOUND, type AlarmSound } from '@shared/timers.ts'

let ctx: AudioContext | null = null

/** One note: `freq` Hz from `at` s (after the sound's start) for `len` s, at `peak` gain. */
interface Note {
  freq: number
  at: number
  len: number
  peak: number
  type?: OscillatorType
  /** Hold full volume this long before fading (beeps); 0 = fade right away. */
  hold?: number
}

const sine = (freq: number, at: number, len = 0.9, peak = 0.2): Note => ({ freq, at, len, peak })

const SOUNDS: Record<AlarmSound, Note[]> = {
  // A soft two-note chime, E5 then A5.
  chime: [sine(659.25, 0), sine(880, 0.18)],
  // A struck bell: A4 with its inharmonic partials, ringing out over two seconds.
  bell: [
    sine(440, 0, 2.2, 0.2),
    sine(440 * 2.76, 0, 1.2, 0.06),
    sine(440 * 5.4, 0, 0.6, 0.03),
    sine(440 * 0.5, 0, 2.2, 0.06),
  ],
  // An alarm clock: three short beeps at A5.
  beeps: [0, 0.22, 0.44].map((at) => ({ freq: 880, at, len: 0.16, peak: 0.12, type: 'square', hold: 0.1 })),
  // A rising C major arpeggio, ending on a held C6.
  fanfare: [523.25, 659.25, 783.99, 1046.5].map((freq, i) => ({
    freq,
    at: i * 0.12,
    len: i === 3 ? 0.9 : 0.25,
    peak: 0.18,
    type: 'triangle',
  })),
  // Four quick wooden notes, falling.
  marimba: [1046.5, 783.99, 659.25, 523.25].map((freq, i) => ({ freq, at: i * 0.11, len: 0.35, peak: 0.3, type: 'triangle' })),
}

export function playChime(volume = 0.5, sound: AlarmSound = DEFAULT_SOUND): void {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  const t0 = ctx.currentTime + 0.02
  const v = Math.min(1, Math.max(0, volume))
  for (const n of SOUNDS[sound] ?? SOUNDS[DEFAULT_SOUND]) {
    const osc = ctx.createOscillator()
    osc.type = n.type ?? 'sine'
    osc.frequency.value = n.freq
    const gain = ctx.createGain()
    const start = t0 + n.at
    const attack = n.type === 'square' ? 0.005 : 0.02
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(n.peak * v, start + attack)
    if (n.hold) gain.gain.setValueAtTime(n.peak * v, start + n.hold)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + n.len)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + n.len + 0.1)
  }
}

/**
 * Adaptive pacing: a weighted up/down staircase (Kaernbach 1991) on WPM that
 * converges on the fastest speed at which comprehension stays ≥ ~75 %.
 * Rayner et al. (2016) show speed and comprehension trade off; the score that
 * matters is effective reading rate = WPM × comprehension.
 */
export const TARGET = 0.75;

export function nextWpm(wpm: number, accuracy: number): number {
  let f = 1;
  if (accuracy >= 0.99) f = 1.1;
  else if (accuracy >= TARGET) f = 1.05;
  else if (accuracy >= 0.5) f = 0.95;
  else f = 0.88;
  return clampWpm(Math.round((wpm * f) / 5) * 5);
}

export function clampWpm(w: number) {
  return Math.min(1200, Math.max(100, w));
}

export function effectiveRate(wpm: number, accuracy: number) {
  return Math.round(wpm * accuracy);
}

/**
 * Starting point after a baseline read: slightly above natural speed when
 * understanding was good, scaled down when it wasn't. Capped at 700 wpm —
 * beyond that, comprehension of normal text collapses (Rayner et al. 2016).
 */
export function startFromBaseline(baselineWpm: number, accuracy: number) {
  const f = accuracy >= TARGET ? 1.15 : Math.max(0.6, accuracy / TARGET);
  return clampWpm(Math.min(700, Math.round((baselineWpm * f) / 5) * 5));
}

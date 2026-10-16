// Mood labels the app sends, on a 1 (worst) – 5 (best) scale. "DOWN" is a legacy alias for "LOW".
export const MOOD_VALUES = ["AWFUL", "LOW", "DOWN", "OKAY", "GOOD", "GREAT"] as const;

export const MOOD_SCORE: Record<string, number> = {
  AWFUL: 1, LOW: 2, DOWN: 2, OKAY: 3, GOOD: 4, GREAT: 5,
};

export const LOW_MOOD_VALUES = new Set(["AWFUL", "LOW", "DOWN"]);

export const NEUTRAL_MOOD_SCORE = 3;

export const moodScore = (mood: string): number => MOOD_SCORE[mood] ?? NEUTRAL_MOOD_SCORE;

// 0 (great mood) – 1 (awful mood), comparable with the ML stress probability.
export const moodRisk = (avgScore: number): number =>
  Math.min(1, Math.max(0, (5 - avgScore) / 4));

export const probabilityToRisk = (prob: number): "CRITICAL" | "HIGH" | "MODERATE" | "LOW" => {
  if (prob >= 0.8) return "CRITICAL";
  if (prob >= 0.6) return "HIGH";
  if (prob >= 0.4) return "MODERATE";
  return "LOW";
};

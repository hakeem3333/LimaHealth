import type { Request, Response } from "express";
import prisma from "../services/prisma.service.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// ML service call
// ---------------------------------------------------------------------------

interface MLPrediction {
  prediction: number;
  stress_probability: number;
  risk_level: string;
}

async function callMLService(payload: {
  heart_rate: number;
  gsr: number;
  skin_temp: number;
  movement: number;
  gsr_std?: number;
  skin_temp_std?: number;
  heart_rate_std?: number;
  movement_std?: number;
}): Promise<MLPrediction | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return res.json() as Promise<MLPrediction>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Heuristic fallback
// ---------------------------------------------------------------------------

function heuristicAnalysis(heartRate: number, stressLevel: number, gsr: number) {
  if (heartRate >= 120 || stressLevel >= 80 || gsr >= 8)
    return { riskScore: 85, riskLevel: "CRITICAL", insights: "Critical stress indicators detected. Immediate counselor check-in recommended." };
  if (heartRate >= 100 || stressLevel >= 65 || gsr >= 6)
    return { riskScore: 65, riskLevel: "HIGH", insights: "Elevated stress detected. Consider a short break or breathing exercise." };
  if (stressLevel >= 40 || gsr >= 4)
    return { riskScore: 40, riskLevel: "MODERATE", insights: "Mild stress noted. Monitoring is advised." };
  return { riskScore: 10, riskLevel: "LOW", insights: "Vitals are within normal range." };
}

function riskToInsight(riskLevel: string, stressProb: number): string {
  const pct = Math.round(stressProb * 100);
  if (riskLevel === "CRITICAL") return `Stress probability is ${pct}% — immediate counselor check-in recommended.`;
  if (riskLevel === "HIGH")     return `Stress probability is ${pct}% — consider a short break or breathing exercise.`;
  if (riskLevel === "MODERATE") return `Stress probability is ${pct}% — mild stress noted. Continue monitoring.`;
  return `Stress probability is ${pct}% — vitals are within normal range.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mean = (arr: number[]) =>
  arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const std = (arr: number[]) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
};

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export const analyzeHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, context, inputData } = req.body;

    if (!userId || !context || !inputData) {
      res.status(400).json({ success: false, error: "Missing required fields" });
      return;
    }

    let insights = "No insights available.";
    let riskScore = 0;
    let riskLevel = "LOW";
    let mlUsed = false;

    // ------------------------------------------------------------------
    // BIOMETRIC SUMMARY
    // ------------------------------------------------------------------
    if (context === "biometric_summary") {
      const logs = await prisma.biometricLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          heartRate: true,
          gsr: true,
          skinTemp: true,
          movement: true,
          stressLevelScore: true,
        },
      });

      const heartRates = logs.map((l) => l.heartRate);
      const gsrValues  = logs.map((l) => l.gsr);
      const temps      = logs.map((l) => l.skinTemp);
      const movements  = logs.map((l) => l.movement);

      const payload = {
        heart_rate:     mean(heartRates)  || (inputData.heartRate  as number) || 0,
        gsr:            mean(gsrValues)   || (inputData.gsr        as number) || 0,
        skin_temp:      mean(temps)       || (inputData.skinTemp   as number) || 0,
        movement:       mean(movements)   || (inputData.movement   as number) || 0,
        heart_rate_std: std(heartRates),
        gsr_std:        std(gsrValues),
        skin_temp_std:  std(temps),
        movement_std:   std(movements),
      };

      const prediction = await callMLService(payload);

      if (prediction) {
        mlUsed    = true;
        riskLevel = prediction.risk_level;
        riskScore = Math.round(prediction.stress_probability * 100);
        insights  = riskToInsight(riskLevel, prediction.stress_probability);
      } else {
        const fallback = heuristicAnalysis(
          payload.heart_rate,
          (inputData.stressLevel as number) || 0,
          payload.gsr,
        );
        riskScore = fallback.riskScore;
        riskLevel = fallback.riskLevel;
        insights  = fallback.insights;
      }
    }

    // ------------------------------------------------------------------
    // MOOD LOG
    // ------------------------------------------------------------------
    else if (context === "mood_log") {
      const mood = ((inputData.mood as string) || "").toUpperCase();
      if (["AWFUL", "DOWN"].includes(mood)) {
        riskScore = 65; riskLevel = "HIGH";
        insights  = "Negative mood detected. Consider scheduling a counsellor appointment.";
      } else if (mood === "LOW") {
        riskScore = 40; riskLevel = "MODERATE";
        insights  = "Low mood noted. Reach out if you would like to talk.";
      } else {
        riskScore = 10; riskLevel = "LOW";
        insights  = "Mood appears stable.";
      }
    }

    const outputJson = { insights, riskScore, riskLevel, mlUsed, timestamp: new Date().toISOString() };

    const analysis = await prisma.aIAnalysis.create({
      data: { userId, context, inputJson: inputData, outputJson },
    });

    res.status(200).json({ success: true, data: analysis });
  } catch (error) {
    console.error("AI Analysis Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

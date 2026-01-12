import type { Request, Response } from "express";
import prisma from "../services/prisma.service.js";

/**
 * Analyze health data using "AI"
 * In a real scenario, this would call an LLM or ML service.
 * Here we mock the analysis based on standard heuristics.
 */
export const analyzeHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, context, inputData } = req.body;

    if (!userId || !context || !inputData) {
      res.status(400).json({ success: false, error: "Missing required fields" });
      return;
    }

    // Mock AI Analysis Logic
    let insights = "No insights available.";
    let riskScore = 0;

    if (context === "biometric_summary") {
      const { heartRate, stressLevel } = inputData;
      if (heartRate > 100 && stressLevel > 7) {
        insights = "High stress and heart rate detected. Recommendation: Breathing exercises.";
        riskScore = 80;
      } else {
        insights = "Vitals are within normal range.";
        riskScore = 10;
      }
    } else if (context === "mood_log") {
      const { moodEmoji } = inputData;
      if (["😢", "😠", "😫"].includes(moodEmoji)) {
        insights = "Negative mood detected. Consider scheduling a counselor appointment.";
        riskScore = 60;
      } else {
        insights = "Mood appears stable.";
        riskScore = 20;
      }
    }

    const outputJson = {
      insights,
      riskScore,
      timestamp: new Date().toISOString(),
    };

    // Store Analysis in DB
    const analysis = await prisma.aIAnalysis.create({
      data: {
        userId,
        context,
        inputJson: inputData,
        outputJson,
      },
    });

    res.status(200).json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error("AI Analysis Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

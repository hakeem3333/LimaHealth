import type { Request, Response } from "express";
import prisma from "../services/prisma.service.js";
import { scoreAndStore } from "../services/healthScore.service.js";
import { evaluateHealthScoreAlert } from "../services/alertEngine.service.js";

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

    // ------------------------------------------------------------------
    // BIOMETRIC SUMMARY — shared health score (same one the alert engine uses)
    // ------------------------------------------------------------------
    if (context === "biometric_summary") {
      const { score, analysis } = await scoreAndStore(userId, inputData, {
        heartRate:   inputData.heartRate   as number,
        stressLevel: inputData.stressLevel as number,
        gsr:         inputData.gsr         as number,
        skinTemp:    inputData.skinTemp    as number,
        movement:    inputData.movement    as number,
      });

      const student = await prisma.user.findUnique({
        where: { id: userId },
        select: { orgId: true, firstName: true, lastName: true },
      });
      if (student?.orgId) {
        evaluateHealthScoreAlert({
          studentId: userId,
          orgId: student.orgId,
          studentName: `${student.firstName} ${student.lastName}`,
          score,
        }).catch((err) => console.error("[AlertEngine] Health score evaluation error:", err.message));
      }

      res.status(200).json({ success: true, data: analysis });
      return;
    }

    // ------------------------------------------------------------------
    // MOOD LOG
    // ------------------------------------------------------------------
    let insights = "No insights available.";
    let riskScore = 0;
    let riskLevel = "LOW";

    if (context === "mood_log") {
      const mood = ((inputData.mood as string) || "").toUpperCase();
      if (mood === "AWFUL") {
        riskScore = 65; riskLevel = "HIGH";
        insights  = "Negative mood detected. Consider scheduling a counsellor appointment.";
      } else if (mood === "LOW" || mood === "DOWN") {
        riskScore = 40; riskLevel = "MODERATE";
        insights  = "Low mood noted. Reach out if you would like to talk.";
      } else {
        riskScore = 10; riskLevel = "LOW";
        insights  = "Mood appears stable.";
      }
    }

    const outputJson = {
      insights, riskScore, riskLevel, mlUsed: false,
      moodAvg: null, moodCount: 0,
      timestamp: new Date().toISOString(),
    };

    const analysis = await prisma.aIAnalysis.create({
      data: { userId, context, inputJson: inputData, outputJson },
    });

    res.status(200).json({ success: true, data: analysis });
  } catch (error) {
    console.error("AI Analysis Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

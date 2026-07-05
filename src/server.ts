import express from "express";
import type { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import routes from "./routes/index.js";
import prisma from "./services/prisma.service.js";
import { stripeWebhook } from "./controllers/billing.controller.js";

dotenv.config();

const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3001", "http://localhost:8081"];

// Crash safety nets
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

async function startServer() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected");

const app: Application = express();

    // Stripe webhook must receive raw body — register before express.json()
    app.post(
      "/api/v1/billing/webhook",
      express.raw({ type: "application/json" }),
      stripeWebhook,
    );

    app.use(
      cors({
        origin: ALLOWED_ORIGINS,
        credentials: true,
      }),
    );

    app.use(express.json());
    app.use(cookieParser());

    // Health check
    app.get("/health", (_req: Request, res: Response) => {
      res.status(200).json({ status: "ok" });
    });

    // API routes
    app.use("/api/v1", routes);

    // Global error handler (must be last)
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error("[Unhandled Error]", err);
      const status = err.status || err.statusCode || 500;
      const message =
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message || "Internal server error";
      res.status(status).json({ message });
    });

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();

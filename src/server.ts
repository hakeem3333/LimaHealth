import express from "express";
import type { Application, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import session from "express-session";
import cookieParser from "cookie-parser";
import routes from "./routes";
import prisma from "./services/prisma.service.js"; // Make sure to use .js for Node ESM

dotenv.config();

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "your_secret_key";

// Global error handlers for async crashes
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

async function startServer() {
  try {
    // Connect to Prisma DB
    await prisma.$connect();
    console.log("✅ Database connected");

    const app: Application = express();

    // Middleware
    app.use(
      session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: { secure: process.env.NODE_ENV === "production" },
      })
    );

    app.use(
      cors({
        origin: "http://localhost:3001",
        credentials: true,
      })
    );
    app.use(express.json());
    app.use(cookieParser());

    // API routes
    app.use("/api/v1", routes);

    // Root route
    app.get("/", (req: Request, res: Response) => {
      res.send("Welcome to the BioAware API! Server is up and running.");
    });

    // Start listening
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1); // Exit explicitly if something goes wrong
  }
}

// Start the server
startServer();

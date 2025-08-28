import express from "express";
import type { Application, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes"; // Import the main routes file
import session from "express-session"; // Import session to manage user authentication

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "your_secret_key";

// Middleware
// Use express-session to manage user sessions
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === "production" },
  })
);

// Enable CORS for all routes and origins
app.use(cors());

// Parse incoming JSON requests
app.use(express.json());

// API versioning - use the routes we've defined
app.use("/api/v1", routes);

// Simple root route to check if the server is running
app.get("/", (req: Request, res: Response) => {
  res.send("Welcome to the BioAware API! Server is up and running.");
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

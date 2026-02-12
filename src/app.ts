import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.set("trust proxy", 1);

const allowedOrigins = (env.CLIENT_ORIGINS ?? env.CLIENT_ORIGIN)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const resolveCorsOrigin = (requestOrigin: string | undefined) => {
  if (!requestOrigin) return false;
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      const resolved = resolveCorsOrigin(origin);
      callback(null, resolved);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    preflightContinue: false,
    optionsSuccessStatus: 204
  })
);

// Explicit OPTIONS handler for preflight requests
app.options("*", (req, res) => {
  const resolved = resolveCorsOrigin(req.headers.origin);
  if (resolved) {
    res.header("Access-Control-Allow-Origin", resolved);
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Vary", "Origin");
  }
  res.status(204).send();
});
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploads with proper CORS headers
app.use("/uploads", (req, res, next) => {
  const resolved = resolveCorsOrigin(req.headers.origin);
  if (resolved) {
    res.header("Access-Control-Allow-Origin", resolved);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Methods", "GET");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(uploadsDir, {
  maxAge: '1d', // Cache for 1 day
  etag: true,
  lastModified: true
}));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Test endpoint to verify image serving
app.get("/api/test-images", (_req, res) => {
  const fs = require('fs');
  const path = require('path');
  const uploadsDir = path.join(process.cwd(), "uploads");
  
  try {
    const files = fs.readdirSync(uploadsDir).slice(0, 5) as string[]; // Get first 5 files
    const imageUrls = files.map((file: string) => `${env.API_BASE_URL}/uploads/${file}`);
    res.json({ 
      message: "Test images",
      imageUrls,
      uploadsDir: "/uploads"
    });
  } catch (error) {
    res.json({ error: "Could not read uploads directory" });
  }
});

// Alternative image serving endpoint with full control
app.get("/api/images/:filename", (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const uploadsDir = path.join(process.cwd(), "uploads");
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);
  
  // Security check: ensure the filename doesn't contain path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Image not found" });
  }
  
  // Set proper headers
  const resolved = resolveCorsOrigin(req.headers.origin);
  if (resolved) {
    res.setHeader('Access-Control-Allow-Origin', resolved);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day cache
  
  // Send the file
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error sending file:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error serving image" });
      }
    }
  });
});

app.use("/api", apiRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  
  // Handle multer errors
  if (err instanceof Error && err.message.includes("Only image files are allowed")) {
    return res.status(400).json({ message: err.message });
  }
  
  if (err instanceof Error && err.message.includes("File too large")) {
    return res.status(400).json({ message: "File size too large. Maximum size is 5MB." });
  }
  
  res.status(500).json({ message: "Internal server error" });
});

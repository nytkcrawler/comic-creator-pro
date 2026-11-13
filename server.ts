/**
 * Vercel's Express server entrypoint.
 *
 * Importing the Express application keeps the same API routes and Vite static
 * assets for local and hosted use. The app listens on its own port only locally.
 */
import express from "express";
import app from "./server/index.js";

const handler = express();
handler.use(app);

export default handler;

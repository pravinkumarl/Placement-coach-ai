// Vercel Serverless entry point.
// Exports the Express app from backend/src/app.js so every /api/* route
// (auth, dashboard, assessments, roadmap, interviews, chat, gemini proxy)
// runs server side with MongoDB + JWT + the Gemini key kept off the browser.
//
// Routing: vercel.json rewrites "/api/(.*)" → "/api/index".
// Static HTML/CSS/JS is still served directly by Vercel's static layer.
import app from '../backend/src/app.js';

export default app;

// Timbul's API as one Vercel function: /api/<route> runs the same handlers as Cloud Run (server/api.mjs).
import { serve } from "../server/api.mjs";

export default async function handler(req, res) {
  await serve(req, res, String(req.query.route || ""));
}

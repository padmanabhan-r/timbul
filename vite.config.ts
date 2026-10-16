import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error plain ESM module shared with the Cloud Run server
import { serve } from "./server/api.mjs";

// Local API for development: the same handlers that run on Cloud Run, so the Gemini key never reaches the browser.
function timbulApi(): Plugin {
  return {
    name: "timbul-api",
    configureServer(server) {
      server.middlewares.use("/api", (req, res) => {
        const route = (req.url || "").replace(/^\//, "").split(/[?/]/)[0];
        serve(req, res, route);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), timbulApi()],
  server: { port: 5173, strictPort: false },
});

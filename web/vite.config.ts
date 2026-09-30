import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Serve the Vercel function at /api/upload during `npm run dev` too. */
function localApi(): Plugin {
  return {
    name: "local-api",
    configureServer(server) {
      server.middlewares.use("/api/upload", async (req, res) => {
        const { default: handler } = await import("./api/upload.js");
        const r = res as typeof res & { status: (c: number) => typeof r; json: (j: unknown) => void };
        r.status = (c) => ((res.statusCode = c), r);
        r.json = (j) => {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(j));
        };
        await handler(req, r);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // expose PINATA_JWT from .env.local to the local API (server side only, never bundled)
  const env = loadEnv(mode, process.cwd(), "");
  if (env.PINATA_JWT && !process.env.PINATA_JWT) process.env.PINATA_JWT = env.PINATA_JWT;
  return { plugins: [react(), localApi()] };
});

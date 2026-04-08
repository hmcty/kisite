import { defineConfig } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// When used via CLI, KISITE_PROJECT_ROOT points to user's project
// Build output goes to user's project/dist by default
const projectRoot = process.env.KISITE_PROJECT_ROOT || __dirname;
const defaultOutDir = path.join(projectRoot, "dist");

export default defineConfig({
  base: "",
  build: {
    outDir: defaultOutDir,
    assetsDir: "assets",
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: true,
    middlewareMode: false,
  },
  publicDir: "public",
  appType: "spa",
  plugins: [
    {
      name: "serve-public-files",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Serve files from public directory for specific extensions
          if (
            req.url?.match(
              /\.(kicad_pro|kicad_sch|kicad_pcb|zip|png|jpg|jpeg|gif|svg|webp|md)$/i,
            )
          ) {
            // Security: Normalize path and prevent directory traversal
            const requestedPath = req.url.split("?")[0]; // Remove query params
            const filePath = path.normalize(
              path.join(__dirname, "public", requestedPath),
            );
            // Ensure the resolved path is within public directory
            const publicDir = path.join(__dirname, "public");
            if (!filePath.startsWith(publicDir)) {
              res.statusCode = 403;
              res.end("Forbidden");
              return;
            }

            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              const content = fs.readFileSync(filePath);

              // Set appropriate Content-Type header
              let contentType = "application/octet-stream";
              if (req.url.endsWith(".zip")) contentType = "application/zip";
              else if (req.url.match(/\.(kicad_pro|kicad_sch|kicad_pcb)$/))
                contentType = "application/json";
              else if (req.url.endsWith(".png")) contentType = "image/png";
              else if (req.url.match(/\.(jpg|jpeg)$/))
                contentType = "image/jpeg";
              else if (req.url.endsWith(".gif")) contentType = "image/gif";
              else if (req.url.endsWith(".svg")) contentType = "image/svg+xml";
              else if (req.url.endsWith(".webp")) contentType = "image/webp";
              else if (req.url.endsWith(".md")) contentType = "text/markdown";

              res.setHeader("Content-Type", contentType);
              res.end(content);
              return;
            }
          }
          next();
        });
      },
    },
  ],
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { ProjectIndex } from "../src/lib/project-index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");
const kisiteRoot = path.resolve(__dirname, "..");
const cliBin = path.join(kisiteRoot, "bin", "kisite.js");

function runCli(
  args: string[],
  cwd: string = fixturesDir,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn("node", [cliBin, ...args], {
      cwd,
      env: { ...process.env, KISITE_NO_OPEN: "1" },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
}

describe("CLI", () => {
  describe("--help", () => {
    it("should display help message", async () => {
      const result = await runCli(["--help"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("kisite");
      expect(result.stdout).toContain("build");
      expect(result.stdout).toContain("preview");
    });
  });

  describe("unknown command", () => {
    it("should exit with error for unknown command", async () => {
      const result = await runCli(["unknown-command"]);

      expect(result.code).toBe(1);
      // Error message could be in stdout or stderr
      const output = result.stdout + result.stderr;
      expect(output).toContain("Unknown command");
    });
  });

  describe("build command", () => {
    const buildOutputDir = path.join(fixturesDir, "dist");
    const kisiteWorkDir = path.join(fixturesDir, ".kisite");

    afterAll(() => {
      // Clean up build output and work directory
      if (fs.existsSync(buildOutputDir)) {
        fs.rmSync(buildOutputDir, { recursive: true });
      }
      if (fs.existsSync(kisiteWorkDir)) {
        fs.rmSync(kisiteWorkDir, { recursive: true });
      }
    });

    it("should build static site successfully", async () => {
      const result = await runCli(["build"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Build complete");
    }, 60000); // Allow up to 60s for build

    it("should create dist directory with expected files", async () => {
      // Build should have already run from previous test
      expect(fs.existsSync(buildOutputDir)).toBe(true);
      expect(fs.existsSync(path.join(buildOutputDir, "index.html"))).toBe(true);
      expect(fs.existsSync(path.join(buildOutputDir, "assets"))).toBe(true);
    });

    it("should include project-index.json in build output", async () => {
      const indexPath = path.join(buildOutputDir, "project-index.json");
      expect(fs.existsSync(indexPath)).toBe(true);

      const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      expect(index.version).toBeDefined();
      expect(index.projects).toBeInstanceOf(Array);
      expect(index.title).toBe("Test Workspace");
    });

    it("should include project files in build output", async () => {
      const projectDir = path.join(buildOutputDir, "test-project");
      expect(fs.existsSync(projectDir)).toBe(true);

      // Should have copied KiCad files
      expect(fs.existsSync(path.join(projectDir, "TestBoard.kicad_pro"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(projectDir, "TestBoard.kicad_sch"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(projectDir, "TestBoard.kicad_pcb"))).toBe(
        true,
      );
    });

    it("should include KiCanvas library in build output", async () => {
      const kicanvasPath = path.join(buildOutputDir, "kicanvas", "kicanvas.js");
      expect(fs.existsSync(kicanvasPath)).toBe(true);
    });

    it("should create downloadable zip files", async () => {
      const downloadsDir = path.join(buildOutputDir, "downloads");
      expect(fs.existsSync(downloadsDir)).toBe(true);

      const zipFiles = fs
        .readdirSync(downloadsDir)
        .filter((f) => f.endsWith(".zip"));
      expect(zipFiles.length).toBeGreaterThan(0);
    });

    // Static site structure validation tests
    it("should have valid project-index.json structure", () => {
      const indexPath = path.join(buildOutputDir, "project-index.json");
      const projectIndex: ProjectIndex = JSON.parse(
        fs.readFileSync(indexPath, "utf-8"),
      );

      // Top-level fields
      expect(projectIndex.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(new Date(projectIndex.generatedAt).toString()).not.toBe(
        "Invalid Date",
      );
      expect(projectIndex.git.repoName).toBeDefined();
      expect(projectIndex.git.commitHash).toBeDefined();
      expect(Array.isArray(projectIndex.projects)).toBe(true);

      // Project metadata
      const project = projectIndex.projects[0];
      expect(project.id).toBeDefined();
      expect(project.name).toBe("TestBoard");
      expect(project.schematics.length).toBeGreaterThan(0);
      expect(project.schematics[0].path).toMatch(/\.kicad_sch$/);
      expect(project.pcb).toMatch(/\.kicad_pcb$/);
      expect(project.zip).toMatch(/\.zip$/);
    });

    it("should have valid paths in project-index.json", () => {
      const indexPath = path.join(buildOutputDir, "project-index.json");
      const projectIndex: ProjectIndex = JSON.parse(
        fs.readFileSync(indexPath, "utf-8"),
      );

      for (const project of projectIndex.projects) {
        // Project file exists
        expect(
          fs.existsSync(path.join(buildOutputDir, project.projectFile)),
        ).toBe(true);

        // Schematics exist
        for (const sch of project.schematics) {
          expect(fs.existsSync(path.join(buildOutputDir, sch.path))).toBe(true);
        }

        // PCB exists
        if (project.pcb) {
          expect(fs.existsSync(path.join(buildOutputDir, project.pcb))).toBe(
            true,
          );
        }

        // Zip exists
        if (project.zip) {
          expect(fs.existsSync(path.join(buildOutputDir, project.zip))).toBe(
            true,
          );
        }
      }
    });

    it("should have valid HTML with asset references", () => {
      const htmlPath = path.join(buildOutputDir, "index.html");
      const html = fs.readFileSync(htmlPath, "utf-8");

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<workspace-app>");
      expect(html).toMatch(/<script[^>]+src="[^"]*assets[^"]*\.js"/);
      expect(html).toMatch(/<link[^>]+href="[^"]*assets[^"]*\.css"/);
    });

    it("should have bundled JS and CSS assets", () => {
      const assetsDir = path.join(buildOutputDir, "assets");
      const assets = fs.readdirSync(assetsDir);

      const jsFiles = assets.filter((f) => f.endsWith(".js"));
      const cssFiles = assets.filter((f) => f.endsWith(".css"));

      expect(jsFiles.length).toBeGreaterThan(0);
      expect(cssFiles.length).toBeGreaterThan(0);
    });

    it("should have valid KiCanvas library", () => {
      const kicanvasPath = path.join(buildOutputDir, "kicanvas", "kicanvas.js");
      const content = fs.readFileSync(kicanvasPath, "utf-8");

      // Basic sanity check - should be non-empty JavaScript
      expect(content.length).toBeGreaterThan(1000);
    });
  });
});

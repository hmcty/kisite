#!/usr/bin/env tsx
/**
 * Project indexer - scans project directories and generates project-index.json
 */

import * as fs from "fs";
import * as path from "path";
import { execSync, spawnSync } from "child_process";
import archiver from "archiver";
import type {
  GitInfo,
  ProjectIndex,
  ProjectMetadata,
  SchematicFile,
  SheetInfo,
  WorkspaceConfig,
} from "../lib/project-index.js";
import {
  isParentOf,
  initializePaths,
  loadConfig,
  getProjectDirs,
  getRootDir,
  getOutputDir,
  getTrackedFiles,
} from "./indexer-utils.js";

function toHttpsUrl(gitUrl: string): string {
  const sshMatch = gitUrl.match(/git@([^:]+):(.+?)(?:\.git)?$/);
  const httpsMatch = gitUrl.match(/https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);

  let result: string | undefined;
  if (sshMatch) {
    const [, host, repoPath] = sshMatch;
    result = `https://${host}/${repoPath}`;
  } else if (httpsMatch) {
    const [, host, repoPath] = httpsMatch;
    result = `https://${host}/${repoPath}`;
  }

  return result || undefined;
}

// Get git repository info
function getGitInfo(): GitInfo {
  const exec = (cmd: string): string => {
    try {
      return execSync(cmd, { cwd: getRootDir(), encoding: "utf-8" }).trim();
    } catch {
      return "";
    }
  };

  // Get commit hash
  const commitHash = exec("git rev-parse HEAD");
  const commitHashShort = exec("git rev-parse --short HEAD");

  // Get remote URL and parse it
  const remoteUrl = exec("git remote get-url origin");
  let repoUrl: string | undefined;
  let repoName = path.basename(getRootDir()); // Fallback to directory name
  if (remoteUrl) {
    // Parse GitHub/GitLab URL formats:
    // git@github.com:user/repo.git
    // https://github.com/user/repo.git
    repoUrl = toHttpsUrl(remoteUrl);
    repoName = repoUrl.split("/").pop() || repoName;
  }

  // Build commit URL
  let commitUrl: string | undefined;
  if (repoUrl && commitHash) {
    commitUrl = `${repoUrl}/commit/${commitHash}`;
  }

  return {
    repoName,
    repoUrl,
    commitHash,
    commitHashShort,
    commitUrl,
  };
}

interface SubmoduleInfo {
  path: string;
  url: string;
  commitHash: string;
}

// Parse .gitmodules to get submodule information
function getSubmodules(): Map<string, SubmoduleInfo> {
  const submodules = new Map<string, SubmoduleInfo>();

  const cmd =
    'echo "$displaypath $(git remote get-url origin) $(git rev-parse HEAD)"';
  const result = spawnSync(
    "git",
    ["submodule", "foreach", "--quiet", "--recursive", cmd],
    {
      cwd: getRootDir(),
      encoding: "utf-8",
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(`Git command failed: ${result.stderr}`);
  }

  const output = result.stdout.trim();
  for (const line of output.split("\n")) {
    const parts = line.split(" ");
    if (parts.length >= 3) {
      const displayPath = parts[0];
      const url = toHttpsUrl(parts[1]);
      const commitHash = parts[2];
      const absolutePath = path.join(getRootDir(), displayPath);
      submodules.set(absolutePath, { path: displayPath, url, commitHash });
    }
  }

  return submodules;
}

// Get git info for a specific path (handles submodules)
function getGitInfoForPath(
  projectPath: string,
  submodules: Map<string, SubmoduleInfo>,
): GitInfo | undefined {
  // Check if this path is within a submodule
  for (const [submodulePath, submoduleInfo] of submodules) {
    console.log(
      `Checking if project path ${projectPath} is in submodule ${submoduleInfo.path} (absolute path: ${submodulePath})`,
    );
    if (
      isParentOf(submodulePath, projectPath) ||
      submoduleInfo.path === projectPath
    ) {
      // This project is in a submodule
      const commitHashShort = submoduleInfo.commitHash.substring(0, 7);
      const repoName =
        submoduleInfo.url
          .split("/")
          .pop()
          ?.replace(/\.git$/, "") || "";
      const commitUrl = `${submoduleInfo.url}/commit/${submoduleInfo.commitHash}`;

      console.log(`Project is in submodule: ${submoduleInfo.path}`);
      console.log(`  Repo: ${repoName}`);
      console.log(`  URL: ${submoduleInfo.url}`);
      console.log(`  Commit: ${submoduleInfo.commitHash} (${commitHashShort})`);

      return {
        repoName,
        repoUrl: submoduleInfo.url,
        commitHash: submoduleInfo.commitHash,
        commitHashShort,
        commitUrl,
      };
    }
  }

  // Not in a submodule, return undefined (will use main repo info)
  return undefined;
}

// Find all .kicad_pro files in tracked files
function findProjectFiles(
  trackedFiles: Set<string>,
  projectDirs: string[],
): string[] {
  const results: string[] = [];

  for (const file of trackedFiles) {
    if (!file.endsWith(".kicad_pro")) continue;
    results.push(file);
  }

  return results;
}

// Get tracked schematic files in a directory
function getTrackedSchematics(
  projectDir: string,
  trackedFiles: Set<string>,
): string[] {
  const results: string[] = [];

  for (const file of trackedFiles) {
    if (!isParentOf(projectDir, file)) continue;
    if (!file.endsWith(".kicad_sch")) continue;
    if (path.dirname(file) !== projectDir) continue; // Only direct children

    results.push(file);
  }

  return results;
}

// Get all tracked files in a project directory (for zipping)
function getProjectFiles(
  projectDir: string,
  trackedFiles: Set<string>,
): string[] {
  const results: string[] = [];

  for (const file of trackedFiles) {
    if (!isParentOf(projectDir, file)) continue;
    results.push(file);
  }

  return results;
}

// Create a zip file for a project
async function createProjectZip(
  projectDir: string,
  projectName: string,
  trackedFiles: Set<string>,
  outputDir: string,
  commitHashShort: string,
): Promise<string> {
  const zipFileName = commitHashShort
    ? `${projectName}-${commitHashShort}.zip`
    : `${projectName}.zip`;
  const zipPath = path.join(outputDir, zipFileName);

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Get all files in project directory
  const projectFiles = getProjectFiles(projectDir, trackedFiles);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(zipFileName));
    archive.on("error", reject);

    archive.pipe(output);

    // Add each file to the archive
    for (const filePath of projectFiles) {
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory())
        continue;
      const relativePath = path.relative(projectDir, filePath);
      archive.file(filePath, { name: `${projectName}/${relativePath}` });
    }

    archive.finalize();
  });
}

// Parse a KiCad project file and extract metadata
function parseProjectFile(
  projectPath: string,
  trackedFiles: Set<string>,
  submodules: Map<string, SubmoduleInfo>,
  projectDirs: string[],
): ProjectMetadata | null {
  try {
    const projectData = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    const projectDir = path.dirname(projectPath);
    const projectName = path.basename(projectPath, ".kicad_pro");

    // Find which project directory this file belongs to
    console.log(`\nParsing project: ${projectName}`);
    console.log(`  Path: ${projectPath}`);
    console.log(
      `  Project directories: ${projectDirs.map((d) => path.relative(getRootDir(), d)).join(", ")}`,
    );
    const containingDir = projectDirs.find((dir) =>
      isParentOf(dir, projectPath),
    );
    if (!containingDir) {
      console.warn(
        `Project file ${projectPath} is not in any configured project directory`,
      );
      return null;
    }

    // Calculate relative path from the containing project directory
    const relativePath = path.relative(containingDir, projectDir);

    // Generate web paths (relative to the index.html location)
    // Use the source directory name as the base (e.g., 'projects', 'hardware', 'pcbs')
    const sourceBaseName = path.relative(getRootDir(), containingDir);
    const webBasePath = `${sourceBaseName}/${relativePath}`.replace(/\\/g, "/");
    const projectFile = `${webBasePath}/${path.basename(projectPath)}`;

    // Extract sheets from project file
    const sheets: SheetInfo[] = [];
    if (projectData.sheets && Array.isArray(projectData.sheets)) {
      for (const sheet of projectData.sheets) {
        if (Array.isArray(sheet) && sheet.length >= 2) {
          sheets.push({
            uuid: sheet[0],
            name: sheet[1],
          });
        }
      }
    }

    // Find tracked .kicad_sch files in the project directory
    const schematics: SchematicFile[] = [];
    const schFiles = getTrackedSchematics(projectDir, trackedFiles);

    for (const schFile of schFiles) {
      schematics.push({
        path: `${webBasePath}/${path.basename(schFile)}`,
        name: path.basename(schFile, ".kicad_sch"),
      });
    }

    // Find PCB file (if tracked)
    let pcb: string | undefined;
    const pcbFile = `${projectName}.kicad_pcb`;
    const pcbPath = path.join(projectDir, pcbFile);
    if (trackedFiles.has(pcbPath) && fs.existsSync(pcbPath)) {
      pcb = `${webBasePath}/${pcbFile}`;
    }

    // Look for README.md or similar markdown file
    let readme: string | undefined;
    const readmeFiles = ["README.md", "readme.md", "Readme.md", "README.MD"];
    for (const readmeFile of readmeFiles) {
      const readmePath = path.join(projectDir, readmeFile);
      if (trackedFiles.has(readmePath) && fs.existsSync(readmePath)) {
        try {
          readme = fs.readFileSync(readmePath, "utf-8");
          break;
        } catch (e) {
          console.warn(`Failed to read ${readmeFile}:`, e);
        }
      }
    }

    // Get file modification dates
    let createdAt: string | undefined;
    let updatedAt: string | undefined;
    try {
      const stats = fs.statSync(projectPath);
      createdAt = stats.birthtime.toISOString();
      updatedAt = stats.mtime.toISOString();
    } catch (e) {
      console.warn(`Failed to get file stats for ${projectPath}:`, e);
    }

    const id = relativePath.replace(/\\/g, "/") || projectName;
    const projectGitInfo = getGitInfoForPath(projectDir, submodules);

    return {
      id,
      name: projectName,
      path: webBasePath,
      projectFile,
      schematics,
      pcb,
      sheets,
      readme,
      createdAt,
      updatedAt,
      git: projectGitInfo,
    };
  } catch (error) {
    console.error(`Error parsing project file ${projectPath}:`, error);
    return null;
  }
}

// Main indexing function
export async function indexProjects() {
  console.log("Starting project indexer...");

  initializePaths();
  const config = loadConfig();

  // Get project directories
  const projectDirs = getProjectDirs(config);
  console.log(
    `Scanning directories: ${projectDirs.map((d) => path.relative(getRootDir(), d)).join(", ")}`,
  );

  // Get git info
  const git = getGitInfo();
  const title = config.title || git.repoName;
  console.log(`Title: ${title}`);
  console.log(`Repo: ${git.repoName} @ ${git.commitHashShort}`);

  console.log("Getting tracked files...");
  const trackedFiles = getTrackedFiles(projectDirs);
  console.log(`Found ${trackedFiles.size} tracked files`);

  // Get submodule information
  console.log("Detecting submodules...");
  const submodules = getSubmodules();
  if (submodules.size > 0) {
    console.log(`Found ${submodules.size} submodules:`);
    for (const [, info] of submodules) {
      console.log(`  - ${info.path} -> ${info.url}`);
    }
  }

  // Find project files
  const projectFiles = findProjectFiles(trackedFiles, projectDirs);
  console.log(`Found ${projectFiles.length} project files`);

  // Prepare downloads directory
  const downloadsDir = path.join(getOutputDir(), "downloads");
  if (fs.existsSync(downloadsDir)) {
    fs.rmSync(downloadsDir, { recursive: true });
  }
  fs.mkdirSync(downloadsDir, { recursive: true });

  // Parse each project and generate zip files
  const projects: ProjectMetadata[] = [];
  console.log("\nProcessing projects...");
  for (const projectFile of projectFiles) {
    const project = parseProjectFile(
      projectFile,
      trackedFiles,
      submodules,
      projectDirs,
    );
    if (project) {
      // Generate zip file - find the containing project directory
      const projectDir = path.dirname(projectFile);
      const zipFileName = await createProjectZip(
        projectDir,
        project.name,
        trackedFiles,
        downloadsDir,
        git.commitHashShort,
      );
      project.zip = `downloads/${zipFileName}`;

      projects.push(project);
      console.log(
        `  - ${project.name} (${project.schematics.length} schematics${project.pcb ? ", PCB" : ""}, zip)`,
      );
    }
  }

  // Sort projects by name
  projects.sort((a, b) => a.name.localeCompare(b.name));

  // Generate index
  const index: ProjectIndex = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    title,
    git,
    projects,
  };

  // Write to public directory
  const outputPath = path.join(getOutputDir(), "project-index.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2));

  console.log(`\nProject index generated: ${outputPath}`);
  console.log(`Total projects: ${projects.length}`);
}

// Run indexer if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  indexProjects();
}

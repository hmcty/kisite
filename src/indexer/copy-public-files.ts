#!/usr/bin/env tsx
/**
 * Copy relevant project files to output directory
 * Respects .gitignore
 */

import * as fs from "fs";
import * as path from "path";
import type { WorkspaceConfig } from "../lib/project-index.js";
import {
  initializePaths,
  loadConfig,
  getProjectDirs,
  getRootDir,
  getOutputDir,
  getTrackedFiles,
} from "./indexer-utils.js";

export function copyPublicFiles() {
  initializePaths();
  const config = loadConfig();
  const projectDirs = getProjectDirs(config);

  console.log(
    `Copying from directories: ${projectDirs.map((d) => path.relative(getRootDir(), d)).join(", ")}`,
  );

  // Clean public directories for each project directory
  for (const projectDir of projectDirs) {
    const relativeDir = path.relative(getRootDir(), projectDir);
    const publicDir = path.join(getOutputDir(), relativeDir);
    if (fs.existsSync(publicDir)) {
      fs.rmSync(publicDir, { recursive: true });
    }
  }

  // Get tracked files from all project directories
  const trackedFiles = getTrackedFiles(projectDirs);
  if (trackedFiles.size === 0) {
    console.log("No tracked files found in configured directories");
    return;
  }

  console.log(`Found ${trackedFiles.size} tracked files`);

  // Copy each tracked file, preserving the source directory structure
  let copiedCount = 0;
  for (const relativePath of trackedFiles) {
    const srcPath = path.join(getRootDir(), relativePath);
    const destPath = path.join(getOutputDir(), relativePath);

    // Check if source is a directory (submodule)
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      // Recursively copy submodule directory
      fs.cpSync(srcPath, destPath, { recursive: true });
      console.log(`  Copied submodule: ${relativePath}`);
      copiedCount++;
    } else {
      // Create destination directory and copy file
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      copiedCount++;
    }
  }

  console.log(`Copied ${copiedCount} entries to ${getOutputDir()}`);
}

// Run if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  copyPublicFiles();
}

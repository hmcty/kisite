/**
 * Shared utilities for indexer scripts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import type { WorkspaceConfig } from '../lib/project-index.js';

// Module-level variables set at runtime
let ROOT_DIR: string;
let OUTPUT_DIR: string;
let KISITE_ROOT: string;

// Get kisite installation root from environment variable or resolve from this file's location
function getKishareRoot(): string {
  if (process.env.KISITE_ROOT) {
    return path.resolve(process.env.KISITE_ROOT);
  }
  // Fallback: resolve from this file's location (two levels up from src/indexer/)
  const __filename = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(__filename), '../..');
}

// Get user's project root (where kisite-config.json and KiCad files live)
function getProjectRoot(): string {
  // KISITE_PROJECT_ROOT is set by CLI, otherwise use cwd
  return process.env.KISITE_PROJECT_ROOT || process.cwd();
}

// Check if one path is a parent of another
export function isParentOf(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

// Read configuration from user's project directory
export function loadConfig(): WorkspaceConfig {
  const configPath = path.join(getProjectRoot(), 'kisite-config.json');
  if (!fs.existsSync(configPath)) {
    console.warn(`No config file found at ${configPath}, using defaults`);
    return {};
  }
  const configData = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(configData) as WorkspaceConfig;
}

// Initialize paths
// ROOT_DIR = user's project (where KiCad files live)
// KISITE_ROOT = kisite package installation
// OUTPUT_DIR = output directory for generated files (can be overridden via KISITE_OUTPUT_DIR)
export function initializePaths() {
  ROOT_DIR = getProjectRoot();
  KISITE_ROOT = getKishareRoot();
  // Allow OUTPUT_DIR to be overridden via environment variable (used by CLI with temp directories)
  OUTPUT_DIR = process.env.KISITE_OUTPUT_DIR || path.join(KISITE_ROOT, 'public');

  console.log(`Config file: ${path.join(ROOT_DIR, 'kisite-config.json')}`);
  console.log(`Root directory (project files): ${ROOT_DIR}`);
  console.log(`KiSite root: ${KISITE_ROOT}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
}

// Get project directories from config (defaults to ['projects'])
export function getProjectDirs(config: WorkspaceConfig): string[] {
  const dirs = config.projectDirs || ['projects'];
  return dirs.map(dir => path.join(ROOT_DIR, dir));
}

// Getters for initialized paths
export function getRootDir(): string {
  if (!ROOT_DIR) {
    throw new Error('Paths not initialized. Call initializePaths() first.');
  }
  return ROOT_DIR;
}

export function getOutputDir(): string {
  if (!OUTPUT_DIR) {
    throw new Error('Paths not initialized. Call initializePaths() first.');
  }
  return OUTPUT_DIR;
}

export function getKishareRootDir(): string {
  if (!KISITE_ROOT) {
    throw new Error('Paths not initialized. Call initializePaths() first.');
  }
  return KISITE_ROOT;
}

// Find the git repository root directory
function findGitRoot(startDir: string): string | null {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: startDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return gitRoot;
  } catch {
    return null;
  }
}

// Get list of git-tracked files in the specified project directories
export function getTrackedFiles(projectDirs: string[]): Set<string> {
  const allFiles = new Set<string>();

  // Find the git root - it might be above ROOT_DIR (e.g., when ROOT_DIR is a subdirectory)
  const gitRoot = findGitRoot(getRootDir());
  if (!gitRoot) {
    console.warn('Not in a git repository, cannot get tracked files');
    return allFiles;
  }

  for (const projectDir of projectDirs) {
    try {
      // Get path relative to git root for the git command
      const relativeToGit = path.relative(gitRoot, projectDir);
      // Get path relative to ROOT_DIR for the output
      const relativeToRoot = path.relative(getRootDir(), projectDir);

      console.log(`Getting git tracked files for ${relativeToRoot}...`);
      const output = execSync(`git ls-files --recurse-submodules "${relativeToGit}/"`, {
        cwd: gitRoot,
        encoding: 'utf-8',
      });

      // Convert paths from git-root-relative to ROOT_DIR-relative
      const gitRootToRootDir = path.relative(gitRoot, getRootDir());

      output.trim().split('\n').filter(f => f).forEach(gitRelativePath => {
        // Convert: path relative to git root -> path relative to ROOT_DIR
        const absolutePath = path.join(gitRoot, gitRelativePath);
        const rootRelativePath = path.relative(getRootDir(), absolutePath);

        // Only include if the file is within ROOT_DIR (not above it)
        if (!rootRelativePath.startsWith('..')) {
          allFiles.add(rootRelativePath);
        }
      });
    } catch (error) {
      console.warn(`Could not get git tracked files for ${projectDir}`);
    }
  }

  return allFiles;
}

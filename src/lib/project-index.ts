/**
 * TypeScript interfaces for the KiCad project index
 */

export interface WorkspaceConfig {
  title?: string; // Optional: falls back to repo name
  projectDirs?: string[]; // Optional: directories to scan for projects (defaults to ['projects'])
}

export interface GitInfo {
  repoName: string; // e.g., "my-kicad-projects"
  repoUrl?: string; // e.g., "https://github.com/user/repo"
  commitHash: string; // e.g., "abc1234"
  commitHashShort: string; // e.g., "abc1234" (7 chars)
  commitUrl?: string; // e.g., "https://github.com/user/repo/commit/abc1234"
  commitDate?: string; // ISO 8601 date of last commit
}

export interface ProjectIndex {
  version: string;
  generatedAt: string;
  title: string;
  git: GitInfo;
  projects: ProjectMetadata[];
}

export interface ProjectMetadata {
  id: string; // Unique identifier
  name: string; // Project name from .kicad_pro filename
  path: string; // Relative path from kicad root
  projectFile: string; // Web path to .kicad_pro
  schematics: SchematicFile[]; // All schematic files
  pcb?: string; // Web path to .kicad_pcb if exists
  sheets: SheetInfo[]; // Sheet hierarchy from .kicad_pro
  zip?: string; // Web path to downloadable zip file
  readme?: string; // Markdown content from README.md or similar
  thumbnail?: string; // Web path to preview image (e.g., PCB render)
  createdAt?: string; // ISO date string
  updatedAt?: string; // ISO date string
  git?: GitInfo; // Optional: per-project git info (for submodules)
}

export interface SchematicFile {
  path: string; // Web path to .kicad_sch
  name: string; // Display name
}

export interface SheetInfo {
  uuid: string;
  name: string;
}

/**
 * Load the project index from the web server
 */
export async function loadProjectIndex(): Promise<ProjectIndex> {
  const response = await fetch("project-index.json");
  if (!response.ok) {
    throw new Error(`Failed to load project index: ${response.statusText}`);
  }
  return await response.json();
}

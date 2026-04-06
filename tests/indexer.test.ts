import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');
const kishareRoot = path.resolve(__dirname, '..');

describe('Indexer', () => {
  const originalEnv = { ...process.env };
  const originalCwd = process.cwd();

  beforeAll(() => {
    // Set up environment for indexer
    process.env.KISHARE_ROOT = kishareRoot;
    process.env.KISHARE_PROJECT_ROOT = fixturesDir;
    process.chdir(fixturesDir);
  });

  afterAll(() => {
    // Restore environment
    process.env = originalEnv;
    process.chdir(originalCwd);
  });

  describe('indexer-utils', () => {
    it('should load config from project root', async () => {
      const { loadConfig } = await import('../src/indexer/indexer-utils.js');
      const config = loadConfig();

      expect(config).toBeDefined();
      expect(config.title).toBe('Test Workspace');
      expect(config.projectDirs).toEqual(['test-project']);
    });

    it('should initialize paths correctly', async () => {
      const { initializePaths, getRootDir, getOutputDir, getKishareRootDir } = await import('../src/indexer/indexer-utils.js');

      initializePaths();

      expect(getRootDir()).toBe(fixturesDir);
      expect(getKishareRootDir()).toBe(kishareRoot);
      expect(getOutputDir()).toBe(path.join(kishareRoot, 'public'));
    });

    it('should get project directories from config', async () => {
      const { loadConfig, getProjectDirs, initializePaths } = await import('../src/indexer/indexer-utils.js');

      initializePaths();
      const config = loadConfig();
      const projectDirs = getProjectDirs(config);

      expect(projectDirs).toHaveLength(1);
      expect(projectDirs[0]).toBe(path.join(fixturesDir, 'test-project'));
    });
  });

  describe('scan-projects', () => {
    it('should find KiCad project files', async () => {
      const { initializePaths, loadConfig, getProjectDirs, getTrackedFiles } = await import('../src/indexer/indexer-utils.js');

      initializePaths();
      const config = loadConfig();
      const projectDirs = getProjectDirs(config);
      const trackedFiles = getTrackedFiles(projectDirs);

      // Should find the .kicad_pro file
      const proFiles = Array.from(trackedFiles).filter(f => f.endsWith('.kicad_pro'));
      expect(proFiles.length).toBeGreaterThan(0);
    });

    it('should find schematic files', async () => {
      const { initializePaths, loadConfig, getProjectDirs, getTrackedFiles } = await import('../src/indexer/indexer-utils.js');

      initializePaths();
      const config = loadConfig();
      const projectDirs = getProjectDirs(config);
      const trackedFiles = getTrackedFiles(projectDirs);

      // Should find .kicad_sch files
      const schFiles = Array.from(trackedFiles).filter(f => f.endsWith('.kicad_sch'));
      expect(schFiles.length).toBeGreaterThan(0);
    });

    it('should find PCB files', async () => {
      const { initializePaths, loadConfig, getProjectDirs, getTrackedFiles } = await import('../src/indexer/indexer-utils.js');

      initializePaths();
      const config = loadConfig();
      const projectDirs = getProjectDirs(config);
      const trackedFiles = getTrackedFiles(projectDirs);

      // Should find .kicad_pcb files
      const pcbFiles = Array.from(trackedFiles).filter(f => f.endsWith('.kicad_pcb'));
      expect(pcbFiles.length).toBeGreaterThan(0);
    });
  });
});

describe('isParentOf utility', () => {
  it('should correctly identify parent directories', async () => {
    const { isParentOf } = await import('../src/indexer/indexer-utils.js');

    expect(isParentOf('/foo/bar', '/foo/bar/baz')).toBe(true);
    expect(isParentOf('/foo/bar', '/foo/bar/baz/qux')).toBe(true);
    expect(isParentOf('/foo/bar', '/foo/baz')).toBe(false);
    expect(isParentOf('/foo/bar', '/foo/bar')).toBe(false); // Same path, not parent
    expect(isParentOf('/foo/bar', '/other/path')).toBe(false);
  });
});

#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createServer, build, preview, type InlineConfig, type Plugin } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the kisite package root (two levels up from src/node/)
const KISITE_ROOT = path.resolve(__dirname, '../..');

function printUsage() {
  console.log(`
kisite - KiCad project viewer generator

Usage:
  kisite [command] [options]

Commands:
  dev      Start development server (default)
  build    Build static site
  preview  Preview built site

Options:
  --help   Show this help message
`);
}

// Create the working directory in the user's project
function createWorkDir(): string {
  const workDir = path.join(process.cwd(), '.kisite');
  // Clean and recreate
  if (fs.existsSync(workDir)) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  fs.mkdirSync(workDir, { recursive: true });
  return workDir;
}

// Copy package assets to the working directory
function setupWorkDir(workDir: string): void {
  // Copy index.html
  fs.copyFileSync(
    path.join(KISITE_ROOT, 'index.html'),
    path.join(workDir, 'index.html')
  );

  // Copy src directory for Vite to compile
  fs.cpSync(
    path.join(KISITE_ROOT, 'src'),
    path.join(workDir, 'src'),
    { recursive: true }
  );

  // Copy tsconfig.json for TypeScript
  if (fs.existsSync(path.join(KISITE_ROOT, 'tsconfig.json'))) {
    fs.copyFileSync(
      path.join(KISITE_ROOT, 'tsconfig.json'),
      path.join(workDir, 'tsconfig.json')
    );
  }

  // Symlink node_modules so Vite can resolve dependencies
  const nodeModulesSource = path.join(KISITE_ROOT, 'node_modules');
  const nodeModulesDest = path.join(workDir, 'node_modules');
  if (fs.existsSync(nodeModulesSource)) {
    fs.symlinkSync(nodeModulesSource, nodeModulesDest, 'dir');
  }

  // Create public directory
  fs.mkdirSync(path.join(workDir, 'public'), { recursive: true });

  // Copy KiCanvas - check lib/ first (npm package), then vendor/ (local dev)
  const kicanvasLocations = [
    path.join(KISITE_ROOT, 'lib/kicanvas.js'),
    path.join(KISITE_ROOT, 'vendor/kicanvas/build/kicanvas.js'),
  ];
  const kicanvasDest = path.join(workDir, 'public/kicanvas/kicanvas.js');
  fs.mkdirSync(path.dirname(kicanvasDest), { recursive: true });

  const kicanvasSource = kicanvasLocations.find(p => fs.existsSync(p));
  if (kicanvasSource) {
    fs.copyFileSync(kicanvasSource, kicanvasDest);
  } else {
    console.warn(`Warning: KiCanvas not found. Checked: ${kicanvasLocations.join(', ')}`);
  }
}


// Create the Vite plugin for serving KiCad files
function createKiCadPlugin(publicDir: string): Plugin {
  return {
    name: 'serve-kicad-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.match(/\.(kicad_pro|kicad_sch|kicad_pcb|zip|png|jpg|jpeg|gif|svg|webp|md)$/i)) {
          const requestedPath = req.url.split('?')[0];
          const filePath = path.normalize(path.join(publicDir, requestedPath));

          if (!filePath.startsWith(publicDir)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
          }

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const content = fs.readFileSync(filePath);

            let contentType = 'application/octet-stream';
            if (req.url.endsWith('.zip')) contentType = 'application/zip';
            else if (req.url.match(/\.(kicad_pro|kicad_sch|kicad_pcb)$/)) contentType = 'application/json';
            else if (req.url.endsWith('.png')) contentType = 'image/png';
            else if (req.url.match(/\.(jpg|jpeg)$/)) contentType = 'image/jpeg';
            else if (req.url.endsWith('.gif')) contentType = 'image/gif';
            else if (req.url.endsWith('.svg')) contentType = 'image/svg+xml';
            else if (req.url.endsWith('.webp')) contentType = 'image/webp';
            else if (req.url.endsWith('.md')) contentType = 'text/markdown';

            res.setHeader('Content-Type', contentType);
            res.end(content);
            return;
          }
        }
        next();
      });
    },
  };
}

// Create inline Vite config
function createViteConfig(workDir: string, outDir?: string): InlineConfig {
  const publicDir = path.join(workDir, 'public');

  return {
    root: workDir,
    base: '',
    publicDir,
    appType: 'spa',
    build: {
      outDir: outDir || path.join(workDir, 'dist'),
      assetsDir: 'assets',
      sourcemap: true,
      emptyOutDir: true,
      rollupOptions: {
        // Don't try to bundle kicanvas - it's in the public directory
        external: ['/kicanvas/kicanvas.js'],
      },
    },
    server: {
      port: 5173,
      open: !process.env.KISITE_NO_OPEN,
    },
    plugins: [createKiCadPlugin(publicDir)],
    // Suppress config file loading
    configFile: false,
  };
}

async function runIndexer(workDir: string) {
  console.log('Indexing projects...');

  // Set OUTPUT_DIR to workDir's public directory
  const originalOutputDir = process.env.KISITE_OUTPUT_DIR;
  process.env.KISITE_OUTPUT_DIR = path.join(workDir, 'public');

  const { indexProjects } = await import('../indexer/scan-projects.js');
  await indexProjects();

  // Restore
  if (originalOutputDir) {
    process.env.KISITE_OUTPUT_DIR = originalOutputDir;
  } else {
    delete process.env.KISITE_OUTPUT_DIR;
  }
}

async function copyProjectFiles(workDir: string) {
  console.log('Copying project files...');

  const originalOutputDir = process.env.KISITE_OUTPUT_DIR;
  process.env.KISITE_OUTPUT_DIR = path.join(workDir, 'public');

  const { copyPublicFiles } = await import('../indexer/copy-public-files.js');
  await copyPublicFiles();

  if (originalOutputDir) {
    process.env.KISITE_OUTPUT_DIR = originalOutputDir;
  } else {
    delete process.env.KISITE_OUTPUT_DIR;
  }
}

async function prepare(workDir: string) {
  setupWorkDir(workDir);
  await runIndexer(workDir);
  await copyProjectFiles(workDir);
}

async function runDev() {
  const workDir = createWorkDir();

  await prepare(workDir);

  const config = createViteConfig(workDir);
  const server = await createServer(config);

  await server.listen();
  server.printUrls();
  server.bindCLIShortcuts({ print: true });
}

async function runBuild() {
  const workDir = createWorkDir();
  const projectRoot = process.cwd();
  const outDir = path.join(projectRoot, 'dist');

  await prepare(workDir);

  const config = createViteConfig(workDir, outDir);
  await build(config);

  console.log(`\nBuild complete! Output: ${outDir}`);
}

async function runPreview() {
  const projectRoot = process.cwd();
  const outDir = path.join(projectRoot, 'dist');

  if (!fs.existsSync(outDir)) {
    console.error(`Error: No build found at ${outDir}`);
    console.error('Run "kisite build" first.');
    process.exit(1);
  }

  const server = await preview({
    root: outDir,
    preview: {
      port: 4173,
      open: true,
    },
    configFile: false,
  });

  server.printUrls();
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'dev';

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // Set environment variables for the indexer
  process.env.KISITE_ROOT = KISITE_ROOT;
  process.env.KISITE_PROJECT_ROOT = process.cwd();

  console.log(`KiSite CLI`);
  console.log(`  Project: ${process.cwd()}`);
  console.log(`  Package: ${KISITE_ROOT}`);
  console.log();

  try {
    switch (command) {
      case 'dev':
        await runDev();
        break;
      case 'build':
        await runBuild();
        break;
      case 'preview':
        await runPreview();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

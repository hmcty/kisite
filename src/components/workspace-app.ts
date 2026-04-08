/**
 * Main application component
 */

import DOMPurify from 'dompurify';
import { loadProjectIndex, type GitInfo, type ProjectMetadata } from '../lib/project-index.js';
import { router } from '../lib/router.js';
import { isSafeUrl, githubIcon } from '../lib/html-utils.js';
import { SIDEBAR } from '../lib/constants.js';
import { ProjectList } from './project-list.js';
import { ViewerPanel } from './viewer-panel.js';

export class WorkspaceApp extends HTMLElement {
  private projectList!: ProjectList;
  private viewerPanel!: ViewerPanel;
  private projects: ProjectMetadata[] = [];
  private title: string = 'KiSite';
  private sidebarCollapsed: boolean = false;
  private sidebarWidth: number = 300; // Track uncollapsed width
  private gitInfo: GitInfo | null = null;

  constructor() {
    super();
  }

  async connectedCallback() {
    this.render();
    await this.loadProjects();
    this.setupRouting();
    this.setupSidebarToggle();
    this.setupSidebarResize();
  }

  /**
   * Load project index from server
   */
  private async loadProjects() {
    try {
      const index = await loadProjectIndex();
      this.projects = index.projects;
      this.title = DOMPurify.sanitize(index.title);

      // Update title in UI
      const titleEl = this.querySelector('.sidebar-title');
      if (titleEl) {
        titleEl.textContent = this.title;
      }
      document.title = this.title;

      // Update git info in footer and viewer
      this.gitInfo = index.git;
      this.updateGitInfo(index.git);
      this.viewerPanel.setGitInfo(index.git);

      // Update project list
      this.projectList.setGitInfo(index.git);
      this.projectList.setProjects(this.projects);

      console.log(`Loaded ${this.projects.length} projects`);
    } catch (error) {
      console.error('Failed to load projects:', error);
      this.viewerPanel.showError('Failed to load project index');
    }
  }

  /**
   * Update git info in sidebar footer
   */
  private updateGitInfo(git: GitInfo) {
    const footer = this.querySelector('.sidebar-footer');
    if (!footer) return;

    // Extract user/repo from repoUrl (e.g., "https://github.com/user/repo" -> "user/repo")
    let repoPath = '';
    if (git.repoUrl) {
      const match = git.repoUrl.match(/https?:\/\/[^/]+\/(.+)/);
      if (match) {
        repoPath = match[1];
      }
    }

    if (git.repoUrl && repoPath) {
      const commitUrl = git.commitUrl || git.repoUrl;
      if (!isSafeUrl(commitUrl)) {
        console.warn('Invalid URL protocol in git info:', commitUrl);
        return;
      }

      const html = `
        <a href="${commitUrl}" target="_blank" rel="noopener" class="commit-link">
          ${githubIcon(14)}
          <span class="repo-path">${repoPath}</span>
          ${git.commitHashShort ? `<span class="commit-separator">-</span><span class="commit-hash">${git.commitHashShort}</span>` : ''}
        </a>
      `;
      footer.innerHTML = DOMPurify.sanitize(html);
    } else if (git.commitHashShort) {
      footer.innerHTML = DOMPurify.sanitize(`<span class="commit-hash">${git.commitHashShort}</span>`);
    }
  }

  /**
   * Setup sidebar toggle functionality
   */
  private setupSidebarToggle() {
    const toggleBtn = this.querySelector('.sidebar-toggle') as HTMLElement;
    const sidebar = this.querySelector('.sidebar') as HTMLElement;

    toggleBtn?.addEventListener('click', () => {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      sidebar?.classList.toggle('collapsed', this.sidebarCollapsed);
      toggleBtn?.classList.toggle('collapsed', this.sidebarCollapsed);

      // Update button position
      if (this.sidebarCollapsed) {
        toggleBtn.style.left = '8px';
      } else {
        // Restore position based on tracked width
        toggleBtn.style.left = `${this.sidebarWidth + 8}px`;
      }
    });
  }

  /**
   * Setup sidebar resize functionality
   */
  private setupSidebarResize() {
    const resizeHandle = this.querySelector('.sidebar-resize-handle') as HTMLElement;
    const sidebar = this.querySelector('.sidebar') as HTMLElement;
    const toggleBtn = this.querySelector('.sidebar-toggle') as HTMLElement;

    if (!resizeHandle || !sidebar) return;

    // Load saved width from localStorage
    const savedWidth = localStorage.getItem(SIDEBAR.STORAGE_KEY);
    if (savedWidth) {
      const width = parseInt(savedWidth, 10);
      this.sidebarWidth = width;
      sidebar.style.width = `${width}px`;
      sidebar.style.minWidth = `${width}px`;
      if (toggleBtn) {
        toggleBtn.style.left = `${width + 8}px`;
      }
    } else {
      // Initialize with default width
      this.sidebarWidth = sidebar.offsetWidth || 300;
    }

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e: MouseEvent) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const delta = e.clientX - startX;
      const newWidth = Math.max(SIDEBAR.MIN_WIDTH, Math.min(SIDEBAR.MAX_WIDTH, startWidth + delta));

      this.sidebarWidth = newWidth;
      sidebar.style.width = `${newWidth}px`;
      sidebar.style.minWidth = `${newWidth}px`;
      if (toggleBtn) {
        toggleBtn.style.left = `${newWidth + 8}px`;
      }
    };

    const onMouseUp = () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Save width to localStorage
        this.sidebarWidth = sidebar.offsetWidth;
        localStorage.setItem(SIDEBAR.STORAGE_KEY, this.sidebarWidth.toString());
      }
    };

    resizeHandle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  /**
   * Setup routing and handle route changes
   */
  private setupRouting() {
    router.onRouteChange((route) => {
      if (route.path === '/project' && route.projectId) {
        this.loadProject(route.projectId, route.position, route.marker);
      } else {
        // Default route - show welcome
        this.viewerPanel.showWelcome();
        this.projectList.setSelectedProject(null);
      }
    });
  }

  /**
   * Load and display a specific project
   */
  private loadProject(
    projectId: string,
    position?: import('../lib/router.js').ViewPosition,
    marker?: import('../lib/router.js').MarkerBounds
  ) {
    const project = this.projects.find(p => p.id === projectId);

    if (!project) {
      console.error(`Project not found: ${projectId}`);
      this.viewerPanel.showError(`Project "${projectId}" not found`);
      return;
    }

    console.log(`Loading project: ${project.name}`);

    // Update UI
    this.projectList.setSelectedProject(projectId);
    this.viewerPanel.loadProject(project, position, marker);
  }

  /**
   * Initial render of the workspace structure
   */
  private render() {
    this.innerHTML = `
      <div class="workspace">
        <aside class="sidebar">
          <div class="sidebar-header">
            <h1 class="sidebar-title">${this.title}</h1>
          </div>
          <div class="sidebar-content">
            <project-list></project-list>
          </div>
          <div class="sidebar-hints">
            <div class="hint">Right-click to pan</div>
            <div class="hint">Press 'C' to open GitHub issue</div>
            <div class="hint">Press 'T' to toggle markers</div>
          </div>
          <div class="sidebar-footer"></div>
          <div class="sidebar-resize-handle"></div>
        </aside>
        <button class="sidebar-toggle" title="Toggle sidebar">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
        </button>
        <main class="viewer-area">
          <viewer-panel></viewer-panel>
        </main>
      </div>
    `;

    // Get references to child components
    this.projectList = this.querySelector('project-list') as ProjectList;
    this.viewerPanel = this.querySelector('viewer-panel') as ViewerPanel;
  }
}

// Register custom element
customElements.define('workspace-app', WorkspaceApp);

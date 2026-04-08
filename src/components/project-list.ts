/**
 * Project list component - displays navigation sidebar
 */

import { Marked } from "marked";
import { baseUrl } from "marked-base-url";
import DOMPurify from "dompurify";
import type { ProjectMetadata, GitInfo } from "../lib/project-index.js";
import { router } from "../lib/router.js";
import { isSafeUrl, githubIcon } from "../lib/html-utils.js";

export class ProjectList extends HTMLElement {
  private projects: ProjectMetadata[] = [];
  private selectedProjectId: string | null = null;
  private viewMode: "list" | "detail" = "list";
  private gitInfo: GitInfo | null = null;

  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
  }

  /**
   * Set git info for building GitHub links
   */
  setGitInfo(git: GitInfo) {
    this.gitInfo = git;
  }

  /**
   * Set the list of projects to display
   */
  setProjects(projects: ProjectMetadata[]) {
    this.projects = projects;
    this.render();
  }

  /**
   * Set the currently selected project
   */
  setSelectedProject(projectId: string | null) {
    this.selectedProjectId = projectId;
    // Switch to detail view when a project is selected
    this.viewMode = projectId ? "detail" : "list";
    this.render();
  }

  /**
   * Return to project list view
   */
  private showProjectList() {
    this.viewMode = "list";
    this.selectedProjectId = null;
    router.navigate("/");
  }

  /**
   * Handle project click
   */
  private handleProjectClick(projectId: string) {
    router.navigate("/project", projectId);
  }

  /**
   * Render the project list
   */
  private render() {
    if (this.projects.length === 0) {
      this.innerHTML = `
        <div class="empty">
          <p>No projects found</p>
        </div>
      `;
      return;
    }

    // Render based on view mode
    if (this.viewMode === "detail" && this.selectedProjectId) {
      this.renderDetailView();
    }
  }

  /**
   * Render the project detail view
   */
  private renderDetailView() {
    const project = this.projects.find((p) => p.id === this.selectedProjectId);
    if (!project) {
      return;
    }

    // Format dates
    const formatDate = (isoDate?: string) => {
      if (!isoDate) return "Unknown";
      const date = new Date(isoDate);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    };

    const badges = [];
    if (project.schematics.length > 0) {
      badges.push(`<span class="badge badge-sch">Sch</span>`);
    }
    if (project.pcb) {
      badges.push(`<span class="badge badge-pcb">PCB</span>`);
    }

    const downloadBtn = project.zip
      ? `
      <a href="${project.zip}" download class="download-btn" title="Download project">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
      </a>
    `
      : "";

    const html = `
      <div class="project-detail">
        <button class="back-button">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
          Back to all projects
        </button>

        <div class="project-item selected">
          <div class="project-name">${project.name}</div>
          <div class="project-actions">
            <div class="project-badges">${badges.join(" ")}</div>
            ${downloadBtn}
          </div>
        </div>

        <div class="detail-meta">
          <div class="detail-meta-item">
            <span class="meta-label">Created:</span>
            <span class="meta-value">${formatDate(project.createdAt)}</span>
          </div>
          <div class="detail-meta-item">
            <span class="meta-label">Last Updated:</span>
            <span class="meta-value">${formatDate(project.updatedAt)}</span>
          </div>
        </div>

        ${
          project.readme
            ? (() => {
                const readmeUrl = this.getProjectUrl(project);
                return `
          <div class="detail-section">
            <div class="detail-section-header">
              <h3>Documentation</h3>
              ${
                readmeUrl
                  ? `
                <a href="${readmeUrl}"
                   target="_blank"
                   rel="noopener"
                   class="github-link"
                   title="View on GitHub/GitLab">
                  ${githubIcon(14)}
                </a>
              `
                  : ""
              }
            </div>
            <div class="detail-readme">${this.renderMarkdown(project.readme, project.path)}</div>
          </div>
        `;
              })()
            : ""
        }
      </div>
    `;
    this.innerHTML = DOMPurify.sanitize(html);

    // Add back button listener
    const backButton = this.querySelector(".back-button");
    if (backButton) {
      backButton.addEventListener("click", () => {
        this.showProjectList();
      });
    }
  }

  /**
   * Get remote URL for a project (handles submodules)
   */
  private getProjectUrl(project: ProjectMetadata): string | null {
    const git = project.git || this.gitInfo;
    if (!git?.repoUrl || !git?.commitHash) {
      return null;
    }

    if (!isSafeUrl(git.repoUrl)) {
      console.warn("Invalid URL protocol in git.repoUrl:", git.repoUrl);
      return null;
    }

    // Build the URL - works for both GitHub and GitLab
    // Note: These values are escaped when inserted into HTML
    return `${git.repoUrl}/-/tree/${git.commitHash}/`;
  }

  /**
   * Render markdown content (used for live doc display)
   */
  private renderMarkdown(markdown: string, projectPath: string): string {
    // Create new instance to avoid global scope issues on project change
    const marked = new Marked();
    marked.use(baseUrl(`${projectPath}/`));
    const html = marked.parse(markdown) as string;

    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "br",
        "strong",
        "em",
        "code",
        "pre",
        "a",
        "img",
        "ul",
        "ol",
        "li",
        "blockquote",
      ],
      ALLOWED_ATTR: ["href", "src", "alt", "title", "target", "rel"],
      ALLOW_DATA_ATTR: false,
    });
  }

  /**
   * Render a single project item
   */
  private renderProjectItem(project: ProjectMetadata): string {
    const isSelected = project.id === this.selectedProjectId;
    const selectedClass = isSelected ? " selected" : "";

    const badges = [];
    if (project.schematics.length > 0) {
      badges.push(`<span class="badge badge-sch">Sch</span>`);
    }
    if (project.pcb) {
      badges.push(`<span class="badge badge-pcb">PCB</span>`);
    }

    const downloadBtn = project.zip
      ? `
      <a href="${project.zip}" download class="download-btn" title="Download project">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
      </a>
    `
      : "";

    return `
      <li class="project-item${selectedClass}" data-project-id="${project.id}">
        <div class="project-name">${project.name}</div>
        <div class="project-actions">
          <div class="project-badges">${badges.join(" ")}</div>
          ${downloadBtn}
        </div>
      </li>
    `;
  }
}

// Register custom element
customElements.define("project-list", ProjectList);

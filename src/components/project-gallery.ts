/**
 * Project gallery component - displays projects in a card grid layout
 */

import DOMPurify from "dompurify";
import type { ProjectMetadata, GitInfo } from "../lib/project-index.js";
import { router } from "../lib/router.js";
import { githubIcon, isSafeUrl } from "../lib/html-utils.js";

export class ProjectGallery extends HTMLElement {
  private projects: ProjectMetadata[] = [];
  private title: string = "Projects";
  private gitInfo: GitInfo | null = null;

  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
  }

  /**
   * Set the list of projects to display
   */
  setProjects(projects: ProjectMetadata[], title?: string) {
    this.projects = projects;
    if (title) {
      this.title = title;
    }
    this.render();
  }

  /**
   * Set git info for the repository link
   */
  setGitInfo(gitInfo: GitInfo | null) {
    this.gitInfo = gitInfo;
    this.render();
  }

  /**
   * Handle project card click
   */
  private handleProjectClick(projectId: string) {
    router.navigate("/project", projectId);
  }

  /**
   * Render the gallery
   */
  private render() {
    if (this.projects.length === 0) {
      this.innerHTML = `
        <div class="gallery-empty">
          <div class="gallery-empty-icon">
            <svg viewBox="0 0 24 24" width="64" height="64" fill="currentColor" opacity="0.3">
              <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
            </svg>
          </div>
          <p>No projects found</p>
        </div>
      `;
      return;
    }

    // Build GitHub link if available
    let githubLink = "";
    if (this.gitInfo?.repoUrl && isSafeUrl(this.gitInfo.repoUrl)) {
      githubLink = `
        <a href="${this.gitInfo.repoUrl}" target="_blank" rel="noopener" class="gallery-github-link" title="View on GitHub">
          ${githubIcon(20)}
        </a>
      `;
    }

    const html = `
      <div class="gallery">
        <div class="gallery-header">
          <div class="gallery-title-row">
            <h2>${DOMPurify.sanitize(this.title)}</h2>
            ${githubLink}
          </div>
          <span class="gallery-count">${this.projects.length} project${this.projects.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="gallery-grid">
          ${this.projects.map((project) => this.renderProjectCard(project)).join("")}
        </div>
      </div>
    `;

    this.innerHTML = DOMPurify.sanitize(html);

    // Create kicanvas-embed elements for each card preview
    this.querySelectorAll(".card-preview").forEach((previewEl) => {
      const projectId = previewEl.getAttribute("data-preview");
      if (!projectId) return;

      const project = this.projects.find((p) => p.id === projectId);
      if (!project) return;

      const embed = document.createElement("kicanvas-embed");
      embed.setAttribute("controls", "none");
      embed.className = "card-kicanvas";

      // Prefer PCB, otherwise use first schematic
      const fileToShow = project.pcb || project.schematics[0]?.path;
      if (fileToShow) {
        const source = document.createElement("kicanvas-source");
        source.setAttribute("src", fileToShow);
        embed.appendChild(source);
      }

      // Insert embed before download button (if it exists)
      const downloadBtn = previewEl.querySelector(".card-download");
      if (downloadBtn) {
        previewEl.insertBefore(embed, downloadBtn);
      } else {
        previewEl.appendChild(embed);
      }
    });

    this.querySelectorAll(".project-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        // Don't navigate if clicking on download button
        const target = e.target as HTMLElement;
        if (target.closest("[data-download]")) {
          return;
        }

        const projectId = card.getAttribute("data-project-id");
        if (projectId) {
          this.handleProjectClick(projectId);
        }
      });
    });
  }

  /**
   * Render a single project card
   */
  private renderProjectCard(project: ProjectMetadata): string {
    const badges = [];
    if (project.schematics.length > 0) {
      badges.push(`<span class="badge badge-sch">Sch</span>`);
    }
    if (project.pcb) {
      badges.push(`<span class="badge badge-pcb">PCB</span>`);
    }

    // Add download button if zip exists
    const downloadButton = project.zip
      ? `<a href="${project.zip}" download class="card-download" title="Download project files" data-download>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/>
          </svg>
        </a>`
      : "";

    return `
      <div class="project-card" data-project-id="${project.id}">
        <div class="card-preview" data-preview="${project.id}">
          ${downloadButton}
        </div>
        <div class="card-content">
          <div class="card-name">${project.name}</div>
          <div class="card-badges">${badges.join(" ")}</div>
        </div>
      </div>
    `;
  }
}

// Register custom element
customElements.define("project-gallery", ProjectGallery);

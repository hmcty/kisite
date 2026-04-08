/**
 * Project gallery component - displays projects in a card grid layout
 */

import DOMPurify from "dompurify";
import type { ProjectMetadata, GitInfo } from "../lib/project-index.js";
import { router } from "../lib/router.js";
import {
  githubIcon,
  isSafeUrl,
  copyIcon,
  checkIcon,
} from "../lib/html-utils.js";

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
   * Format an ISO date string to a human-readable format
   */
  private formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  /**
   * Copy text to clipboard and show feedback
   */
  private async copyToClipboard(text: string, button: HTMLElement) {
    try {
      await navigator.clipboard.writeText(text);
      const originalHtml = button.innerHTML;
      button.innerHTML = checkIcon(14);
      button.classList.add("copied");
      setTimeout(() => {
        button.innerHTML = originalHtml;
        button.classList.remove("copied");
      }, 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
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
          ${githubIcon(24)}
        </a>
      `;
    }

    // Build clone URL row if available
    let cloneUrlRow = "";
    if (this.gitInfo?.repoUrl && isSafeUrl(this.gitInfo.repoUrl)) {
      const cloneUrl = `${this.gitInfo.repoUrl}.git`;
      cloneUrlRow = `
        <div class="gallery-clone-row">
          <code class="gallery-clone-url">git clone ${cloneUrl}</code>
          <button class="gallery-copy-btn" data-copy="${cloneUrl}" title="Copy clone URL">
            ${copyIcon(14)}
          </button>
        </div>
      `;
    }

    // Build last updated row if available
    let lastUpdatedRow = "";
    if (this.gitInfo?.commitDate) {
      const formattedDate = this.formatDate(this.gitInfo.commitDate);
      lastUpdatedRow = `<span class="separator">•</span><span class="gallery-updated">Last Updated: ${formattedDate}</span>`;
    }

    const html = `
      <div class="gallery">
        <div class="gallery-header">
          <div class="gallery-top-row">
            <div class="gallery-title-row">
              <h2>${DOMPurify.sanitize(this.title)}</h2>
              ${githubLink}
            </div>
            ${cloneUrlRow}
          </div>
          <div class="gallery-meta">
            <span class="gallery-count">${this.projects.length} project${this.projects.length !== 1 ? "s" : ""}</span>
            ${lastUpdatedRow}
          </div>
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

    // Add copy button event listener
    const copyBtn = this.querySelector(".gallery-copy-btn") as HTMLElement;
    if (copyBtn) {
      const copyUrl = copyBtn.getAttribute("data-copy");
      if (copyUrl) {
        copyBtn.addEventListener("click", () => {
          this.copyToClipboard(copyUrl, copyBtn);
        });
      }
    }
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

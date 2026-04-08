/**
 * Viewer panel component - wraps KiCanvas embed element
 */

import type { ProjectMetadata, GitInfo } from "../lib/project-index.js";
import { router, type ViewPosition, type MarkerBounds } from "../lib/router.js";
import { MARKER, TOAST } from "../lib/constants.js";
import { githubIcon } from "../lib/html-utils.js";
import { ProjectGallery } from "./project-gallery.js";

interface MousePosition {
  x: number;
  y: number;
}

export class ViewerPanel extends HTMLElement {
  private currentEmbed: HTMLElement | null = null;
  private mousePosition: MousePosition = { x: 0, y: 0 };
  private gitInfo: GitInfo | null = null;
  private markerId: number | null = null;
  private projects: ProjectMetadata[] = [];
  private title: string = "Projects";

  constructor() {
    super();
  }

  connectedCallback() {
    console.log("ViewerPanel connected to DOM");
    this.render();
    this.setupEventListeners();
  }

  /**
   * Set git info for GitHub issue links
   */
  setGitInfo(git: GitInfo) {
    this.gitInfo = git;
  }

  /**
   * Set projects for the gallery view
   */
  setProjects(projects: ProjectMetadata[], title?: string) {
    this.projects = projects;
    if (title) {
      this.title = title;
    }
  }

  /**
   * Load a project in the viewer
   */
  loadProject(
    project: ProjectMetadata,
    position?: ViewPosition,
    marker?: import("../lib/router.js").MarkerBounds,
  ) {
    // Cleanup previous marker
    this.clearMarker();

    // Clear existing content
    this.innerHTML = "";

    // Create container for viewer and toolbar
    const container = document.createElement("div");
    container.className = "viewer-container";

    // Create kicanvas-embed element
    const embed = document.createElement("kicanvas-embed");
    embed.setAttribute("controls", "full");

    // Add project file as a source
    if (project.projectFile) {
      this.addSource(embed, project.projectFile);
    }

    // Add all schematic files
    for (const schematic of project.schematics) {
      this.addSource(embed, schematic.path);
    }

    // Add PCB if exists
    if (project.pcb) {
      this.addSource(embed, project.pcb);
    }

    container.appendChild(embed);

    this.appendChild(container);
    this.currentEmbed = embed;

    // Recreate context menu (it was cleared with innerHTML)
    this.createContextMenu();

    // Setup event listeners
    this.setupViewerEvents(embed, position, marker);
  }

  /**
   * Setup event listeners
   */
  private setupViewerEvents(
    embed: HTMLElement,
    position?: ViewPosition,
    marker?: import("../lib/router.js").MarkerBounds,
  ) {
    // Track mouse position
    embed.addEventListener("kicanvas:mousemove", ((e: CustomEvent) => {
      this.mousePosition = {
        x: e.detail.x,
        y: e.detail.y,
      };
    }) as EventListener);

    // Pan to position after load
    if (position) {
      embed.addEventListener(
        "kicanvas:load",
        () => {
          this.panToPosition(position, marker);
        },
        { once: true },
      );
    }
  }

  /**
   * Pan viewer to a specific position and optionally show marker
   */
  private panToPosition(
    position: ViewPosition,
    marker?: import("../lib/router.js").MarkerBounds,
  ) {
    try {
      // Switch to the specified file if needed
      if (position.file && position.file !== "pcb") {
        // Schematic sheet - need to switch to it first
        const shadowRoot = this.currentEmbed?.shadowRoot;
        if (shadowRoot) {
          const schematicApp = shadowRoot.querySelector("kc-schematic-app");
          if (schematicApp && (schematicApp as any).project) {
            const project = (schematicApp as any).project;
            console.log(
              "Switching to sheet:",
              position.file,
              "current:",
              project.active_page?.project_path,
            );

            // Always set the active page to ensure we're on the right sheet
            project.set_active_page(position.file);

            // Wait for the sheet to load and viewer to be ready
            setTimeout(
              () => this.doPanAndMarker(position, marker, "schematic"),
              300,
            );
            return;
          }
        }
      }

      // PCB or no file specified - use currently active viewer
      this.doPanAndMarker(
        position,
        marker,
        position.file === "pcb" ? "pcb" : null,
      );
    } catch (e) {
      console.warn("Failed to pan to position:", e);
    }
  }

  /**
   * Actually perform the pan and add marker
   */
  private doPanAndMarker(
    position: ViewPosition,
    marker?: import("../lib/router.js").MarkerBounds,
    preferredType?: "schematic" | "pcb" | null,
  ) {
    const viewer = this.getViewer(preferredType);
    if (!viewer) {
      console.warn("No viewer found for type:", preferredType);
      return;
    }

    try {
      console.log("Adding marker to viewer at", position.x, position.y);
      viewer.viewport.camera.center.set(position.x, position.y);
      viewer.viewport.camera.zoom = position.zoom;
      viewer.draw();

      // Add marker if specified
      if (marker) {
        // Draw bounding box with arrow pointing to center
        const centerX = marker.x + marker.width / 2;
        const centerY = marker.y + marker.height / 2;

        console.log("Adding marker at center:", centerX, centerY);
        // Add arrow marker at center of bounding box
        this.markerId = viewer.addMarker(centerX, centerY, MARKER.STYLE);
      } else {
        // No marker specified, just add a simple arrow at the center
        this.markerId = viewer.addMarker(position.x, position.y, MARKER.STYLE);
      }
    } catch (e) {
      console.warn("Failed to do pan and marker:", e);
    }
  }

  /**
   * Clear any active marker
   */
  private clearMarker() {
    if (this.markerId !== null) {
      const viewer = this.getViewer();
      if (viewer) {
        viewer.removeMarker(this.markerId);
      }
      this.markerId = null;
    }
  }

  /**
   * Toggle visibility of all markers
   */
  private toggleMarkersVisible() {
    const viewer = this.getViewer();
    if (!viewer) return;

    try {
      const visible = viewer.toggleMarkersVisible();
      this.showToast(visible ? "Markers shown" : "Markers hidden");
    } catch (e) {
      console.warn("Failed to toggle markers:", e);
    }
  }

  /**
   * Get the current viewer instance
   */
  private getViewer(preferredType?: "schematic" | "pcb" | null): any {
    if (!this.currentEmbed) return null;

    const shadowRoot = this.currentEmbed.shadowRoot;
    if (!shadowRoot) return null;

    // If a specific type is requested, return that viewer
    if (preferredType === "pcb") {
      const boardApp = shadowRoot.querySelector("kc-board-app");
      if (boardApp && (boardApp as any).viewer) {
        return (boardApp as any).viewer;
      }
      return null;
    }

    if (preferredType === "schematic") {
      const schematicApp = shadowRoot.querySelector("kc-schematic-app");
      if (schematicApp && (schematicApp as any).viewer) {
        return (schematicApp as any).viewer;
      }
      return null;
    }

    // No preference - check which is visible
    // Try board viewer first, then schematic
    const boardApp = shadowRoot.querySelector("kc-board-app");
    if (boardApp) {
      const style = window.getComputedStyle(boardApp);
      if (style.display !== "none" && (boardApp as any).viewer) {
        return (boardApp as any).viewer;
      }
    }

    const schematicApp = shadowRoot.querySelector("kc-schematic-app");
    if (schematicApp) {
      const style = window.getComputedStyle(schematicApp);
      if (style.display !== "none" && (schematicApp as any).viewer) {
        return (schematicApp as any).viewer;
      }
    }

    return null;
  }

  /**
   * Get the current file identifier (for URL tracking)
   */
  private getCurrentFile(): string | null {
    if (!this.currentEmbed) return null;

    const shadowRoot = this.currentEmbed.shadowRoot;
    if (!shadowRoot) return null;

    // Check if board app is visible and has a viewer
    const boardApp = shadowRoot.querySelector("kc-board-app");
    if (boardApp) {
      const style = window.getComputedStyle(boardApp);
      if (style.display !== "none" && (boardApp as any).viewer) {
        return "pcb";
      }
    }

    // Check if schematic app is visible and has active page
    const schematicApp = shadowRoot.querySelector("kc-schematic-app");
    if (schematicApp) {
      const style = window.getComputedStyle(schematicApp);
      if (
        style.display !== "none" &&
        (schematicApp as any).project?.active_page
      ) {
        const activePage = (schematicApp as any).project.active_page;
        console.log("Current active page:", activePage.project_path);
        // Return the project_path which uniquely identifies the sheet
        return activePage.project_path || null;
      }
    }

    return null;
  }

  /**
   * Get current view position
   */
  private getCurrentPosition(): ViewPosition | null {
    const viewer = this.getViewer();
    if (!viewer) return null;

    try {
      const file = this.getCurrentFile();
      return {
        x: viewer.viewport.camera.center.x,
        y: viewer.viewport.camera.center.y,
        zoom: viewer.viewport.camera.zoom,
        file: file || undefined,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Setup event listeners for keyboard shortcuts
   */
  private setupEventListeners() {
    console.log("Setting up event listeners");
    this.createContextMenu();

    // Use keyboard shortcut instead: 'C' key to open context menu
    let lastMouseX = 0;
    let lastMouseY = 0;

    // Track screen mouse position
    document.addEventListener("mousemove", (e: MouseEvent) => {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });

    document.addEventListener("keydown", (e: KeyboardEvent) => {
      console.log("Keydown event:", e.key);
      const key = e.key.toLowerCase();

      // Press 'C' to open context menu at mouse position
      if (key === "c") {
        if (!this.currentEmbed) {
          console.log("No embed loaded, cannot show context menu");
          return;
        }
        e.preventDefault();
        this.showContextMenu(lastMouseX, lastMouseY);
      }

      if (key === "t") {
        if (!this.currentEmbed) return;
        e.preventDefault();
        this.toggleMarkersVisible();
      }
    });

    document.addEventListener("click", () => {
      this.closeContextMenu();
    });
  }

  /**
   * Create context menu element
   */
  private createContextMenu() {
    // Remove old menu if exists
    const oldMenu = this.querySelector(".context-menu");
    if (oldMenu) oldMenu.remove();

    // Create context menu element
    const menu = document.createElement("div");
    menu.className = "context-menu hidden";
    menu.innerHTML = `
      <button class="context-menu-item" data-action="copy">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
        </svg>
        Copy location link
      </button>
      <button class="context-menu-item" data-action="github">
        ${githubIcon(16)}
        Open GitHub Issue
      </button>
    `;
    this.appendChild(menu);

    // Setup menu item click handlers
    menu
      .querySelector('[data-action="copy"]')!
      .addEventListener("click", (e) => {
        e.stopPropagation();
        this.copyLocationLink();
        this.closeContextMenu();
      });

    menu
      .querySelector('[data-action="github"]')!
      .addEventListener("click", (e) => {
        e.stopPropagation();
        this.openGitHubIssue();
        this.closeContextMenu();
      });
  }

  /**
   * Show context menu at position
   */
  private showContextMenu(x: number, y: number) {
    const menu = this.querySelector(".context-menu") as HTMLElement;
    if (!menu) {
      console.error("Context menu element not found!");
      return;
    }

    // Position menu
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove("hidden");

    // Adjust if menu goes off screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${y - rect.height}px`;
    }
  }

  /**
   * Close context menu
   */
  private closeContextMenu() {
    const menu = this.querySelector(".context-menu");
    menu?.classList.add("hidden");
  }

  /**
   * Creates marker at current mouse position and returns URL.
   */
  private createLocationMarker(): string {
    const position = this.getCurrentPosition();
    if (!position) {
      console.warn("No viewer position available");
      return;
    }

    // Get mouse position directly from viewer instead of relying on events
    const viewer = this.getViewer();
    if (!viewer || !viewer.mouse_position) {
      console.warn("No viewer mouse position available");
      return;
    }

    const mousePos = {
      x: viewer.mouse_position.x,
      y: viewer.mouse_position.y,
    };
    console.log("Mouse position for marker:", mousePos);

    // Create a marker bounds around current mouse position
    const marker: MarkerBounds = {
      x: mousePos.x - MARKER.SIZE / 2,
      y: mousePos.y - MARKER.SIZE / 2,
      width: MARKER.SIZE,
      height: MARKER.SIZE,
    };
    console.log("Marker bounds:", marker);

    // Add temporary marker to show what will be shared
    const centerX = marker.x + marker.width / 2;
    const centerY = marker.y + marker.height / 2;

    const tempMarkerId = viewer.addMarker(centerX, centerY, MARKER.STYLE);

    // Remove temporary marker after configured duration
    setTimeout(() => {
      viewer.removeMarker(tempMarkerId);
    }, MARKER.TEMP_DURATION);

    return router.buildPositionUrl(position, marker);
  }

  /**
   * Copy location link to clipboard
   */
  private async copyLocationLink() {
    const url = this.createLocationMarker();
    try {
      await navigator.clipboard.writeText(url);
      this.showToast("Link copied to clipboard");
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  }

  /**
   * Open GitHub issue with location link
   */
  private openGitHubIssue() {
    const url = this.createLocationMarker();
    const route = router.getCurrentRoute();

    // Build GitHub issue URL
    const title = encodeURIComponent(`Review: ${route.projectId || "Project"}`);
    const body = encodeURIComponent(
      `## Location\n\n[View in workspace](${url})\n\n## Comment\n\n`,
    );

    if (this.gitInfo?.repoUrl) {
      const issueUrl = `${this.gitInfo.repoUrl}/issues/new?title=${title}&body=${body}`;
      window.open(issueUrl, "_blank");
    } else {
      // Fallback: just copy the link
      this.copyLocationLink();
    }
  }

  /**
   * Show a toast notification
   */
  private showToast(message: string) {
    const existing = this.querySelector(".toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    this.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), TOAST.FADE_DURATION);
    }, TOAST.DURATION);
  }

  /**
   * Add a file source to the kicanvas embed
   */
  private addSource(embed: HTMLElement, src: string) {
    const source = document.createElement("kicanvas-source");
    source.setAttribute("src", src);
    embed.appendChild(source);
  }

  /**
   * Show project gallery when no project is selected
   */
  showWelcome() {
    this.currentEmbed = null;
    this.clearMarker();

    // Show gallery instead of simple welcome message
    this.innerHTML = "";
    const gallery = document.createElement("project-gallery");
    this.appendChild(gallery);

    // Wait for next tick to ensure custom element is upgraded
    requestAnimationFrame(() => {
      if (gallery instanceof ProjectGallery) {
        gallery.setGitInfo(this.gitInfo);
        gallery.setProjects(this.projects, this.title);
      }
    });
  }

  /**
   * Show error message
   */
  showError(message: string) {
    this.currentEmbed = null;
    this.clearMarker();
    this.innerHTML = `
      <div class="error">
        <h3>Error</h3>
        <p>${message}</p>
      </div>
    `;
  }

  /**
   * Initial render
   */
  private render() {
    this.showWelcome();
  }
}

// Register custom element
customElements.define("viewer-panel", ViewerPanel);

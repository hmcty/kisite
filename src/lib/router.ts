/**
 * Simple hash-based router for navigating between projects
 */

export interface ViewPosition {
  x: number;
  y: number;
  zoom: number;
  file?: string; // Which file to view (schematic sheet UUID or 'pcb')
}

export interface MarkerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Route {
  path: string;
  projectId?: string;
  position?: ViewPosition;
  marker?: MarkerBounds;
}

export type RouteChangeHandler = (route: Route) => void;

export class Router {
  private handlers: Set<RouteChangeHandler> = new Set();

  constructor() {
    // Listen for hash changes
    window.addEventListener("hashchange", () => this.handleHashChange());

    // Handle initial route
    this.handleHashChange();
  }

  /**
   * Parse the current hash and notify handlers
   */
  private handleHashChange() {
    const route = this.parseHash();
    this.notifyHandlers(route);
  }

  /**
   * Parse hash into a Route object
   */
  private parseHash(): Route {
    const hash = window.location.hash.slice(1); // Remove #

    if (!hash || hash === "/") {
      return { path: "/" };
    }

    // Split path and query string
    const [pathPart, queryString] = hash.split("?");

    // Parse query params for position and marker
    let position: ViewPosition | undefined;
    let marker: MarkerBounds | undefined;
    if (queryString) {
      const params = new URLSearchParams(queryString);

      // View position
      const x = params.get("x");
      const y = params.get("y");
      const zoom = params.get("zoom");
      const file = params.get("file");
      if (x !== null && y !== null) {
        position = {
          x: parseFloat(x),
          y: parseFloat(y),
          zoom: zoom ? parseFloat(zoom) : 1,
          file: file || undefined,
        };
      }

      // Marker bounds
      const mx = params.get("mx");
      const my = params.get("my");
      const mw = params.get("mw");
      const mh = params.get("mh");
      if (mx !== null && my !== null && mw !== null && mh !== null) {
        marker = {
          x: parseFloat(mx),
          y: parseFloat(my),
          width: parseFloat(mw),
          height: parseFloat(mh),
        };
      }
    }

    // Parse #/project/{projectId}
    const projectMatch = pathPart.match(/^\/project\/(.+)$/);
    if (projectMatch) {
      return {
        path: "/project",
        projectId: decodeURIComponent(projectMatch[1]),
        position,
        marker,
      };
    }

    return { path: pathPart, position, marker };
  }

  /**
   * Navigate to a route
   */
  navigate(
    path: string,
    projectId?: string,
    position?: ViewPosition,
    marker?: MarkerBounds,
  ) {
    let hash: string;
    if (projectId) {
      hash = `/project/${encodeURIComponent(projectId)}`;
    } else {
      hash = path;
    }

    if (position) {
      const params: string[] = [];
      params.push(`x=${position.x.toFixed(2)}`);
      params.push(`y=${position.y.toFixed(2)}`);
      params.push(`zoom=${position.zoom.toFixed(2)}`);
      if (position.file) {
        params.push(`file=${encodeURIComponent(position.file)}`);
      }
      if (marker) {
        params.push(`mx=${marker.x.toFixed(2)}`);
        params.push(`my=${marker.y.toFixed(2)}`);
        params.push(`mw=${marker.width.toFixed(2)}`);
        params.push(`mh=${marker.height.toFixed(2)}`);
      }
      hash += `?${params.join("&")}`;
    }

    window.location.hash = `#${hash}`;
  }

  /**
   * Build a URL for the current route with a position and optional marker
   */
  buildPositionUrl(position: ViewPosition, marker?: MarkerBounds): string {
    const route = this.parseHash();
    const base = window.location.href.split("#")[0];
    let hash: string;

    if (route.projectId) {
      hash = `/project/${encodeURIComponent(route.projectId)}`;
    } else {
      hash = route.path;
    }

    const params: string[] = [];
    params.push(`x=${position.x.toFixed(2)}`);
    params.push(`y=${position.y.toFixed(2)}`);
    params.push(`zoom=${position.zoom.toFixed(2)}`);
    if (position.file) {
      params.push(`file=${encodeURIComponent(position.file)}`);
    }
    if (marker) {
      params.push(`mx=${marker.x.toFixed(2)}`);
      params.push(`my=${marker.y.toFixed(2)}`);
      params.push(`mw=${marker.width.toFixed(2)}`);
      params.push(`mh=${marker.height.toFixed(2)}`);
    }

    hash += `?${params.join("&")}`;
    return `${base}#${hash}`;
  }

  /**
   * Register a handler for route changes
   */
  onRouteChange(handler: RouteChangeHandler) {
    this.handlers.add(handler);

    // Immediately call handler with current route
    const route = this.parseHash();
    handler(route);
  }

  /**
   * Unregister a route change handler
   */
  offRouteChange(handler: RouteChangeHandler) {
    this.handlers.delete(handler);
  }

  /**
   * Notify all handlers of a route change
   */
  private notifyHandlers(route: Route) {
    for (const handler of this.handlers) {
      handler(route);
    }
  }

  /**
   * Get the current route
   */
  getCurrentRoute(): Route {
    return this.parseHash();
  }
}

// Export singleton instance
export const router = new Router();

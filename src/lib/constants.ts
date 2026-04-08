/**
 * Application-wide constants
 */

/**
 * Sidebar configuration
 */
export const SIDEBAR = {
  /** Minimum width in pixels */
  MIN_WIDTH: 200,
  /** Maximum width in pixels */
  MAX_WIDTH: 600,
  /** Default width in pixels */
  DEFAULT_WIDTH: 300,
  /** LocalStorage key for saved width */
  STORAGE_KEY: "sidebar-width",
} as const;

/**
 * Toast notification duration
 */
export const TOAST = {
  /** Duration to show toast in milliseconds */
  DURATION: 2000,
  /** Fade out animation duration in milliseconds */
  FADE_DURATION: 300,
} as const;

/**
 * Marker configuration for position sharing
 */
export const MARKER = {
  /** Size of marker bounding box */
  SIZE: 4,
  /** Duration to show temporary marker in milliseconds */
  TEMP_DURATION: 3000,
  /** Marker visual properties */
  STYLE: {
    color: "rgba(255, 68, 68, 0.7)",
    radius: 1.5,
    strokeWidth: 0.3,
    shape: "arrow" as const,
  },
} as const;

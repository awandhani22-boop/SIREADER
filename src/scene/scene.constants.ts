/**
 * Centralized 3D Scene Constants, Palette, and Isometric Camera Configuration
 * Follows Skill 02 (Three.js & R3F) and Skill 03 (Futuristic Virtual Office Design).
 */

export const SCENE_COLORS = {
  voidBackground: '#070C18',
  fogColor: '#070C18',
  baseSlab: '#0F172A',
  baseSlabBorder: '#334155',
  corridorFloor: '#162238',
  corridorGridLine: '#0EA5E9',
  wallStructural: '#1E293B',
  wallTrim: '#3B4F73',
  glassPartition: '#38BDF8',
  deskSurface: '#27364F',
  deskFrame: '#131D31',
  chairFabric: '#1E293B',
  monitorBezel: '#0B111E',
  selectionCyan: '#06B6D4',
} as const;

export const ISOMETRIC_CAMERA_DEFAULTS = {
  /** True isometric angle from South-East-Up framing all 7 rooms between UI drawers */
  position: [26, 25, 26] as [number, number, number],
  target: [1.2, 0, 1.0] as [number, number, number],
  defaultZoom: 23.5,
  minZoom: 14,
  maxZoom: 60,
  near: -120,
  far: 220,
} as const;

export const OFFICE_DIMENSIONS = {
  totalWidthX: 38,
  totalDepthZ: 22,
  corridorWidthZ: 4.8,
  wallHeightY: 2.7,
  wallThickness: 0.18,
} as const;

/**
 * Detects software WebGL (SwiftShader / llvmpipe) from the WebGL renderer string
 * so headless browser verification and VDI environments render smoothly without
 * changing scene objects or layout.
 */
export const IS_SOFTWARE_GL: boolean = (() => {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
})();

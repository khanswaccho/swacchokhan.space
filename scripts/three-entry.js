/**
 * The three.js surface this site actually touches.
 *
 * Bundling from this file instead of shipping the full library lets esbuild
 * drop every renderer, loader, geometry, material and control we never call.
 * `npm run build:three` turns this into public/vendor/three.min.js.
 *
 * If you use a new THREE.* export, add it here or the build will omit it and
 * you'll get `undefined is not a constructor` at runtime. `npm run check:three`
 * verifies this list against what public/js actually references.
 */
export {
  // Core
  Scene,
  Group,
  Clock,
  Color,
  Vector3,
  PerspectiveCamera,
  WebGLRenderer,

  // Geometry
  BufferGeometry,
  BufferAttribute,
  PlaneGeometry,

  // Objects
  Mesh,
  Points,
  LineSegments,

  // Materials
  ShaderMaterial,
  MeshBasicMaterial,
  LineBasicMaterial,

  // Textures
  CanvasTexture,

  // Constants
  AdditiveBlending,
  FrontSide,
  BackSide,
  SRGBColorSpace,
  LinearMipmapLinearFilter,
} from 'three';

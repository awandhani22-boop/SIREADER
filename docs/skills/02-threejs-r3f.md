# Skill 02 — Three.js and React Three Fiber

## Mission
Build an interactive and maintainable 3D scene using React 19, Three.js, and React Three Fiber v9.

## Version compatibility
- Pair React 19 with `@react-three/fiber` v9.
- Use a stable Drei release compatible with the selected R3F version.
- Do not install R3F v8 with React 19.
- Do not use R3F v10 alpha for this stable project unless the owner explicitly approves.

## Scene practices
- Use a Canvas root with controlled camera, lighting, and background.
- Prefer orthographic camera for the isometric default; tune position/zoom and target.
- Separate static environment from animated worker meshes.
- Use pointer events with event propagation handled deliberately.
- Use Suspense/loading fallbacks for GLB assets.
- Use `useFrame` for small per-frame animation only; do not push React state updates every frame.
- Use refs and animation mixers for continuous motion.
- Centralize dimensions, colors, and coordinate conventions.

## Acceptance criteria
- Camera starts at a readable isometric view.
- Pan/zoom/reset are usable and do not make the office disappear.
- Clicking a worker selects the correct worker and opens the matching panel.
- No runtime console errors or missing assets in the initial scene.

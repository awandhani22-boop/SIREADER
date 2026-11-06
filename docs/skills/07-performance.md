# Skill 07 — 3D Performance and Optimization

## Mission
Keep the office responsive on a consumer laptop and avoid GPU/memory waste.

## Practices
- Profile before optimizing; report observed FPS and device/browser context when possible.
- Prefer instancing for repeated furniture, lights/props where appropriate.
- Limit dynamic shadows and shadow-map resolution.
- Keep textures compressed and appropriately sized.
- Reuse geometries and materials.
- Use LOD or simpler models for distant characters/objects when useful.
- Avoid re-rendering the full React tree at frame rate.
- Use `useFrame` and refs for animation; keep per-frame work minimal.
- Use demand rendering for static scenes if compatible with animation/state updates.
- Lazy-load large models and show fallbacks.
- Dispose dynamically created geometry, materials, and textures when removed.
- Offer a lower graphics preset and reduced-motion option.

## Acceptance criteria
- Initial office renders without persistent console warnings/errors.
- Interactions remain responsive during worker animations.
- No accidental continuous React state updates in the render loop.
- Heavy asset loading has a visible loading state.

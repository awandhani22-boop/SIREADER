# Skill 04 — Human Character and Animation System

## Mission
Integrate human-like 3D workers with reusable rigs and status-driven animation.

## Asset format
- Prefer GLB/glTF for runtime delivery.
- Use licensed assets only; record source, author, license, and any attribution requirement.
- Inspect model scale, origin, materials, skeleton, and animation clips before integration.
- Avoid loading large source project files into the browser.

## Reusable character architecture
- One `WorkerAvatar` component accepts worker identity, model URL, accent color, and animation state.
- Reuse compatible skeleton/animation sets when possible.
- Distinguish visual identity with clothing/material variations, badges, hair, and accessories.
- Keep animation mapping explicit; inspect clips rather than guessing names.

## Suggested animation states
- IDLE: breathing/standing or seated idle.
- WALKING: walk cycle while transitioning between known positions.
- WORKING: seated typing or focused computer work.
- TALKING: meeting/discussion animation.
- WAITING: subtle waiting pose.
- PAUSED: neutral seated/standing pose.
- ERROR: restrained alert reaction, not exaggerated.
- COMPLETED: subtle completion gesture.

## Movement rules
- Use a simple navigation graph/path between corridor and workstation locations.
- Do not teleport between rooms unless explicitly used as a temporary fallback.
- Do not make workers walk through walls/furniture.
- Keep locomotion speed and rotation smooth.
- If the selected avatar is moving, preserve selection state and panel identity.

## Acceptance criteria
- Every worker is selectable and has an assigned workstation.
- Animation follows worker state.
- Missing animation clips fall back gracefully and are reported.
- No copyrighted or unlicensed character assets are used without permission.

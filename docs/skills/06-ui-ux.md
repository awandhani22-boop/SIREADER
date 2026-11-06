# Skill 06 — UI/UX for Virtual Office

## Mission
Create a professional command-center interface that complements rather than hides the 3D office.

## Core UI regions
- Top bar: SIREADER identity, local demo indicator, simulation controls, settings.
- Main viewport: 3D office.
- Worker detail drawer: identity, status, model/provider placeholder, task, metrics, actions.
- Activity feed: recent task and state transitions.
- Optional department/worker roster that can be collapsed.

## Interaction design
- Clicking a character selects them and opens their detail panel.
- Clicking empty space clears selection when appropriate.
- Selected worker gets a clear visual outline or floor marker.
- Panel updates immediately when selected worker changes.
- Pause/resume/assign task actions include confirmation or clear feedback.

## Visual rules
- Use clear typography and hierarchy.
- Reserve bright accent colors for meaningful status and selection.
- Ensure labels and panel text remain readable over 3D scene.
- Avoid excessive glass blur, glow, and animation that hurt clarity.
- Provide loading, empty, error, and reduced-motion states.

## Responsive behavior
- Desktop is primary target.
- On narrow viewports, collapse side panels and simplify camera controls.
- Do not force the full office scene and full-width panels to overlap.

## Acceptance criteria
- User can understand selected worker and current task without searching.
- All actions are discoverable and accessible outside the canvas.
- No key task depends solely on hover or color.

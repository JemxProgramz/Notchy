# Notchy — Completed Improvements

This file records the concrete work done against `IMPROVEMENT_TASKS.md`
(Phase 1: Notch experience). Every change below was verified with
`npm run check` and a smoke run of the app (`npx electron .`) that loaded the
renderer without JavaScript errors.

## 1. Collapsed notch

- Added `role="region"` and `aria-label="Notch"` to the island so the collapsed
  pill is announced instead of being an anonymous shape.
- Added a restrained idle hover affordance (`.island:not(.open):not(.peek):hover`)
  for both dark and light themes: a hairline highlight and soft shadow that
  signals "open me" without glowing or shifting layout. Motion still collapses
  under the reduced-motion rules.
- Made the notch recover when its display disappears (see Desktop integration).

Files: `src/renderer/index.html`, `src/renderer/styles.css`, `src/main.js`.

## 2. Expand and dismiss behavior

- **Escape now closes the island.** It unwinds in order: the wireless popover
  first, then the legacy dropdown, then the island itself; blurring any focused
  control so the state stays clean.
- **Keyboard toggle is immediate.** `Ctrl+Shift+Space` now opens or closes
  instantly instead of routing the close through the 350 ms hover-close timer.
- **Fewer accidental dismissals.** The hover-out close is skipped while a
  dropdown or the wireless panel is open, while a slider is being dragged, and
  while a text field inside the island has focus.
- **Fixed a keyboard double-activation bug.** The tile `Enter`/`Space` handler
  called `click()` on real `<button>` tiles that already activate natively, so a
  key press toggled the tile twice (open then instantly close). The handler now
  only synthesizes clicks for non-button `role="button"` elements.

Files: `src/renderer/app.js`, `src/renderer/integrations/windows.js`.

## 3. Quick-panel state integrity (part of hierarchy work)

- The legacy inline renderer repainted the Controls tiles with **sample data**
  (`Home 5G`, `Office`, demo audio outputs) whenever a legacy code path ran, for
  example after the Night Light/theme tiles were clicked. `tiles` is now bound to
  the native `renderTiles`, so every call site keeps real Windows state.
- Wi-Fi, Bluetooth, Night Light, and Notch theme tiles now all have real,
  consistent behavior:
  - Wi-Fi / Bluetooth open their wireless panel (existing).
  - Night Light opens the Windows night light page (the in-app `#night` overlay
    is disabled in this build, so a fake toggle would be dishonest).
  - Notch theme toggles dark/light and saves the setting.
- Wi-Fi and Bluetooth tiles expose `aria-expanded`; the theme tile exposes
  `aria-pressed`.

Files: `src/pages/controls/renderer/index.js`, `src/renderer/integrations/windows.js`.

## 4. Visual and state consistency

- Added shared styling for the new recovery button (`.native-retry`) matching the
  existing small buttons (hover, active, focus-visible).
- Idle hover, focus-visible, loading (spinner), error (toast), unavailable
  (reason text), and pressed states are now distinct and consistent with the
  existing wireless panel styling.

Files: `src/renderer/styles.css`, `src/renderer/native.css`.

## 5. Transitions and reduced motion

- CSS transitions already honored `prefers-reduced-motion`; the **JavaScript
  animations** (Web Animations API) did not. Added an `anim()` helper that skips
  both reduced-motion users and the app's own "Animations off" setting, and
  routed the to-do completion burst and the timer-finish pulse through it.

Files: `src/renderer/app.js`, `src/pages/today/renderer/index.js`.

## 6. Desktop integration

- **Disconnected display handling.** If the display selected for the notch is
  disconnected, the main process now resets `displayId` to the primary display,
  persists it, refreshes the tray, and notifies the renderer, which reloads
  settings and shows a toast. Previously the choice stayed stale.
- The display list reports which entry is the primary display, and the Settings
  select labels it "(Primary)".
- Added the `notch:display:changed` event through the preload bridge.

Files: `src/main.js`, `src/preload.js`, `src/renderer/integrations/windows.js`.

## 7. Keyboard and accessibility

- Arrow keys (`←`/`→`, `Home`, `End`) move between sections when the tab strip
  has focus, and the active tab carries `aria-current="page"`.
- Escape-to-close and immediate keyboard toggle (above).
- `aria-label` on the tab strip ("Notch sections") and island; `aria-pressed`
  on the theme toggle; passwords and wireless switches already had labels.

Files: `src/renderer/index.html`, `src/renderer/app.js`, `src/pages/controls/renderer/index.js`.

## 8. Understandable unavailable controls

- When Windows cannot provide master volume or the display cannot report
  brightness, the Controls panel now states **why** ("no audio output was
  reported", "external monitors often do not support it") and shows a
  **Check again** button that re-queries Windows controls and wireless state.
- The message only appears after the first controls read, so there is no scary
  flash of "unavailable" during startup.

Files: `src/renderer/integrations/windows.js`, `src/renderer/native.css`.

## 9. Lightweight companion

- The system monitor no longer polls on a timer while the notch is closed or the
  Stats tab is not visible; opening Stats refreshes it immediately, and the
  timer only runs while Stats is on screen.

Files: `src/pages/stats/renderer/index.js`, `src/renderer/integrations/windows.js`.

## Verification

- `npm run check` → "Notch source syntax, package metadata, and Windows icon are
  valid."
- `npx electron .` smoke run → renderer loaded with no `Uncaught` /
  `ReferenceError` / `TypeError` output (only the usual dev CSP warning).

## Still open (see IMPROVEMENT_TASKS.md)

- Quick-panel hierarchy could be re-grouped further (for example a separate
  "System" vs "Personal" grouping) — state integrity was fixed here, but the
  information architecture was intentionally left as-is.
- Layout/scaling verification across unusual display scaling levels was not
  re-tested in this pass.
- The later Voice commands phase is untouched, as intended.

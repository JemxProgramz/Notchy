# Notchy Improvement Tasks

## Goal

Polish Notchy into a compact, desktop-native notch and quick-settings experience inspired by Linux desktop panels. Keep the current Windows app and its existing controls as the focus. Voice commands are a later phase.

> Work finished in a pass is checked off here and described in detail in
> [`completed.md`](completed.md).

## Phase 1: Notch experience

- [x] **Refine the collapsed notch.** Make the idle state feel intentional and unobtrusive, with a clear affordance for opening it. Keep it clear of app controls and usable on displays with different top-edge layouts.
- [x] **Make expand and dismiss behavior consistent.** Verify hover, click, and `Ctrl+Shift+Space` behavior; provide a predictable close path and avoid accidental dismissals while the user interacts with a panel.
- [ ] **Clarify the quick-panel hierarchy.** Put frequent system controls first, group related tools, and make navigation between controls, today, stats, clipboard, apps, wallpaper, and power easy to scan. *(State integrity fixed; deeper re-grouping still open.)*
- [x] **Polish visual consistency.** Align spacing, typography, icon weight, corner radii, and contrast across the notch and its panels. Make active, selected, disabled, unavailable, loading, and error states visually distinct.
- [x] **Tune transitions.** Use short, coordinated open, close, and hover animations that keep the panel feeling attached to the top edge. Respect Windows reduced-motion preferences.
- [x] **Improve desktop integration.** Check multi-monitor selection, taskbar placement, display scaling, window focus, always-on-top, click-through, and behavior when the selected display is disconnected.
- [x] **Finish keyboard and accessibility behavior.** Ensure the shortcut works reliably, focus is visible, panels can be navigated and dismissed from the keyboard, and controls have useful accessible names.
- [x] **Make unavailable controls understandable.** Show concise reasons when Windows or a device cannot provide a control, and give the user a clear retry or recovery action when one is available.
- [x] **Keep the companion lightweight.** Stats polling sleeps when inactive, and the media progress animation stops when external playback is paused or idle.
- [x] **Make the media timeline useful.** Keep external playback progress moving smoothly between Windows session updates and allow seeking from both the peek and expanded players when the source supports seeking.
- [ ] **Verify media-session edge cases.** On supported Windows builds, check play/pause, track changes, missing album art, live or unknown duration, and session end so the timeline and idle display stay coherent.

## Phase 1 completion checklist

- [x] The notch opens and closes predictably with pointer and keyboard input.
- [ ] The main controls are easy to find without crowding the compact panel. *(Depends on the hierarchy item above.)*
- [x] Theme, focus, hover, loading, error, and unavailable states are consistent.
- [ ] Layout and interaction remain usable across supported Windows displays and scaling levels. *(Disconnected-display fallback added; unusual scaling levels not re-tested.)*
- [x] Existing system controls continue to report failures clearly when Windows or hardware does not support them.

## Later phase: Voice commands

Keep this out of the current notch-polish milestone. Once the notch experience is stable, plan a separate voice-command milestone covering:

- [ ] Choose a voice activation shortcut and show a clear listening state.
- [ ] Capture speech and turn a small set of supported phrases into commands.
- [ ] Connect commands to existing Notchy actions, starting with low-risk actions such as opening a panel or app.
- [ ] Ask for confirmation before destructive or system-level actions.
- [ ] Explain microphone access, where audio is processed, and how to stop listening.
- [ ] Handle permission, network, recognition, and unsupported-command errors in the UI.

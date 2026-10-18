# Codex Work Log

Updated: 2026-10-18

This file summarizes the project changes made during the Codex collaboration. Detailed UI polish notes from the earlier improvement pass are in [completed.md](completed.md); remaining work is tracked in [IMPROVEMENT_TASKS.md](IMPROVEMENT_TASKS.md).

## Completed changes

### Application structure

- Grouped Controls, Today, Stats, Clipboard, Apps, Wallpaper, Power, and Settings under `src/pages/<page>/`, with each page's renderer and Electron main-process modules together.
- Added shared renderer state and startup modules in `src/renderer/app.js` and `src/renderer/bootstrap.js`; moved Windows/Electron integration into `src/renderer/integrations/windows.js`.
- Split Controls IPC handlers into Wi-Fi, Bluetooth, brightness, volume, wireless, and Windows Settings modules under `src/pages/controls/`; Today task notifications are under `src/pages/today/task/`.
- Grouped native C++ sources beside their Controls features in `src/pages/controls/{wifi,bluetooth,wireless,audio}/native/`. `src/native/binding.gyp` remains the node-gyp entry point and writes generated files to the ignored `src/native/build/` directory.
- Updated renderer script paths, IPC registration, native includes/build sources, `scripts/check.cjs`, and the README architecture tree for the unified page structure.

### Features and UI

- Added an idle hover affordance and accessible region label to the notch.
- Made Escape close open UI in order, made the `Ctrl+Shift+Space` toggle immediate, protected active controls from hover dismissal, and fixed keyboard double activation on button tiles.
- Kept Controls tiles synchronized with actual Windows state; wired Wi-Fi/Bluetooth scanning and connection or pairing, Night Light settings launch, and saved dark/light theme state. Added pressed/expanded accessibility states.
- Added reduced-motion handling for JavaScript animations, clear unavailable-control explanations with retry, and active-tab-only Stats polling.
- Added a fallback to the primary display when the selected display disconnects and labeled the primary display in Settings.
- Removed system uptime from the Stats data and page. Stats reports CPU, GPU, memory, network, top processes, and storage.
- Stats refreshes automatically while its page is open; removed the unnecessary manual refresh button and fixed Stats IPC argument forwarding for process sorting.
- Expanded the Stats storage panel to list all ready fixed drives with drive letters, volume labels, used, available, and total capacity, and per-drive usage bars, including D:. The storage card now stretches with the adjacent process list so there is no empty gap below it.
- Placed Lock, Sleep, Restart, and Shut down in one compact horizontal row on the Power page.
- Fixed the expanded media player title alignment with equal-width side columns, centering the title between the artwork and expand button.
- Limited long media titles to two lines and artist/source details to one ellipsized line in the peek player, keeping the timeline and playback controls visible.
- Aligned previous, play/pause, and next controls in a symmetric three-column row and adjusted vertical spacing so the large center button stays fully inside the player.
- Replaced the external media player's generated waveform with live Windows audio-output levels. Capture and 30 Hz level updates run only while a compatible media session is playing, stop while paused or inactive, and retain only a short in-memory level buffer; audio is not saved.
- Fixed the external media timeline to use Windows session position relative to its timeline start and timestamp, interpolate smoothly between session samples, and seek from both the peek and expanded players when Windows reports seeking support. The range control is keyboard accessible and disabled for unsupported or unknown-duration sessions.
- Made Windows media commands responsive by checking the command pipe frequently while keeping media-state polling throttled; playback state now updates immediately for play/pause with rollback if Windows rejects the command.
- Made seek and previous/next actions update the timeline immediately, holding the optimistic position briefly so an older Windows snapshot cannot move the progress bar back before the session applies the command.
- Limited the media progress animation frame loop to active external playback; it now stops while paused or idle.
- Preserved the Windows native wireless controls and their Wi-Fi scan/connect and Bluetooth scan/pair flows while moving their source files.
- `Build-test/` contains local Windows build output and is excluded by `.gitignore`; source releases do not include installer binaries.

### Documentation

- Updated `README.md` with the renderer and native page structure.
- Documented the external media visualizer's Windows loopback source and its in-memory-only behavior.
- Added `IMPROVEMENT_TASKS.md` for remaining product improvements and `completed.md` for the earlier completed UI pass.
- Added `.editorconfig` for consistent formatting and updated `.gitignore` for build outputs and local-only files.

## Verification record

- `npm run build:native` succeeded after adding the loopback target; both `audio.node` and `wireless.node` compiled.
- `npm.cmd run build` succeeded after the page-source consolidation. Both native addons compiled from the feature-local C++ folders, and the installer, portable app, and unpacked app were refreshed in `Build-test/`.
- Removed the old `Build-test-*` package folders and root `dist/` output after closing the Notch instances that were running from an obsolete package. Future Electron builds target `Build-test/`; AppX output targets `Build-test/appx/`.
- No manual visual runtime check was performed for the Stats screen after this change.
- No manual visual runtime check was performed for the Power screen after this change.
- `completed.md` records an earlier successful `npm run check` and Electron smoke run. Those checks have not been rerun after the latest page-folder and player-alignment changes.
- No runtime visual or interactive playback checks were run after the media player alignment changes.
- No runtime visual or interactive seek check was run for the media timeline update.
- No live-session timing check was run for the media control responsiveness update.
- No live-session seek or previous-track visual check was run for the optimistic timeline update.

## Remaining tracked work

- Finish reviewing the quick-panel hierarchy.
- Check media-session edge cases and unusual Windows display scaling.
- Voice commands remain a separate later phase in `IMPROVEMENT_TASKS.md`.

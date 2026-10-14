<div align="center">
  <img src="assets/notch.png" alt="Notch app icon" width="128" height="128">
  <h1>Notchy</h1>
  <p><strong>A lightweight Windows desktop companion with a Dynamic Island-inspired interface.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4?logo=windows" alt="Windows 10 and 11">
    <img src="https://img.shields.io/badge/runtime-Electron-47848F?logo=electron&logoColor=white" alt="Built with Electron">
    <img src="https://img.shields.io/badge/Node.js-%3E%3D22.12-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22.12 or newer">
    <img src="https://img.shields.io/badge/license-unlicensed-lightgrey" alt="Currently unlicensed">
  </p>
</div>

Notch places a transparent, frameless island at the top of a selected display, bringing system controls and everyday desktop tools into one compact interface. Hover over or click the island to expand it, or use **Ctrl+Shift+Space** to toggle it.

> **Project status:** Notch is under active development. Windows integrations depend on the device, driver, Windows policy, and current session; unsupported controls are reported as unavailable.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Build](#build)
- [Release notes](#release-notes)
- [Architecture](#architecture)
- [Privacy and local data](#privacy-and-local-data)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Features

### Windows controls

- Windows master-volume control through Core Audio.
- Display brightness control when the active display supports the Windows monitor WMI interface.
- Wi-Fi and Bluetooth status, with shortcuts to the corresponding Windows settings pages.
- Windows media-session integration where a compatible session is available.

### Desktop tools

- CPU, memory, disk, network activity, uptime, and top-process metrics.
- Text clipboard history with configurable size and retention limits.
- Start menu application discovery, pinned applications, and an application picker.
- Wallpaper previews, local image imports, and applying an image as the Windows desktop wallpaper.
- Calendar, local tasks and reminders, and Windows notifications while Notch is running.
- Lock, sleep, restart, and shutdown actions; restart and shutdown require confirmation.

### Customization

- Dark and light themes, display selection, and time format.
- Global shortcut, startup preference, always-on-top, and click-through settings.
- Monitoring interval and clipboard-history settings.
- System tray controls and a compact music preview with locally generated audio.

## Requirements

- Windows 10 or Windows 11.
- Node.js **22.12.0 or newer** and npm.

## Getting started

Clone the repository and install the exact dependency versions recorded in the lockfile:

```powershell
git clone https://github.com/<your-username>/Notchy.git
cd Notchy
npm ci
npm run check
npm run dev
```

Replace `<your-username>` with the GitHub account or organization that owns the repository. `npm run check` validates JavaScript syntax, package metadata, renderer wiring, and the Windows icon.

## Build

Create the Windows NSIS installer and portable executable:

```powershell
npm run build
```

Other build targets:

```powershell
npm run build:dir     # Unpacked application directory
npm run build:appx    # Optional, locally signed AppX package
```

Build output is written to `dist/` and is excluded from version control.

The AppX build creates a temporary self-signed signing certificate and removes its private key after the build. The generated certificate and package are local build artifacts. Windows requires trusting the certificate to install that package. The certificate is for local development and evaluation, not public distribution.

The NSIS installer is configured not to require administrator privileges by default. Public installer signing and update delivery require a publisher identity and release infrastructure; Notch does not currently include an update service.

## Release notes

### v1.0.0

- Initial Notchy release for Windows 10 and 11.
- Added the Dynamic Island-inspired desktop interface, system tray, global shortcut, and customization settings.
- Added Windows system controls, desktop metrics, clipboard history, wallpaper tools, app launcher, calendar, tasks, and reminders.
- Added Windows NSIS installer, portable executable, and optional locally signed AppX build.

Downloadable builds are published through GitHub Releases when available. Build locally using the [build instructions](#build).

## Architecture

Notch is an Electron application. The main process owns Windows integrations and application lifecycle; the renderer implements the interface; a restricted preload exposes the approved IPC surface to the renderer.

```text
src/
├── main.js                         Main process and Windows integrations
├── preload.js                      Restricted renderer IPC bridge
├── media.ps1                       Windows media-session helper
└── renderer/
    ├── index.html                  Interface and original renderer
    ├── native-integration.js       Electron/Windows renderer integration
    └── native.css                  Native integration styles
assets/                              Application icons
build/appx/                          AppX package logos
scripts/                             Validation, build, and install helpers
```

## Privacy and local data

- Notch has no account or cloud service and does not send clipboard contents or system metrics to a server.
- Settings and clipboard history are stored in Electron's per-user `userData` directory.
- Tasks, reminders, pinned applications, and wallpaper-selection metadata use Notch's local Chromium storage.
- Clipboard monitoring can be disabled in Settings. When enabled, text clipboard history is collected locally while Notch is running; history can be cleared in Settings.
- Obvious password, token, and private-key text is skipped. This is a best-effort filter, not a guarantee that every sensitive string will be detected.
- Clipboard image history is not implemented. Notifications are delivered only while Notch is running.

## Known limitations

- Brightness adjustment depends on the active display and driver exposing Windows' monitor WMI interface; many external monitors do not.
- GPU utilization is shown only when the installed driver exposes a usable reading. Notch does not estimate missing values.
- Windows owns Wi-Fi and Bluetooth radio enable/disable controls. Notch reports status where available and opens Windows Settings for those controls.
- Media controls depend on a compatible Windows media session being active.
- Display, power, and system-control behavior may be restricted by Windows policy or a remote session.

## Troubleshooting

| Issue | What to try |
| --- | --- |
| The island is hidden | Open Notch from the system tray or press **Ctrl+Shift+Space**. |
| The global shortcut is unavailable | Choose another shortcut in Settings; another application may already have registered it. |
| Brightness is unavailable | Check whether the active display and driver expose Windows monitor brightness controls. |
| GPU utilization is missing | Check driver telemetry support; unavailable readings are not estimated. |
| A wallpaper is not applied | Check Windows desktop-background policy and use a PNG, JPEG, or BMP image. |
| Wi-Fi or Bluetooth cannot be toggled in Notch | Use the Windows Settings page opened by the relevant Notch control. |
| A build cannot replace `Notch.exe` | Close running Notch instances from the project's `dist/` folder, then retry. |

## Contributing

Bug reports and focused pull requests are welcome. Before submitting a change:

1. Keep changes scoped and describe the user-visible impact.
2. Run `npm ci` and `npm run check`.
3. For Windows-specific changes, include the Windows version and relevant device or driver details in the report.
4. Do not include build artifacts, local wallpaper files, credentials, signing certificates, or personal data.

## License

This project currently declares `"license": "UNLICENSED"` in `package.json` and does not include an open-source license. **Do not assume that the source may be reused, modified, or redistributed.** Choose and add a license before inviting external contributions under open-source terms.

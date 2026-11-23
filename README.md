# Luna Music (v0.1)

A modern, lightweight, private browser-based local music player. Luna Music blends a **Spotify-inspired visual experience** with **MusicBee-inspired local folder management**, sharing the visual identity and interaction patterns of **Luna Player**.

Built with React 19, TypeScript, Vite, Tailwind CSS v4, and native Web Audio APIs. Zero backend, zero telemetry, zero uploads.

---

## Highlights

- **100% Local & Private**: No backend, no accounts, no streaming service, and zero track uploads. Audio remains safely on your device.
- **Deep Navy & Light Blue-Grey Themes**: Aligned directly with Luna Player:
  - **Dark Mode**: Deep navy palette (`#071427` to `#102443`), subtle glass surfaces, low-contrast translucent borders, and dynamic ambient artwork glow.
  - **Light Mode**: Solid light-blue-grey background (`#CFDBE7`), subtle `#C7D8E9` borders, and high-contrast dark slate typography.
  - **Theme Toggle**: Accessible `Sun` / `Moon` toggle in the header with local storage persistence.
- **Unified Open Music Split Button**: Single reusable control adhering to platform conventions:
  - **Desktop (Mac/PC)**: Default action opens folder (`showDirectoryPicker` or fallback).
  - **iPad / Mobile**: Default action opens multi-file picker.
  - **Dropdown Menu**: Direct access to Add Folder and Open Files; folder input fallback is selected automatically when the directory-picker API is unavailable.
  - **Display Logic**: Displays prominently in the empty-state center when no music is loaded; moves into a compact split button at the bottom of the sidebar once a library is loaded.
- **First-Class Folder Browsing**: MusicBee-style recursive folder tree navigation, breadcrumbs, subfolder drill-downs, and natural numeric sorting (`Intl.Collator`).
- **Synchronized Local Lyrics (`.lrc`)**: Reads companion `.lrc` files (e.g. `Song.mp3` + `Song.lrc`), auto-scrolls line by line, highlights active lyrics, and allows clicking any lyric line to jump playback to that timestamp.
- **Reliable Audio Playback**: Native HTMLAudioElement playback with play/pause, seek slider, volume/mute, shuffle, repeat (off / all / one), and safe source cleanup.
- **Simplified Playlist/Queue Toggle**: Clean list icon with accessible `aria-pressed` state controlling the Now Playing & Lyrics panel.
- **Unobtrusive Error Handling**: No large red banners; genuine playback failures are presented via dismissible, auto-expiring toast notifications.
- **Dedicated IndexedDB Persistence**: Stores library folder handles, volume, repeat/shuffle preferences, and favourite tracks in a separate `LunaMusicDB` database.

---

## Getting Started

### Prerequisites

Node.js (v18+) and npm.

### Installation & Development

```bash
cd /Users/leo/Projects/luna-music
npm install
npm run dev
```

The development server will start at `http://localhost:5173/`.

### Run Tests

```bash
npm test
```

### Production Build

```bash
npm run build
```

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` | Play / Pause audio |
| `←` / `→` | Seek backward / forward 5 seconds |
| `⌘` / `Ctrl` + `←` | Previous track |
| `⌘` / `Ctrl` + `→` | Next track |
| `↑` / `↓` | Adjust volume up / down (5%) |
| `M` | Toggle mute |
| `L` | Toggle synchronized lyrics / Now Playing panel |

*Note: Keyboard shortcuts are automatically suppressed when typing inside text inputs, textareas, or dialogs.*

---

## License

MIT © Jin Liu

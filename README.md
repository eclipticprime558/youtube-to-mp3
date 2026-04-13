# YouTube → MP3 Converter

A local YouTube-to-MP3 converter with a clean web UI and companion mobile app. No length limits, no ads, no sign-in. Runs entirely on your own machine.

## Features

- Paste any YouTube URL (video or playlist) — conversion starts automatically
- Downloads every track in a playlist individually
- Embeds album art (thumbnail) directly into each MP3's ID3 tags — shows in File Explorer, VLC, and phone music apps
- Real-time progress bar with speed and ETA
- Configurable output folder
- Companion mobile app (Android/iOS via Expo) — convert from your phone, download for offline playback
- VLC WiFi sync — browse your music library directly from VLC Mobile over your home network

## Requirements

- Python 3.10+
- ffmpeg (installed via setup.bat)
- Node.js + Expo Go (for mobile app)

## Quick Start

### PC

```
# First time only
setup.bat

# Every time
start.bat
```

Then open `http://localhost:5000` in your browser.

### Mobile App

```
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone. Go to the **Settings** tab and enter your PC's local IP address (shown in the PC web UI under Settings).

## Output

MP3s are saved to `%USERPROFILE%\Music\VLC` by default. Change it anytime in the Settings panel of the web UI.

Each file includes:
- Embedded album art (JPEG, ID3v2.3 compatible)
- Title, artist, and other metadata

## VLC WiFi Sync

1. Right-click your output folder → **Properties → Sharing → Share** (name it `Music`)
2. Open VLC on your phone → **Browse → Network → Windows Network**
3. Find your PC → tap the `Music` share
4. Files appear instantly. Tap to stream or hold to download for offline playback.

## Tech Stack

| Layer | Technology |
|---|---|
| PC Backend | Python + Flask + yt-dlp + ffmpeg |
| PC Frontend | HTML / CSS / Vanilla JS |
| Mobile App | React Native + Expo |
| Album Art | mutagen (ID3v2.3) |

## Project Structure

```
youtube-to-mp3/
├── server/
│   ├── app.py              # Flask server
│   ├── requirements.txt
│   └── templates/
│       └── index.html      # Web UI
├── mobile/
│   ├── App.tsx             # React Native app
│   └── src/
│       ├── api.ts
│       └── screens/
│           ├── ConvertScreen.tsx
│           ├── LibraryScreen.tsx
│           └── SettingsScreen.tsx
├── setup.bat               # Install dependencies + ffmpeg
└── start.bat               # Launch server + open browser
```

## Notes

- This tool uses [yt-dlp](https://github.com/yt-dlp/yt-dlp) for downloading. Keep it updated with `pip install -U yt-dlp` if YouTube changes break downloads.
- For personal use only. Downloading YouTube content may be subject to YouTube's Terms of Service.

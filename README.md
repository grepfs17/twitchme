# TwitchMe

Chrome extension that monitors Twitch channels and opens new tabs when they go live.

## Features

- Add channels to a watch list
- Auto-opens stream tabs when a channel goes live
- Re-opens tabs if you close them while the stream is still live
- Per-channel settings: mute (tab-level), auto-focus, number of tabs to open
- It makes sure that the twitch player has audio on
- Polling interval: 15s, 30s, 1min, or 5min
- Optionally close tabs when the stream ends

## Chrome Web Store

Available on the [Chrome Web Store](https://chromewebstore.google.com/detail/twitchme/hmneicbjhnomfecllcpklblflffkpehp).

## Setup

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked and select this folder

No API credentials needed. Uses Twitch's public GraphQL endpoint.

## Structure

| File | Purpose |
|------|---------|
| `background.js` | Service worker -- polls for live status, opens/closes tabs |
| `popup/popup.html` | Popup UI -- channel list with controls |
| `popup/popup.js` | Popup logic |
| `options/options.html` | Settings page |
| `options/options.js` | Settings logic |
| `manifest.json` | Extension manifest (MV3) |
| `icons/` | App icons |


I wouldn't say no to a tip :D
<p>
 <a href="https://ko-fi.com/masterofhollows" >
<img width="100" src="https://cdn.prod.website-files.com/5c14e387dab576fe667689cf/670f5a02fad2b4c413af6d15_support_me_on_kofi_badge_beige.png" alt="Support me on Ko-fi">
 </a>
</p>

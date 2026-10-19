# GCalc – Grocery Calculator

A phone-first web app (PWA) for the market. Pick a vegetable or fruit, enter its rate, then:

- **Price → Weight**: type how much you want to spend, see how much you get.
- **Weight → Price**: type the weight you need (g or kg), see what you pay.

Rates can be per kg, 500 g, 250 g or 100 g, and each item remembers its last rate. Tap **Add to bill** to keep a running total. You can add your own items, and pick your currency in Settings. Everything is saved on the device and works offline once loaded.

## Run it

```bash
npm start
```

Open http://localhost:8080. To try it on your phone, connect it to the same Wi-Fi and open the "on your Wi-Fi" address the server prints (Windows may ask to allow Node through the firewall).

## Install on a phone

Installing and offline mode need HTTPS (or localhost). Host the folder on any static host (GitHub Pages, Netlify, Cloudflare Pages), open it on the phone, then choose **Install app** in Settings, or **Add to Home screen** from the browser menu.

## Files

- `index.html`, `styles.css`, `app.js`: the app
- `items.js`: built-in vegetables and fruits (add more here)
- `sw.js`: offline cache. Bump `VERSION` after changing files so installed copies update.
- `manifest.webmanifest`, `icons/`: install metadata and icons (`icon.svg` and `maskable.svg` are the sources for the PNGs)
- `server.js`: tiny local server for testing

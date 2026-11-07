<div align="center">
  <img src="assets/app-icon.png" width="100" height="100" alt="Claimr App Icon" style="border-radius: 22px;" />
  <h1>Claimr</h1>
  <p><strong>Free PC and console game radar with instant giveaway alerts.</strong></p>
  <p>Never miss a 100% free game, limited-time promotional drop, or publisher giveaway again.</p>

  <p>
    <a href="https://claimr-app.vercel.app"><img src="https://img.shields.io/badge/Web_App-Live_Production-10B981?style=for-the-badge&logo=vercel&logoColor=white" alt="Live App" /></a>
    <a href="https://github.com/EklavyaAhuja/claimr/releases"><img src="https://img.shields.io/badge/Android-APK_v1.3.0-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Android APK" /></a>
    <a href="https://discord.gg/gMATmybhk5"><img src="https://img.shields.io/badge/Discord-Join_Community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord Community" /></a>
    <img src="https://img.shields.io/badge/License-MIT-gray?style=for-the-badge" alt="MIT License" />
  </p>
</div>

https://github.com/user-attachments/assets/306e508d-4030-4f70-a419-179197ef8b14

---

## ⚡ Features

* **Unified Multi-Store Radar**: Continuously scans 11 major platforms: Steam, Epic Games Store, GOG, Amazon Prime Gaming, PlayStation, Xbox, itch.io, Ubisoft, Stove, and Alienware Arena.
* **Instant Giveaway Alerts**: High-priority push notifications dispatched the moment a giveaway goes live—before keys run out or time windows expire.
* **Rich Game Intel**: Full store descriptions, original retail values, player ratings, direct 1-click claim links, and embedded gameplay trailers.
* **Task Detection**: Automatically detects and separates direct 1-click claims from task-based giveaways (Gleam, Discord, Twitch).
* **Personal Game Vault**: Log your claimed titles, view your total saved library value, and avoid duplicate claims across multiple accounts.
* **Granular Customization**: Filter by storefront, giveaway type (Full Games, DLCs, In-game Loot), and toggle safe browsing preferences (18+ blur).
* **Zero Tracking & Full Privacy**: No accounts or passwords required. 100% privacy-friendly and free forever.

---

## 📥 How to Install

### 📱 Android (Native APK)
1. Head to the [Releases](https://github.com/EklavyaAhuja/claimr/releases) page.
2. Download the latest `claimr-v1.3.0.apk`.
3. Open the downloaded APK on your device and tap **Install** *(enable installs from your browser if prompted)*.

### 📲 Progressive Web App (PWA)

#### iOS (Safari)
1. Open [claimr-app.vercel.app](https://claimr-app.vercel.app) in Safari.
2. Tap the **Share** button at the bottom of the screen.
3. Scroll down and select **Add to Home Screen**.
4. Launch Claimr from your home screen and allow notifications for Web Push alerts.

#### Android (Chrome)
1. Open [claimr-app.vercel.app](https://claimr-app.vercel.app) in Google Chrome.
2. Tap the **Install App** banner at the bottom or open the menu (`⋮`) and tap **Install app** / **Add to Home screen**.

#### Desktop (Windows / macOS / Linux)
1. Open [claimr-app.vercel.app](https://claimr-app.vercel.app) in Google Chrome, Microsoft Edge, or Brave.
2. Click the **Install** icon on the right side of the URL address bar (or menu `⋮` → **Install Claimr**).
3. Claimr will launch in its own standalone, distraction-free desktop window.

---

## 🛠️ Tech Stack

* **Client**: React Native, React 19, TypeScript, Expo SDK 57 (New Architecture enabled).
* **Web & Desktop PWA**: React Native Web, Service Worker (`sw.js`), Web Push API (VAPID).
* **State & Storage**: Reactive singleton store with AsyncStorage and Web Storage caching.
* **Design System**: Tailored dark-first aesthetic with Plus Jakarta Sans & Unbounded typography.
* **Backend Pipeline**: Node.js, Express, multi-tier RSS & store API aggregation, Firebase Cloud Messaging (FCM), and Web Push delivery.

---

## 💻 Running Locally

### Prerequisites
* Node.js (v18+)
* npm or yarn

### Setup
```bash
# Clone the repository
git clone https://github.com/EklavyaAhuja/Claimr.git
cd Claimr

# Install dependencies
npm install

# Start the Expo development server
npx expo start

# Run in Web browser
npx expo start --web
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

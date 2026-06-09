<div align="center">

# LootQuest

Track free game giveaways from multiple platforms in one place.

Never miss a free game again.

[Download Latest APK](https://github.com/EklavyaAhuja/LootQuest/releases/download/v1.0.0/LootQuest-v1.0.0-beta.apk)

</div>

---

## Overview

LootQuest helps users discover, track, and manage free game giveaways from various gaming platforms in a single mobile application.

Instead of browsing multiple websites and communities, users can view active giveaways, monitor expiry dates, receive background alerts, and keep track of claimed games through a personal vault.

---

## Features

###  Giveaway Feed
Browse active giveaways from multiple sources in a unified, beautifully styled feed featuring platform-specific color coding.

###  Rich Game Metadata
Enriches posts with additional data automatically fetched in the background:
- Original prices and current discounts
- Game descriptions, developer info, and genres
- Achievements and trading card availability
- SteamDB ratings and review scores

###  Expiry Tracking
Indicates whether giveaways are still live or expired, calculating exact ending times and displaying real-time countdown labels.

###  Smart Background Notifications
Checks for new giveaways periodically in the background (runs task every 15, 30, or 60 minutes) and delivers local notifications with a custom notification channel and sound.

###  NSFW Filter & Gate
Safe browsing support with blur filters on NSFW game thumbnails and a verification gate before revealing adult-only content.

###  Personal Vault
A persistent inventory card system where you can track your claimed games or watch-list upcoming giveaways.

---

## Screenshots

| Home Feed | Giveaway Details |
|--------|--------|
| ![](screenshots/MainPage_LootQuest.jpeg) | ![](screenshots/GamePage_LootQuest.jpeg) |

| Personal Vault | Settings & Notifications |
|--------|--------|
| ![](screenshots/Vault_LootQuest.jpeg) | ![](screenshots/Settings_LootQuest.jpeg) |

---

## Tech Stack

- **Core Framework**: React Native (Expo SDK 54)
- **Language**: TypeScript
- **State & Local Storage**: React Native AsyncStorage & Expo SecureStore
- **Styling**: Curated dark-themed StyleSheet system featuring smooth BouncyPressable micro-animations
- **APIs & Scrapers**: 
  - Reddit RSS API (Scrapes r/FreeGameFindings new/hot threads and FGF_Info_Bot comments)
  - GamerPower API (Integrated fallback feed)
  - Epic Games Store Promotions API (Metadata and cover image scraper)
  - Steam Store API (Fuzzy title search and header image resolver)
- **Background Tasks**: Expo TaskManager & BackgroundFetch
- **Local Alerts**: Expo Notifications

---

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/EklavyaAhuja/LootQuest.git
   cd LootQuest
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env
   ```
   Modify `EXPO_PUBLIC_DISCORD_WEBHOOK_URL` in `.env` if you want to receive feedback submissions.

4. **Run the app locally:**
   ```bash
   npx expo start
   ```

---

## Installation

### Download APK

1. Go to the [Releases](https://github.com/EklavyaAhuja/LootQuest/releases) page and download the latest `.apk` file.
2. Enable installation from unknown sources in your Android security settings.
3. Install the downloaded APK.
4. Launch LootQuest and start claiming freebies!

---

## Feedback & Bug Reports

If you encounter a bug or have a suggestion:

- Open a GitHub Issue.
- Submit feedback directly through the App settings drawer (transmits anonymously to our logs via Discord).

Please include:
- Device model
- Android/OS version
- Steps to reproduce the bug

---

## Community

Have feedback, suggestions, or bug reports?

Join the Discord server:

[Discord Invite](https://discord.gg/pXxnhKWdGH)

## Disclaimer

LootQuest does not host, distribute, or provide any games. All giveaways, game assets, trademarks, and store content belong to their respective owners.

---

## License

This project is licensed under the MIT License unless stated otherwise.

import { resolveEpicMobileUrls } from '../services/EpicMobileHelper';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Deal } from '../models/Deal';
import { dealsStore } from '../services/dealsStore';
import {
  isDealExpired,
  getTimeLeft,
  calculateVaultValue,
  parseDateToMs,
  cleanDisplayTitle,
} from '../utils/dealUtils';
import {
  requestNotificationPermissions,
  sendWebNotification,
  registerWebPushSubscription,
  startWebDealPoller,
} from '../services/notificationService';
import { saveAppSettings } from '../services/storageService';
import { searchSteamAppId, enrichSteamDeal, fetchSteamSpyPlaytime, extractSteamAppId, fetchExactStoreReleaseDate } from '../services/SteamGamesEnricher';
import { extractEpicSlug, fetchEpicProductContent } from '../services/EpicGamesEnricher';
import { PRIME_GAMING_CONFIG } from '../config/primeGaming';
import { updateCheckerService, UpdateInfo, getCurrentNativeVersion } from '../services/updateCheckerService';
import { WEB_CSS } from '../web/tokens';
import { HOME_SECTIONS } from '../web/homeSections';
import ClaimrLandingPage from './ClaimrLandingPage';
import { sendDailyPing } from '../services/usageAnalytics';

// Silence harmless Reanimated web layout easing warnings in browser devtools
if (typeof window !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('[Reanimated] Selected easing is not currently supported on web')) {
      return;
    }
    originalWarn.apply(console, args);
  };
}

// Store Brand SVG Logos (clean vector paths)
const STORE_SVG_PATHS: Record<string, { path: string; viewBox?: string }> = {
  steam: {
    path: "M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"
  },
  epic: {
    path: "M3.537 0C2.165 0 1.66.506 1.66 1.879V18.44a4.262 4.262 0 00.02.433c.031.3.037.59.316.92.027.033.311.245.311.245.153.075.258.13.43.2l8.335 3.491c.433.199.614.276.928.27h.002c.314.006.495-.071.928-.27l8.335-3.492c.172-.07.277-.124.43-.2 0 0 .284-.211.311-.243.28-.33.285-.621.316-.92a4.261 4.261 0 00.02-.434V1.879c0-1.373-.506-1.88-1.878-1.88zm13.366 3.11h.68c1.138 0 1.688.553 1.688 1.696v1.88h-1.374v-1.8c0-.369-.17-.54-.523-.54h-.235c-.367 0-.537.17-.537.539v5.81c0 .369.17.54.537.54h.262c.353 0 .523-.171.523-.54V8.619h1.373v2.143c0 1.144-.562 1.71-1.7 1.71h-.694c-1.138 0-1.7-.566-1.7-1.71V4.82c0-1.144.562-1.709 1.7-1.709zm-12.186.08h3.114v1.274H6.117v2.603h1.648v1.275H6.117v2.774h1.74v1.275h-3.14zm3.816 0h2.198c1.138 0 1.7.564 1.7 1.708v2.445c0 1.144-.562 1.71-1.7 1.71h-.799v3.338h-1.4zm4.53 0h1.4v9.201h-1.4zm-3.13 1.235v3.392h.575c.354 0 .523-.171.523-.54V4.965c0-.368-.17-.54-.523-.54zm-3.74 10.147a1.708 1.708 0 01.591.108 1.745 1.745 0 01.49.299l-.452.546a1.247 1.247 0 00-.308-.195.91.91 0 00-.363-.068.658.658 0 00-.28.06.703.703 0 00-.224.163.783.783 0 00-.151.243.799.799 0 00-.056.299v.008a.852.852 0 00.056.31.7.7 0 00.157.245.736.736 0 00.238.16.774.774 0 00.303.058.79.79 0 00.445-.116v-.339h-.548v-.565H7.37v1.255a2.019 2.019 0 01-.524.307 1.789 1.789 0 01-.683.123 1.642 1.642 0 01-.602-.107 1.46 1.46 0 01-.478-.3 1.371 1.371 0 01-.318-.455 1.438 1.438 0 01-.115-.58v-.008a1.426 1.426 0 01.113-.57 1.449 1.449 0 01.312-.46 1.418 1.418 0 01.474-.309 1.58 1.58 0 01.598-.111 1.708 1.708 0 01.045 0zm11.963.008a2.006 2.006 0 01.612.094 1.61 1.61 0 01.507.277l-.386.546a1.562 1.562 0 00-.39-.205 1.178 1.178 0 00-.388-.07.347.347 0 00-.208.052.154.154 0 00-.07.127v.008a.158.158 0 00.022.084.198.198 0 00.076.066.831.831 0 00.147.06c.062.02.14.04.236.061a3.389 3.389 0 01.43.122 1.292 1.292 0 01.328.17.678.678 0 01.207.24.739.739 0 01.071.337v.008a.865.865 0 01-.081.382.82.82 0 01-.229.285 1.032 1.032 0 01-.353.18 1.606 1.606 0 01-.46.061 2.16 2.16 0 01-.71-.116 1.718 1.718 0 01-.593-.346l.43-.514c.277.223.578.335.9.335a.457.457 0 00.236-.05.157.157 0 00.082-.142v-.008a.15.15 0 00-.02-.077.204.204 0 00-.073-.066.753.753 0 00-.143-.062 2.45 2.45 0 00-.233-.062 5.036 5.036 0 01-.413-.113 1.26 1.26 0 01-.331-.16.72.72 0 01-.222-.243.73.73 0 01-.082-.36v-.008a.863.863 0 01.074-.359.794.794 0 01.214-.283 1.007 1.007 0 01.34-.185 1.423 1.423 0 01.448-.066 2.006 2.006 0 01.025 0zm-9.358.025h.742l1.183 2.81h-.825l-.203-.499H8.623l-.198.498h-.81zm2.197.02h.814l.663 1.08.663-1.08h.814v2.79h-.766v-1.602l-.711 1.091h-.016l-.707-1.083v1.593h-.754zm3.469 0h2.235v.658h-1.473v.422h1.334v.61h-1.334v.442h1.493v.658h-2.255zm-5.3.897l-.315.793h.624zm-1.145 5.19h8.014l-4.09 1.348z"
  },
  gog: {
    path: "M7.15 15.24H4.36a.4.4 0 0 0-.4.4v2c0 .21.18.4.4.4h2.8v1.32h-3.5c-.56 0-1.02-.46-1.02-1.03v-3.39c0-.56.46-1.02 1.03-1.02h3.48v1.32zM8.16 11.54c0 .58-.47 1.05-1.05 1.05H2.63v-1.35h3.78a.4.4 0 0 0 .4-.4V6.39a.4.4 0 0 0-.4-.4H4.39a.4.4 0 0 0-.41.4v2.02c0 .23.18.4.4.4H6v1.35H3.68c-.58 0-1.05-.46-1.05-1.04V5.68c0-.57.47-1.04 1.05-1.04H7.1c.58 0 1.05.47 1.05 1.04v5.86zM21.36 19.36h-1.32v-4.12h-.93a.4.4 0 0 0-.4.4v3.72h-1.33v-4.12h-.93a.4.4 0 0 0-.4.4v3.72h-1.33v-4.42c0-.56.46-1.02 1.03-1.02h5.61v5.44zM21.37 11.54c0 .58-.47 1.05-1.05 1.05h-4.48v-1.35h3.78a.4.4 0 0 0 .4-.4V6.39a.4.4 0 0 0-.4-.4h-2.03a.4.4 0 0 0-.4.4v2.02c0 .23.18.4.4.4h1.62v1.35H16.9c-.58 0-1.05-.46-1.05-1.04V5.68c0-.57.47-1.04 1.05-1.04h3.43c.58 0 1.05.47 1.05 1.04v5.86zM13.72 4.64h-3.44c-.58 0-1.04.47-1.04 1.04v3.44c0 .58.46 1.04 1.04 1.04h3.44c.57 0 1.04-.46 1.04-1.04V5.68c0-.57-.47-1.04-1.04-1.04m-.3 1.75v2.02a.4.4 0 0 1-.4.4h-2.03a.4.4 0 0 1-.4-.4V6.4c0-.22.17-.4.4-.4H13c.23 0 .4.18.4.4zM12.63 13.92H9.24c-.57 0-1.03.46-1.03 1.02v3.39c0 .57.46 1.03 1.03 1.03h3.39c.57 0 1.03-.46 1.03-1.03v-3.39c0-.56-.46-1.02-1.03-1.02m-.3 1.72v2a.4.4 0 0 1-.4.4v-.01H9.94a.4.4 0 0 1-.4-.4v-1.99c0-.22.18-.4.4-.4h2c.22 0 .4.18.4.4zM23.49 1.1a1.74 1.74 0 0 0-1.24-.52H1.75A1.74 1.74 0 0 0 0 2.33v19.34a1.74 1.74 0 0 0 1.75 1.75h20.5A1.74 1.74 0 0 0 24 21.67V2.33c0-.48-.2-.92-.51-1.24m0 20.58a1.23 1.23 0 0 1-1.24 1.24H1.75A1.23 1.23 0 0 1 .5 21.67V2.33a1.23 1.23 0 0 1 1.24-1.24h20.5a1.24 1.24 0 0 1 1.24 1.24v19.34z"
  },
  itch: {
    path: "M3.13 1.338C2.08 1.96.02 4.328 0 4.95v1.03c0 1.303 1.22 2.45 2.325 2.45 1.33 0 2.436-1.102 2.436-2.41 0 1.308 1.07 2.41 2.4 2.41 1.328 0 2.362-1.102 2.362-2.41 0 1.308 1.137 2.41 2.466 2.41h.024c1.33 0 2.466-1.102 2.466-2.41 0 1.308 1.034 2.41 2.363 2.41 1.33 0 2.4-1.102 2.4-2.41 0 1.308 1.106 2.41 2.435 2.41C22.78 8.43 24 7.282 24 5.98V4.95c-.02-.62-2.082-2.99-3.13-3.612-3.253-.114-5.508-.134-8.87-.133-3.362 0-7.945.053-8.87.133zm6.376 6.477a2.74 2.74 0 0 1-.468.602c-.5.49-1.19.795-1.947.795a2.786 2.786 0 0 1-1.95-.795c-.182-.178-.32-.37-.446-.59-.127.222-.303.412-.486.59a2.788 2.788 0 0 1-1.95.795c-.092 0-.187-.025-.264-.052-.107 1.113-.152 2.176-.168 2.95v.005l-.006 1.167c.02 2.334-.23 7.564 1.03 8.85 1.952.454 5.545.662 9.15.663 3.605 0 7.198-.21 9.15-.664 1.26-1.284 1.01-6.514 1.03-8.848l-.006-1.167v-.004c-.016-.775-.06-1.838-.168-2.95-.077.026-.172.052-.263.052a2.788 2.788 0 0 1-1.95-.795c-.184-.178-.36-.368-.486-.59-.127.22-.265.412-.447.59a2.786 2.786 0 0 1-1.95.794c-.76 0-1.446-.303-1.948-.793a2.74 2.74 0 0 1-.468-.602 2.738 2.738 0 0 1-.463.602 2.787 2.787 0 0 1-1.95.794h-.16a2.787 2.787 0 0 1-1.95-.793 2.738 2.738 0 0 1-.464-.602zm-2.004 2.59v.002c.795.002 1.5 0 2.373.953.687-.072 1.406-.108 2.125-.107.72 0 1.438.035 2.125.107.873-.953 1.578-.95 2.372-.953.376 0 1.876 0 2.92 2.934l1.123 4.028c.832 2.995-.266 3.068-1.636 3.07-2.03-.075-3.156-1.55-3.156-3.025-1.124.184-2.436.276-3.748.277-1.312 0-2.624-.093-3.748-.277 0 1.475-1.125 2.95-3.156 3.026-1.37-.004-2.468-.077-1.636-3.072l1.122-4.027c1.045-2.934 2.545-2.934 2.92-2.934zM12 12.714c-.002.002-2.14 1.964-2.523 2.662l1.4-.056v1.22c0 .056.56.033 1.123.007.562.026 1.124.05 1.124-.008v-1.22l1.4.055C14.138 14.677 12 12.713 12 12.713z"
  },
  playstation: {
    path: "M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z"
  },
  xbox: {
    path: "M7.202 15.967a8 8 0 0 1-3.552-1.26c-.898-.585-1.101-.826-1.101-1.306 0-.965 1.062-2.656 2.879-4.583C6.459 7.723 7.897 6.44 8.052 6.475c.302.068 2.718 2.423 3.622 3.531 1.43 1.753 2.088 3.189 1.754 3.829-.254.486-1.83 1.437-2.987 1.802-.954.301-2.207.429-3.239.33m-5.866-3.57C.589 11.253.212 10.127.03 8.497c-.06-.539-.038-.846.137-1.95.218-1.377 1.002-2.97 1.945-3.95.401-.417.437-.427.926-.263.595.2 1.23.638 2.213 1.528l.574.519-.313.385C4.056 6.553 2.52 9.086 1.94 10.653c-.315.852-.442 1.707-.306 2.063.091.24.007.15-.3-.319Zm13.101.195c.074-.36-.019-1.02-.238-1.687-.473-1.443-2.055-4.128-3.508-5.953l-.457-.575.494-.454c.646-.593 1.095-.948 1.58-1.25.381-.237.927-.448 1.161-.448.145 0 .654.528 1.065 1.104a8.4 8.4 0 0 1 1.343 3.102c.153.728.166 2.286.024 3.012a9.5 9.5 0 0 1-.6 1.893c-.179.393-.624 1.156-.82 1.404-.1.128-.1.127-.043-.148ZM7.335 1.952c-.67-.34-1.704-.705-2.276-.803a4 4 0 0 0-.759-.043c-.471.024-.45 0 .306-.358A7.8 7.8 0 0 1 6.47.128c.8-.169 2.306-.17 3.094-.005.85.18 1.853.552 2.418.9l.168.103-.385-.02c-.766-.038-1.88.27-3.078.853-.361.176-.676.316-.699.312a12 12 0 0 1-.654-.319Z",
    viewBox: "0 0 16 16"
  },
  ubisoft: {
    path: "M23.561 11.988C23.301-.304 6.954-4.89.656 6.634c.282.206.661.477.943.672a11.747 11.747 0 00-.976 3.067 11.885 11.885 0 00-.184 2.071C.439 18.818 5.621 24 12.005 24c6.385 0 11.556-5.17 11.556-11.556v-.455zm-20.27 2.06c-.152 1.246-.054 1.636-.054 1.788l-.282.098c-.108-.206-.37-.932-.488-1.908C2.163 10.308 4.7 6.96 8.57 6.33c3.544-.52 6.937 1.68 7.728 4.758l-.282.098c-.087-.087-.228-.336-.77-.878-4.281-4.281-11.002-2.32-11.956 3.74zm11.002 2.081a3.145 3.145 0 01-2.59 1.355 3.15 3.15 0 01-3.155-3.155 3.159 3.159 0 012.927-3.144c1.018-.043 1.972.51 2.416 1.398a2.58 2.58 0 01-.455 2.95c.293.205.575.4.856.595zm6.58.12c-1.669 3.782-5.106 5.766-8.77 5.712-7.034-.347-9.083-8.466-4.38-11.393l.207.206c-.076.108-.358.325-.791 1.182-.51 1.041-.672 2.081-.607 2.732.369 5.67 8.314 6.83 11.045 1.214C21.057 8.217 11.822.401 3.626 6.374l-.184-.184C5.599 2.808 9.816 1.3 13.837 2.309c6.147 1.55 9.453 7.956 7.035 13.94z"
  },
  alienware: {
    path: "M20.382 9.4054c-.0649-.6486-.1297-1.3622-.2595-2.0108-.1297-.6487-.2594-1.2973-.5189-1.946-.1297-.3243-.2595-.6486-.3892-.908-.1297-.3244-.3243-.5838-.454-.9082-.1946-.2594-.3892-.5838-.5838-.8432-.1946-.2595-.454-.519-.7135-.7135-.454-.3892-.973-.7784-1.5568-1.1027-.5838-.3244-1.2324-.5838-1.881-.7135C13.3765.0649 12.7278 0 12.0143 0c-.7135 0-1.3621.0649-2.0108.2595C9.355.3892 8.7712.6486 8.1874.973c-.6487.3243-1.1676.7135-1.6865 1.1675-.2595.1946-.454.454-.7135.7136l-.5838.7783c-.1297.3244-.3243.5838-.454.9081l-.3892.973c-.1946.6487-.3892 1.2973-.519 1.946-.1297.6486-.1946 1.2973-.2594 2.0108-.0649.7135 0 1.2973 0 1.946 0 .6486.0648 1.2972.1946 2.0107l.1946.973c.0648.3243.1946.6486.3243.973.454 1.2324 1.1676 2.4 1.881 3.5027.3893.5838.7785 1.1027 1.1676 1.6216.3892.519.7784 1.1027 1.2325 1.5568.1946.2594.454.454.7135.7135.2594.1946.519.3892.8432.5837.2595.1946.5838.3244.9081.4541.1298.0649.3244.1297.4541.1297.1946 0 .3243.0649.519.0649.1945 0 .3242 0 .5188-.0649.1946 0 .3244-.0648.454-.1297.3244-.1297.6487-.2595.9082-.454.2595-.1946.5838-.3892.8432-.5838.2595-.1946.519-.454.7136-.7135.454-.519.8432-1.0379 1.2324-1.5568.3892-.519.7784-1.1027 1.1676-1.6216.7135-1.1027 1.427-2.2703 1.881-3.5027.1298-.3244.2595-.6487.3244-.973.0648-.3243.1946-.6486.1946-.973.1297-.6486.1945-1.2973.1945-2.0108 0-.6486 0-1.3621-.0648-2.0108zM4.8144 12.0649s3.6973.8432 6.0973 5.8378c-.0649 0-6.4216-.1297-6.0973-5.8378zm8.3676 5.8378c2.3351-4.9946 6.0973-5.8378 6.0973-5.8378.3243 5.708-6.0973 5.8378-6.0973 5.8378z"
  },
  prime: {
    path: "M3.5 8.2l4.2 3.6L12 5.2l4.3 6.6 4.2-3.6-1.9 10H5.4z"
  },
  stove: {
    path: "M12 2.8c.9 3.1-2.3 4.4-2.3 7.5a2.4 2.4 0 0 0 4.8 0c0-.9-.3-1.7-.8-2.5 2.3 1.4 4.1 3.8 4.1 6.9a5.9 5.9 0 0 1-11.8 0c0-4.7 4.4-6.5 6-11.9z"
  },
  link: {
    path: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
  },
  gamepad: {
    path: "M6 6a4 4 0 0 0-4 4v4a4 4 0 0 0 4 4c1.5 0 2.5-1 3.5-2.5l1-1.5h3l1 1.5c1 1.5 2 2.5 3.5 2.5a4 4 0 0 0 4-4v-4a4 4 0 0 0-4-4H6zm1 4h2v1h1v2H9v1H7v-1H6v-2h1v-1zm10 1a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-2 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-2 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"
  }
};

export const StoreLogo = ({ store, size = 14 }: { store?: string; size?: number }) => {
  const s = (store || '').toLowerCase();
  let key = 'gamepad';
  if (s.includes('steam')) key = 'steam';
  else if (s.includes('epic')) key = 'epic';
  else if (s.includes('gog')) key = 'gog';
  else if (/\bitch(?:\.io)?\b/i.test(s)) key = 'itch';
  else if (s.includes('playstation') || s.includes('ps')) key = 'playstation';
  else if (s.includes('xbox')) key = 'xbox';
  else if (s.includes('ubisoft')) key = 'ubisoft';
  else if (s.includes('alienware')) key = 'alienware';
  else if (s.includes('prime') || s.includes('amazon')) key = 'prime';
  else if (s.includes('stove')) key = 'stove';
  else if (s.includes('other') || s.includes('link') || s.includes('.')) key = 'link';

  const item = STORE_SVG_PATHS[key] || STORE_SVG_PATHS.gamepad;
  return (
    <svg
      viewBox={item.viewBox || "0 0 24 24"}
      width={size}
      height={size}
      fill="currentColor"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d={item.path} />
    </svg>
  );
};

// Type matching helper
const matchDealType = (d: Deal, typeKey: string): boolean => {
  const k = typeKey.toUpperCase();
  if (k === 'GAME') {
    return d.type === 'full_game' || d.type === 'mobile_game' || !d.type;
  }
  if (k === 'DLC') {
    return d.type === 'dlc' || d.type === 'item' || d.type === 'loot';
  }
  if (k === 'BETA') {
    return d.type === 'beta';
  }
  if (k === '18+') {
    return !!d.is18Plus || !!d.isNsfw;
  }
  return true;
};

// motion-anything: click-spark & celebratory loot-burst micro-interactions
const triggerSpark = (
  e: React.MouseEvent<HTMLElement> | { clientX: number; clientY: number },
  color = '#EDEDEB',
  mode: 'spark' | 'loot' = 'spark'
) => {
  if (typeof window === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const x = e.clientX;
  const y = e.clientY;
  const n = mode === 'loot' ? 18 : 8;
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:${x}px;top:${y}px;pointer-events:none;z-index:99999;`;
  document.body.appendChild(host);

  const colors = mode === 'loot' ? ['#FFD700', '#F59E0B', '#C084FC', '#E879F9', '#EDEDEB'] : [color];

  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    const a = (i / n) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
    const d = mode === 'loot' ? 24 + Math.random() * 40 : 16 + Math.random() * 14;
    const dx = Math.cos(a) * d;
    const dy = Math.sin(a) * d + (mode === 'loot' ? 8 : 0);
    const pColor = colors[Math.floor(Math.random() * colors.length)];
    const size = mode === 'loot' ? (Math.random() > 0.5 ? 6 : 4) : 4;
    const isDiamond = mode === 'loot' && Math.random() > 0.4;

    s.style.cssText = `position:absolute;width:${size}px;height:${size}px;border-radius:${isDiamond ? '1px' : '50%'};background:${pColor};transform:translate(-50%,-50%) ${isDiamond ? 'rotate(45deg)' : ''};pointer-events:none;box-shadow:0 0 6px ${pColor}80;`;
    host.appendChild(s);
    if ((s as any).animate) {
      (s as any).animate(
        [
          { transform: `translate(-50%, -50%) ${isDiamond ? 'rotate(45deg)' : ''} scale(1)`, opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) ${isDiamond ? 'rotate(180deg)' : ''} scale(0.2)`, opacity: 0 }
        ],
        { duration: mode === 'loot' ? 600 : 400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
      );
    }
  }
  setTimeout(() => {
    if (host.parentNode) host.parentNode.removeChild(host);
  }, mode === 'loot' ? 620 : 420);
};

// motion-anything: spotlight-card cursor sheen tracking (GPU CSS vars, no re-render)
const handleSpotlightMouseMove = (e: React.MouseEvent<HTMLElement>) => {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
};

// motion-anything: count-up emphasis animation (GPU-friendly RAF with cubic ease-out)
const CountUpValue = ({ value, prefix = '', decimals = 0 }: { value: number; prefix?: string; decimals?: number }) => {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const duration = 650;
    const initial = 0;
    let rafId: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = initial + (value - initial) * ease;
      setDisplay(current);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value]);

  return <span>{prefix}{decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString()}</span>;
};


function cleanFormatting(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function formatTypeBadge(type?: string): { label: string; tagClass: string } {
  if (!type) return { label: 'GAME', tagClass: 'game' };
  const upper = type.toUpperCase().replace(/_/g, ' ').trim();
  if (upper === 'FULL GAME' || upper === 'GAME') {
    return { label: 'GAME', tagClass: 'game' };
  }
  if (upper === 'MOBILE GAME' || upper === 'MOBILE') {
    return { label: 'MOBILE', tagClass: 'mobile' };
  }
  if (upper.includes('DLC')) {
    return { label: 'DLC', tagClass: 'dlc' };
  }
  if (upper.includes('BETA')) {
    return { label: 'BETA', tagClass: 'beta' };
  }
  return { label: upper, tagClass: type.toLowerCase().replace(/[^a-z0-9]/g, '') };
}

export default function DesktopWebApp({ onSwitchToMobile }: { onSwitchToMobile?: () => void } = {}) {
  const [route, setRoute] = useState<'landing' | 'home' | 'feed' | 'vault' | 'alerts' | 'settings' | 'game' | 'prime'>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.slice(1);
      const root = hash.split('/')[0];
      if (['home', 'feed', 'vault', 'alerts', 'settings', 'prime'].includes(root)) return root as any;
      if (root === 'game') return 'game';
      return 'landing';
    }
    return 'landing';
  });
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [claimedDeals, setClaimedDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [primeHidden, setPrimeHidden] = useState(false);
  const [pendingClaimDealId, setPendingClaimDealId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [storeSearch, setStoreSearch] = useState('');
  const [showAllStores, setShowAllStores] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Media & Lightbox state
  const [lightboxImageIndex, setLightboxImageIndex] = useState<number | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [fullscreenTrailerUrl, setFullscreenTrailerUrl] = useState<string | null>(null);

  // User Profile
  const [userName, setUserName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lq_desktop_username') || '';
    }
    return '';
  });

  // PWA update state
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);

  // Persistent Feed Filter States
  const [filterTypes, setFilterTypes] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const s = localStorage.getItem('lq_desktop_filter_types');
        if (s) return JSON.parse(s);
      } catch {}
    }
    return [];
  });

  const [filterMethods, setFilterMethods] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const s = localStorage.getItem('lq_desktop_filter_methods');
        if (s) return JSON.parse(s);
      } catch {}
    }
    return [];
  });

  const [filterStores, setFilterStores] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const s = localStorage.getItem('lq_desktop_filter_stores');
        if (s) return JSON.parse(s);
      } catch {}
    }
    return [];
  });

  const [alertsFilter, setAlertsFilter] = useState<string>('all');

  const [sortOption, setSortOption] = useState<'end' | 'new' | 'val'>(() => {
    if (typeof window !== 'undefined') {
      const s = localStorage.getItem('lq_desktop_sort_option');
      if (s === 'end' || s === 'new' || s === 'val') return s;
    }
    return 'end';
  });

  const ALL_SETTINGS_STORES = [
    'Steam',
    'Epic Games',
    'GOG',
    'itch.io',
    'Ubisoft',
    'Stove',
    'Alienware Arena',
    'Prime Gaming',
    'Playstation',
    'Xbox',
    'Others',
  ] as const;

  // Persistent Settings State
  const [settings, setSettings] = useState(() => {
    const defaults = {
      notif: true,
      usage: true,
      GAME: true,
      DLC: true,
      BETA: true,
      Steam: true,
      'Epic Games': true,
      Epic: true,
      GOG: true,
      'itch.io': true,
      Ubisoft: true,
      Stove: true,
      'Alienware Arena': true,
      'Prime Gaming': true,
      Playstation: true,
      Xbox: true,
      Others: true,
      nsfw18: false,
    };
    if (typeof window !== 'undefined') {
      try {
        const s = localStorage.getItem('lq_desktop_settings');
        if (s) return { ...defaults, ...JSON.parse(s) };
      } catch {}
    }
    return defaults;
  });

  // Settings State matching App
  const [introAnimation, setIntroAnimation] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('claimr_intro_animation_enabled') ?? localStorage.getItem('lootquest_intro_animation_enabled');
      if (v !== null) return v === 'true';
    }
    return true;
  });
  const [alwaysShow18Plus, setAlwaysShow18Plus] = useState<boolean>(() => dealsStore.getAlwaysShow18Plus());
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [savedNameSuccess, setSavedNameSuccess] = useState(false);
  const [versionCopied, setVersionCopied] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [checkStatusMessage, setCheckStatusMessage] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  // Notification status
  const [hasNotifPermission, setHasNotifPermission] = useState(() => {
    return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
  });

  // Request notification permissions immediately on open if undecided (default) & activate background poller
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        requestNotificationPermissions().then((granted) => {
          setHasNotifPermission(granted);
          if (granted) {
            registerWebPushSubscription().catch(() => {});
          }
        }).catch(() => {});
      } else {
        const isGranted = Notification.permission === 'granted';
        setHasNotifPermission(isGranted);
        if (isGranted) {
          registerWebPushSubscription().catch(() => {});
        }
      }
    }
    const stopPoller = startWebDealPoller();
    return () => {
      stopPoller();
    };
  }, []);

  // Only send usage ping when user actually launches and uses the live app (not merely viewing the landing page)
  useEffect(() => {
    if (route !== 'landing') {
      sendDailyPing();
    }
  }, [route]);

  const playWebChime = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  }, []);

  const handleSaveProfileName = useCallback(() => {
    const trimmed = (userName || '').trim();
    if (typeof window !== 'undefined') {
      localStorage.setItem('claimr_user_name', trimmed || 'Hunter');
      localStorage.setItem('lootquest_user_name', trimmed || 'Hunter');
      localStorage.setItem('lq_desktop_username', trimmed || 'Hunter');
    }
    setSavedNameSuccess(true);
    setTimeout(() => setSavedNameSuccess(false), 2200);
  }, [userName]);

  const handleToggleIntroAnimation = useCallback(() => {
    setIntroAnimation((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('claimr_intro_animation_enabled', String(next));
      }
      return next;
    });
  }, []);

  const handleToggleAlwaysShow18Plus = useCallback(() => {
    setAlwaysShow18Plus((prev) => {
      const next = !prev;
      dealsStore.setAlwaysShow18Plus(next);
      if (typeof window !== 'undefined') {
        localStorage.setItem('claimr_always_show_18_plus', String(next));
      }
      return next;
    });
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    setIsCheckingUpdate(true);
    setCheckStatusMessage('Checking for updates...');
    try {
      const info = await updateCheckerService.checkForUpdate(true);
      setUpdateInfo(info);
      if (info && info.isUpdateAvailable) {
        setCheckStatusMessage(`v${info.version} is ready to download!`);
      } else {
        setCheckStatusMessage(`Up to date (v${getCurrentNativeVersion()})`);
      }
    } catch {
      setCheckStatusMessage('Could not reach update server.');
    } finally {
      setIsCheckingUpdate(false);
      setTimeout(() => setCheckStatusMessage(null), 4000);
    }
  }, []);

  const handleFeedbackSubmit = useCallback(async () => {
    const trimmed = feedbackText.trim();
    if (!trimmed || feedbackSending) return;
    setFeedbackSending(true);

    const feedbackEntry = {
      user: userName || 'Hunter',
      text: trimmed,
      timestamp: Date.now(),
    };

    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('fgf_user_feedback');
        const list = raw ? JSON.parse(raw) : [];
        list.unshift(feedbackEntry);
        localStorage.setItem('fgf_user_feedback', JSON.stringify(list.slice(0, 50)));
      }
    } catch {}

    try {
      await fetch('https://lootquest-backend.onrender.com/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackEntry),
      });
    } catch {}

    setFeedbackSending(false);
    setFeedbackSubmitted(true);
    setFeedbackText('');
    setTimeout(() => setFeedbackSubmitted(false), 3500);
  }, [feedbackText, feedbackSending, userName]);

  // Game detail asynchronous enrichment states
  const [gameScreenshots, setGameScreenshots] = useState<any[]>([]);
  const [gameTrailer, setGameTrailer] = useState<{ url: string; thumbnail?: string } | null>(null);
  const [enrichedGameData, setEnrichedGameData] = useState<Partial<Deal> | null>(null);
  const [desktopPlaytime, setDesktopPlaytime] = useState<string | null>(null);

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('lq_desktop_filter_types', JSON.stringify(filterTypes));
      localStorage.setItem('lq_desktop_filter_methods', JSON.stringify(filterMethods));
      localStorage.setItem('lq_desktop_filter_stores', JSON.stringify(filterStores));
      localStorage.setItem('lq_desktop_sort_option', sortOption);
      localStorage.setItem('lq_desktop_settings', JSON.stringify(settings));

      const activeStores = ALL_SETTINGS_STORES.filter(
        (k) => (settings as any)[k] !== false
      );
      const activeTypes = (['GAME', 'DLC', 'BETA'] as const)
        .filter((k) => (settings as any)[k])
        .map((t) => (t === 'GAME' ? 'Game' : t === 'DLC' ? 'DLC' : 'Beta'));

      saveAppSettings({
        notificationsEnabled: !!settings.notif,
        notificationPlatforms: [...activeStores],
        notificationTypes: activeTypes,
        backgroundIntervalMinutes: 30,
        theme: 'cartoon-classic',
        hasMigratedToAllEnabledV3: true,
        anonymousUsageCount: !!settings.usage,
      });
    }
  }, [filterTypes, filterMethods, filterStores, sortOption, settings]);

  useEffect(() => {
    if (typeof window !== 'undefined' && userName) {
      localStorage.setItem('lq_desktop_username', userName);
    }
  }, [userName]);

  // Subscribe to dealsStore and router
  useEffect(() => {
    let mounted = true;
    dealsStore.init().then(() => {
      if (mounted) {
        setDeals(dealsStore.getActiveDeals());
        setClaimedDeals(dealsStore.getVaultItems('All'));
        setAlwaysShow18Plus(dealsStore.getAlwaysShow18Plus());
        setLoading(false);
      }
    });

    const unsubscribe = dealsStore.subscribe(() => {
      if (mounted) {
        setDeals(dealsStore.getActiveDeals());
        setClaimedDeals(dealsStore.getVaultItems('All'));
        setAlwaysShow18Plus(dealsStore.getAlwaysShow18Plus());
        setLoading(false);
      }
    });

    // Hash router listener (#home, #feed, #vault, #alerts, #settings, #prime, #game/:id)
    const handleHashChange = () => {
      const rawHash = window.location.hash.slice(1);
      const parts = rawHash.split('/');

      if (parts[0] === 'game' && parts[1]) {
        setSelectedGameId(parts[1]);
        setRoute('game');
        window.scrollTo(0, 0);
        return;
      }
      if (['home', 'feed', 'vault', 'alerts', 'settings', 'prime'].includes(parts[0])) {
        setRoute(parts[0] as any);
        setSelectedGameId(null);
        window.scrollTo(0, 0);
        return;
      }

      // Any other hash stays on the landing page (in-page anchors like #missed-games, #the-gap, etc.)
      setRoute('landing');
      setSelectedGameId(null);

      // In-page anchor scroll mapping
      let targetId = parts[0];
      if (targetId === 'the-problem') targetId = 'the-gap';
      if (targetId === 'how-it-works') targetId = 'systems';

      if (targetId && !['landing', 'overview'].includes(targetId)) {
        setTimeout(() => {
          const el = document.getElementById(targetId);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }
    };

    // SW update listener
    const handleSwUpdate = () => {
      setSwUpdateAvailable(true);
    };

    // PWA install prompt listener
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };

    let handleSwMsg: ((e: MessageEvent) => void) | null = null;
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', handleHashChange);
      window.addEventListener('lq-sw-update-available', handleSwUpdate);
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      handleHashChange();

      // Deep link (?dealId=...) support with clean URL
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const urlDealId = searchParams.get('dealId');
        if (urlDealId) {
          const cleanUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, '', cleanUrl);

          if (!dealsStore.getDealById(urlDealId)) {
            const titleParam = searchParams.get('title') || 'Free Game';
            const dealUrlParam = searchParams.get('url') || '';
            const platformParam = searchParams.get('platform') || 'Steam';
            const isTaskParam = searchParams.get('isTask') === '1';
            const imageParam = searchParams.get('image') || undefined;

            const notifDeal: Deal = {
              id: urlDealId,
              title: titleParam,
              platform: platformParam,
              type: 'full_game',
              claimMethod: isTaskParam ? 'tasks' : 'one_click',
              url: dealUrlParam || 'https://store.steampowered.com',
              giveawayUrl: dealUrlParam || undefined,
              author: 'Freebie Radar',
              image: imageParam,
              resolvedImage: imageParam,
              resolvedPoster: imageParam,
              isFromNotification: true,
            };
            dealsStore.upsertDeal(notifDeal);
          }

          setSelectedGameId(urlDealId);
          setRoute('game');
        }
      } catch {}

      // Service worker message listener for notifications
      if ('serviceWorker' in navigator) {
        handleSwMsg = (e: MessageEvent) => {
          if (e.data && e.data.type === 'CLAIMR_PUSH_RECEIVED' && e.data.data) {
            const dealId = e.data.data?.dealId || e.data.data?.postId;
            if (dealId && e.data.data?.gameTitle && !dealsStore.getDealById(dealId)) {
              const notifDeal: Deal = {
                id: String(dealId),
                title: e.data.data.gameTitle,
                platform: e.data.data.platform || 'Steam',
                type: 'full_game',
                claimMethod: e.data.data.isTask ? 'tasks' : 'one_click',
                url: e.data.data.url || 'https://store.steampowered.com',
                giveawayUrl: e.data.data.url,
                author: 'Freebie Radar',
                image: e.data.data.image,
                resolvedImage: e.data.data.image,
                resolvedPoster: e.data.data.image,
                isFromNotification: true,
              };
              dealsStore.upsertDeal(notifDeal);
            }
          }
          if (e.data && e.data.type === 'CLAIMR_NOTIFICATION_CLICK') {
            const dealId = e.data.data?.dealId || e.data.data?.postId;
            if (dealId) {
              if (e.data.data?.gameTitle && !dealsStore.getDealById(dealId)) {
                const notifDeal: Deal = {
                  id: String(dealId),
                  title: e.data.data.gameTitle,
                  platform: e.data.data.platform || 'Steam',
                  type: 'full_game',
                  claimMethod: e.data.data.isTask ? 'tasks' : 'one_click',
                  url: e.data.data.url || 'https://store.steampowered.com',
                  giveawayUrl: e.data.data.url,
                  author: 'Freebie Radar',
                  image: e.data.data.image,
                  resolvedImage: e.data.data.image,
                  resolvedPoster: e.data.data.image,
                  isFromNotification: true,
                };
                dealsStore.upsertDeal(notifDeal);
              }
              setSelectedGameId(dealId);
              setRoute('game');
            }
          }
        };
        navigator.serviceWorker.addEventListener('message', handleSwMsg);
      }
    }

    return () => {
      mounted = false;
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', handleHashChange);
        window.removeEventListener('lq-sw-update-available', handleSwUpdate);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      if (handleSwMsg && 'serviceWorker' in navigator) { navigator.serviceWorker.removeEventListener('message', handleSwMsg); }
      }
    };
  }, []);

  // Keyboard shortcut listener (Keys 1-5 switch pages, 'R' syncs deals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // 1-5 navigation
      const pages: Array<'home' | 'feed' | 'vault' | 'alerts' | 'settings'> = [
        'home',
        'feed',
        'vault',
        'alerts',
        'settings',
      ];
      const pageIndex = '12345'.indexOf(e.key);
      if (pageIndex >= 0) {
        navigateTo(pages[pageIndex]);
        return;
      }

      // 'R' or 'r' syncs deals
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        triggerSync();
        return;
      }

      // Fullscreen trailer Escape
      if (fullscreenTrailerUrl && e.key === 'Escape') {
        setFullscreenTrailerUrl(null);
      }

      // Lightbox navigation
      if (lightboxImageIndex !== null) {
        if (e.key === 'Escape') {
          setLightboxImageIndex(null);
          setLightboxZoom(1);
        } else if (e.key === 'ArrowRight' && gameScreenshots.length > 0) {
          setLightboxImageIndex((prev) => (prev !== null ? (prev + 1) % gameScreenshots.length : 0));
          setLightboxZoom(1);
        } else if (e.key === 'ArrowLeft' && gameScreenshots.length > 0) {
          setLightboxImageIndex((prev) => (prev !== null ? (prev - 1 + gameScreenshots.length) % gameScreenshots.length : 0));
          setLightboxZoom(1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImageIndex, gameScreenshots, fullscreenTrailerUrl]);

  // "Did you claim it?" trigger on visibilitychange / focus
  useEffect(() => {
    const checkClaimPrompt = () => {
      if (pendingClaimDealId && !dealsStore.isClaimed(pendingClaimDealId)) {
        // Show sheet if user is on the game's page or return from new tab
      }
    };

    window.addEventListener('visibilitychange', checkClaimPrompt);
    window.addEventListener('focus', checkClaimPrompt);
    return () => {
      window.removeEventListener('visibilitychange', checkClaimPrompt);
      window.removeEventListener('focus', checkClaimPrompt);
    };
  }, [pendingClaimDealId]);

  // 1-second interval to update countdown timer smoothly
  const [, setTimerTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const navigateTo = (newRoute: string, id?: string) => {
    if (typeof window !== 'undefined') {
      window.location.hash = id ? `${newRoute}/${id}` : newRoute;
    }
  };

  const triggerSync = async (force = true) => {
    if (syncing) return;
    setSyncing(true);
    try {
      await dealsStore.sync(force);
    } finally {
      setSyncing(false);
    }
  };

  const prevRouteRef = useRef(route);
  useEffect(() => {
    // Whenever entering the app from landing or fresh load into app route, force a sync
    if (route !== 'landing' && prevRouteRef.current === 'landing') {
      triggerSync(true);
    }
    prevRouteRef.current = route;
  }, [route]);

  // Selectors from central dealsStore
  

  const activeDeals = useMemo(() => dealsStore.getActiveDeals(), [deals]);
  const heroDeal = useMemo(() => dealsStore.getHero(), [deals]);
  const topRatedDeals = useMemo(() => dealsStore.getTopRated().slice(0, 8), [deals]);
  const endingSoonDeals = useMemo(() => dealsStore.getEndingSoon(heroDeal?.id).slice(0, 8), [deals, heroDeal]);

  // Selected game for detail view
  const activeSelectedGame = useMemo(() => {
    if (!selectedGameId) return null;
    return (
      activeDeals.find((d) => d.id === selectedGameId) ||
      claimedDeals.find((d) => d.id === selectedGameId) ||
      null
    );
  }, [selectedGameId, activeDeals, claimedDeals]);

  // Load screenshots and Steam metadata when game detail opens
  useEffect(() => {
    if (!activeSelectedGame) {
      setGameScreenshots([]);
      setGameTrailer(null);
      setEnrichedGameData(null);
      setDesktopPlaytime(null);
      setFullscreenTrailerUrl(null);
      return;
    }

    let active = true;

    // 1. Fetch real screenshots (Steam / Epic)
    dealsStore.getScreenshotsForDeal(activeSelectedGame).then((shots) => {
      if (active && Array.isArray(shots) && shots.length > 0) {
        setGameScreenshots(shots);
      } else if (active) {
        setGameScreenshots([]);
      }
    });

    // 2. Fetch trailer
    dealsStore.getTrailerForDeal(activeSelectedGame).then((tr) => {
      if (active && tr && tr.url) {
        setGameTrailer(tr);
      } else if (active) {
        setGameTrailer(null);
      }
    });

    // 3. Comprehensive cross-store enrichment (Steam, Epic, GOG, itch.io)
    async function enrichGameDetails() {
      if (!activeSelectedGame) return;

      const urls = [
        activeSelectedGame.storeUrl,
        activeSelectedGame.steamUrl,
        activeSelectedGame.giveawayUrl,
        activeSelectedGame.url,
      ].filter(Boolean).join(' ');

      // A. Discover or extract Steam App ID
      let sAppId =
        (activeSelectedGame.steamAppId && /^\d+$/.test(activeSelectedGame.steamAppId)
          ? activeSelectedGame.steamAppId
          : null) || extractSteamAppId(urls);

      let targetUrl = sAppId ? `https://store.steampowered.com/app/${sAppId}/` : undefined;

      if (!targetUrl && activeSelectedGame.title) {
        const foundId = await searchSteamAppId(activeSelectedGame.title);
        if (foundId) {
          sAppId = foundId;
          targetUrl = `https://store.steampowered.com/app/${foundId}/`;
        }
      }

      // B. Fetch Steam reviews, rating, trailer, metacritic, genres, developer
      if (targetUrl) {
        try {
          const steamData = await enrichSteamDeal(targetUrl, activeSelectedGame.title);
          if (active && steamData) {
            setEnrichedGameData((prev) => ({
              ...(prev || {}),
              ...steamData,
            }));

            if (steamData.trailerUrl) {
              setGameTrailer({
                url: steamData.trailerUrl,
                thumbnail: steamData.trailerThumbnail,
              });
            }

            const finalAppId = steamData.steamAppId || sAppId;
            const reviewCount = steamData.steamReviewCount ?? activeSelectedGame.steamReviewCount ?? 0;
            if (finalAppId && reviewCount >= 25) {
              try {
                const pt = await fetchSteamSpyPlaytime(finalAppId);
                if (active && pt) {
                  setDesktopPlaytime(pt);
                }
              } catch {}
            }
          }
        } catch {}
      }

      // C. If Epic Games Store, enrich from Epic Product Content
      const isEpic =
        (activeSelectedGame.platform || '').toLowerCase().includes('epic') ||
        (activeSelectedGame.url || '').toLowerCase().includes('epicgames.com') ||
        (activeSelectedGame.storeUrl || '').toLowerCase().includes('epicgames.com');

      if (isEpic) {
        const epicSlug = extractEpicSlug(urls);
        if (epicSlug) {
          try {
            const content = await fetchEpicProductContent(epicSlug);
            if (active && content) {
              if (content.screenshots && content.screenshots.length > 0) {
                setGameScreenshots((prev) => (prev.length > 0 ? prev : content.screenshots));
              }
              setEnrichedGameData((prev) => ({
                ...(prev || {}),
                developer: prev?.developer || content.developer,
                publisher: prev?.publisher || content.publisher,
                description: prev?.description || content.description,
              }));
            }
          } catch {}
        }
      }

      // D. Official store release date (exact date from store API)
      try {
        const exactDate = await fetchExactStoreReleaseDate(activeSelectedGame);
        if (active && exactDate) {
          setEnrichedGameData((prev) => ({
            ...(prev || {}),
            releaseDate: exactDate,
          }));
        }
      } catch {}
    }

    enrichGameDetails();

    return () => {
      active = false;
    };
  }, [activeSelectedGame?.id]);

  // Merged game detail with on-demand enriched data
  const game = useMemo(() => {
    if (!activeSelectedGame) return null;
    return {
      ...activeSelectedGame,
      ...(enrichedGameData || {}),
    };
  }, [activeSelectedGame, enrichedGameData]);

  // Sync document.title
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (route === 'game' && game) {
        document.title = `${cleanDisplayTitle(game.title)} - Claimr`;
      } else {
        document.title = 'Claimr - Free Game Radar & Alerts';
      }
    }
  }, [route, game?.title]);


  // motion-anything: decrypted-text cyberpunk title resolve
  const [scrambledTitle, setScrambledTitle] = useState('');
  useEffect(() => {
    if (!game?.title) {
      setScrambledTitle('');
      return;
    }
    const clean = cleanDisplayTitle(game.title);
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setScrambledTitle(clean);
      return;
    }
    const chars = '!<>-_/[]{}=+*^?#';
    let frame = 0;
    const totalFrames = 10;
    const interval = setInterval(() => {
      frame++;
      let result = '';
      for (let i = 0; i < clean.length; i++) {
        if (i < (frame / totalFrames) * clean.length) {
          result += clean[i];
        } else if (clean[i] === ' ') {
          result += ' ';
        } else {
          result += chars[Math.floor(Math.random() * chars.length)];
        }
      }
      setScrambledTitle(result);
      if (frame >= totalFrames) {
        clearInterval(interval);
        setScrambledTitle(clean);
      }
    }, 24);
    return () => clearInterval(interval);
  }, [game?.id]);

  // Filtered Feed Deals
  const filteredFeedDeals = useMemo(() => {
    return activeDeals
      .filter((d) => {
        // Search
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = (d.title || '').toLowerCase().includes(q);
          const matchStore = (d.platform || '').toLowerCase().includes(q);
          if (!matchTitle && !matchStore) return false;
        }
        // Type filter
        if (filterTypes.length > 0) {
          const matchesAny = filterTypes.some((tk) => matchDealType(d, tk));
          if (!matchesAny) return false;
        }
        // Claim Method filter
        if (filterMethods.length > 0) {
          const isTasks = !!d.isEntryRequired || d.claimMethod === 'tasks';
          const matchOneClick = filterMethods.includes('One-click') && !isTasks;
          const matchTasks = filterMethods.includes('Tasks required') && isTasks;
          if (!matchOneClick && !matchTasks) return false;
        }
        // Store filter
        if (filterStores.length > 0) {
          const plat = (d.platform || '').toLowerCase();
          const matches = filterStores.some((s) => plat.includes(s.toLowerCase()));
          if (!matches) return false;
        }

        // Prime Gaming visibility check
        const isPrime = d.id === 'prime-gaming-notice' || d.isBundleNotice || (d.platform || '').toLowerCase().includes('prime');
        if (isPrime && (primeHidden || (settings as any)['Prime Gaming'] === false)) {
          return false;
        }

        // Store enabled setting check
        const plat = (d.platform || '').toLowerCase();
        for (const store of ALL_SETTINGS_STORES) {
          if ((settings as any)[store] === false) {
            const sKey = store.toLowerCase();
            if (plat.includes(sKey) || (sKey === 'epic games' && plat.includes('epic'))) {
              return false;
            }
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOption === 'end') {
          const aEnd = a.endDate ? parseDateToMs(a.endDate) : 9e15;
          const bEnd = b.endDate ? parseDateToMs(b.endDate) : 9e15;
          return aEnd - bEnd;
        }
        if (sortOption === 'new') {
          return (b.createdAt || 0) - (a.createdAt || 0);
        }
        if (sortOption === 'val') {
          const aVal = typeof a.worth === 'number' ? a.worth : parseFloat(String(a.worth || 0).replace(/[^0-9.]/g, '')) || 0;
          const bVal = typeof b.worth === 'number' ? b.worth : parseFloat(String(b.worth || 0).replace(/[^0-9.]/g, '')) || 0;
          return bVal - aVal;
        }
        return 0;
      });
  }, [activeDeals, searchQuery, filterTypes, filterMethods, filterStores, sortOption]);

  // Available store filters list
  const availableStores = useMemo(() => {
    const set = new Set<string>();
    activeDeals.forEach((d) => {
      const p = (d.platform || 'Other').trim();
      if (p.toLowerCase().includes('steam')) set.add('Steam');
      else if (p.toLowerCase().includes('epic')) set.add('Epic Games');
      else if (p.toLowerCase().includes('gog')) set.add('GOG');
      else if (/\bitch(?:\.io)?\b/i.test(p)) set.add('itch.io');
      else if (p.toLowerCase().includes('playstation') || p.toLowerCase().includes('ps')) set.add('PlayStation');
      else if (p.toLowerCase().includes('xbox')) set.add('Xbox');
      else if (p.toLowerCase().includes('prime') || p.toLowerCase().includes('amazon')) set.add('Prime Gaming');
      else set.add(p.split(' ')[0] || 'Other');
    });
    return Array.from(set).sort();
  }, [activeDeals]);

  const MAIN_STORES = ['Steam', 'Epic Games', 'GOG', 'Prime Gaming', 'itch.io', 'Xbox', 'PlayStation'];

  const filteredStoresList = useMemo(() => {
    const q = storeSearch.trim().toLowerCase();
    if (q) {
      return availableStores.filter((s) => s.toLowerCase().includes(q));
    }
    if (!showAllStores) {
      return availableStores.filter(
        (s) =>
          MAIN_STORES.some((m) => s.toLowerCase().includes(m.toLowerCase())) ||
          filterStores.includes(s)
      );
    }
    return availableStores;
  }, [availableStores, storeSearch, showAllStores, filterStores]);

  // Helpers
  const isClaimed = (id: string) => dealsStore.isClaimed(id);

  const isHot = (deal: Deal | null | undefined): boolean => {
    if (!deal || !deal.endDate) return false;
    const end = parseDateToMs(deal.endDate);
    const leftMs = end - Date.now();
    return leftMs > 0 && leftMs < 12 * 3600 * 1000; // Under 12 hours
  };

  const getCountdownParts = (deal: Deal | null | undefined) => {
    if (!deal || !deal.endDate) return [[0, 'Days'], [0, 'Hrs'], [0, 'Min'], [0, 'Sec']];
    const end = parseDateToMs(deal.endDate);
    const s = Math.max(0, (end - Date.now()) / 1000);
    return [
      [Math.floor(s / 86400), 'Days'],
      [Math.floor((s % 86400) / 3600), 'Hrs'],
      [Math.floor((s % 3600) / 60), 'Min'],
      [Math.floor(s % 60), 'Sec'],
    ];
  };

  const getCleanPrice = (deal: Deal): { original: string; free: boolean } => {
    const rawWorth = deal.worth || deal.originalPrice;
    if (rawWorth && rawWorth !== 'N/A' && rawWorth !== '0' && rawWorth !== '$0' && rawWorth !== '$0.00') {
      const pStr = String(rawWorth).startsWith('$') ? String(rawWorth) : `$${rawWorth}`;
      return { original: pStr, free: true };
    }
    return { original: '', free: true };
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return '#34C759';
    if (score >= 50) return '#FFCC00';
    return '#FF3B30';
  };

  const getStoreDisplayName = (platform?: string) => {
    if (!platform) return 'Game';
    const p = platform.toLowerCase();
    if (p.includes('steam')) return 'Steam';
    if (p.includes('epic')) return 'Epic';
    if (p.includes('gog')) return 'GOG';
    if (/\bitch(?:\.io)?\b/i.test(p)) return 'itch.io';
    if (p.includes('playstation') || p.includes('ps4') || p.includes('ps5')) return 'PlayStation';
    if (p.includes('xbox')) return 'Xbox';
    if (p.includes('prime')) return 'Prime';
    return platform.split('/')[0].trim();
  };

  const totalVaultValueSaved = useMemo(() => {
    return calculateVaultValue(claimedDeals);
  }, [claimedDeals]);

  const totalActiveValue = useMemo(() => {
    return activeDeals.reduce((sum, d) => {
      const val = typeof d.worth === 'number' ? d.worth : parseFloat(String(d.worth || 0).replace(/[^0-9.]/g, '')) || 0;
      return sum + val;
    }, 0);
  }, [activeDeals]);

  const getTimeAgo = (dateVal?: string | number) => {
    if (!dateVal) return 'Just now';
    const ms = typeof dateVal === 'number' ? dateVal : parseDateToMs(dateVal);
    if (!ms || isNaN(ms)) return 'Just now';
    const diff = Math.max(0, Date.now() - ms);
    if (diff < 60000) return 'Just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const filteredAlertsDeals = useMemo(() => {
    if (alertsFilter === 'all' || alertsFilter === 'live') {
      return activeDeals;
    }
    return activeDeals.filter((d) =>
      (d.platform || d.source || '').toLowerCase().includes(alertsFilter.toLowerCase())
    );
  }, [activeDeals, alertsFilter]);

  // Card Renderer matching pure hallmark design
  const renderCard = (d: Deal, extraMeta?: string) => {
    const priceInfo = getCleanPrice(d);
    const claimedNow = isClaimed(d.id);
    const hotNow = isHot(d);
    const storeName = getStoreDisplayName(d.platform || d.source);
    const typeInfo = formatTypeBadge(d.type);
    const artworkUrl = d.resolvedImage || d.bannerImage || d.image;
    const is18Gated = (!!d.is18Plus || !!d.isNsfw) && !dealsStore.is18PlusRevealed(d.id) && !alwaysShow18Plus;
    const hasImage = !is18Gated && !!artworkUrl && !failedImages[d.id];

    const isPrimeDeal = d.id === 'prime-gaming-notice' || d.isBundleNotice || (d.platform || '').toLowerCase().includes('prime');
    const rawStoreUrl = d.giveawayUrl || d.url || d.storeUrl || '';
    const directStoreUrl = rawStoreUrl && !rawStoreUrl.startsWith('http') ? `https://${rawStoreUrl}` : rawStoreUrl;

    return (
      <div
        key={d.id}
        className="card spotlight-card"
        role="button"
        tabIndex={0}
        onMouseMove={handleSpotlightMouseMove}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.quick-claim-pill')) {
            return;
          }
          triggerSpark(e);
          if (isPrimeDeal) {
            navigateTo('prime');
          } else {
            navigateTo('game', d.id);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if ((e.target as HTMLElement).closest('.quick-claim-pill')) return;
            if (isPrimeDeal) {
              navigateTo('prime');
            } else {
              navigateTo('game', d.id);
            }
          }
        }}
      >
        <div className="art">
          {directStoreUrl && !isPrimeDeal && !is18Gated && (
            <a
              href={directStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="quick-claim-pill"
              title={`Claim on ${storeName}`}
              onClick={(e) => {
                e.stopPropagation();
                triggerSpark(e, '#FFD700', 'loot');
                setPendingClaimDealId(d.id);
              }}
            >
              Claim ↗
            </a>
          )}
          {is18Gated ? (
            <div
              className="art-fallback"
              style={{
                backgroundColor: '#121214',
                border: '1px dashed rgba(255, 59, 48, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#FF3B30',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(255, 59, 48, 0.15)',
                  letterSpacing: '0.06em',
                }}
              >
                18+
              </span>
              <span className="art-fallback-title" style={{ color: 'var(--tx)', fontSize: '13px', fontWeight: 600 }}>
                18+ game
              </span>
              <span style={{ color: 'var(--mu)', fontSize: '11px' }}>Click to view</span>
            </div>
          ) : hasImage ? (
            <img
              src={artworkUrl}
              alt={d.title}
              onError={() => {
                setFailedImages((prev) => ({ ...prev, [d.id]: true }));
              }}
            />
          ) : (
            <div className="art-fallback">
              <StoreLogo store={storeName} size={28} />
              <span className="art-fallback-title">{cleanDisplayTitle(d.title)}</span>
            </div>
          )}
        </div>
        <div style={{ paddingTop: '12px' }}>
          <div className="row" style={{ alignItems: 'center', gap: '6px' }}>
            <span className="m">{typeInfo.label}</span>
            <span className="tag-sep">&middot;</span>
            <StoreLogo store={storeName} size={13} />
            <span className="m">{storeName}</span>
          </div>
          <div className="t s">{is18Gated ? '18+ game' : cleanDisplayTitle(d.title)}</div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              {claimedNow ? (
                <span className="claimed">Claimed &#10003;</span>
              ) : priceInfo.original ? (
                <>
                  <span className="old">{priceInfo.original}</span>{' '}
                  <span className="free shiny-text">&rarr; FREE</span>
                </>
              ) : (
                <span className="free shiny-text">FREE</span>
              )}
            </span>
            <span
              className={`m ${hotNow ? 'hot-pulse' : ''}`}
              style={{ color: hotNow ? 'var(--time)' : 'var(--mu)' }}
            >
              {extraMeta || (d.endDate ? getTimeLeft(d.endDate) : 'Active')}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const pendingDeal = pendingClaimDealId ? activeDeals.find((d) => d.id === pendingClaimDealId) || claimedDeals.find((d) => d.id === pendingClaimDealId) : null;
  const showClaimPrompt = pendingDeal && !isClaimed(pendingDeal.id);

  if (route === 'landing') {
    return (
      <ClaimrLandingPage
        onLaunchApp={() => {
          triggerSync(true);
          navigateTo('feed');
        }}
        onNavigate={navigateTo as any}
        activeDealsCount={activeDeals.length}
        totalSavingsValue={totalActiveValue}
      />
    );
  }

  return (
    <div style={{ backgroundColor: 'var(--bg)', color: 'var(--tx)', minHeight: '100vh', width: '100%' }}>
      {/* INJECT EXACT CSS */}
      <style dangerouslySetInnerHTML={{ __html: WEB_CSS + `
        @keyframes claimr-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .sync-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 500;
          color: var(--tx);
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--bd);
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
          user-select: none;
        }
        .sync-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.25);
        }
        .sync-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .sync-icon-spin {
          animation: claimr-spin 0.8s linear infinite;
        }
      ` }} />

      {/* HEADER */}
      <header className="desktop-header">
        <div className="wrap desktop-nav">
          <div
            className="desktop-logo"
            onClick={() => navigateTo('landing')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <img
              src="/claimr-wordmark.png"
              alt="Claimr"
              style={{
                height: '24px',
                width: 'auto',
                maxWidth: '120px',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>
          <nav className="desktop-nav-links" aria-label="Main navigation">
            <a
              href="#landing"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('landing');
              }}
            >
              Overview
            </a>
            <a
              className={route === 'home' ? 'on' : ''}
              href="#home"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('home');
              }}
            >
              Home
            </a>
            <a
              className={route === 'feed' ? 'on' : ''}
              href="#feed"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('feed');
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              Feed
              <span
                className="radar-ping"
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--gr)',
                  display: 'inline-block',
                }}
                title="Live deals feed active"
              />
            </a>
            <a
              className={route === 'vault' ? 'on' : ''}
              href="#vault"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('vault');
              }}
            >
              Vault {claimedDeals.length > 0 && `(${claimedDeals.length})`}
            </a>
            <a
              className={route === 'alerts' ? 'on' : ''}
              href="#alerts"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('alerts');
              }}
            >
              Alerts
            </a>
            <a
              className={route === 'settings' ? 'on' : ''}
              href="#settings"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('settings');
              }}
            >
              Settings
            </a>
          </nav>
          <div className="row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => triggerSync(true)}
              disabled={syncing}
              className="sync-btn"
              title="Sync latest giveaways (Press 'R')"
              aria-label="Sync giveaways"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={syncing ? 'sync-icon-spin' : ''}
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
              <span>{syncing ? 'Syncing...' : 'Sync'}</span>
            </button>
            {onSwitchToMobile && (
              <button
                onClick={onSwitchToMobile}
                className="btn o"
                style={{ padding: '7px 13px', fontSize: '12px' }}
                title="Switch to Mobile App View"
              >
                Mobile View
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="wrap" style={{ paddingTop: '8px' }}>
        {/* 1. HOME VIEW */}
        {route === 'home' && (
          <div>
            {/* FULL-PAGE HERO: first screen of desktop site (100svh minus top bar) */}
            <section className="full-hero">
              {heroDeal ? (
                <>
                  <div>
                    <div className="row" style={{ alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                      <span className="m">{formatTypeBadge(heroDeal.type).label}</span>
                      <span className="tag-sep">&middot;</span>
                      <span className="m">
                        {heroDeal.isEntryRequired || heroDeal.claimMethod === 'tasks'
                          ? 'TASKS'
                          : 'ONE-CLICK'}
                      </span>
                      <span className="tag-sep">&middot;</span>
                      <StoreLogo store={heroDeal.platform || heroDeal.source} size={14} />
                      <span className="m">{getStoreDisplayName(heroDeal.platform || heroDeal.source)}</span>
                    </div>

                    <h1
                      className="s"
                      style={{
                        fontSize: 'clamp(52px, 6.5vw, 96px)',
                        lineHeight: 0.98,
                        margin: '16px 0 20px',
                        fontWeight: 700,
                        letterSpacing: '-0.025em',
                      }}
                    >
                      {cleanDisplayTitle(heroDeal.title)}
                    </h1>

                    <div className={isHot(heroDeal) ? 'hot' : ''}>
                      <div className="cd" id="cd">
                        {getCountdownParts(heroDeal).map(([val, label]) => (
                          <div key={label}>
                            <b>{String(val).padStart(2, '0')}</b>
                            <span className="m">{label}</span>
                          </div>
                        ))}
                      </div>
                      <div className="bar">
                        <i style={{ width: '42%' }}></i>
                      </div>
                    </div>

                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: '28px' }}>
                      <div style={{ fontSize: '20px' }}>
                        {getCleanPrice(heroDeal).original ? (
                          <>
                            <span className="old">{getCleanPrice(heroDeal).original}</span>{' '}
                            <span className="free shiny-text">&rarr; FREE</span>
                          </>
                        ) : (
                          <span className="free shiny-text">FREE</span>
                        )}
                      </div>
                      <div className="row" style={{ gap: '16px' }}>
                        <a
                          href={heroDeal.giveawayUrl || heroDeal.url || heroDeal.storeUrl || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="m"
                          style={{ textDecoration: 'underline', cursor: 'pointer' }}
                        >
                          Open giveaway ↗
                        </a>
                        <button
                          className="btn"
                          onClick={() => navigateTo('game', heroDeal.id)}
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* HERO ARTWORK (Fills panel, fades into black, aligned with wrap) */}
                  <div
                    className="hero-art-container border-beam spotlight-card"
                    onMouseMove={handleSpotlightMouseMove}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      triggerSpark(e);
                      navigateTo('game', heroDeal.id);
                    }}
                  >
                    {heroDeal.resolvedImage || heroDeal.bannerImage || heroDeal.image ? (
                      <>
                        <img
                          src={heroDeal.resolvedImage || heroDeal.bannerImage || heroDeal.image}
                          alt={heroDeal.title}
                          className="hero-art-image"
                        />
                        <div className="hero-art-gradient" />
                      </>
                    ) : (
                      <div className="art-fallback">
                        <StoreLogo store={heroDeal.platform || heroDeal.source} size={48} />
                        <span className="art-fallback-title" style={{ fontSize: '22px' }}>
                          {cleanDisplayTitle(heroDeal.title)}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ padding: '64px 0' }}>
                  <h1 className="s" style={{ fontSize: '64px', fontWeight: 400 }}>
                    All caught up
                  </h1>
                  <p style={{ color: 'var(--mu)' }}>Nothing unclaimed is ending soon.</p>
                </div>
              )}
            </section>

            {/* EXTENSIBLE SECTIONS (from homeSections.tsx) */}
            {HOME_SECTIONS.filter((s) => s.enabled).map((sec) => {
              const Comp = sec.component;
              return (
                <Comp
                  key={sec.id}
                  activeDeals={activeDeals}
                  claimedDeals={claimedDeals}
                  heroDeal={heroDeal}
                  topRatedDeals={topRatedDeals}
                  endingSoonDeals={endingSoonDeals}
                  primeHidden={primeHidden}
                  onHidePrime={() => setPrimeHidden(true)}
                  onNavigate={navigateTo}
                  renderCard={renderCard}
                />
              );
            })}
          </div>
        )}

        {/* 2. FEED VIEW */}
        {route === 'feed' && (
          <div className="layout">
            {/* SIDEBAR FILTERS (Sticky) */}
            <aside className="feed-sidebar" aria-label="Filters">
              {/* SEARCH */}
              <div className="filter-group">
                <input
                  type="text"
                  placeholder="Search giveaways..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="inp"
                  style={{ fontSize: '14px' }}
                />
              </div>

              {/* TYPE FILTER */}
              <div className="filter-group">
                <span className="m" style={{ display: 'block', marginBottom: '8px' }}>Type</span>
                {['GAME', 'DLC', 'BETA'].map((typeKey) => {
                  const on = filterTypes.includes(typeKey);
                  const count = activeDeals.filter((d) => matchDealType(d, typeKey)).length;
                  return (
                    <div
                      key={typeKey}
                      className={`filter-row ${on ? 'active' : ''}`}
                      onClick={() => {
                        setFilterTypes((prev) =>
                          on ? prev.filter((t) => t !== typeKey) : [...prev, typeKey]
                        );
                      }}
                    >
                      <div className="filter-left">
                        <span className="filter-check">&#10003;</span>
                        <span>{typeKey}</span>
                      </div>
                      <span className="filter-count">{count}</span>
                    </div>
                  );
                })}
              </div>

              {/* CLAIM METHOD FILTER */}
              <div className="filter-group">
                <span className="m" style={{ display: 'block', marginBottom: '8px' }}>Claim method</span>
                {['One-click', 'Tasks required'].map((methodKey) => {
                  const on = filterMethods.includes(methodKey);
                  const isTaskReq = methodKey === 'Tasks required';
                  const count = activeDeals.filter((d) => (!!d.isEntryRequired || d.claimMethod === 'tasks') === isTaskReq).length;
                  return (
                    <div
                      key={methodKey}
                      className={`filter-row ${on ? 'active' : ''}`}
                      onClick={() => {
                        setFilterMethods((prev) =>
                          on ? prev.filter((m) => m !== methodKey) : [...prev, methodKey]
                        );
                      }}
                    >
                      <div className="filter-left">
                        <span className="filter-check">&#10003;</span>
                        <span>{methodKey}</span>
                      </div>
                      <span className="filter-count">{count}</span>
                    </div>
                  );
                })}
              </div>

              {/* STORE FILTER */}
              <div className="filter-group">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="m">Store</span>
                  {availableStores.length > 6 && (
                    <span className="m" style={{ fontSize: '10px' }}>{availableStores.length} total</span>
                  )}
                </div>
                {/* Store Search Input */}
                {availableStores.length > 6 && (
                  <div className="store-search-box">
                    <input
                      type="text"
                      placeholder="Filter stores..."
                      value={storeSearch}
                      onChange={(e) => setStoreSearch(e.target.value)}
                      className="store-search-input"
                    />
                  </div>
                )}
                {filteredStoresList.map((storeKey) => {
                  const on = filterStores.includes(storeKey);
                  const count = activeDeals.filter((d) =>
                    (d.platform || '').toLowerCase().includes(storeKey.toLowerCase())
                  ).length;
                  return (
                    <div
                      key={storeKey}
                      className={`filter-row ${on ? 'active' : ''}`}
                      onClick={() => {
                        setFilterStores((prev) =>
                          on ? prev.filter((s) => s !== storeKey) : [...prev, storeKey]
                        );
                      }}
                    >
                      <div className="filter-left">
                        <span className="filter-check">&#10003;</span>
                        <StoreLogo store={storeKey} size={13} />
                        <span>{storeKey}</span>
                      </div>
                      <span className="filter-count">{count}</span>
                    </div>
                  );
                })}

                {!storeSearch.trim() && availableStores.length > filteredStoresList.length && (
                  <button
                    type="button"
                    className="store-toggle-btn"
                    onClick={() => setShowAllStores(true)}
                  >
                    + Show more stores ({availableStores.length - filteredStoresList.length})
                  </button>
                )}
                {!storeSearch.trim() && showAllStores && availableStores.length > 6 && (
                  <button
                    type="button"
                    className="store-toggle-btn"
                    onClick={() => setShowAllStores(false)}
                  >
                    - Show fewer stores
                  </button>
                )}
              </div>

              {/* CLEAR FILTERS BUTTON */}
              {filterTypes.length > 0 || filterMethods.length > 0 || filterStores.length > 0 || searchQuery ? (
                <button
                  className="btn o"
                  id="clr"
                  style={{ width: '100%', marginTop: '12px', padding: '10px 14px', fontSize: '12px' }}
                  onClick={() => {
                    setFilterTypes([]);
                    setFilterMethods([]);
                    setFilterStores([]);
                    setSearchQuery('');
                    setStoreSearch('');
                  }}
                >
                  Clear all filters
                </button>
              ) : null}
            </aside>

            {/* FEED MAIN GRID */}
            <div>
              {/* ACTIVE FILTERS CHIP BAR */}
              {(filterTypes.length > 0 || filterMethods.length > 0 || filterStores.length > 0 || searchQuery) && (
                <div className="active-filters-bar">
                  <span className="m" style={{ marginRight: '4px' }}>Active:</span>
                  {searchQuery && (
                    <button className="filter-chip" onClick={() => setSearchQuery('')} title="Remove search filter">
                      <span>&ldquo;{searchQuery}&rdquo;</span>
                      <span style={{ marginLeft: '4px', opacity: 0.7 }}>&times;</span>
                    </button>
                  )}
                  {filterTypes.map((t) => (
                    <button
                      key={t}
                      className="filter-chip"
                      onClick={() => setFilterTypes((prev) => prev.filter((x) => x !== t))}
                      title={`Remove ${t}`}
                    >
                      <span>{t}</span>
                      <span style={{ marginLeft: '4px', opacity: 0.7 }}>&times;</span>
                    </button>
                  ))}
                  {filterMethods.map((m) => (
                    <button
                      key={m}
                      className="filter-chip"
                      onClick={() => setFilterMethods((prev) => prev.filter((x) => x !== m))}
                      title={`Remove ${m}`}
                    >
                      <span>{m}</span>
                      <span style={{ marginLeft: '4px', opacity: 0.7 }}>&times;</span>
                    </button>
                  ))}
                  {filterStores.map((s) => (
                    <button
                      key={s}
                      className="filter-chip"
                      onClick={() => setFilterStores((prev) => prev.filter((x) => x !== s))}
                      title={`Remove ${s}`}
                    >
                      <span>{s}</span>
                      <span style={{ marginLeft: '4px', opacity: 0.7 }}>&times;</span>
                    </button>
                  ))}
                  <button
                    className="clear-filters-btn"
                    onClick={() => {
                      setFilterTypes([]);
                      setFilterMethods([]);
                      setFilterStores([]);
                      setSearchQuery('');
                      setStoreSearch('');
                    }}
                  >
                    Clear all
                  </button>
                </div>
              )}

              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="m">
                    Showing {filteredFeedDeals.length} of {activeDeals.length}
                  </span>
                  <span className="tag-sep">&middot;</span>
                  <span className="m" style={{ color: 'var(--mu)', fontSize: '11px' }}>
                    Updated just now
                  </span>
                </div>
                <div className="row" style={{ gap: '16px' }}>
                  <span className="m">Sort:</span>
                  <button
                    className="m"
                    style={{
                      background: 'none',
                      border: 0,
                      cursor: 'pointer',
                      color: sortOption === 'end' ? 'var(--tx)' : 'var(--mu)',
                      borderBottom: sortOption === 'end' ? '1px solid var(--tx)' : '1px solid transparent',
                    }}
                    onClick={() => setSortOption('end')}
                  >
                    Ending soonest
                  </button>
                  <button
                    className="m"
                    style={{
                      background: 'none',
                      border: 0,
                      cursor: 'pointer',
                      color: sortOption === 'new' ? 'var(--tx)' : 'var(--mu)',
                      borderBottom: sortOption === 'new' ? '1px solid var(--tx)' : '1px solid transparent',
                    }}
                    onClick={() => setSortOption('new')}
                  >
                    Newest
                  </button>
                  <button
                    className="m"
                    style={{
                      background: 'none',
                      border: 0,
                      cursor: 'pointer',
                      color: sortOption === 'val' ? 'var(--tx)' : 'var(--mu)',
                      borderBottom: sortOption === 'val' ? '1px solid var(--tx)' : '1px solid transparent',
                    }}
                    onClick={() => setSortOption('val')}
                  >
                    Highest value
                  </button>
                </div>
              </div>

              <div className="grid">
                {filteredFeedDeals.length > 0 ? (
                  filteredFeedDeals.map((d) => renderCard(d))
                ) : (
                  <p style={{ color: 'var(--mu)', gridColumn: '1 / -1' }}>
                    Nothing matches. Clear a filter to see more.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. VAULT VIEW */}
        {route === 'vault' && (
          <div>
            <section style={{ padding: '48px 0 24px' }}>
              <h1 className="s" style={{ fontSize: '64px', fontWeight: 400, margin: 0 }}>
                Your vault
              </h1>
              <p style={{ color: 'var(--mu)' }}>What you've claimed, and what it would have cost.</p>
              <div className="grid" style={{ marginTop: '24px' }}>
                <div className="rule" style={{ display: 'block' }}>
                  <span className="m">Saved</span>
                  <div className="s big">
                    <CountUpValue value={totalVaultValueSaved} prefix="$" decimals={2} />
                  </div>
                </div>
                <div className="rule" style={{ display: 'block' }}>
                  <span className="m">Games</span>
                  <div className="s big">
                    <CountUpValue value={claimedDeals.length} decimals={0} />
                  </div>
                </div>
                <div className="rule" style={{ display: 'block' }}>
                  <span className="m">Avg per game</span>
                  <div className="s big">
                    <CountUpValue
                      value={claimedDeals.length > 0 ? totalVaultValueSaved / claimedDeals.length : 0}
                      prefix="$"
                      decimals={2}
                    />
                  </div>
                </div>
              </div>
            </section>
            <section className="sec">
              <div className="grid">
                {claimedDeals.length > 0 ? (
                  claimedDeals.map((d) => renderCard(d, 'Saved in Vault'))
                ) : (
                  <p style={{ color: 'var(--mu)' }}>Nothing here yet. Claim a game and it shows up here.</p>
                )}
              </div>
            </section>
          </div>
        )}

        {/* 4. ALERTS / DROP RADAR VIEW */}
        {route === 'alerts' && (
          <section style={{ padding: '48px 0 56px', maxWidth: '780px' }}>
            <h1 className="s" style={{ fontSize: 'clamp(44px, 5vw, 64px)', fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Drop Radar.
            </h1>
            <p style={{ color: 'var(--mu)', fontSize: '16px', margin: '0 0 28px' }}>
              New free games, as they go live.
            </p>

            {/* DESKTOP PUSH NOTIFICATIONS BANNER */}
            {!hasNotifPermission && (
              <div
                className="rule"
                style={{
                  alignItems: 'center',
                  marginBottom: '24px',
                  padding: '16px 20px',
                  backgroundColor: 'var(--hl)',
                  borderRadius: '8px',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>Browser Push Alerts</span>
                  <br />
                  <span className="m" style={{ color: 'var(--mu)', fontSize: '12px' }}>
                    Receive instant push notifications the moment a high-value game drops.
                  </span>
                </div>
                <button
                  className="btn"
                  onClick={async () => {
                    const granted = await requestNotificationPermissions();
                    setHasNotifPermission(granted);
                  }}
                >
                  Enable
                </button>
              </div>
            )}

            {/* PLATFORM FILTER TABS (Underline text-tab style matching nav) */}
            <div
              className="tabs"
              style={{
                display: 'flex',
                gap: '28px',
                overflowX: 'auto',
                paddingBottom: '0',
                marginBottom: '32px',
                borderBottom: '1px solid var(--hl)',
              }}
            >
              {[
                { id: 'all', label: 'All' },
                { id: 'live', label: 'Live now' },
                { id: 'Steam', label: 'Steam' },
                { id: 'Epic', label: 'Epic Games' },
                { id: 'Prime', label: 'Prime Gaming' },
                { id: 'GOG', label: 'GOG' },
              ].map((tab) => {
                const isActive = alertsFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    className="m"
                    onClick={() => setAlertsFilter(tab.id)}
                    style={{
                      padding: '8px 0 12px',
                      background: 'none',
                      border: 'none',
                      borderBottom: isActive ? '2px solid var(--tx)' : '2px solid transparent',
                      color: isActive ? 'var(--tx)' : 'var(--mu)',
                      cursor: 'pointer',
                      fontWeight: isActive ? 700 : 500,
                      fontSize: '12px',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      transition: 'color 150ms ease, border-color 150ms ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* TIMELINE EVENT STREAM */}
            <div style={{ position: 'relative', paddingLeft: '28px', borderLeft: '1px solid var(--bd)', marginLeft: '12px' }}>
              {filteredAlertsDeals.map((d, index) => {
                const store = getStoreDisplayName(d.platform || d.source);
                const price = getCleanPrice(d);
                const relTime = d.publishedAt ? getTimeAgo(d.publishedAt) : (d.createdAt ? getTimeAgo(d.createdAt) : 'Live');

                return (
                  <div
                    key={d.id}
                    style={{
                      position: 'relative',
                      marginBottom: '36px',
                    }}
                  >
                    {/* TIMELINE DOT */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '-33px',
                        top: '5px',
                        width: '9px',
                        height: '9px',
                        borderRadius: '50%',
                        backgroundColor: index === 0 ? '#39ff14' : 'var(--mu)',
                        border: '2px solid var(--bg)',
                      }}
                    />

                    {/* EVENT META ROW */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <StoreLogo store={store} size={13} />
                      <span className="m" style={{ color: 'var(--tx)', fontSize: '12px', fontWeight: 600 }}>{store}</span>
                      <span className="tag-sep">&middot;</span>
                      <span className="m" style={{ color: '#39ff14', fontSize: '11px' }}>Live</span>
                      <span className="tag-sep">&middot;</span>
                      <span className="m" style={{ color: 'var(--mu)', fontSize: '11px' }}>{relTime}</span>
                    </div>

                    {/* EVENT TITLE & ACTIONS */}
                    <a
                      href={`#game/${d.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo('game', d.id);
                      }}
                      style={{ textDecoration: 'none', display: 'block' }}
                    >
                      <h3
                        className="s"
                        style={{
                          fontSize: '20px',
                          fontWeight: 600,
                          margin: '0 0 4px',
                          color: 'var(--tx)',
                          lineHeight: 1.3,
                        }}
                      >
                        {cleanDisplayTitle(d.title)}
                      </h3>
                      {price.original && (
                        <div className="m" style={{ color: 'var(--mu)', fontSize: '13px', marginBottom: '8px' }}>
                          Save {price.original}
                        </div>
                      )}
                      <span
                        className="m"
                        style={{
                          color: 'var(--tx)',
                          fontSize: '12px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: 600,
                        }}
                      >
                        View &rarr;
                      </span>
                    </a>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 5. SETTINGS VIEW */}
        {route === 'settings' && (
          <section style={{ padding: '48px 0 56px', maxWidth: '640px' }}>
            <h1 className="s" style={{ fontSize: '64px', fontWeight: 400, margin: '0 0 24px' }}>
              Settings
            </h1>

            {/* SECTION 1: PROFILE */}
            <div className="m" style={{ marginTop: '28px' }}>
              Profile
            </div>
            <div className="rule" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px', padding: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '15px', fontWeight: 600 }}>Your name</span>
                  <div className="m" style={{ textTransform: 'none', letterSpacing: 0, font: "400 13px 'Plus Jakarta Sans', sans-serif", marginTop: '2px' }}>
                    Shown in the greeting on Home.
                  </div>
                </div>
                <button
                  className="btn"
                  style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600 }}
                  onClick={handleSaveProfileName}
                >
                  {savedNameSuccess ? 'Saved ✓' : 'Save'}
                </button>
              </div>
              <input
                className="inp"
                id="nm"
                placeholder="Hunter"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveProfileName();
                }}
                maxLength={20}
                style={{ marginTop: '6px' }}
              />
            </div>

            {/* SECTION 2: PWA INSTALL & UPDATE ROWS */}
            {deferredInstallPrompt && (
              <>
                <div className="m" style={{ marginTop: '36px' }}>
                  Web App
                </div>
                <div className="rule" style={{ alignItems: 'center' }}>
                  <span>
                    Install Claimr
                    <br />
                    <span className="m" style={{ textTransform: 'none', letterSpacing: 0, font: "400 13px 'Plus Jakarta Sans', sans-serif" }}>
                      Add to desktop or shelf for quick launch
                    </span>
                  </span>
                  <button
                    className="btn"
                    onClick={() => {
                      deferredInstallPrompt.prompt();
                      deferredInstallPrompt.userChoice.then(() => setDeferredInstallPrompt(null));
                    }}
                  >
                    Install App
                  </button>
                </div>
              </>
            )}

            {swUpdateAvailable && (
              <div className="rule" style={{ alignItems: 'center', marginTop: '16px' }}>
                <span>
                  Update available
                  <br />
                  <span className="m" style={{ textTransform: 'none', letterSpacing: 0, font: "400 13px 'Plus Jakarta Sans', sans-serif" }}>
                    A fresh version of Claimr is ready
                  </span>
                </span>
                <button
                  className="btn"
                  onClick={() => {
                    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
                    }
                    window.location.reload();
                  }}
                >
                  Refresh
                </button>
              </div>
            )}

            {/* SECTION 3: NOTIFICATIONS */}
            <div className="m" style={{ marginTop: '36px' }}>
              Notifications
            </div>
            {(() => {
              const isActive = hasNotifPermission && settings.notif;
              return (
                <>
                  <div className="rule" style={{ alignItems: 'center' }}>
                    <span>
                      Push notifications
                      <br />
                      {isActive ? (
                        <span
                          style={{
                            textTransform: 'none',
                            letterSpacing: 0,
                            font: "500 13px 'Plus Jakarta Sans', sans-serif",
                            color: '#34C759',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginTop: '2px',
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Notifications enabled
                        </span>
                      ) : (
                        <span className="m" style={{ textTransform: 'none', letterSpacing: 0, font: "400 13px 'Plus Jakarta Sans', sans-serif" }}>
                          Tell me when a new game goes free
                        </span>
                      )}
                    </span>
                    {isActive ? (
                      <button
                        className="sw"
                        role="switch"
                        aria-checked={true}
                        onClick={() => {
                          setSettings((s: any) => ({ ...s, notif: false }));
                        }}
                      >
                        <i></i>
                      </button>
                    ) : (
                      <button
                        className="btn"
                        style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600 }}
                        onClick={async () => {
                          const granted = await requestNotificationPermissions();
                          setHasNotifPermission(granted);
                          if (granted) {
                            registerWebPushSubscription().catch(() => {});
                            setSettings((s: any) => ({ ...s, notif: true }));
                          }
                        }}
                      >
                        Enable
                      </button>
                    )}
                  </div>
                </>
              );
            })()}

            {/* SECTION 4: STORES TO WATCH (ALL 11 PLATFORMS) */}
            <div className="m" style={{ marginTop: '36px' }}>
              Stores to watch
            </div>
            {ALL_SETTINGS_STORES.map((storeKey) => {
              const isOn = (settings as any)[storeKey] !== false;
              return (
                <div key={storeKey} className="rule" style={{ alignItems: 'center' }}>
                  <span className="row" style={{ alignItems: 'center', gap: '8px' }}>
                    <StoreLogo store={storeKey} size={15} />
                    <span>{storeKey}</span>
                  </span>
                  <button
                    className="sw"
                    role="switch"
                    aria-checked={isOn}
                    onClick={() => setSettings((s: any) => ({ ...s, [storeKey]: !isOn }))}
                  >
                    <i></i>
                  </button>
                </div>
              );
            })}

            {/* SECTION 5: GAME TYPES */}
            <div className="m" style={{ marginTop: '36px' }}>
              Game types
            </div>
            {(['GAME', 'DLC', 'BETA'] as const).map((typeKey) => (
              <div key={typeKey} className="rule" style={{ alignItems: 'center' }}>
                <span>{typeKey === 'GAME' ? 'Game' : typeKey === 'DLC' ? 'DLC' : 'Beta'}</span>
                <button
                  className="sw"
                  role="switch"
                  aria-checked={(settings as any)[typeKey] !== false}
                  onClick={() => setSettings((s: any) => ({ ...s, [typeKey]: !(s as any)[typeKey] }))}
                >
                  <i></i>
                </button>
              </div>
            ))}

            {/* SECTION 6: CONTENT */}
            <div className="m" style={{ marginTop: '36px' }}>
              Content
            </div>
            <div className="rule" style={{ alignItems: 'center' }}>
              <span>
                Always show 18+ games
                <br />
                <span className="m" style={{ textTransform: 'none', letterSpacing: 0, font: "400 13px 'Plus Jakarta Sans', sans-serif" }}>
                  Show mature drops without asking each time
                </span>
              </span>
              <button
                className="sw"
                role="switch"
                aria-checked={alwaysShow18Plus}
                onClick={handleToggleAlwaysShow18Plus}
              >
                <i></i>
              </button>
            </div>

            {/* SECTION 8: PRIVACY */}
            <div className="m" style={{ marginTop: '36px' }}>
              Privacy
            </div>
            <div className="rule" style={{ alignItems: 'center' }}>
              <span>
                Anonymous usage count
                <br />
                <span className="m" style={{ textTransform: 'none', letterSpacing: 0, font: "400 13px 'Plus Jakarta Sans', sans-serif" }}>
                  Sends a random ID and the Claimr version once a day. Nothing else.
                </span>
              </span>
              <button
                className="sw"
                role="switch"
                aria-checked={settings.usage !== false}
                onClick={() => setSettings((s: any) => ({ ...s, usage: !s.usage }))}
              >
                <i></i>
              </button>
            </div>

            {/* SECTION 9: FEEDBACK AND SUGGESTIONS */}
            <div className="m" style={{ marginTop: '36px' }}>
              Feedback and suggestions
            </div>
            <div style={{ marginTop: '12px' }}>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Got suggestions or found an issue? Tell us here..."
                style={{
                  width: '100%',
                  minHeight: '92px',
                  boxSizing: 'border-box',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--bd)',
                  borderRadius: '8px',
                  color: 'var(--tx)',
                  font: "400 14px 'Plus Jakarta Sans', sans-serif",
                  padding: '12px',
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  className="btn"
                  disabled={feedbackSending || !feedbackText.trim()}
                  style={{
                    padding: '7px 18px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    opacity: feedbackSending || !feedbackText.trim() ? 0.5 : 1,
                    cursor: feedbackSending || !feedbackText.trim() ? 'not-allowed' : 'pointer',
                  }}
                  onClick={handleFeedbackSubmit}
                >
                  {feedbackSending ? 'Submitting...' : feedbackSubmitted ? 'Feedback sent ✓' : 'Submit'}
                </button>
              </div>
            </div>

            {/* SECTION 10: ABOUT */}
            <div className="m" style={{ marginTop: '36px' }}>
              About
            </div>
            <div className="rule" style={{ alignItems: 'center' }}>
              <div
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    navigator.clipboard.writeText(`Claimr v${getCurrentNativeVersion()}`);
                  }
                  setVersionCopied(true);
                  setTimeout(() => setVersionCopied(false), 2000);
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.4px', fontFamily: "'Unbounded', sans-serif" }}>
                  Claimr
                </div>
                <div className="m" style={{ textTransform: 'none', letterSpacing: 0, font: "400 13px 'Plus Jakarta Sans', sans-serif" }}>
                  v{getCurrentNativeVersion()} {versionCopied ? '· Copied' : '· Click to copy'}
                </div>
              </div>
            </div>

            <div className="rule" style={{ alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>What's new</span>
                <div className="m" style={{ textTransform: 'none', letterSpacing: 0, font: "400 13px 'Plus Jakarta Sans', sans-serif" }}>
                  Release notes and latest improvements
                </div>
              </div>
              <a
                href={updateInfo?.releaseUrl || 'https://github.com/EklavyaAhuja/claimr/releases'}
                target="_blank"
                rel="noopener noreferrer"
                className="btn o"
                style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600 }}
              >
                ↗
              </a>
            </div>

            <div className="rule" style={{ alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>Join our Discord</span>
                <div className="m" style={{ textTransform: 'none', letterSpacing: 0, font: "400 13px 'Plus Jakarta Sans', sans-serif" }}>
                  Chat with other Claimr users and hear about drops early
                </div>
              </div>
              <a
                href="https://discord.gg/gMATmybhk5"
                target="_blank"
                rel="noopener noreferrer"
                className="btn o"
                style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600 }}
              >
                ↗
              </a>
            </div>

            <div className="rule" style={{ alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>Support on Ko-fi</span>
                <div className="m" style={{ textTransform: 'none', letterSpacing: 0, font: "400 13px 'Plus Jakarta Sans', sans-serif" }}>
                  Help cover server and notification costs
                </div>
              </div>
              <a
                href="https://ko-fi.com/eklavyaahuja"
                target="_blank"
                rel="noopener noreferrer"
                className="btn o"
                style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600 }}
              >
                ↗
              </a>
            </div>
          </section>
        )}

        {/* 6. PRIME GAMING VIEW (#prime) */}
        {route === 'prime' && (
          <div>
            <div style={{ padding: '36px 0 16px' }}>
              <a
                href="#home"
                className="m"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('home');
                }}
              >
                &larr; Back
              </a>
            </div>
            <section style={{ maxWidth: '640px', padding: '16px 0 56px' }}>
              <div className="row">
                <span className="ic">P</span>
                <span className="m" style={{ color: 'var(--tx)' }}>
                  Prime Gaming
                </span>
              </div>
              <h1
                className="s"
                style={{
                  fontSize: 'clamp(44px, 6vw, 72px)',
                  lineHeight: 1,
                  margin: '14px 0 8px',
                  fontWeight: 400,
                }}
              >
                Prime Gaming
              </h1>
              <p style={{ color: 'var(--mu)', margin: '0 0 20px' }}>Included with Prime</p>

              <div className="rule">
                <span className="m">Requires</span>
                <span>Amazon Prime membership</span>
              </div>

              <span className="m" style={{ display: 'block', margin: '28px 0 10px' }}>
                Some of the games available now
              </span>
              <p style={{ margin: '0 0 6px', fontSize: '20px' }}>
                Free PC games and in-game content rotate weekly.
              </p>
              <p style={{ color: 'var(--mu)', margin: '0 0 28px' }}>
                Open Prime Gaming to see the full list.
              </p>

              <a
                href={PRIME_GAMING_CONFIG.PRIMARY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
              >
                Open Prime Gaming
              </a>
            </section>
          </div>
        )}

        {/* 7. GAME DETAIL VIEW (#game/:id) */}
        {route === 'game' && (
          <div>
            {game ? (
              <div>
                <div style={{ paddingTop: '36px', paddingBottom: '12px' }}>
                  <a
                    href="#feed"
                    className="m"
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo('feed');
                    }}
                  >
                    &larr; Back to feed
                  </a>
                </div>
                {((!!game.is18Plus || !!game.isNsfw) && !dealsStore.is18PlusRevealed(game.id) && !alwaysShow18Plus) ? (
                  <div
                    style={{
                      maxWidth: '520px',
                      margin: '56px auto',
                      padding: '40px 32px',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 59, 48, 0.25)',
                      borderRadius: '16px',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 12px',
                        borderRadius: '16px',
                        backgroundColor: 'rgba(255, 59, 48, 0.15)',
                        color: '#FF3B30',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        marginBottom: '16px',
                        border: '1px solid rgba(255, 59, 48, 0.3)',
                      }}
                    >
                      18+ MATURE CONTENT
                    </div>
                    <h2 className="s" style={{ fontSize: '28px', margin: '0 0 12px' }}>
                      Age-Restricted Drop
                    </h2>
                    <p style={{ color: 'var(--mu)', fontSize: '14px', lineHeight: 1.6, marginBottom: '28px' }}>
                      This title is rated 18+ / Mature and may contain graphic violence, suggestive themes, mature language, or adult content. Do you want to view this game?
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '300px', margin: '0 auto' }}>
                      <button
                        className="btn"
                        style={{ width: '100%', padding: '12px 20px', fontSize: '14px', fontWeight: 600 }}
                        onClick={() => {
                          dealsStore.reveal18PlusDeal(game.id);
                          setAlwaysShow18Plus(dealsStore.getAlwaysShow18Plus());
                        }}
                      >
                        Yes, Show Game
                      </button>
                      <button
                        className="btn o"
                        style={{ width: '100%', padding: '10px 20px', fontSize: '13px' }}
                        onClick={() => {
                          handleToggleAlwaysShow18Plus();
                        }}
                      >
                        Always show 18+ content
                      </button>
                      <button
                        className="btn g"
                        style={{ width: '100%', padding: '10px 20px', fontSize: '13px' }}
                        onClick={() => navigateTo('feed')}
                      >
                        Not now / Go back
                      </button>
                    </div>
                  </div>
                ) : (
                <section className="cols">
                  {/* LEFT: ARTWORK, VIDEO TRAILER & REAL SCREENSHOTS, PROSE */}
                  <div style={{ minWidth: 0 }}>
                    <div className="art" style={{ aspectRatio: '16/9', width: '100%', overflow: 'hidden' }}>
                      {game.resolvedImage || game.bannerImage || game.image ? (
                        <img
                          src={game.resolvedImage || game.bannerImage || game.image}
                          alt={game.title}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                      ) : (
                        <div className="art-fallback">
                          <StoreLogo store={game.platform || game.source} size={48} />
                          <span className="art-fallback-title" style={{ fontSize: '20px' }}>
                            {cleanDisplayTitle(game.title)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* MEDIA STRIP */}
                    <div style={{ marginTop: '20px', marginBottom: '8px', width: '100%' }}>
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span className="m">Media & Screenshots</span>
                        <div className="row" style={{ gap: '6px' }}>
                          <button
                            type="button"
                            className="btn o"
                            style={{ padding: '4px 10px', fontSize: '14px', lineHeight: 1 }}
                            onClick={() => {
                              const el = document.getElementById('media-strip-scroll');
                              if (el) el.scrollBy({ left: -260, behavior: 'smooth' });
                            }}
                            title="Scroll left"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            className="btn o"
                            style={{ padding: '4px 10px', fontSize: '14px', lineHeight: 1 }}
                            onClick={() => {
                              const el = document.getElementById('media-strip-scroll');
                              if (el) el.scrollBy({ left: 260, behavior: 'smooth' });
                            }}
                            title="Scroll right"
                          >
                            ›
                          </button>
                        </div>
                      </div>
                      <div id="media-strip-scroll" className="media">
                        {/* Trailer tile */}
                        {gameTrailer && gameTrailer.url ? (
                          <div
                            className="tile v dock-zoom"
                            onClick={() => {
                              setFullscreenTrailerUrl(gameTrailer.url);
                            }}
                            title="Play official trailer in fullscreen"
                          >
                            <img
                              src={gameTrailer.thumbnail || game.resolvedImage || game.bannerImage || game.image}
                              alt="Trailer thumbnail"
                              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
                            />
                            <span className="pl">&#9654; Trailer</span>
                          </div>
                        ) : null}

                        {/* Screenshot tiles */}
                        {gameScreenshots.map((item: any, idx: number) => {
                          const sUrl = typeof item === 'string' ? item : (item?.path_thumbnail || item?.path_full || '');
                          if (!sUrl) return null;
                          return (
                            <div
                              key={idx}
                              className="tile dock-zoom"
                              onClick={() => {
                                setLightboxImageIndex(idx);
                                setLightboxZoom(1);
                              }}
                            >
                              <img
                                src={sUrl}
                                alt={`screenshot ${idx + 1}`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* HOW TO CLAIM */}
                    {game.instructions ? (
                      <div style={{ marginTop: '28px' }}>
                        <span className="m" style={{ display: 'block', marginBottom: '8px' }}>
                          How to claim
                        </span>
                        <p className="detail-prose" style={{ color: 'var(--tx)', whiteSpace: 'pre-line' }}>
                          {cleanFormatting(game.instructions)}
                        </p>
                      </div>
                    ) : null}

                    {/* ABOUT THIS GAME */}
                    {game.description || game.aboutGame ? (
                      <div style={{ marginTop: '28px' }}>
                        <span className="m" style={{ display: 'block', marginBottom: '8px' }}>
                          About this game
                        </span>
                        <p className="detail-prose" style={{ color: '#B0B0B8', whiteSpace: 'pre-line', lineHeight: 1.65, fontSize: '15px' }}>
                          {cleanFormatting(game.description || game.aboutGame || '')}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {/* RIGHT COLUMN: TAGS, TITLE, COUNTDOWN, PRICE, CLAIM BUTTON (Above Fold) */}
                  <aside style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: '6px', alignItems: 'center', marginBottom: '12px' }}>
                      <span className="m">{formatTypeBadge(game.type).label}</span>
                      <span className="tag-sep">&middot;</span>
                      <span className="m">
                        {game.isEntryRequired || game.claimMethod === 'tasks' ? 'TASKS' : 'ONE-CLICK'}
                      </span>
                      <span className="tag-sep">&middot;</span>
                      <StoreLogo store={game.platform || game.source} size={13} />
                      <span className="m">{getStoreDisplayName(game.platform || game.source)}</span>
                    </div>

                    <h1
                      className="s"
                      style={{
                        fontSize: 'clamp(32px, 3.5vw, 44px)',
                        fontWeight: 700,
                        lineHeight: 1.1,
                        margin: '0 0 16px',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {cleanDisplayTitle(game.title)}
                    </h1>

                    {game.endDate ? (
                      <div className={isHot(game) ? 'hot' : ''}>
                        <div className="cd" style={{ gap: '24px', margin: '14px 0' }}>
                          {getCountdownParts(game).map(([val, label]) => (
                            <div key={label}>
                              <b style={{ fontSize: '44px' }}>{String(val).padStart(2, '0')}</b>
                              <span className="m">{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ margin: '14px 0' }}>
                        <span className="m" style={{ color: 'var(--tx)', fontSize: '13px' }}>Permanent drop &middot; Keep forever</span>
                      </div>
                    )}

                    <div style={{ fontSize: '20px', margin: '16px 0 20px' }}>
                      {getCleanPrice(game).original ? (
                        <>
                          <span className="old">{getCleanPrice(game).original}</span>{' '}
                          <span className="free shiny-text">&rarr; FREE</span>
                        </>
                      ) : (
                        <span className="free shiny-text">FREE</span>
                      )}
                    </div>

                    {/* PROMINENT CLAIM ACTION BUTTON(S) */}
                    {(() => {
                      const epicMobile = (game.androidUrl && game.iosUrl)
                        ? { androidUrl: game.androidUrl, iosUrl: game.iosUrl }
                        : resolveEpicMobileUrls(game.title, game.giveawayUrl || game.url, (game.instructions || '') + ' ' + (game.description || ''), game.platform);

                      if (epicMobile?.androidUrl && epicMobile?.iosUrl) {
                        return (
                          <div style={{ display: 'flex', gap: '10px', margin: '20px 0 28px' }}>
                            <a
                              href={epicMobile.androidUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn"
                              style={{ flex: 1, padding: '16px 18px', fontSize: '14px', fontWeight: 700 }}
                              onClick={(e) => {
                                triggerSpark(e, '#FFD700', 'loot');
                                setPendingClaimDealId(game.id);
                              }}
                            >
                              Claim (Android) ↗
                            </a>
                            <a
                              href={epicMobile.iosUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn g"
                              style={{ flex: 1, padding: '16px 18px', fontSize: '14px', fontWeight: 700 }}
                              onClick={(e) => {
                                triggerSpark(e, '#FFD700', 'loot');
                                setPendingClaimDealId(game.id);
                              }}
                            >
                              Claim (iOS) ↗
                            </a>
                          </div>
                        );
                      }

                      const rawDetailUrl = game.giveawayUrl || game.storeUrl || game.url || '#';
                      const detailClaimUrl = rawDetailUrl && rawDetailUrl !== '#' && !rawDetailUrl.startsWith('http') ? `https://${rawDetailUrl}` : rawDetailUrl;

                      return (
                        <div style={{ margin: '20px 0 28px' }}>
                          {isClaimed(game.id) ? (
                            <a
                              href={detailClaimUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn o"
                              style={{ display: 'block', width: '100%', padding: '16px 24px', fontSize: '15px', fontWeight: 600, textDecoration: 'none' }}
                              onClick={(e) => {
                                triggerSpark(e, '#00D2A0', 'loot');
                              }}
                            >
                              Claimed &#10003;
                            </a>
                          ) : (
                            <a
                              href={detailClaimUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn"
                              style={{ display: 'block', width: '100%', padding: '16px 24px', fontSize: '15px', fontWeight: 700, textDecoration: 'none' }}
                              onClick={(e) => {
                                triggerSpark(e, '#FFD700', 'loot');
                                setPendingClaimDealId(game.id);
                              }}
                            >
                              {game.isEntryRequired || game.claimMethod === 'tasks'
                                ? 'Enter Giveaway ↗'
                                : `Claim on ${getStoreDisplayName(game.platform || game.source)} ↗`}
                            </a>
                          )}
                        </div>
                      );
                    })()}

                    {/* STATS STRIP: Metacritic, Steam, Playtime, Claimed */}
                    {(() => {
                      const effectiveMetacritic = game.metacriticScore;
                      const hasMetacritic = typeof effectiveMetacritic === 'number' && effectiveMetacritic > 0;

                      const effectiveSteam = game.steamRatingPercent;
                      const hasSteam = typeof effectiveSteam === 'number' && effectiveSteam > 0;

                      const effectivePlaytime = game.playtimeFormatted || desktopPlaytime;
                      const hasPlaytime = !!effectivePlaytime;

                      const claimedCount = typeof game.claimedUsers === 'number' && game.claimedUsers > 0 ? game.claimedUsers : null;
                      const hasClaimed = claimedCount !== null;

                      const statMetrics: Array<{
                        id: string;
                        value: string;
                        label: string;
                        subLabel?: string;
                        color?: string;
                        glassText: string;
                      }> = [];

                      if (hasMetacritic) {
                        const mColor = getScoreColor(effectiveMetacritic);
                        statMetrics.push({
                          id: 'metacritic',
                          value: String(effectiveMetacritic),
                          label: 'Metascore',
                          color: mColor,
                          glassText: `Metacritic Score: ${effectiveMetacritic}/100`,
                        });
                      }

                      if (hasSteam) {
                        const sColor = getScoreColor(effectiveSteam);
                        statMetrics.push({
                          id: 'steam',
                          value: `${effectiveSteam}%`,
                          label: 'Steam Rating',
                          subLabel: game.steamReviewCount ? `${game.steamReviewCount.toLocaleString()} reviews` : undefined,
                          color: sColor,
                          glassText: `Steam: ${effectiveSteam}% Positive${game.steamReviewCount ? ` (${game.steamReviewCount.toLocaleString()} reviews)` : ''}`,
                        });
                      }

                      if (hasPlaytime) {
                        statMetrics.push({
                          id: 'playtime',
                          value: effectivePlaytime,
                          label: 'Median Playtime',
                          glassText: `Median Playtime: ${effectivePlaytime}`,
                        });
                      }

                      if (hasClaimed) {
                        statMetrics.push({
                          id: 'claimed',
                          value: claimedCount.toLocaleString(),
                          label: 'Claimed',
                          glassText: `${claimedCount.toLocaleString()} gamers claimed this drop`,
                        });
                      }

                      if (statMetrics.length === 0) return null;

                      if (statMetrics.length === 1) {
                        return (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '14px 18px',
                              backgroundColor: 'rgba(255, 255, 255, 0.04)',
                              backdropFilter: 'blur(16px)',
                              WebkitBackdropFilter: 'blur(16px)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '12px',
                              marginBottom: '24px',
                              textAlign: 'center',
                            }}
                          >
                            <span
                              style={{
                                color: statMetrics[0].color || 'var(--tx)',
                                fontSize: '14px',
                                fontWeight: 600,
                              }}
                            >
                              {statMetrics[0].glassText}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          className="stats"
                          style={{
                            gridTemplateColumns: `repeat(${statMetrics.length}, 1fr)`,
                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid var(--bd)',
                            borderRadius: '12px',
                            padding: '18px 12px',
                            marginBottom: '24px',
                          }}
                        >
                          {statMetrics.map((item, idx) => (
                            <div
                              key={item.id}
                              style={{
                                borderLeft: idx > 0 ? '1px solid var(--bd)' : 'none',
                                paddingLeft: idx > 0 ? '12px' : '0',
                                textAlign: 'center',
                              }}
                            >
                              <b
                                className="s"
                                style={{
                                  color: item.color || 'var(--tx)',
                                  fontSize: '20px',
                                  display: 'block',
                                  fontWeight: 700,
                                }}
                              >
                                {item.value}
                              </b>
                              <span className="m" style={{ color: 'var(--mu)', fontSize: '11px', marginTop: '2px', display: 'block' }}>
                                {item.label}
                              </span>
                              {item.subLabel && (
                                <span className="m" style={{ color: 'var(--mu)', fontSize: '10px', textTransform: 'none', letterSpacing: 0, marginTop: '2px', display: 'block' }}>
                                  {item.subLabel}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* SECONDARY LINKS */}
                    {game.steamUrl && (
                      <div className="row" style={{ gap: '14px', marginBottom: '28px' }}>
                        <a
                          href={game.steamUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn o"
                          style={{ flex: 1, padding: '10px 14px', fontSize: '13px' }}
                        >
                          Steam Page ↗
                        </a>
                      </div>
                    )}

                    {/* METADATA RULES */}
                    {game.metacriticScore && game.metacriticScore > 0 ? (
                      <div className="rule">
                        <span className="m">Metacritic</span>
                        <span style={{ color: getScoreColor(game.metacriticScore), fontWeight: 700 }}>
                          {game.metacriticScore}/100
                        </span>
                      </div>
                    ) : null}
                    {game.developer && (
                      <div className="rule">
                        <span className="m">Developer</span>
                        <span>{game.developer}</span>
                      </div>
                    )}
                    {game.publisher && game.publisher !== game.developer && (
                      <div className="rule">
                        <span className="m">Publisher</span>
                        <span>{game.publisher}</span>
                      </div>
                    )}
                    {game.releaseDate && (
                      <div className="rule">
                        <span className="m">Release date</span>
                        <span>{game.releaseDate}</span>
                      </div>
                    )}
                    {game.genres && game.genres.length > 0 && (
                      <div className="rule">
                        <span className="m">Genres</span>
                        <span>{game.genres.join(', ')}</span>
                      </div>
                    )}
                    {(game.playtimeFormatted || desktopPlaytime) && (
                      <div style={{ marginTop: '16px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--mu)', letterSpacing: '0.04em' }}>
                        Playtime: SteamSpy
                      </div>
                    )}
                  </aside>
                </section>
                )}
              </div>
            ) : (
              <div style={{ padding: '60px 0', textAlign: 'center' }}>
                <h1 className="s" style={{ fontSize: '48px' }}>
                  Game not found
                </h1>
                <p style={{ color: 'var(--mu)' }}>This giveaway may have expired or is no longer available.</p>
                <button className="btn" onClick={() => navigateTo('feed')}>
                  Back to feed
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* LIGHTBOX MODAL (mouse wheel zoom, double-click reset, arrow keys, escape) */}
      {lightboxImageIndex !== null && gameScreenshots.length > 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.92)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
          }}
          onClick={() => {
            setLightboxImageIndex(null);
            setLightboxZoom(1);
          }}
          onWheel={(e) => {
            e.preventDefault();
            setLightboxZoom((prev) => Math.min(3, Math.max(1, prev + (e.deltaY < 0 ? 0.2 : -0.2))));
          }}
        >
          <div
            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={() => setLightboxZoom((z) => (z > 1 ? 1 : 2))}
          >
            {/* Prev Screenshot Button */}
            {gameScreenshots.length > 1 && (
              <button
                type="button"
                className="lightbox-nav-btn prev"
                aria-label="Previous screenshot"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxImageIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : gameScreenshots.length - 1));
                  setLightboxZoom(1);
                }}
              >
                ‹
              </button>
            )}

            <img
              src={
                typeof gameScreenshots[lightboxImageIndex] === 'string'
                  ? gameScreenshots[lightboxImageIndex]
                  : gameScreenshots[lightboxImageIndex]?.path_full || gameScreenshots[lightboxImageIndex]?.path_thumbnail
              }
              alt="Screenshot full view"
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain',
                borderRadius: 'var(--r)',
                transform: `scale(${lightboxZoom})`,
                transition: 'transform 150ms ease',
                cursor: lightboxZoom > 1 ? 'zoom-out' : 'zoom-in',
              }}
            />

            {/* Next Screenshot Button */}
            {gameScreenshots.length > 1 && (
              <button
                type="button"
                className="lightbox-nav-btn next"
                aria-label="Next screenshot"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxImageIndex((prev) => (prev !== null && prev < gameScreenshots.length - 1 ? prev + 1 : 0));
                  setLightboxZoom(1);
                }}
              >
                ›
              </button>
            )}

            <button
              onClick={() => {
                setLightboxImageIndex(null);
                setLightboxZoom(1);
              }}
              style={{
                position: 'absolute',
                top: -40,
                right: 0,
                background: 'none',
                border: 0,
                color: '#EDEDEB',
                fontSize: '28px',
                cursor: 'pointer',
              }}
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* FULLSCREEN TRAILER LIGHTBOX MODAL */}
      {fullscreenTrailerUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10001,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setFullscreenTrailerUrl(null)}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '1100px',
              aspectRatio: '16/9',
              backgroundColor: '#000000',
              borderRadius: 'var(--r)',
              overflow: 'hidden',
              boxShadow: '0 24px 60px rgba(0,0,0,0.85)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={fullscreenTrailerUrl}
              autoPlay
              controls
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
            <button
              onClick={() => setFullscreenTrailerUrl(null)}
              aria-label="Close trailer"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                zIndex: 10,
                background: 'rgba(15, 15, 16, 0.85)',
                border: '1px solid #3A3A3D',
                borderRadius: '50%',
                color: '#EDEDEB',
                width: '38px',
                height: '38px',
                fontSize: '22px',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* "DID YOU CLAIM IT?" BOTTOM SHEET */}
      {showClaimPrompt && pendingDeal && (
        <div id="sheet">
          <div className="wrap row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <span>
              <span className="s" style={{ fontSize: '26px' }}>
                Did you claim it?
              </span>
              <br />
              <span style={{ color: 'var(--mu)' }}>
                Add {cleanDisplayTitle(pendingDeal.title)} to your Vault to track your games and savings.
              </span>
            </span>
            <span className="row" style={{ gap: '12px' }}>
              <button
                className="btn g"
                onClick={() => setPendingClaimDealId(null)}
              >
                Not yet
              </button>
              <button
                className="btn"
                onClick={async () => {
                  await dealsStore.claimDeal(pendingDeal);
                  setPendingClaimDealId(null);
                }}
              >
                Yes, add to Vault
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

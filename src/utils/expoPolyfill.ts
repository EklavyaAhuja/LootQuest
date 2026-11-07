import { TurboModuleRegistry } from 'react-native';

// Ensure globalThis.expo and globalThis.expo.EventEmitter are initialized
// before any Expo modules evaluate in the JavaScript runtime.
if (typeof globalThis !== 'undefined') {
  // 1. Try to invoke native TurboModule to install JSI expo bindings if available
  try {
    const core = TurboModuleRegistry.get('ExpoModulesCore') as any;
    if (core && typeof core.installModules === 'function') {
      core.installModules();
    }
  } catch (e) {
    // Non-blocking
  }

  // 2. Ensure globalThis.expo exists
  if (!(globalThis as any).expo) {
    try {
      const { installExpoGlobalPolyfill } = require('expo-modules-core/src/polyfill/dangerous-internal');
      installExpoGlobalPolyfill();
    } catch {
      (globalThis as any).expo = {};
    }
  }

  // 3. Ensure globalThis.expo.EventEmitter exists
  if (!(globalThis as any).expo.EventEmitter) {
    try {
      const { EventEmitter } = require('expo-modules-core/src/polyfill/CoreModule');
      (globalThis as any).expo.EventEmitter = EventEmitter;
    } catch {
      class FallbackEventEmitter {
        private _listeners = new Map<string, Set<Function>>();
        addListener(event: string, listener: Function) {
          if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
          }
          this._listeners.get(event)!.add(listener);
          return {
            remove: () => {
              this.removeListener(event, listener);
            },
          };
        }
        removeListener(event: string, listener: Function) {
          this._listeners.get(event)?.delete(listener);
        }
        removeAllListeners(event?: string) {
          if (event) {
            this._listeners.get(event)?.clear();
          } else {
            this._listeners.clear();
          }
        }
        emit(event: string, ...args: any[]) {
          this._listeners.get(event)?.forEach((l) => {
            try {
              l(...args);
            } catch (err) {
              console.warn('[EventEmitter] listener error:', err);
            }
          });
        }
        listenerCount(event: string): number {
          return this._listeners.get(event)?.size ?? 0;
        }
        startObserving() {}
        stopObserving() {}
      }
      (globalThis as any).expo.EventEmitter = FallbackEventEmitter;
    }
  }
}

export {};

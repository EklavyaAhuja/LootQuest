import { AppState, AppStateStatus } from 'react-native';
import { useState, useEffect } from 'react';

type ClockListener = (now: number) => void;

class AppClockService {
  private now: number = Date.now();
  private secondListeners: Set<ClockListener> = new Set();
  private minuteListeners: Set<ClockListener> = new Set();
  private secondTimer: any = null;
  private minuteTimer: any = null;
  private isAppActive: boolean = true;

  constructor() {
    this.handleAppStateChange = this.handleAppStateChange.bind(this);
    AppState.addEventListener('change', this.handleAppStateChange);
  }

  public getNow(): number {
    return this.now;
  }

  private handleAppStateChange(nextState: AppStateStatus) {
    const wasActive = this.isAppActive;
    this.isAppActive = nextState === 'active';

    if (this.isAppActive && !wasActive) {
      // Immediately refresh current time when returning to foreground so nothing shows stale time
      this.now = Date.now();
      this.notifyAll();
      this.ensureTimers();
    } else if (!this.isAppActive) {
      // Pause clock when app goes to background to avoid wasted ticks and battery drain
      this.clearTimers();
    }
  }

  private tickSeconds() {
    this.now = Date.now();
    for (const listener of this.secondListeners) {
      try {
        listener(this.now);
      } catch (e) {
        console.error('[AppClock] second listener error:', e);
      }
    }
  }

  private tickMinutes() {
    this.now = Date.now();
    for (const listener of this.minuteListeners) {
      try {
        listener(this.now);
      } catch (e) {
        console.error('[AppClock] minute listener error:', e);
      }
    }
  }

  private notifyAll() {
    for (const listener of this.secondListeners) {
      try { listener(this.now); } catch {}
    }
    for (const listener of this.minuteListeners) {
      try { listener(this.now); } catch {}
    }
  }

  private ensureTimers() {
    if (!this.isAppActive) return;

    if (this.secondListeners.size > 0 && !this.secondTimer) {
      this.secondTimer = setInterval(() => this.tickSeconds(), 1000);
    }
    if (this.minuteListeners.size > 0 && !this.minuteTimer) {
      this.minuteTimer = setInterval(() => this.tickMinutes(), 30000);
    }
  }

  private clearTimers() {
    if (this.secondTimer) {
      clearInterval(this.secondTimer);
      this.secondTimer = null;
    }
    if (this.minuteTimer) {
      clearInterval(this.minuteTimer);
      this.minuteTimer = null;
    }
  }

  public subscribeSeconds(listener: ClockListener): () => void {
    this.secondListeners.add(listener);
    this.ensureTimers();
    // Immediate callback on mount
    listener(this.now);

    return () => {
      this.secondListeners.delete(listener);
      if (this.secondListeners.size === 0 && this.secondTimer) {
        clearInterval(this.secondTimer);
        this.secondTimer = null;
      }
    };
  }

  public subscribeMinutes(listener: ClockListener): () => void {
    this.minuteListeners.add(listener);
    this.ensureTimers();
    // Immediate callback on mount
    listener(this.now);

    return () => {
      this.minuteListeners.delete(listener);
      if (this.minuteListeners.size === 0 && this.minuteTimer) {
        clearInterval(this.minuteTimer);
        this.minuteTimer = null;
      }
    };
  }
}

export const appClock = new AppClockService();

export function useAppClockSeconds(): number {
  const [now, setNow] = useState(() => appClock.getNow());

  useEffect(() => {
    return appClock.subscribeSeconds((currentNow) => {
      setNow(currentNow);
    });
  }, []);

  return now;
}

export function useAppClockMinutes(): number {
  const [now, setNow] = useState(() => appClock.getNow());

  useEffect(() => {
    return appClock.subscribeMinutes((currentNow) => {
      setNow(currentNow);
    });
  }, []);

  return now;
}

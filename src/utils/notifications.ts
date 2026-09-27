// Web Notifications & System Alerts Helper
import { getSelectedIconTheme, ICON_THEMES, playNotificationTone } from './audioAlert';

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (e) {
      console.warn('Error requesting notification permission', e);
      return false;
    }
  }

  return false;
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export function sendBrowserNotification(title: string, options?: { body?: string; icon?: string; tag?: string; playSound?: boolean }) {
  if (!isNotificationSupported()) return;

  const currentIconTheme = getSelectedIconTheme();
  const iconConfig = ICON_THEMES.find((i) => i.id === currentIconTheme);
  const iconEmoji = iconConfig ? `${iconConfig.emoji} ` : '';
  const displayTitle = title.startsWith('🔔') || title.startsWith('📢') || title.startsWith('⚡') || title.startsWith('🛡️') || title.startsWith('🎯')
    ? title
    : `${iconEmoji}${title}`;

  if (options?.playSound) {
    playNotificationTone('normal');
  }

  if (Notification.permission === 'granted') {
    try {
      const notification = new Notification(displayTitle, {
        body: options?.body || '',
        icon: options?.icon || iconConfig?.path || '/icon.svg',
        tag: options?.tag || `monglish-${Date.now()}`,
        dir: 'rtl',
        lang: 'ar',
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (e) {
      // Catch possible ServiceWorker requirement on certain mobile browsers
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(displayTitle, {
            body: options?.body || '',
            icon: options?.icon || iconConfig?.path || '/icon.svg',
            tag: options?.tag || `monglish-${Date.now()}`,
            dir: 'rtl',
            lang: 'ar',
          } as NotificationOptions);
        }).catch(() => {});
      }
    }
  }
}

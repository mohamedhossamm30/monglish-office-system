// Advanced Web Audio API synthesizer for instant alert notifications with customizable themes
export type SoundTheme = 'chime' | 'bell' | 'marimba' | 'digital' | 'subtle';

export const SOUND_THEMES: { id: SoundTheme; label: string; desc: string; icon: string }[] = [
  { id: 'chime', label: 'نغمة هادئة رنانة (Chime)', desc: 'نغمات بلورية نقية وهادئة جداً للمكتب', icon: '✨' },
  { id: 'bell', label: 'جرس تنبيه حديث (Bell)', desc: 'رنين جرس كلاسيكي نقي وواضح', icon: '🔔' },
  { id: 'marimba', label: 'ماريمبا خشبية (Marimba)', desc: 'نغمات ماريمبا دافئة وفخمة', icon: '🎵' },
  { id: 'digital', label: 'تنبيه رقمي نقي (Digital Ping)', desc: 'نقرة رقمية سريعة ونقية', icon: '⚡' },
  { id: 'subtle', label: 'نقرة خافتة راقية (Subtle Pop)', desc: 'صوت خفيف جداً ومريح للتركيز', icon: '🍃' },
];

export function getSelectedSoundTheme(): SoundTheme {
  try {
    if (typeof window === 'undefined') return 'chime';
    return (localStorage.getItem('monglish_sound_choice') as SoundTheme) || 'chime';
  } catch {
    return 'chime';
  }
}

export function setSelectedSoundTheme(theme: SoundTheme) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem('monglish_sound_choice', theme);
  } catch {}
}

export type IconTheme = 'bell' | 'megaphone' | 'lightning' | 'shield' | 'target';

export const ICON_THEMES: { id: IconTheme; emoji: string; label: string; path: string }[] = [
  { id: 'bell', emoji: '🔔', label: 'جرس كلاسيكي', path: '/icon.svg' },
  { id: 'megaphone', emoji: '📢', label: 'بوق إداري', path: '/icon.svg' },
  { id: 'lightning', emoji: '⚡', label: 'تنبيه ذكي', path: '/icon.svg' },
  { id: 'shield', emoji: '🛡️', label: 'درع الأمان', path: '/icon.svg' },
  { id: 'target', emoji: '🎯', label: 'شعار مونجلش', path: '/icon.svg' },
];

export function getSelectedIconTheme(): IconTheme {
  try {
    if (typeof window === 'undefined') return 'bell';
    return (localStorage.getItem('monglish_icon_choice') as IconTheme) || 'bell';
  } catch {
    return 'bell';
  }
}

export function setSelectedIconTheme(theme: IconTheme) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem('monglish_icon_choice', theme);
  } catch {}
}

export function playNotificationTone(
  type: 'critical' | 'normal' | 'success' = 'normal',
  overrideTheme?: SoundTheme
) {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const activeTheme = overrideTheme || getSelectedSoundTheme();

    if (type === 'critical') {
      // Urgent double beep (580Hz -> 880Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(580, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain1.gain.setValueAtTime(0.14, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.25);

      setTimeout(() => {
        try {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(880, ctx.currentTime);
          osc2.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.15);
          gain2.gain.setValueAtTime(0.14, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start();
          osc2.stop(ctx.currentTime + 0.25);
        } catch {}
      }, 180);
      return;
    }

    if (type === 'success') {
      // Pleasant upward chord (C5 -> E5 -> G5)
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + idx * 0.08 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.35);
      });
      return;
    }

    // Normal notifications customized by activeTheme
    switch (activeTheme) {
      case 'bell': {
        // High resonance bell strike with natural decay
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc2.frequency.setValueAtTime(1760, ctx.currentTime); // Harmonic A6
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.002, ctx.currentTime + 0.55);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 0.55);
        osc2.stop(ctx.currentTime + 0.55);
        break;
      }
      case 'marimba': {
        // Wooden warm notes
        [440, 554.37, 659.25].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);
          gain.gain.setValueAtTime(0.1, ctx.currentTime + idx * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + idx * 0.06 + 0.28);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.06);
          osc.stop(ctx.currentTime + idx * 0.06 + 0.28);
        });
        break;
      }
      case 'digital': {
        // Modern crisp double ping
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, ctx.currentTime); // B5
        osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.09); // E6
        gain.gain.setValueAtTime(0.09, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.09);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.28);
        break;
      }
      case 'subtle': {
        // Gentle subtle soft pop
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(680, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
        break;
      }
      case 'chime':
      default: {
        // Calming resonant gentle crystal chime
        const freqs = [659.25, 987.77]; // E5, B5
        freqs.forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, ctx.currentTime + idx * 0.07);
          gain.gain.setValueAtTime(0.09, ctx.currentTime + idx * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + idx * 0.07 + 0.45);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.07);
          osc.stop(ctx.currentTime + idx * 0.07 + 0.45);
        });
        break;
      }
    }
  } catch {
    // AudioContext autoplay restrictions or unsupported
  }
}

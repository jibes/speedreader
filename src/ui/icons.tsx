const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const Play = () => (
  <svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="currentColor" /></svg>
);
export const Pause = () => (
  <svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1.2" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1.2" fill="currentColor" /></svg>
);
export const Back = () => (
  <svg viewBox="0 0 24 24" {...P}><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>
);
export const Close = () => (
  <svg viewBox="0 0 24 24" {...P}><path d="M18 6L6 18M6 6l12 12" /></svg>
);
export const TextSize = () => (
  <svg viewBox="0 0 24 24" {...P}><path d="M3 18l5-12 5 12M4.7 14h6.6M14.5 18l3.5-8 3.5 8M15.6 15.5h4.8" /></svg>
);
export const Minus = () => (
  <svg viewBox="0 0 24 24" {...P}><path d="M6 12h12" /></svg>
);
export const PlusI = () => (
  <svg viewBox="0 0 24 24" {...P}><path d="M12 6v12M6 12h12" /></svg>
);
export const Clip = () => (
  <svg viewBox="0 0 24 24" {...P}><path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" /></svg>
);
export const Gear = () => (
  <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);

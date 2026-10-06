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
export const Fwd = () => (
  <svg viewBox="0 0 24 24" {...P}><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg>
);
export const Close = () => (
  <svg viewBox="0 0 24 24" {...P}><path d="M18 6L6 18M6 6l12 12" /></svg>
);
export const Sliders = () => (
  <svg viewBox="0 0 24 24" {...P}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
export const Gauge = () => (
  <svg viewBox="0 0 24 24" {...P}><path d="M12 14l4-4" /><path d="M3.3 17a10 10 0 1 1 17.4 0" /></svg>
);

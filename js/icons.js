// Alle Symbole der App als Vektorgrafik, keine Emojis.
const line = (d, w = 2.2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICON = {
  search: line('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  camera: line('<path d="M4 8h3.500L9 5.500h6L16.500 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.500"/>', 2),
  close: line('<path d="M6 6l12 12M18 6L6 18"/>'),
  menu: line('<path d="M5 7h14M5 12h14M5 17h14"/>', 2.4),
  back: line('<path d="M15 5l-7 7 7 7"/>', 2.6),
  plus: line('<path d="M12 5v14M5 12h14"/>', 2.8),
  torch: line('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>', 2),
  gallery: line('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.500" cy="10" r="1.500"/><path d="M21 16l-5-5-8 8"/>', 2),
  edit: line('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>', 2),
  check: line('<path d="M5 12.500l4.500 4.500L19 7.500"/>', 2.8),
  lock: line('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 2),
  stack: line('<rect x="7" y="4" width="11" height="15" rx="2"/><path d="M4 8v11a2 2 0 0 0 2 2h8"/>', 2),
  coins: line('<circle cx="12" cy="12" r="8.500"/><path d="M15.500 9a4 4 0 1 0 0 6M7 11h6M7 13.500h5"/>', 2),
  star: line('<path d="M12 3.500l2.600 5.300 5.900.9-4.300 4.100 1 5.800-5.200-2.700-5.200 2.700 1-5.800L3.500 9.700l5.900-.9z"/>', 2),
  book: line('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>', 2),
  trend: line('<path d="M4 17l6-6 4 4 6-8"/><path d="M15 7h5v5"/>', 2.2),
  info: line('<circle cx="12" cy="12" r="8.500"/><path d="M12 11v5M12 8v.010"/>', 2.2),
  flame: line('<path d="M12 3c.5 3.500 5 5.500 5 10.500a5 5 0 0 1-10 0c0-2 1-3.500 2-4.500.3 1.500 1 2.300 2 2.500C10.500 9 11 6 12 3z"/>', 2),
  gavel: line('<path d="M13 5l6 6M10 8l6 6M11.500 6.500l-3 3M17.500 12.500l-3 3M12 12l-7.500 7.500M4 21h9"/>', 2),
  chevron: line('<path d="M9 6l6 6-6 6"/>', 2.4),
};

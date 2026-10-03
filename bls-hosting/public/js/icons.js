// Stroke icons drawn inline so they inherit the text colour and follow the theme
// on their own. Built with createElementNS because the content security policy
// refuses innerHTML. One 24 by 24 grid  one stroke weight  no fills
const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  // navigation
  overview: ['M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z'],
  runtime: ['M12 2 3 7v10l9 5 9-5V7z', 'M3 7l9 5 9-5', 'M12 12v10'],
  activity: ['M3 12h4l3 8 4-16 3 8h4'],
  plus: ['M12 5v14', 'M5 12h14'],

  // lifecycle
  start: ['M7 4.5v15l12-7.5z'],
  stop: ['M6 6h12v12H6z'],
  restart: ['M21 12a9 9 0 1 1-2.64-6.36', 'M21 3v6h-6'],
  kill: ['M12 3v9', 'M6.3 7.3a8 8 0 1 0 11.4 0'],
  install: ['M12 3v12', 'M7.5 10.5 12 15l4.5-4.5', 'M4 19h16'],

  // tabs
  console: ['M4 4h16v16H4z', 'M8 9.5 11 12l-3 2.5', 'M13 15h4'],
  files: ['M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h7A1.5 1.5 0 0 1 19 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5z'],
  env: ['M15.5 8.5a4 4 0 1 0-3.9 4.9L7 18v3h3l1-1v-2h2v-2h2l1.2-1.2a4 4 0 0 0-.7-6.3z', 'M16.5 7.5h.01'],
  settings: ['M5 7h14', 'M5 12h14', 'M5 17h14', 'M9 5v4', 'M15 10v4', 'M11 15v4'],

  // files
  file: ['M6 3h7l5 5v13H6z', 'M13 3v5h5'],
  folder: ['M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h7A1.5 1.5 0 0 1 19 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5z'],
  edit: ['M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z', 'M14.5 7.5 16.5 9.5'],
  download: ['M12 3v11', 'M7.5 9.5 12 14l4.5-4.5', 'M4 20h16'],
  upload: ['M12 15V4', 'M7.5 8.5 12 4l4.5 4.5', 'M4 20h16'],
  trash: ['M4 7h16', 'M9 7V5h6v2', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
  rename: ['M4 7V5h16v2', 'M12 5v14', 'M9.5 19h5'],
  refresh: ['M3 12a9 9 0 0 1 15.36-6.36', 'M21 12a9 9 0 0 1-15.36 6.36', 'M18 3v5h-5', 'M6 21v-5h5'],
  startup: ['M12 2.5 14.6 9h6.9l-5.6 4.1 2.1 6.6-6-4.1-6 4.1 2.1-6.6L2.5 9h6.9z'],

  // misc
  send: ['M4 12 20 4l-4 16-4-6z', 'M12 14 20 4'],
  clear: ['M6 6l12 12', 'M18 6 6 18'],
  copy: ['M9 9h11v11H9z', 'M15 5H4v11'],
  key: ['M15.5 8.5a4 4 0 1 0-3.9 4.9L7 18v3h3l1-1v-2h2v-2h2l1.2-1.2a4 4 0 0 0-.7-6.3z'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  theme: ['M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z'],
  save: ['M5 4h11l3 3v13H5z', 'M8 4v6h8V4', 'M8 20v-6h8v6'],
  warn: ['M12 4 2.5 20h19z', 'M12 10v4', 'M12 17h.01'],
};

export function icon(name, size = 15) {
  const paths = PATHS[name];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (!paths) return svg;
  // The play triangle and the stop square read better solid
  const solid = name === 'start' || name === 'stop';
  for (const d of paths) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    if (solid) path.setAttribute('fill', 'currentColor');
    svg.append(path);
  }
  return svg;
}

export const iconNames = Object.keys(PATHS);

// Өлшеу нүктелерінің орналасу сызбасы (қойдың бүйірден көрінісі)
export function schemeSVG() {
  const P = {
    rodTop: [30, 34], rodBottom: [30, 196],
    withers: [128, 66], ground: [128, 196],
    shoulder: [104, 104], pin: [272, 96],
    back: [150, 68], chest: [150, 140],
  };
  const c = { rod: '#F2A33A', H: '#13B5A5', L: '#1E6FD9', D: '#C25BD6' };
  const dot = (k, col, label, dx = 8, dy = -6, anchor = 'start') => {
    const [x, y] = P[k];
    return `<circle cx="${x}" cy="${y}" r="5" fill="${col}" stroke="#06101E" stroke-width="1.5"/>
      <text x="${x + dx}" y="${y + dy}" font-size="11" font-weight="700" fill="currentColor" text-anchor="${anchor}">${label}</text>`;
  };
  return `
  <svg class="scheme" viewBox="0 0 360 214" role="img" aria-label="Өлшеу нүктелерінің сызбасы">
    <line x1="0" y1="196" x2="360" y2="196" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5"/>
    <!-- қой (сызба) -->
    <g fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-opacity=".55" stroke-width="1.6">
      <path d="M104 104 C100 82 116 66 140 66 C175 62 230 64 262 72 C284 78 290 98 280 118 C272 136 250 144 226 144 L170 144 C150 144 132 142 120 136 C108 130 104 118 104 104 Z"/>
      <path d="M118 80 C106 64 92 50 78 46 C70 44 62 50 64 60 C66 68 76 72 86 78 C96 86 104 92 108 98"/>
      <path d="M122 136 L120 196 M136 140 L138 196 M240 140 L242 196 M256 136 L260 196" fill="none"/>
    </g>
    <!-- рейка -->
    <rect x="26" y="34" width="8" height="162" rx="2" fill="${c.rod}" fill-opacity=".25" stroke="${c.rod}" stroke-width="1.5"/>
    <!-- H -->
    <line x1="${P.withers[0]}" y1="${P.withers[1]}" x2="${P.ground[0]}" y2="${P.ground[1]}" stroke="${c.H}" stroke-width="2.5" stroke-dasharray="0"/>
    <!-- L -->
    <line x1="${P.shoulder[0]}" y1="${P.shoulder[1]}" x2="${P.pin[0]}" y2="${P.pin[1]}" stroke="${c.L}" stroke-width="2.5"/>
    <!-- D -->
    <line x1="${P.back[0]}" y1="${P.back[1]}" x2="${P.chest[0]}" y2="${P.chest[1]}" stroke="${c.D}" stroke-width="2.5"/>
    ${dot('rodTop', c.rod, 'Рейка ұшы', 10, 4)}
    ${dot('rodBottom', c.rod, 'Рейка табаны', 10, -6)}
    ${dot('withers', c.H, 'Шоқтық', -8, -8, 'end')}
    ${dot('ground', c.H, 'Жер', -8, -6, 'end')}
    ${dot('shoulder', c.L, 'Иық буыны', -8, 4, 'end')}
    ${dot('pin', c.L, 'Шонданай', 8, -4)}
    ${dot('back', c.D, 'Арқа', 8, -8)}
    ${dot('chest', c.D, 'Кеуде асты', 8, 14)}
    <text x="120" y="176" font-size="13" font-weight="800" fill="${c.H}" text-anchor="end">H</text>
    <text x="200" y="94" font-size="13" font-weight="800" fill="${c.L}">L</text>
    <text x="156" y="112" font-size="13" font-weight="800" fill="${c.D}">D</text>
  </svg>`;
}

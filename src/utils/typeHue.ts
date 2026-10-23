const HUES = [4, 22, 40, 75, 105, 150, 175, 205, 230, 260, 290, 330];

/* FNV-1a over the lowercased type, so a type always maps to one color —
 * same scheme as okf-link-type-badge, okf-frontmatter-page and
 * okf-bundle-navigator. */
export function typeHue(type: string): number {
    const s = type.toLowerCase();
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return HUES[(h >>> 0) % HUES.length];
}

/* Spread order for indexed assignment (registered journals): maximally
 * separated hues first — green, red, blue, orange, purple, then the
 * remaining slots — so adjacent journals never sit near each other in
 * the spectrum */
const SPREAD = [105, 4, 230, 22, 260, 150, 330, 75, 290, 175, 40, 205];

export function paletteHue(index: number): number {
    return SPREAD[((index % SPREAD.length) + SPREAD.length) % SPREAD.length];
}

/** Official NSK logo artwork (supplied as nsk_Logo-01.svg). Paths are drawn in white on the brand navy. */
export const NSK_NAVY = "#132c5b";

/** Tight crop around the artwork (the source file's 47.4×28.9 canvas includes padding). */
export const NSK_LOGO_VIEWBOX = "5.4 7 35 13.5";

export const NSK_LOGO_PATHS = [
  "M23.7,9.2c1.6,0,2.9,0.6,3.8,1.3l-0.6,2.7c0,0-1.7-1.5-3.1-1.5c-0.9,0-1.1,0.6-1.1,0.9c0,0.4,0.3,0.7,0.7,0.9c0.9,0.5,2.7,1.4,2.7,3.4c0,3.4-3.8,3.6-4.5,3.6c-1.2,0-2.9-0.5-4-1l0.6-2.8c1,0.4,2.5,1.2,3.5,1.2c0.6,0,1-0.5,1-0.9c0-0.4-0.3-0.7-0.8-0.9c-0.6-0.3-2.6-1.2-2.6-3.3C19.4,11.2,20.5,9.2,23.7,9.2z",
  "M22.3,7.4c-3.4,0-6.4,0.3-7.4,4.7l-0.8,3.5l-2.8-6.3H8.2L5.8,20.1h3.4l1.3-6l2.7,6h3.3c0,0,1.2-5.3,1.7-7.6c0.6-2.8,2.2-4.1,6-4.1l16.4,0l1-1L22.3,7.4z",
  "M40,9.3L35.9,9.3L31.2,14L32.3,9.3L28.8,9.3L26.4,20.1L29.9,20.1L31,15.2L34,20.1L38,20.1L34.7,14.6Z",
];

/** Standalone SVG markup (for HTML strings such as the PDF export template). */
export function nskLogoSvg(opts: { height: number; fill?: string }) {
  const [, , w, h] = NSK_LOGO_VIEWBOX.split(" ").map(Number);
  const width = Math.round((opts.height * w) / h);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${NSK_LOGO_VIEWBOX}" width="${width}" height="${opts.height}" role="img" aria-label="NSK"><g fill="${opts.fill ?? "#fff"}">${NSK_LOGO_PATHS.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`;
}

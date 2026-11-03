export type ObjectOrigin = { x: number; y: number; width: number; height: number };

/** Measure the physical object, including on the shelf's separate + control. */
export function objectOrigin(button: HTMLElement): ObjectOrigin | undefined {
  const item = button.closest("[data-product-id]") ?? button;
  const art = item.querySelector<HTMLElement>("[data-sticker-object]") ?? item.querySelector<HTMLElement>(".mh-product-art, .mobile-shelf__art");
  if (!art) return undefined;
  const box = art.getBoundingClientRect();
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

import { ART_SRC, type ProductDef } from "@/lib/catalog";
import { cn } from "@/lib/cn";

export function PackShot({
  product,
  className,
  size = "md",
}: {
  product: ProductDef;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const src = ART_SRC[product.artKey];
  const h = size === "lg" ? "h-28" : size === "sm" ? "h-12" : "h-20";
  return (
    <span className={cn("relative inline-flex items-end justify-center", h, className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={product.name}
          draggable={false}
          className={cn("h-full w-auto object-contain img-edge rounded-[6px]", size === "sm" && "rounded-[4px]")}
        />
      ) : (
        <svg viewBox="0 0 64 88" className="h-full w-auto" aria-hidden>
          <rect x="6" y="6" width="52" height="76" rx="6" fill={product.body} />
          <rect x="6" y="6" width="52" height="22" rx="6" fill={product.band} />
          <rect x="6" y="24" width="52" height="4" fill={product.foil} />
        </svg>
      )}
    </span>
  );
}

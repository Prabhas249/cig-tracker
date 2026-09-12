import { ART_SRC, type ProductDef } from "@/lib/catalog";
import { cn } from "@/lib/cn";

export function ProductShot({
  product,
  className,
  size = "md",
}: {
  product: ProductDef;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const src = product.kind === "cig" ? ART_SRC.cork : ART_SRC[product.artKey];
  const h = size === "lg" ? "h-32" : size === "sm" ? "h-12" : "h-[5.25rem]";
  return (
    <span className={cn("serve-3d inline-flex items-end justify-center", size !== "sm" && "serve-float", h, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={product.name}
        draggable={false}
        className="h-full w-auto object-contain"
      />
    </span>
  );
}

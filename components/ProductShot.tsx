import { type ProductDef } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { StickerObject } from "./StickerObject";

export function ProductShot({
  product,
  className,
  size = "md",
}: {
  product: ProductDef;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const h = size === "lg" ? "h-32" : size === "sm" ? "h-12" : "h-[5.25rem]";
  return (
    <span className={cn("product-shot serve-3d", h, className)}>
      <StickerObject product={product} size={size}/>
    </span>
  );
}

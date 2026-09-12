"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";

type PressableProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"
> & { static?: boolean };

export function Pressable({
  static: isStatic,
  className,
  children,
  ...props
}: PressableProps) {
  return (
    <motion.button
      {...props}
      type={props.type ?? "button"}
      whileTap={isStatic ? undefined : { scale: 0.96 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(className)}
    >
      {children}
    </motion.button>
  );
}

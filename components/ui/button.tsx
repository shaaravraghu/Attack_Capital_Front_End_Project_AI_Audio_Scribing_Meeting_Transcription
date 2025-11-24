"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import Link from "next/link";
import { ButtonHTMLAttributes, forwardRef } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-slate-950",
  {
    variants: {
      variant: {
        default: "bg-brand text-brand-foreground hover:bg-brand/80",
        ghost: "bg-white/5 text-white hover:bg-white/15",
        danger: "bg-red-600 text-white hover:bg-red-500"
      },
      size: {
        default: "h-11 px-5 py-2 text-sm",
        sm: "h-9 px-3 text-sm",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    href?: string;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, variant, asChild, href, children, ...props }, ref) => {
    const classes = clsx(buttonVariants({ variant, size }), className);

    if (asChild && href) {
      return (
        <Link href={href} className={classes} ref={ref as any}>
          {children}
        </Link>
      );
    }

    return (
      <button
        ref={ref}
        className={classes}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";



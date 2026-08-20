import clsx, { type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * cn — className composer used by the shadcn-derived primitives.
 *
 * Unlike `cx` (clsx only), this runs the result through tailwind-merge so a
 * caller's `className` reliably overrides a variant's default utilities
 * (e.g. passing `bg-surface` beats the variant's `bg-brand-500`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export default cn

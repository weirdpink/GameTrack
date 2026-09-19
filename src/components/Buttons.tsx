import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "icon";
};

/**
 * Unified button styles for the whole app — the brutalist boxed language:
 * square corners, black uppercase type, solid border. Variants:
 * - primary:   filled accent box (nav tabs, confirm actions)
 * - secondary: transparent box with border (cancel, alt actions)
 * - icon:      compact square for icon-only buttons (settings gear, arrows)
 */
export const Buttons: React.FC<ButtonProps> = ({
  variant = "secondary",
  type = "button",
  className = "",
  ...props
}) => {
  const base =
    "cursor-pointer border transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-brand-accent focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary:
      "bg-brand-accent text-black border border-transparent hover:bg-brand-accent-hover font-black uppercase tracking-wider text-xs",
    secondary:
      "bg-transparent text-white border border-brand-border hover:border-brand-accent hover:text-brand-accent font-black uppercase tracking-wider text-xs",
    icon:
      "bg-transparent text-brand-muted border border-brand-border hover:border-brand-border hover:text-white",
  };
  return (
    <button type={type} className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
};

export default Buttons;

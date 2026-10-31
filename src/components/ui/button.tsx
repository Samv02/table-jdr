import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

/**
 * Le bouton de toute l'appli. Son apparence vient de ses classes (table-integration.css).
 * Il ne valide un formulaire que s'il est marqué type="submit".
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, type = "button", ...props }, ref) =>
    asChild ? <Slot ref={ref} {...props} /> : <button ref={ref} type={type} {...props} />,
);
Button.displayName = "Button";

export { Button };

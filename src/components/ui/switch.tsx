"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
<<<<<<< HEAD
      "peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
      // A finger-sized target around the small track.
      "after:absolute after:-inset-x-1.5 after:-inset-y-2.5 after:content-['']",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
=======
      "peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
>>>>>>> 5c1d94054047b9a8e141db7699f22c3285dc1d90
      "disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
<<<<<<< HEAD
        // White in both themes: a dark knob on the blue track read as a hole.
        "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] ring-0 transition-transform duration-200",
=======
        "pointer-events-none block h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgb(15_18_30/0.3)] ring-0 transition-transform duration-150 ease-out",
>>>>>>> 5c1d94054047b9a8e141db7699f22c3285dc1d90
        "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };

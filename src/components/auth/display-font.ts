import { Baloo_2 } from "next/font/google";

/**
 * Chunky rounded face for the wordmark. Only the entry screens import this
 * file, so the font is never preloaded inside the app itself.
 */
export const fontDisplay = Baloo_2({
  subsets: ["latin"],
  weight: "800",
  variable: "--font-display",
  display: "swap",
});

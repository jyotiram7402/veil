import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { fontDisplay } from "@/components/auth/display-font";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import styles from "./entry.module.css";

// Order matters: emoji n takes the position class m{n} in entry.module.css.
const STAGE_MOJI = ["🦁", "🐱", "🐭", "🦊", "🦏"];

/**
 * Frame for the screens between the first screen and the app: log in, sign up
 * and the personal invite gate. A blue stage with drifting moji on top, the
 * form on a white sheet below. On tablets and up it becomes a centred card.
 */
export function AuthShell({
  backHref = "/",
  children,
}: {
  /** Where the back button goes. Pass null to hide it. */
  backHref?: string | null;
  children: React.ReactNode;
}) {
  return (
    <main className={cn(fontDisplay.variable, styles.auth)}>
      <div className={styles.authCard}>
        <div className={styles.authStage}>
          <div className={styles.rings} aria-hidden="true" />

          <div className={styles.authTop}>
            {backHref ? (
              <Link href={backHref} className={styles.iconBtn} aria-label="Back">
                <ChevronLeft className="h-5 w-5" />
              </Link>
            ) : (
              <span className="h-10 w-10" aria-hidden="true" />
            )}
            <span className={styles.authBrand}>{APP_NAME}</span>
            <ThemeToggle className="text-white hover:bg-white/15 hover:text-white" />
          </div>

          <div aria-hidden="true">
            {STAGE_MOJI.map((emoji, i) => (
              <span key={emoji} className={cn(styles.stageMoji, styles[`m${i + 1}`])}>
                <span className={styles.stageMojiBody}>{emoji}</span>
              </span>
            ))}
          </div>
        </div>

        <div className={styles.sheet}>{children}</div>
      </div>
    </main>
  );
}

import type { CSSProperties } from "react";
import Link from "next/link";
import { fontDisplay } from "@/components/auth/display-font";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { MOJI_COLORS } from "@/lib/moji";
import { cn } from "@/lib/utils";
import styles from "./entry.module.css";

const TILES: { emoji: string; bg: string }[] = [
  { emoji: "🐼", bg: MOJI_COLORS.sun },
  { emoji: "🐱", bg: MOJI_COLORS.sky },
  { emoji: "🐸", bg: MOJI_COLORS.pink },
  { emoji: "😎", bg: MOJI_COLORS.cloud },
  { emoji: "🦊", bg: "hsl(var(--foreground))" },
  { emoji: "🐰", bg: MOJI_COLORS.mint },
  { emoji: "🐺", bg: MOJI_COLORS.tangerine },
  { emoji: "👻", bg: MOJI_COLORS.blue },
  { emoji: "🦁", bg: MOJI_COLORS.violet },
  { emoji: "🐷", bg: MOJI_COLORS.sky },
  { emoji: "🌵", bg: MOJI_COLORS.sun },
  { emoji: "🚀", bg: MOJI_COLORS.cloud },
];

export function FirstScreen() {
  return (
    <main className={cn(fontDisplay.variable, styles.screen)}>
      <div className={styles.stage}>
        <div className={styles.wall} aria-hidden="true">
          {TILES.map((tile, i) => (
            <span
              key={tile.emoji}
              className={cn(styles.tile, styles[`t${i + 1}`])}
              style={{ "--tile": tile.bg } as CSSProperties}
            >
              <span className={styles.tileBody}>{tile.emoji}</span>
            </span>
          ))}
        </div>

        <div className={styles.brand}>
          <h1 className={styles.wordmark}>{APP_NAME}</h1>
          <p className={styles.promise}>{APP_TAGLINE}</p>
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.buttons}>
          <Link href="/login" className={cn(styles.cta, styles.ctaPrimary)}>
            Log in
          </Link>
          <Link href="/signup" className={cn(styles.cta, styles.ctaInk)}>
            Sign up
          </Link>
        </div>
        <p className={styles.note}>Invite only. Signing up needs a code.</p>
      </div>
    </main>
  );
}

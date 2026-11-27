"use client";

import { useEffect, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";

export async function copyLink(url: string) {
  if (await copyText(url)) toast.success("Link copied");
  else toast.error("Couldn't copy. Select the link and copy it yourself.");
}

export function LinkBox({ url, autoFocus }: { url: string; autoFocus?: boolean }) {
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
  }, []);

  async function share() {
    try {
      await navigator.share({ url });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      await copyLink(url);
    }
  }

  return (
    <div className="space-y-3">
      <p className="select-all break-all rounded-2xl bg-muted px-4 py-3 text-sm font-medium">{url}</p>
      <div className={canShare ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
        <Button size="lg" autoFocus={autoFocus} onClick={() => void copyLink(url)}>
          <Copy /> Copy link
        </Button>
        {canShare && (
          <Button size="lg" variant="secondary" onClick={() => void share()}>
            <Share2 /> Share
          </Button>
        )}
      </div>
    </div>
  );
}

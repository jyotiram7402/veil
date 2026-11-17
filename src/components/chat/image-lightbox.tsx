"use client";

import { useEffect } from "react";
import { X, Download } from "lucide-react";

export function ImageLightbox({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4 backdrop-blur-md duration-200 animate-in fade-in-0"
      onClick={onClose}
    >
      <img
        src={url}
        alt={name}
        className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain shadow-2xl duration-200 animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <a
          href={url}
          download={name}
          onClick={(e) => e.stopPropagation()}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Download"
        >
          <Download className="h-5 w-5" />
        </a>
        <button
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export const APP_NAME = "Rooms";
export const APP_TAGLINE = "A quiet place to talk.";

export const MESSAGE_PAGE_SIZE = 40;

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const ALLOWED_ATTACHMENT_MIME = [
  ...IMAGE_MIME_TYPES,
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
  "text/csv",
];

export const TYPING_TIMEOUT_MS = 4000;
export const PRESENCE_HEARTBEAT_MS = 30_000;

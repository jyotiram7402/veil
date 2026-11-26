export type CallErrorCode =
  | "MIC_PERMISSION_DENIED"
  | "MIC_UNAVAILABLE"
  | "MIC_NOT_FOUND"
  | "CAMERA_PERMISSION_DENIED"
  | "CAMERA_UNAVAILABLE"
  | "CAMERA_NOT_FOUND"
  | "CAMERA_SWITCH_FAILED"
  | "CAMERA_LOST"
  | "NETWORK_DISCONNECTED"
  | "ICE_FAILED"
  | "CONNECTION_FAILED"
  | "SIGNALING_FAILED"
  | "RECONNECT_FAILED"
  | "CALL_ENDED"
  | "SESSION_EXPIRED"
  | "ROOM_ENDED"
  | "PERMISSION_REVOKED"
  | "UNSUPPORTED"
  | "SETUP_FAILED"
  | "UNKNOWN";

const MESSAGES: Record<CallErrorCode, string> = {
  MIC_PERMISSION_DENIED:
    "The microphone is blocked. Allow it for this site in your browser, then call again.",
  MIC_UNAVAILABLE: "The microphone could not be started. Close other apps that use it and try again.",
  MIC_NOT_FOUND: "No microphone was found on this device.",
  CAMERA_PERMISSION_DENIED:
    "The camera is blocked. Allow it for this site in your browser to use video.",
  CAMERA_UNAVAILABLE: "The camera could not be started.",
  CAMERA_NOT_FOUND: "No camera was found on this device.",
  CAMERA_SWITCH_FAILED: "The other camera could not be started, so this one stays on.",
  CAMERA_LOST: "The camera stopped. Tap Camera to turn it on again.",
  NETWORK_DISCONNECTED: "You appear to be offline.",
  ICE_FAILED: "Couldn't connect the call. Check your connection and try again.",
  CONNECTION_FAILED: "The call connection failed.",
  SIGNALING_FAILED: "Couldn't reach the other person.",
  RECONNECT_FAILED: "The connection was lost and could not be restored.",
  CALL_ENDED: "Call ended.",
  SESSION_EXPIRED: "Your session has expired.",
  ROOM_ENDED: "This room is no longer available.",
  PERMISSION_REVOKED: "Voice calling has been disabled by the administrator.",
  UNSUPPORTED: "This browser doesn't support voice calls.",
  SETUP_FAILED: "The call couldn't be set up. Try again.",
  UNKNOWN: "Something went wrong with the call.",
};

export function callErrorMessage(code: CallErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.UNKNOWN;
}

export function classifyMediaError(err: unknown): CallErrorCode {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "MIC_PERMISSION_DENIED";
      case "NotFoundError":
      case "OverconstrainedError":
        return "MIC_NOT_FOUND";
      case "NotReadableError":
      case "AbortError":
        return "MIC_UNAVAILABLE";
    }
  }
  return "SETUP_FAILED";
}

export function errorTag(err: unknown): string | null {
  if (err instanceof Error || err instanceof DOMException) return err.name || null;
  return null;
}

export function classifyCameraError(err: unknown): CallErrorCode {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "CAMERA_PERMISSION_DENIED";
      case "NotFoundError":
        return "CAMERA_NOT_FOUND";
      case "NotReadableError":
      case "AbortError":
      case "OverconstrainedError":
        return "CAMERA_UNAVAILABLE";
    }
  }
  return "CAMERA_UNAVAILABLE";
}

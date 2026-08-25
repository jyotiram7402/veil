/**
 * Centralized call error classification. Internal categories never reach the
 * user directly — they are mapped to short, friendly messages.
 */

export type CallErrorCode =
  | "MIC_PERMISSION_DENIED"
  | "MIC_UNAVAILABLE"
  | "MIC_NOT_FOUND"
  | "CAMERA_PERMISSION_DENIED"
  | "CAMERA_UNAVAILABLE"
  | "CAMERA_NOT_FOUND"
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
  | "UNKNOWN";

const MESSAGES: Record<CallErrorCode, string> = {
  MIC_PERMISSION_DENIED: "Microphone access is required for voice calls.",
  MIC_UNAVAILABLE: "Your microphone is unavailable.",
  MIC_NOT_FOUND: "No microphone was found.",
  CAMERA_PERMISSION_DENIED: "Camera access was denied. Voice calling is still available.",
  CAMERA_UNAVAILABLE: "Camera unavailable.",
  CAMERA_NOT_FOUND: "No camera was found.",
  NETWORK_DISCONNECTED: "You appear to be offline.",
  ICE_FAILED: "Couldn't connect the call.",
  CONNECTION_FAILED: "The call connection failed.",
  SIGNALING_FAILED: "Couldn't reach the other person.",
  RECONNECT_FAILED: "Unable to reconnect.",
  CALL_ENDED: "Call ended.",
  SESSION_EXPIRED: "Your session has expired.",
  ROOM_ENDED: "This room is no longer available.",
  PERMISSION_REVOKED: "Voice calling has been disabled by the administrator.",
  UNSUPPORTED: "This browser doesn't support voice calls.",
  UNKNOWN: "Something went wrong with the call.",
};

export function callErrorMessage(code: CallErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.UNKNOWN;
}

/** Map a getUserMedia / DOMException to a mic error code. */
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
  return "MIC_UNAVAILABLE";
}

/** Map a getUserMedia / DOMException to a camera error code. */
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

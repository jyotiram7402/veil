import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { SignalPayload, SignalType } from "@/lib/webrtc/types";

const SIGNAL_EVENTS: SignalType[] = [
  "call_started",
  "call_accepted",
  "call_rejected",
  "call_cancelled",
  "offer",
  "answer",
  "ice_candidate",
  "call_ended",
  "busy",
  "media_state",
];

type Handler = (type: SignalType, payload: SignalPayload) => void;

// Private channels are authorized against the caller's JWT. Channels opened in
// the same moment (the admin listens on one per person) share a single round.
let authorizing: Promise<void> | null = null;

function authorizeRealtime(): Promise<void> {
  if (!authorizing) {
    authorizing = (async () => {
      const supabase = supabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
    })().finally(() => {
      authorizing = null;
    });
  }
  return authorizing;
}

/**
 * Thin wrapper over a Supabase Realtime PRIVATE broadcast channel used purely
 * for WebRTC signaling on `call:<chatId>`. Private + realtime.messages RLS
 * (see v7.sql) means only the two chat members can send/receive here.
 *
 * Only control data (SDP/ICE) is sent — never audio.
 */
export class SignalingChannel {
  private channel: RealtimeChannel | null = null;
  private handler: Handler | null = null;
  private joined: Promise<void> | null = null;
  private closed = false;
  private readonly topic: string;

  constructor(private readonly chatId: string) {
    this.topic = `call:${chatId}`;
  }

  onSignal(handler: Handler) {
    this.handler = handler;
  }

  /** Joins the channel. Resolves once it is subscribed; safe to call twice. */
  connect(): Promise<void> {
    if (!this.joined) this.joined = this.join();
    return this.joined;
  }

  private async join(): Promise<void> {
    await authorizeRealtime();
    if (this.closed) return;

    const channel = supabaseBrowser().channel(this.topic, {
      config: { broadcast: { self: false, ack: false }, private: true },
    });

    for (const event of SIGNAL_EVENTS) {
      channel.on("broadcast", { event }, ({ payload }) => {
        this.handler?.(event, payload as SignalPayload);
      });
    }
    this.channel = channel;

    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
    });
  }

  /** Sends one message. One sent while the channel is still joining waits for it. */
  async send(type: SignalType, payload: SignalPayload): Promise<void> {
    if (this.closed || !this.joined) return;
    await this.joined;
    if (this.closed || !this.channel) return;
    await this.channel.send({ type: "broadcast", event: type, payload });
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    this.handler = null;
    const channel = this.channel;
    this.channel = null;
    if (channel) await supabaseBrowser().removeChannel(channel);
  }
}

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
  private readonly topic: string;

  constructor(private readonly chatId: string) {
    this.topic = `call:${chatId}`;
  }

  onSignal(handler: Handler) {
    this.handler = handler;
  }

  async connect(): Promise<void> {
    const supabase = supabaseBrowser();

    // Private channels are authorized against the caller's JWT.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      await supabase.realtime.setAuth(session.access_token);
    }

    const channel = supabase.channel(this.topic, {
      config: { broadcast: { self: false, ack: false }, private: true },
    });

    for (const event of SIGNAL_EVENTS) {
      channel.on("broadcast", { event }, ({ payload }) => {
        this.handler?.(event, payload as SignalPayload);
      });
    }

    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
    });

    this.channel = channel;
  }

  async send(type: SignalType, payload: SignalPayload): Promise<void> {
    if (!this.channel) return;
    await this.channel.send({ type: "broadcast", event: type, payload });
  }

  async disconnect(): Promise<void> {
    if (!this.channel) return;
    const supabase = supabaseBrowser();
    await supabase.removeChannel(this.channel);
    this.channel = null;
    this.handler = null;
  }
}

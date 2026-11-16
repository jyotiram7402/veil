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

export class SignalingChannel {
  private channel: RealtimeChannel | null = null;
  private handler: Handler | null = null;
  private joined: Promise<void> | null = null;
  private closed = false;
  private readonly topic: string;

  constructor(chatId: string) {
    this.topic = `call:${chatId}`;
  }

  onSignal(handler: Handler) {
    this.handler = handler;
  }

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

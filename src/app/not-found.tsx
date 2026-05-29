import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center px-6 text-center">
      <div>
        <p className="text-sm uppercase tracking-widest text-muted-foreground">404</p>
        <h1 className="mt-2 text-3xl font-semibold">We can&apos;t find that page</h1>
        <p className="mt-3 text-muted-foreground max-w-sm">
          The conversation might have been removed, or you might not be in the room.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link href="/chats">Back to chats</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { talkToNpc, type Turn } from "@/lib/npc.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Moonlit Gate — AI NPC Game" },
      { name: "description", content: "Talk your way past Vesper, an AI gargoyle guardian with dynamically generated dialogue." },
      { property: "og:title", content: "The Moonlit Gate — AI NPC Game" },
      { property: "og:description", content: "Win the trust of an AI-powered gargoyle to enter the forbidden library." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Game,
});

const MAX_TURNS = 10;
const OPENING: Turn = {
  role: "npc",
  text: "Halt, traveller. I am Vesper, keeper of the Moonlit Gate. Many have begged, few have passed. Tell me — why should stone move for you?",
};

function Game() {
  const [history, setHistory] = useState<Turn[]>([OPENING]);
  const [trust, setTrust] = useState(30);
  const [turnsLeft, setTurnsLeft] = useState(MAX_TURNS);
  const [mood, setMood] = useState("suspicious");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"continue" | "opened" | "banished" | "timeout">("continue");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg) return setError("Vesper waits for words. Type something first.");
    if (msg.length > 400) return setError("Too long — keep it under 400 characters.");
    setError(null);
    setLoading(true);
    setInput("");
    const newHist: Turn[] = [...history, { role: "player", text: msg }];
    setHistory(newHist);
    try {
      const r = await talkToNpc({ data: { history, message: msg, trust, turnsLeft } });
      if (!r.ok) {
        setError(r.error);
        setHistory(history);
        setInput(msg);
        return;
      }
      const t = Math.max(0, Math.min(100, trust + r.result.trustDelta));
      const left = turnsLeft - 1;
      setTrust(t);
      setTurnsLeft(left);
      setMood(r.result.mood);
      setHistory([...newHist, { role: "npc", text: r.result.reply }]);
      if (r.result.outcome === "opened" || t >= 100) setOutcome("opened");
      else if (r.result.outcome === "banished" || t <= 0) setOutcome("banished");
      else if (left <= 0) setOutcome("timeout");
    } catch {
      setError("Something went wrong reaching Vesper. Please try again.");
      setHistory(history);
      setInput(msg);
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setHistory([OPENING]);
    setTrust(30);
    setTurnsLeft(MAX_TURNS);
    setMood("suspicious");
    setOutcome("continue");
    setError(null);
  }

  const over = outcome !== "continue";
  const suggestions = ["Ask me a riddle.", "I seek knowledge to heal my village.", "Here, take this gold coin.", "Open up or I'll smash you!"];

  return (
    <main className="min-h-screen bg-background text-foreground font-body">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">An AI NPC adventure</p>
          <h1 className="mt-2 font-display text-5xl text-foreground">The Moonlit Gate</h1>
          <p className="mt-3 text-muted-foreground">Earn the gargoyle's trust (100) within {MAX_TURNS} turns. Lose it all and you're banished.</p>
        </header>

        <section className="mt-8 grid grid-cols-3 gap-3 text-center">
          <Stat label="Trust" value={`${trust}/100`} />
          <Stat label="Turns left" value={String(turnsLeft)} />
          <Stat label="Mood" value={mood} />
        </section>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all duration-700" style={{ width: `${trust}%` }} />
        </div>

        <section className="mt-6 h-[420px] overflow-y-auto rounded-xl border border-border bg-card p-4 space-y-3">
          {history.map((t, i) => (
            <div key={i} className={t.role === "npc" ? "flex" : "flex justify-end"}>
              <div className={t.role === "npc" ? "max-w-[85%] rounded-lg bg-secondary p-3 text-secondary-foreground" : "max-w-[85%] rounded-lg bg-primary p-3 text-primary-foreground"}>
                <p className="text-[10px] uppercase tracking-widest opacity-70">{t.role === "npc" ? "Vesper" : "You"}</p>
                <p className="mt-1">{t.text}</p>
              </div>
            </div>
          ))}
          {loading && <p className="text-sm italic text-muted-foreground">Vesper's eyes glow as it ponders…</p>}
          <div ref={endRef} />
        </section>

        {error && <p role="alert" className="mt-3 rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}

        {over ? (
          <div className="mt-6 rounded-xl border border-primary bg-card p-6 text-center">
            <h2 className="font-display text-3xl">
              {outcome === "opened" ? "The gate swings open!" : outcome === "banished" ? "You have been banished." : "The moon sets. The gate stays shut."}
            </h2>
            <p className="mt-2 text-muted-foreground">Final trust: {trust}/100</p>
            <button onClick={restart} className="mt-4 rounded-md bg-primary px-5 py-2 font-medium text-primary-foreground hover:opacity-90">Play again</button>
          </div>
        ) : (
          <>
            <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                maxLength={400}
                placeholder="Speak to Vesper…"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              />
              <button disabled={loading} className="rounded-md bg-primary px-5 py-2 font-medium text-primary-foreground disabled:opacity-50">Say</button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s} disabled={loading} onClick={() => send(s)} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50">{s}</button>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl capitalize">{value}</p>
    </div>
  );
}

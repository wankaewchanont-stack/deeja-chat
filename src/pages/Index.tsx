import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Sparkles, Trash2, Moon, Sun } from "lucide-react";
import deejaLogo from "@/assets/deeja-logo.png";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Role = "user" | "assistant";
interface Message {
  id: string;
  role: Role;
  content: string;
}

const MODES = [
  { value: "P", label: "P · Prompt Engineer", tag: "Optimize prompts" },
  { value: "T", label: "T · Teach", tag: "Learn step-by-step" },
  { value: "E", label: "E · Explore", tag: "Brainstorm ideas" },
  { value: "F", label: "F · Focus", tag: "Sharp & concise" },
  { value: "R", label: "R · Reflect", tag: "Deeper thinking" },
];

const STARTERS: Record<string, string[]> = {
  P: [
    "ปรับ prompt นี้ให้ได้ output 10/10: 'เขียนโพสต์ขายของ'",
    "สร้าง prompt สำหรับวิเคราะห์คู่แข่งทางธุรกิจ",
    "ออกแบบ prompt ให้ AI สอนเขียนโค้ดแบบมืออาชีพ",
    "ทำ prompt template สำหรับ content marketing",
  ],
  T: [
    "อธิบาย quantum entanglement แบบเข้าใจง่าย",
    "สอนใช้ React hooks ตั้งแต่เริ่มต้น",
    "TypeScript generics ทำงานยังไง?",
    "อธิบาย RAG ในระบบ AI แบบสั้นๆ",
  ],
  E: [
    "ไอเดียโปรเจกต์ AI สำหรับสุดสัปดาห์",
    "Brainstorm ชื่อแบรนด์สำหรับ AI startup",
    "เสนอ 5 มุมมองใหม่ของการใช้ LLM",
    "ไอเดีย side project ที่ทำเงินได้",
  ],
  F: [
    "สรุปข้อดี-ข้อเสียของ Vercel vs Netlify",
    "เขียน follow-up email สั้นๆ ให้สุภาพ",
    "List 5 ข้อในการ optimize React app",
    "Action plan 1 สัปดาห์เพิ่ม productivity",
  ],
  R: [
    "ฉันควรเปลี่ยนงานหรือไม่? ช่วยถามคำถามสะท้อนคิด",
    "วิเคราะห์ pattern ความล้มเหลวที่ผ่านมา",
    "ช่วยวางเป้าหมายชีวิต 5 ปีข้างหน้า",
    "สะท้อนสิ่งที่เรียนรู้จากสัปดาห์นี้",
  ],
};

const FOLLOWUPS = [
  "ขยายความให้ลึกขึ้น",
  "ยกตัวอย่างประกอบ",
  "ทำเป็น checklist ใช้ได้จริง",
  "เปรียบเทียบทางเลือกอื่น",
];

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const ChatBubble = ({ m, streaming }: { m: Message; streaming?: boolean }) => {
  const isUser = m.role === "user";
  return (
    <div className={`fade-in flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-3xl px-5 py-3 shadow-soft ${
          isUser
            ? "bg-[hsl(var(--bubble-user))] text-[hsl(var(--bubble-user-foreground))] rounded-br-md"
            : "bg-[hsl(var(--bubble-assistant))] text-[hsl(var(--bubble-assistant-foreground))] rounded-bl-md border"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
        ) : (
          <div
            className={`prose prose-sm dark:prose-invert max-w-none prose-pre:bg-secondary prose-pre:text-foreground prose-code:before:hidden prose-code:after:hidden ${
              streaming && !m.content ? "blink-caret" : ""
            } ${streaming ? "after:content-['▍'] after:ml-0.5 after:animate-pulse" : ""}`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {m.content || "…"}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("P");
  const [streaming, setStreaming] = useState(false);
  const [dark, setDark] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(prefers);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    if (text.length > 4000) {
      toast.error("Message too long (max 4000 chars).");
      return;
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "" };
    const next = [...messages, userMsg];
    setMessages([...next, assistantMsg]);
    setInput("");
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const resp = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        if (resp.status === 429) toast.error("Rate limit reached. Please wait a moment.");
        else if (resp.status === 402) toast.error("AI credits exhausted. Add credits in workspace settings.");
        else toast.error("Something went wrong.");
        setMessages((m) => m.filter((x) => x.id !== assistantMsg.id));
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              setMessages((m) =>
                m.map((x) => (x.id === assistantMsg.id ? { ...x, content: acc } : x))
              );
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error("Connection error.");
      setMessages((m) => m.filter((x) => x.id !== assistantMsg.id || x.content));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background/60 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={deejaLogo} alt="Deeja logo" className="h-10 w-auto" />
          <div className="flex-1">
            <h1 className="text-lg font-semibold tracking-tight">
              Deeja <span className="text-gradient-brand">v2.0</span>
            </h1>
            <p className="text-xs text-muted-foreground -mt-0.5">AI assistant · streaming</p>
          </div>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="w-[180px] rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={() => setDark((d) => !d)} aria-label="Toggle theme">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={clearChat} aria-label="Clear chat">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-20 fade-in">
              <img src={deejaLogo} alt="Deeja logo" className="h-20 w-auto mx-auto mb-5" />
              <h2 className="text-3xl font-semibold tracking-tight mb-2">
                Hey, I'm <span className="text-gradient-brand">Deeja</span>.
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Pick a mode and ask me anything. I respond in real-time with streaming.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mt-8 max-w-xl mx-auto text-left">
                {[
                  "Explain quantum entanglement simply",
                  "Draft a polite follow-up email",
                  "Compare React vs Vue for a startup",
                  "Brainstorm a weekend project",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-sm rounded-2xl border bg-card hover:shadow-soft hover:border-primary/40 transition px-4 py-3 text-card-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <ChatBubble
                key={m.id}
                m={m}
                streaming={streaming && i === messages.length - 1 && m.role === "assistant"}
              />
            ))
          )}
        </div>
      </main>

      <footer className="border-t bg-background/60 backdrop-blur-xl sticky bottom-0">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-end gap-2 rounded-3xl border bg-card p-2 shadow-soft focus-within:shadow-glow transition-shadow">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message Deeja…"
              rows={1}
              className="min-h-[44px] max-h-40 resize-none border-0 focus-visible:ring-0 bg-transparent"
            />
            <Button
              onClick={send}
              disabled={!input.trim() || streaming}
              size="icon"
              className="rounded-full bg-gradient-brand hover:opacity-90 shadow-glow h-10 w-10 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Enter to send · Shift+Enter for newline · Mode {mode}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;

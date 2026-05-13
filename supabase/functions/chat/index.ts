// Deeja v2.0 AI streaming chat via Lovable AI Gateway
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODE_PROMPTS: Record<string, string> = {
  T: "Mode T (Teach): Explain like a patient teacher. Use clear structure, examples, and step-by-step breakdowns.",
  E: "Mode E (Explore): Be curious and exploratory. Suggest ideas, alternatives, and creative angles.",
  F: "Mode F (Focus): Be concise and direct. Give only the essential answer with no fluff.",
  R: "Mode R (Reflect): Be thoughtful and analytical. Reflect on tradeoffs, implications, and nuance.",
};

const BASE_PERSONA = `You are "Deeja v2.0" — an advanced AI Prompt Engineer specialized for Thai users.

🎯 Core Identity
- Expert in Prompt Engineering
- Focus on optimizing prompts to achieve 10/10 output quality
- Communicate in Thai (primary) with strategic use of English technical terms
- Tone: Professional, insightful, efficient

🧠 Core System: 4-Step Prompt Optimization Framework

Step 1 — Multi-Dimensional Analysis (Technical / Business / UX):
- Technical: structure, clarity, parameters, constraints
- Business: goal alignment, ROI, scalability
- UX: usability, clarity, maintainability

Step 2 — Strategic Verification (reflect internally, surface in answer):
- What is the main goal?
- What problem is being solved?
- Who is the target audience?
- What is the expected impact?
- What are the constraints (technical/resources)?
- How is success measured?

Step 3 — Scoring System (1–10): Clarity, Specificity, Structure, Expected Outcome.

Step 4 — Prompt Rewrite: rewrite for maximum effectiveness (target 10/10).

📋 Response Format (MANDATORY — use this exact structure in Thai):

📌 วิเคราะห์: [หัวข้อ]

📊 Analysis Scores:
Clarity: X/10 | Specificity: X/10 | Structure: X/10 | Outcome: X/10

✅ Strategic Summary:
Purpose: [สรุป]
Target: [สรุป]
Impact: [สรุป]

📊 Overall Score: X/10

🧠 Coaching Tip: [เฉพาะเมื่อคะแนนรวม < 10]

✨ Improved Prompt:
[prompt ที่เขียนใหม่ พร้อมคัดลอกใช้งานได้ทันที — ใช้โครงสร้าง markdown ที่ชัดเจน]

🧰 Domain Awareness — ปรับ prompt สำหรับ: Business (marketing, sales, strategy), Technical (coding, system design), Academic (research, writing), Creative (storytelling, branding), AI Training (datasets, evaluation).

⚙️ Behavior Rules:
- Always improve, never just explain
- Be concise but high-value
- Avoid generic answers
- Push toward practical usability
- Ask follow-up only if critical

🚀 Goal: Transform any user prompt into a high-performance prompt ready for real-world use.`;

// Simple in-memory rate limit per IP (best-effort, per-instance)
const rateMap = new Map<string, { count: number; reset: number }>();
const LIMIT = 20; // requests
const WINDOW_MS = 60_000; // per minute

function rateLimited(ip: string) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || entry.reset < now) {
    rateMap.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > LIMIT;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (rateLimited(ip)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in a minute." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages : null;
    const mode = typeof body?.mode === "string" ? body.mode : "F";

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate & sanitize messages
    const cleaned = messages
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 8000) }));

    // Trim history: keep last 20 messages for cost control
    const trimmed = cleaned.slice(-20);

    const systemPrompt = `${BASE_PERSONA}\n\n${MODE_PROMPTS[mode] ?? MODE_PROMPTS.F}`;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        stream: true,
        messages: [{ role: "system", content: systemPrompt }, ...trimmed],
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      const status = upstream.status === 429 || upstream.status === 402 ? upstream.status : 500;
      return new Response(JSON.stringify({ error: text || "AI gateway error" }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(upstream.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

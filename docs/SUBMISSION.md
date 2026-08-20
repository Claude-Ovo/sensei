# Devpost submission draft — All Things Agentic Hackathon

> 表单字段：Project name · Elevator pitch · About the project（Inspiration / What it does / How we built it / Challenges / Accomplishments / What we learned / What's next）· Built with · Try it out links · Video · Category。下面按字段起草，英文，最后逸晨过一遍再贴。

**Project name**: Sensei

**Elevator pitch (≤ 200 chars)**:
An agent that sits beside your terminal while you learn a tool — watches the real stream, nudges only when you're stuck, takes notes, and compiles your struggle into a tutorial.

**Category**: Collaborative Partner

## About the project

### Inspiration
Learning a CLI tool is mostly *doing*: you type, it fails, you search, and you try again. Chat assistants live in another window and know only what you paste; they never see the actual stream or remember what you tried, and by the time it works, the knowledge has evaporated. I wanted to build the equivalent of a senior engineer sitting beside you: quiet and observant, speaking only when the evidence says you're stuck, then handing you the write-up you would never have written yourself.

### What it does
`sensei start` wraps your shell in a pty. Every keystroke and every byte the terminal prints is captured, **redacted locally** (keys, tokens, emails, home paths never leave the machine), logged, and mirrored to Cloud Firestore.

A background **Observer** agent (Gemini 3.5 Flash-Lite via the Google ADK for TypeScript — high-frequency observation runs on the light tier, while the Coach and Compiler use Gemini 3.7 Flash) reads the messy stream — ANSI, stack traces, progress bars — and uses evidence to decide whether you're flowing, exploring, or stuck. It stays silent by default; when it speaks, it gives you one line directly in your terminal, in your language, at the level you requested. It asks a **clarifying question** only when the right hint depends on your intent (`sensei reply` answers it). It **takes notes** throughout the session and incorporates your **feedback** (`sensei fb too-basic | confusing | just-tell-me | let-me-try`) into a learner profile that persists across sessions. `sensei ask` gets a grounded answer from the **Coach**. `sensei done` runs the **Compiler**, which synthesizes commands, errors, notes, milestones, and Q&A into a step-by-step tutorial with a "pitfalls we hit" table and a 60-second spoken script.

What makes it distinct:
- **The three-stage gate**: a free regex filter → a cheap Gemma triage call ("worth a senior engineer's attention?") → only then the Observer. Silence is the default; the gate is why it doesn't nag.
- **The hint ladder**: a prompt-driven escalation — early failures get a nudge or direction, repeated evidence of the same failure earns an explanation of the cause, and persistence earns the fix. At each tick, the model evaluates the transcript against the learner profile rather than relying on a hard-coded counter; a cooldown and echo guard reduce repetition.
- **Auto-ask — a feature our first real user taught us**: when a learner types natural language straight into the shell ("这个错到底怎么回事") and the shell returns an error, Sensei recognizes the question, answers it, and teaches the `sensei ask` syntax once.

A **web panel** on Firebase Hosting shows the live session, hints, notes, questions, learner profile, and compiled tutorial — whether you're following along on a second screen or a mentor or judge is watching. Replies and feedback entered in the panel flow back into the terminal session through a Firestore `inbound` collection.

### How we built it
- **CLI (Node 24, TypeScript)**: node-pty wrapper, ANSI cleaning, regex redaction, JSONL session log, local IPC for the sub-commands.
- **Agents (@google/adk `LlmAgent` + `InMemoryRunner`)**: Observer on Gemini 3.5 Flash-Lite (structured JSON, thinking off for latency), Coach and Compiler on Gemini 3.7 Flash — each with per-attempt timeouts, automatic model fallback and a quota-aware circuit breaker; a **Gemma 4** triage gate decides whether a bigger model needs to look at all; a free regex pre-filter runs before both.
- **Google Cloud**: Cloud Firestore for every session artifact and as the realtime bus between CLI and panel; Firebase Hosting for the panel; Firebase Auth (Google) for owner-only sessions; security rules that let public sessions be read by anyone and clients only append to `inbound`.
- **Panel**: React + Vite + Firebase Web SDK, realtime `onSnapshot` listeners.

### Challenges we ran into
- Being useful without being annoying: the first version commented on everything. The fix was structural — a three-stage gate (regex → cheap triage → observer), a hint cooldown, and a prompt that forbids cheerleading and restating.
- Model availability under load: Gemini 3.7 Flash returned 503s during periods of high demand; per-attempt timeouts, model fallback, and a circuit breaker keep hints arriving in seconds rather than after a minute.
- Running from mainland China: Google Cloud billing isn't offered here, so the architecture keeps the agent on the learner's machine, where the terminal stream and API key live, and uses Firestore plus Firebase Hosting on a Spark project for the cloud side. This turned out to be the better design anyway.
- Terminal UX: printing a hint while the learner is mid-command clobbers their line — Sensei waits for Enter, then speaks.

### Accomplishments that we're proud of
We were especially proud when the Observer caught my *own* incorrect note ("git commit failed because user.name wasn't set") by reading the actual output ("no — the commit succeeded, see `[master (root-commit) …]`"). The compiled tutorial was something I would actually publish.

### What we learned
Silence is a feature. Evidence in the prompt beats thinking budget for this job. Cheap models are best used as gates, not as replacements.

### What's next
Voice hints (Gemini Live), a VS Code terminal integration, per-tool skill packs (git, docker, MCP), and turning the 60-second scripts into real short videos.

## Data sources
The only data processed is the learner's own local terminal stream (stdout/stderr and typed commands), locally redacted before any storage. No third-party datasets.

## Built with
typescript, node.js, node-pty, google-adk, gemini-3.7-flash, gemma-4, cloud-firestore, firebase-hosting, firebase-auth, react, vite

## Links
- Repo: https://github.com/Claude-Ovo/sensei (public at submission time)
- Panel: https://sensei-agent.web.app
- Video: <TODO YouTube URL>
- Blog (bonus): <TODO dev.to URL>
- Social (bonus): <TODO X/LinkedIn URL with #AllThingsAgenticHackathon>

## Testing instructions (for judges)
1. Node ≥ 24. `git clone https://github.com/Claude-Ovo/sensei.git && cd sensei && npm install && npm run build && npm -w @sensei/cli link`
2. Create `~/.sensei/.env` and add `GEMINI_API_KEY=…` (your Gemini API key). English coaching is the default; set `SENSEI_LANG=en` explicitly if needed. The cloud mirror is optional; without a service account, Sensei runs fully offline.
3. `sensei start -g "learn git: make my first commit"` → work as usual → `sensei ask "…"` → `sensei done` → `exit`.
4. Public demo sessions are visible at https://sensei-agent.web.app without signing in.

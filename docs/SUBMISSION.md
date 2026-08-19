# Devpost submission draft — All Things Agentic Hackathon

> 表单字段：Project name · Elevator pitch · About the project（Inspiration / What it does / How we built it / Challenges / Accomplishments / What we learned / What's next）· Built with · Try it out links · Video · Category。下面按字段起草，英文，最后逸晨过一遍再贴。

**Project name**: Sensei

**Elevator pitch (≤ 200 chars)**:
An agent that sits beside your terminal while you learn a tool — watches the real stream, nudges only when you're stuck, takes notes, and compiles your struggle into a tutorial.

**Category**: Collaborative Partner

## About the project

### Inspiration
Learning a CLI tool is mostly *doing*: you type, it errors, you search, you try again. Chat assistants live in another window and only know what you paste; they never see the actual stream, never remember what you tried, and when it finally works the knowledge evaporates. I wanted the senior engineer who sits next to you — quiet, watching, and only speaking when the evidence says you're stuck — and who, at the end, hands you the write-up you'd never have written yourself.

### What it does
`sensei start` wraps your shell in a pty. Every keystroke and every byte the terminal prints is captured, **redacted locally** (keys, tokens, emails, home paths never leave the machine), logged, and mirrored to Cloud Firestore.

A background **Observer** agent (Gemini 3.7 Flash via the Google ADK for TypeScript) reads the messy stream — ANSI, stack traces, progress bars — and decides on evidence whether you're flowing, exploring, or stuck. It stays silent by default; when it speaks it's one line, inline in your terminal, in your language, at the level you asked for. It asks a **clarifying question** only when the right hint depends on your intent (`sensei reply` answers it). It **takes notes** the whole time and turns your **feedback** (`sensei fb too-basic | confusing | just-tell-me | let-me-try`) into a learner profile it carries across sessions. `sensei ask` gets a grounded answer from the **Coach**. `sensei done` runs the **Compiler**: commands, errors, notes, milestones and Q&A are synthesized into a step-by-step tutorial with a "pitfalls we hit" table and a 60-second spoken script.

A **web panel** on Firebase Hosting shows the live session, hints, notes, questions, the profile and the compiled tutorial — for you on a second screen, or for a mentor/judge watching along; replies and feedback typed on the panel flow back into the terminal session through a Firestore `inbound` collection.

### How we built it
- **CLI (Node 24, TypeScript)**: node-pty wrapper, ANSI cleaning, regex redaction, JSONL session log, local IPC for the sub-commands.
- **Agents (@google/adk)**: Observer (structured JSON output, thinking off for latency), Coach, Compiler — all Gemini 3.7 Flash with automatic fallback to 3.5 Flash and a per-model circuit breaker; a **Gemma 4** triage gate decides whether the expensive model needs to look at all; a free regex pre-filter runs before both.
- **Google Cloud**: Cloud Firestore for every session artifact and as the realtime bus between CLI and panel; Firebase Hosting for the panel; Firebase Auth (Google) for owner-only sessions; security rules that let public sessions be read by anyone and clients only append to `inbound`.
- **Panel**: React + Vite + Firebase Web SDK, realtime `onSnapshot` listeners.

### Challenges we ran into
- Being useful without being annoying: the first version commented on everything. The fix was structural — a three-stage gate (regex → cheap triage → observer), a hint cooldown, and a prompt that forbids cheerleading and restating.
- Model load: Gemini 3.7 Flash returned 503s under demand during development; per-attempt timeouts, model fallback and a circuit breaker keep hints arriving in seconds instead of a minute.
- Running from mainland China: Google Cloud billing isn't offered here, so the architecture keeps the agent on the learner's machine (where the terminal stream and the API key live) and uses Firestore + Firebase Hosting on a Spark project as the cloud half — which turned out to be the better design anyway.
- Terminal UX: printing a hint while the learner is mid-command clobbers their line — Sensei waits for Enter, then speaks.

### Accomplishments that we're proud of
The Observer catching my *own* wrong note ("git commit failed because user.name wasn't set") by reading the actual output ("no — the commit succeeded, see `[master (root-commit) …]`"). The compiled tutorial being something I'd actually publish.

### What we learned
Silence is a feature. Evidence in the prompt beats thinking budget for this job. Cheap models are best used as gates, not as replacements.

### What's next
Voice hints (Gemini Live), a VS Code terminal integration, per-tool skill packs (git, docker, MCP), and turning the 60-second scripts into real short videos.

## Built with
typescript, node.js, node-pty, google-adk, gemini-3.7-flash, gemma-4, cloud-firestore, firebase-hosting, firebase-auth, react, vite

## Links
- Repo: <TODO GitHub URL>
- Panel: https://sensei-agent.web.app
- Video: <TODO YouTube URL>
- Blog (bonus): <TODO dev.to URL>
- Social (bonus): <TODO X/LinkedIn URL with #AllThingsAgenticHackathon>

## Testing instructions (for judges)
1. Node ≥ 24. `git clone … && npm install && npm run build && npm -w @sensei/cli link`
2. `~/.sensei/.env` → `GEMINI_API_KEY=…` (Gemini API key). Cloud mirror is optional; without a service account Sensei runs fully offline.
3. `sensei start -g "learn git: make my first commit"` → work as usual → `sensei ask "…"` → `sensei done` → `exit`.
4. Public demo sessions are visible at https://sensei-agent.web.app without signing in.

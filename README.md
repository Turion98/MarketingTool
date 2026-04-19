# Questell — Embeddable Decision Engine

Turn static websites into guided decision flows that increase conversion.

Instead of overwhelming users with content, Questell guides them step-by-step to a clear decision.

→ Not a quiz
→ Not a chatbot
→ A conversion layer for websites

🌐 Live: https://www.thequestell.com

---

## What this is

Questell is a system for building **branching, interactive experiences** that live inside websites.

Users don’t just scroll — they:

* make choices
* follow personalized paths
* reach clear outcomes (e.g. product selection, CTA, next step)

Typical use cases:

* Product finders (ecommerce)
* Campaign experiences
* Onboarding / qualification flows
* Guided decision tools

---

## Why it matters

Most websites:

* overload users with options
* rely on static pages
* optimize for clicks, not decisions

Result: drop-offs.

Questell changes this by:

* guiding users through structured decisions
* reducing choice overload
* increasing completion and conversion

---

## Core capabilities

* **Branching logic** — choices, conditions, dynamic routing
* **Content as data** — flows defined in JSON schema
* **Embeddable player** — works inside any website
* **Analytics** — track paths, completions, drop-offs
* **Reusable system** — no need to rebuild flows from scratch

---

## How it works (high level)

Questell runs a **JSON-driven decision engine**:

1. Load structured flow (story)
2. Render step-by-step pages
3. Evaluate user choices (flags / logic)
4. Route to next step or outcome
5. Track events for analytics

---

## Architecture

| Layer      | Stack                      |
| ---------- | -------------------------- |
| Frontend   | Next.js, React, TypeScript |
| Backend    | FastAPI (Python)           |
| Data model | JSON Schema (shared)       |
| Analytics  | Event batching + rollups   |

---

## Project structure (simplified)

frontend/ → app, player, editor, embed routes

backend/ → API, analytics, story engine

schemas/ → shared JSON schema definitions

stories/ → example decision flows

---

## Example flow

User enters → chooses path → flow adapts → reaches CTA

---

## Tech highlights

* JSON-driven runtime engine
* Dynamic routing based on user input
* Embeddable iframe system
* Analytics pipeline (event → rollup → report)
* Optional AI image generation (backend integration)

---

## Quick start

### Frontend

cd frontend
npm install
npm run dev

### Backend

cd backend
python -m venv .venv

# Windows: .venv\Scripts\activate

# macOS/Linux: source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --host 0.0.0.0 --port 8000

---

## Notes

* Stories are loaded from backend/stories/
* Frontend connects via NEXT_PUBLIC_API_BASE
* Embeds are served via /embed/...

---

## Positioning

This project is not a typical CRUD app.

It is a **decision engine + runtime system** designed for:

* marketing flows
* conversion optimization
* guided user journeys

---

## Status

Active development.
Evolving toward a production-ready system.

---

## License

Define based on intended use (private / commercial / OSS).


# Quest Forge – Interactive AI Story App

Welcome to **Quest Forge**, a fully dynamic, AI-enhanced story experience powered by Next.js and OpenAI integrations.

This is the **MVP frontend** for an interactive dark-fantasy adventure where each page is defined in a JSON file and visuals/audio are either preloaded or generated in real-time using AI.

---

## 🧩 How It Works

- The app loads a structured story from a `story.json` file
- Displays narration, visuals, sound, and interactive choices
- Supports real-time AI generation for:
  - 🎨 Images via Midjourney API
  - 🎙 Voice narration via ElevenLabs API
- Tracks choices, page flow, and unlockable "soul fragments"

---

## 🚀 Quick Start

### 1. Clone or unzip this repository

```
git clone https://github.com/yourusername/quest-forge.git
cd quest-forge
```

Or unzip the folder and navigate into it.

### 2. Install dependencies

```
npm install
```

### 3. Start the development server

```
npm run dev
```

Then open your browser at `http://localhost:3000`.

---

## 🔐 API Keys Required

Before starting the story, you’ll be asked to enter:

- **ElevenLabs API Key** – for AI voice generation
- **Midjourney API Key** – for image generation

These keys are stored in your browser’s localStorage during the session.

If an image/audio asset is not found, the app will request it from your backend generator.

---

## 📁 File Structure

```
/app
  /components      → TextBox, ImageBox, AudioPlayer, ChoiceButtons
  /lib             → Story logic + API integrations
  /public/story.json → The structured story definition
  layout.tsx       → App layout
  page.tsx         → Landing screen (API keys + Start)
  story.tsx        → Main interactive story engine
globals.json       → UI layout and style defaults
```

---

## 🧪 Customization

- You can fully edit the `story.json` file to change the narrative and structure
- `globals.json` allows changing layouts and fonts
- Easily extend with more effects, animations or saving mechanisms

---

## 📦 Deployment

You can deploy this app to:

- **Vercel** (recommended for Next.js)
- **Netlify**
- **Any Node.js-compatible host**

Just remember to set up your backend server (e.g. with FastAPI) to respond to the `/generate_voice` and `/generate_image` routes.

---

## 🙏 Credits

Built using:
- Next.js (App Router)
- Styled-components
- OpenAI / ElevenLabs / Midjourney (via your API keys)

This is just the beginning. The tower is waiting.

---

> Questions or ideas? Fork it. Expand it. Make it your own.

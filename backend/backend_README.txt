# 🎮 QuestForge Backend

## 🚀 FastAPI alapú backend AI hang és kép generáláshoz

---

## 📦 Telepítés

1. Klónozd vagy másold ide a projektet
2. Lépj be a mappába:
```bash
cd backend
```

3. Telepítsd a függőségeket:
```bash
pip install -r requirements.txt
```

---

## ▶️ Futtatás

```bash
uvicorn main:app --reload
```

Ez elindítja a szervert a következő URL-en:
```
http://localhost:8000
```

---

## 🔊 Voice generálás
```http
POST /generate_voice
{
  "pageId": "ch3a1_pg1",
  "apiKey": "YOUR_ELEVENLABS_KEY"
}
```

---

## 🖼️ Kép generálás (Replicate)
A backend a Replicate API-t használja. Kulcs a kérésben (apiKey) vagy a környezetből (REPLICATE_API_TOKEN).
```http
POST /api/generate-image
{
  "pageId": "ch3a1_pg1",
  "apiKey": "YOUR_REPLICATE_TOKEN",
  "prompt": "...",
  "storySlug": "mystory"
}
```

---

## 🔧 Környezeti változók (local vs production)

- **Lokál:** Hozz létre a `backend` mappában egy `.env` fájlt (a `.env` nincs gitben). Másold a `backend/.env.example` tartalmát, és add meg a `REPLICATE_API_TOKEN=r8_...` értéket. Így a backend tud képet generálni anélkül, hogy a frontend küldene kulcsot.
- **Production (pl. Railway, Render, VPS):** Ugyanaz a token kell a szerver környezetében: állítsd be a hostnál a `REPLICATE_API_TOKEN` env változót. A frontend (pl. Vercel) számára a gyökér `.env.example`-ban lévő `NEXT_PUBLIC_API_BASE` mutasson a production backend URL-re.

---

## 🔐 Kulcs validálás
```http
GET /validate_keys?voiceKey=...&imageKey=...
```

---

## 📁 Mentett fájlok

| Típus | Hely |
|-------|------|
| Hang  | public/assets/audio/{pageId}.mp3 |
| Kép   | public/assets/generated/{pageId}.jpg |


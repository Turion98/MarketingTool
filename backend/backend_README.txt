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

## 🖼️ Kép generálás
```http
POST /generate_image
{
  "pageId": "ch3a1_pg1",
  "apiKey": "YOUR_OPENAI_KEY"
}
```

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


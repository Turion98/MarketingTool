from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

load_dotenv()

EMBEDDING_MODEL = "voyage-3"
EMBEDDINGS_FILE = Path(__file__).parent.parent / "data" / "node_embeddings.json"

_cached_embeddings: dict | None = None

OFF_TOPIC_PAGE_KEY = "off-topic"


def _append_off_topic_candidate_if_missing(pages: dict, results: list[dict]) -> list[dict]:
    """Mindig szerepeljen a catch-all off-topic AI node a jelöltek között, ha a story tartalmazza."""
    off_topic = pages.get(OFF_TOPIC_PAGE_KEY)
    if not isinstance(off_topic, dict) or off_topic.get("type") != "ai":
        return results
    oid = off_topic.get("id") or OFF_TOPIC_PAGE_KEY
    if any(isinstance(n, dict) and n.get("id") == oid for n in results):
        return results
    return [*results, off_topic]


def preload_embeddings() -> None:
    """Memóriába tölti a node_embeddings.json tartalmát (szerver induláskor hívandó)."""
    global _cached_embeddings
    if not EMBEDDINGS_FILE.exists():
        _cached_embeddings = {}
        return
    with open(EMBEDDINGS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    _cached_embeddings = data if isinstance(data, dict) else {}


def _embed_text(text: str) -> list[float]:
    """Egyetlen szöveg embedding-je Voyage AI-on keresztül."""
    import voyageai

    vo = voyageai.Client(api_key=os.getenv("VOYAGE_API_KEY"))
    result = vo.embed([text], model=EMBEDDING_MODEL)
    return result.embeddings[0]


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity két vektor között."""
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    norm_a = np.linalg.norm(va)
    norm_b = np.linalg.norm(vb)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))


def build_embeddings(story: dict) -> None:
    """
    Story JSON-ból kinyeri az AI node-okat,
    legenerálja az embedding-eket és elmenti JSON fájlba.

    Hívd meg minden story mentéskor.
    """
    global _cached_embeddings
    pages = story.get("pages")
    if not isinstance(pages, dict):
        return

    ai_nodes = {
        page_id: page
        for page_id, page in pages.items()
        if isinstance(page, dict) and page.get("type") == "ai"
    }

    if not ai_nodes:
        return

    embeddings: dict[str, dict] = {}

    for node_id, node in ai_nodes.items():
        knowledge = node.get("knowledge") or {}
        description = (
            knowledge.get("description", "")
            if isinstance(knowledge, dict)
            else ""
        )
        scope = (
            knowledge.get("scope", "")
            if isinstance(knowledge, dict)
            else ""
        )
        examples = (
            knowledge.get("examples", [])
            if isinstance(knowledge, dict)
            else []
        )

        text_parts = [description]
        if scope:
            text_parts.append(scope)
        if isinstance(examples, list):
            text_parts.extend(
                e for e in examples if isinstance(e, str)
            )

        full_text = " ".join(text_parts).strip()
        if not full_text:
            continue

        vector = _embed_text(full_text)
        embeddings[node_id] = {
            "nodeId": node_id,
            "text": full_text,
            "vector": vector,
        }

    EMBEDDINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(EMBEDDINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(embeddings, f, ensure_ascii=False, indent=2)

    _cached_embeddings = embeddings


def get_top_k_nodes(
    prompt: str,
    story: dict,
    k: int = 3,
) -> list[dict]:
    """
    Visszaadja a prompthoz legjobban illő top-K AI node-ot
    cosine similarity alapján.

    Ha az embeddings fájl nem létezik, visszaadja
    az összes AI node-ot fallback-ként.
    """
    pages = story.get("pages")
    if not isinstance(pages, dict):
        return []

    all_ai_nodes = [
        page
        for page in pages.values()
        if isinstance(page, dict) and page.get("type") == "ai"
    ]

    if not all_ai_nodes:
        return []

    if _cached_embeddings is not None:
        embeddings = _cached_embeddings
    else:
        if not EMBEDDINGS_FILE.exists():
            return _append_off_topic_candidate_if_missing(pages, all_ai_nodes[:k])
        with open(EMBEDDINGS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        embeddings = raw if isinstance(raw, dict) else {}

    if not embeddings:
        return _append_off_topic_candidate_if_missing(pages, all_ai_nodes[:k])

    prompt_vector = _embed_text(prompt)

    scored: list[tuple[float, dict]] = []
    for node in all_ai_nodes:
        node_id = node.get("id", "")
        entry = embeddings.get(node_id)
        if not entry or not entry.get("vector"):
            continue
        score = _cosine_similarity(prompt_vector, entry["vector"])
        scored.append((score, node))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = [node for _, node in scored[:k]]
    return _append_off_topic_candidate_if_missing(pages, top)

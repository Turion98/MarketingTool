# Külső adatforrás integráció — felmérési specifikáció

**Cél:** dokumentálni a jelenlegi AI complaint handling folyamatot, és megtervezni az **OrderContext** + **provider** réteget anélkül, hogy a story JSON formátuma, a determinisztikus router, a kondíció-ID-k vagy a frontend változna.

**Megjegyzés a fájlútvonalhoz:** a feladat `backend/data/stories/ai_complaint_story_v3.json`-t említ; a repóban a story jelenleg **`backend/stories/ai_complaint_story_v3.json`** alatt van. Az alábbi elemzés erre a fájlra és a tényleges kódútvonalakra támaszkodik.

---

## 1. Jelenlegi flow (user prompt → válasz)

**Belépési pont:** `POST /ai-node/process` — `backend/routers/ai_node_routes.py`, függvény: `process_ai_node`.

### 1.1 Story és pages betöltése

| Lépés | Fájl / függvény | Mi történik |
|-------|-----------------|-------------|
| 1 | `normalize_src_to_path(body.src)` → `load_story(story_path)` | `backend/services/story_runtime.py`: a story JSON betöltése (cache). |
| 2 | `pages = story.get("pages")` | Feltételezett forma: **dict**, kulcs = page id (AI node-ok is itt vannak). |

### 1.2 „Ragadó” aktív node (session)

| Lépés | Hely | Feltétel |
|-------|------|----------|
| 3 | `ai_node_routes.process_ai_node` ~50–63 | Ha `pages[body.pageId]` létezik, `type == "ai"`, **és** (`body.satisfiedConditions` nem üres **vagy** van `steps` és `body.currentStepId`), akkor `active_node = existing_node` — **nem** fut újra embedding + node match. |

Ha ez nem teljesül, `active_node` továbbra is `None` → következő szakasz.

### 1.3 Node matching (csak ha nincs ragadó node)

| Lépés | Fájl / függvény | Mi történik |
|-------|-----------------|-------------|
| 4 | `get_top_k_nodes(prompt, story, k=3)` | `backend/services/embedding_store.py`: embedding alapú előszűrés → max. 3 jelölt `StoryPage`. |
| 5 | `match_active_node(user_prompt, candidate_nodes)` | `backend/services/ai_node_runtime.py`: egy **Anthropic** hívás, `NODE_MATCH_TOOL` → `activeNodeId` vagy `askClarification`. |
| 6 | Ha `askClarification` | Visszaadás `status: clarification`, `clarificationQuestion`, opcionálisan `assistantMessage` fallback (`resolve_ai_clarification_fallback_message`) — **routing / kondíció extract nem fut**. |
| 7 | Ha van `activeNodeId` | `active_node = pages[active_node_id]`. |

**Külső kondíciók relevanciája itt:** a node match **csak** a user szöveget és a jelöltek `knowledge` blokkját látja. **Order / raktár / futár tények** itt **nem** jelennek meg.

### 1.4 Ág A — Lépés-alapú folyamat (`steps` + `currentStepId`)

| Lépés | Fájl / függvény | Mi történik |
|-------|-----------------|-------------|
| 8a | `process_step(...)` | `ai_node_runtime.process_step`: `internal_conditions` listából `_build_conditions_block`; **két** LLM hívás: (1) `extract_conditions` tool, (2) `generate_reply` tool. **User üzenet:** `f"Kondíciók:\n{block}\n\nFelhasználó üzenete: {user_prompt}"`. |
| 8b | Kötelező lépés-zárás | `required_ids`: minden `internal_conditions` elem, ahol `required` **nem** `false`. Ha mind presetben / toolban teljesült → `stepDone`, `next_step_id` branch vagy `default_next`. |
| 8c | Ha lépés lezárva és nincs következő step | `get_ai_node_payload` (`story_runtime`): betölti a node `routing` tömbjét, `resolve_ai_node_routing(routing, satisfied_conditions)` → `nextPageId` vagy `"ask"`. |

**Külső kondíciók:** ha egy ilyen ID (pl. `extended_warranty_active`, `within_return_window`) szerepel `internal_conditions`-ben, a modell **csak a user promptból** próbálja eldönteni → **hallucináció / téves teljesülés kockázata**; **nincs** order API hívás.

### 1.5 Ág B — Első üzenet egy matched node-on (`steps`, nincs `currentStepId`)

| Lépés | Függvény | Mi történik |
|-------|----------|-------------|
| 9 | `process_step` (első `steps[0]` elem) | Ugyanaz a pipeline, mint 8a: `extract_conditions` tool az első lépés `internal_conditions` listájára, majd `generate_reply` a felismert `satisfied` / `missing` / `stepDone` / `done_when` alapján. |
| 10 | Válasz prompt | A reply már látja a teljesült és hiányzó kondíciókat; explicit szabály: ami `satisfied`, annak adatát ne kérje be újra (pl. `tracking_checked` → ne tracking szám / futár). |

**step_start viselkedés:** Ha egy stepped node-ra érkezik az első üzenet és nincs `currentStepId`, a backend `process_step`-et futtat az első stepre — nem külön `generate_step_start_reply` + extract párost. Az első lépés `internal_conditions` listáján fut az extract, utána a `generate_reply` az extract eredményével (satisfied, missing, lépés lezárva-e, következő step). A válasz nem kér be olyan adatot, ami már a satisfied listában van.

### 1.6 Ág C — Lépés nélküli AI node (`conditions` a node szintjén, üres vagy nincs `steps` logika)

| Lépés | Függvény | Mi történik |
|-------|----------|-------------|
| 11 | `extract_conditions(user_prompt, active_node, already_satisfied)` | Node `conditions` listája → ugyanaz a kétfázisú extract + reply; user üzenetben csak a kondíció lista + `user_prompt`. |
| 12 | `get_ai_node_payload` | Ugyanaz, mint 8c: determinisztikus `routing` a **összegyűjtött** `satisfied_conditions` string listára. |

**Üres conditions fallback:** Ha egy AI node `conditions` listája üres (`[]` vagy hiányzik), a backend **nem** futtat `extract_conditions` LLM hívást. Közvetlenül `generate_reply`-ra ugrik: a system prompt a node `knowledge` leírását és a `fallback_message` hangnemét / tartalmát használja (nem hardcoded „Köszönöm, folytatjuk.” szöveg). Példa: `off-topic` node üres conditions-sel (ha nincs session kondíció) vagy off-topic `user_acknowledged` kondícióval normál extract úttal.

### 1.7 Hol hiányzik a 15 külső típusú kondíció támogatása?

A rendszer **egyetlen helyen** sem olvas order / warehouse / courier API-t. A releváns **story** ID-k (példa: `extended_warranty_active`, `within_return_window`, `outside_return_window`, `sold_threshold_known`, `below_sold_threshold`, `sold_grade_known`, `order_accessory_list_checked`, `accessory_was_in_order`, `accessory_not_in_order`, `return_was_completed`, `return_not_received`, `payment_method_known`) a `ai_complaint_story_v3.json`-ban **szerepelnek** leírásokkal — a runtime viszont **minden** ilyen flaget a **LLM `extract_conditions` eredményéből** vár, kivéve ha a kliens már elküldte `satisfiedConditions`-ben (session merge `already_satisfied` + tool `satisfied`).

**Megjegyzés a táblázat `delivery_date` / `courier` / `tracking_number` ID-khoz:** a jelenlegi story fájlban **nem** találhatók ilyen nevű `internal_conditions` / `conditions` **id** mezők (a szállítási ág inkább `tracking_checked`, `marked_delivered_not_received` stb. narratív flagjeit használja). Integrációtervezéskor érdemes **szótár**: külső mező → story-beli condition id, vagy story finomhangolás.

---

## 2. Integrációs pont (OrderContext injektálás)

### 2.1 Hol kellene a context enrichment futnia?

**Ajánlott sorrend:** **`process_ai_node` elején**, közvetlenül a story betöltése és a **ragadó** `active_node` feloldása után, **de még** az első olyan LLM hívás előtt, ami kondíciókat vagy node match-et végez — tehát:

1. `load_story` + `pages` + (opcionális) **`order_id` kinyerése** a `body`-ból vagy a meglévő `satisfiedConditions` / user prompt heurisztikájából (jövőbeli API bővítés).
2. **`OrderContextProvider.get_order_context(order_id)`** (async) — ha van `order_id`.
3. **`derive_conditions(ctx, conversation_state)`** → pl. `{"within_return_window": True, ...}` mint **előre teljesült** ID-k.
4. Ezeket **összevonni** a kliens által küldött `body.satisfiedConditions`-nel (prioritás: **külső / derived felülírja vagy kiegészíti** — policy kérdés, lásd nyitott kérdések).

**Alternatíva (mélyebb integráció):** `extract_conditions` / `process_step` **hívása előtt** a routerben (`ai_node_routes`) összeállítani egy `enriched_satisfied: list[str]` listát, és azt adni át `already_satisfied`-ként **és/vagy** külön blokkban a promptba.

### 2.2 Hol változna az LLM-nek küldött szöveg?

| Komponens | Fájl | Jelenleg | Javasolt bővítés |
|-----------|------|----------|------------------|
| `extract_conditions` | `ai_node_runtime.py` | `system_extract` + `user_message` = kondíciók + user üzenet. | Opcionális blokk: **„Rendszer által ismert tények (order)”** JSON vagy bullet lista az `OrderContext` mezőiből; utasítás: *„Ezeket a kondíciókat ne tagadd meg, ha egyeznek; ne találj ki order adatot.”* |
| `process_step` | ugyanott | Ugyanígy csak user + `internal_conditions`. | Ugyanaz a blokk a `user_message` végén vagy külön `system` részben. |
| `match_active_node` | ugyanott | Csak node `knowledge`. | Opcionális: rövid order összefoglaló a **szándék** finomításához (nem kötelező az 1. fázishoz). |

### 2.3 „User adta” vs „orderből jött” megkülönböztetése

Jelenleg **nincs** explicit megkülönböztetés: minden satisfied ID egy string lista.

**Javasolt irány (implementáció nélkül):**

- **Belső reprezentáció:** `satisfiedConditions` marad string lista a válaszban (kompatibilitás), de a szerveren **opcionális** meta: `conditionSources: dict[str, "user" | "order" | "derived"]` *(csak ha a API szerződést később bővítik — a feladat szerint a frontend most nem változik; ez opcionális válaszmező lenne)*.
- **Prompt-szint:** a rendszer által injektált tényekhez tartozó ID-k listája külön sorban: *„A következő kondíciók már bizonyítottan teljesülnek (order): …”* — az LLM `extract_conditions` toolját instruálni, hogy ezeket **mindig** tegye a `satisfied` listába, és **ne** távolítsa el.
- **Determinisztikus összevonás:** a `derive_conditions` + order által garantált ID-k **egyesítése** a tool outputtal **szerver oldali merge** után (trusted path), így a router (`resolve_ai_node_routing`) **valós** adaton fut.

---

## 3. OrderContext Pydantic modell (terv)

A felhasználói specifikáció alapján, a story-ban látott mezők és a 15 külső jellegű flag lefedésével kiegészítve. **`below_sold_threshold` nincs a modellben** — származtatott / összehasonlítás (user által jelentett health vs `sold_battery_threshold`).

```python
from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class OrderContext(BaseModel):
    """Rendeléshez kapcsolt, külső forrásokból összeállított tények. Nem minden mező minden rendelésnél elérhető."""

    order_id: str = Field(..., description="Kulcs a provider hívásokhoz; ha nincs rendelés, ne hozz létre OrderContext-et.")

    purchase_date: Optional[date] = None
    extended_warranty_active: Optional[bool] = None

    sold_grade: Optional[str] = Field(
        None,
        description='Pl. "Excellent" / "Very Good" / "Good" — story: sold_grade_known',
    )
    sold_battery_threshold: Optional[float] = Field(
        None,
        description="Eladáskor ígért minimum battery health (0–1), story: sold_threshold_known / below_sold_threshold számításhoz",
    )

    accessories_in_order: Optional[list[str]] = Field(
        None,
        description="Rendelésben szereplő tartozék SKU vagy megnevezés — order_accessory_list_checked, accessory_was_in_order",
    )

    return_status: Optional[str] = Field(
        None,
        description='Raktár / WMS: pl. "pending" | "received" | "accepted" | "rejected" — return_was_completed, return_not_received',
    )

    payment_method: Optional[str] = Field(None, description="Story: payment_method_known")

    delivery_date: Optional[date] = Field(None, description="Futár / carrier confirmed delivery date ha elérhető")
    courier: Optional[str] = Field(None, description="Futárszolgálat neve")
    tracking_number: Optional[str] = Field(None, description="Tracking szám a szállításhoz")

    # Kiterjesztés a kódelemzés alapján (story + üzleti logika)
    order_currency: Optional[str] = None
    line_item_skus: Optional[list[str]] = None
    warehouse_notes: Optional[str] = None
```

---

## 4. `derive_conditions` — szignatúra és logika (szövegesen, implementáció nélkül)

```python
def derive_conditions(
    ctx: OrderContext,
    conversation_state: dict,
) -> dict[str, object]:
    """
    Visszaadás: condition_id → érték (bool / str / float) vagy csak satisfied ID-k halmaza,
    attól függenően, hogy a pipeline hogyan merge-eli a routing listába.

    conversation_state: pl. user által jelentett értékek kulcsai
    (missing_accessory_name, battery_health_user_reported float, today override teszthez).

    Számítások (terv):
    - within_return_window: ha purchase_date ismert és policy szerint N nap (pl. 30):
      (today - purchase_date).days <= N.
    - outside_return_window: logikai negációja a within_return_window-nak, ha purchase_date ismert;
      ha purchase_date hiányzik → ne állítson semmit (vagy explicit „unknown” — policy).
    - return_was_completed: return_status in {"accepted"} (vagy üzleti szabály szerinti részhalmaz).
    - return_not_received: return_status in {None, "", "pending"} vagy nem „received/accepted”.
    - accessory_was_in_order: user által jelzett hiányzó tétel (conversation_state) ∈ accessories_in_order
      (normalizált string egyezés / SKU mapping — nyitott kérdés).
    - accessory_not_in_order: explicit ellenkező eset, ha a hiányzó tétel egyértelműen **nincs** a listában;
      ha lista ismeretlen → ne állítson „not_in_order”-ot (false positive elkerülése).
    - sold_threshold_known: True ha sold_battery_threshold is not None (vagy külön bool a providerben).
    - below_sold_threshold: **nem** a OrderContext része; számítás:
      battery_health_user_reported < sold_battery_threshold, mindkét oldal ismert kell legyen.

    Figyelmeztetés: a story routing **string ID-k jelenlétét** nézi, nem bool értéket — a merge rétegnek
    a derive eredményét **satisfied condition ID listává** kell alakítania (pl. within_return_window → szerepel a listában ha True).
    """
    ...
```

---

## 5. OrderContextProvider ABC + négy stub

```python
from abc import ABC, abstractmethod
from typing import Optional

from pydantic import BaseModel


class OrderContext(BaseModel):
    """Lásd a 3. fejezetet — itt csak a provider interfészhez stub."""


class OrderContextProvider(ABC):
    @abstractmethod
    async def get_order_context(self, order_id: str) -> Optional[OrderContext]:
        """Visszaadja a rendelés kontextusát, vagy None ha nincs adat / hiba kezelve üresen."""


class MockOrderContextProvider(OrderContextProvider):
    """
    Inicializálás: opcionális dict[order_id, OrderContext] vagy fixture JSON path.
    get_order_context: dict lookup, azonnali return.
    Latency: ~0 ms. Kockázat: eltér a prod adattól — csak dev/CI.
    """


class CsvOrderContextProvider(OrderContextProvider):
    """
    Inicializálás: CSV fájl útvonal + oszlop mapping konfig.
    get_order_context: szinkron read + parse sor order_id alapján, async wrapperben.
    Latency: alacsony (disk). Kockázat: frissítés kézi, konkurencia íráskor, séma drift.
    """


class WebhookOrderContextProvider(OrderContextProvider):
    """
    Inicializálás: Redis/DB connection ahol a webhook írja a legutóbbi order snapshotot; TTL.
    get_order_context: cache read order kulccsal.
    Latency: alacsony–közepes. Kockázat: webhook késik / duplikál / out-of-order események.
    """


class ApiOrderContextProvider(OrderContextProvider):
    """
    Inicializálás: base URL, auth (API key / OAuth), timeout, circuit breaker.
    get_order_context: HTTP GET (vagy GraphQL) order_id-re, válasz → OrderContext map.
    Latency: közepes–magas (hálózat). Kockázat: rate limit, részleges válasz, üzleti SLA.
    """
```

---

## 6. Nyitott kérdések

1. **`order_id` forrása a `AiNodeProcessRequest`-ben:** jelenleg nincs dedikált mező — csak `prompt` + opcionálisan `has_order_id` a sessionben. Szükség van-e `orderId` mezőre a requestben (backend-only bővítés), vagy elegendő a kliens által küldött `satisfiedConditions` + `has_order_id`?
2. **Merge policy:** ha az LLM **false**-nak „gondol” egy order által már igazolt flaget, a szerver **felülírja-e** a tool outputot, vagy **hiba** / **log**?
3. **`return_status` enumeráció:** a story `return_was_completed` / `return_not_received` szövegei üzleti nyelven vannak — pontos WMS állapot → condition ID mapping táblázat szükséges.
4. **Tartozék egyeztetés:** `accessories_in_order` stringek vs user szabad szövege — fuzzy match, SKU, vagy manuális disambiguation lépés?
5. **`delivery_date` / `courier` / `tracking_number` vs story ID-k:** a jelenlegi `ai_complaint_story_v3.json` más ID-ket használ a szállítási ágon; egységesíteni kell-e a 15 feltétel listát a storyval, vagy külön „canonical mapping” réteget?
6. **Async FastAPI:** `process_ai_node` jelenleg **sync** `async def` mellett sync Anthropic hívásokkal; provider async lesz — blokkoló executor vagy teljes async migration?
7. **Observabilitás:** order fetch hiba esetén fail-open (csak LLM) vagy fail-closed (clarification + hibaüzenet)?
8. **Adatvédelem:** OrderContext logolása / prompt injektálás — PII maszkolás (cím, név) szükséges-e?

---

## Fájl-hivatkozás összefoglaló

| Terület | Fájl | Kulcsfüggvények |
|---------|------|-----------------|
| HTTP pipeline | `backend/routers/ai_node_routes.py` | `process_ai_node` |
| LLM + kondíciók | `backend/services/ai_node_runtime.py` | `match_active_node`, `extract_conditions`, `process_step`, `generate_step_start_reply` |
| Routing | `backend/services/story_runtime.py` | `get_ai_node_payload`, `resolve_ai_node_routing`, `resolve_ai_clarification_fallback_message` |
| Séma (AI node szerkezet) | `backend/schemas/CoreSchema.json` | `$defs/AiNode`, `AiNodeCondition`, `AiNodeRoutingRule` |
| Story tartalom | `backend/stories/ai_complaint_story_v3.json` | `pages.*` AI node-ok, `conditions` / `steps` / `routing` |

"""Pydantic contracts for the support-chatbot onboarding brief (Phase 0 input).

A `SupportChatbotBrief` az a USER-FACING input, amit az ügyfél kitölt a
`/dashboard/onboarding/new` oldalon. A Phase 0 (lásd `brief_expander.py`)
ebből konstruál egy strukturált `research_text` markdown-t és a Phase 1
által várt metaadatokat (`BriefExpansionResult`), majd a meglévő pipeline
(Phase 1-2-3) ezt változatlan kontrakttal feldolgozza.

Tartalmi felépítés a `questell_onboarding_flow.md` szerint:

* **Card 1 — Cégi alapok** (`Card1CompanyBasics`): kontextus a knowledge
  leírások és reply_rules személyességéhez.
* **Card 2 — Visszaküldés, hibakezelés, szállítás** (`Card2Operations`):
  időablakok, remedy hierarchia, szállítói adatok. A pipeline kondíció +
  routing logikájának forrása.
* **Card 3 — Háttérrendszer és SLA** (`Card3Backend`): helpdesk csatlakozás
  (discriminated union per provider), SLA célok, sürgősségi triggerek.
* **Card 4 — Kimenet és ígéretek** (`Card4Output`): 6 fix end-node szöveg
  AI által előtöltve + 1 kötelező manuális scope-out üzenet. Az
  `AiPrefilledText` state machine kezeli a Fresh / Stale / Approved
  állapotokat (lásd a docstringben).
* **Card 5 — Viselkedési határok és eszkaláció** (`Card5Boundaries`):
  off-topic kezelés, support elérhetőség. (Az 5C fix-szabály panel NEM
  kontraktol mezőt, csak frontend pattern.)
* **Card 6 — Forrásanyagok** (`Card6Sources`): 6 fix dokumentum-slot
  priority címkékkel; a Phase 0 ezeket text-extractolva belefűzi a
  research_text-be.

Tervezési alapelvek:

1. **`extra="forbid"` mindenhol** — regresszió-védelem a frontend
   hallucinált mezők ellen.
2. **Strukturális default-ok** — ahol a doksi default-ot említ (off-topic
   limit 2, off-topic redirect szöveg, normál SLA 48h, sürgős SLA 24h,
   `battery_safety` mindig benne van), Field default-tal vagy
   model_validator-rel kényszerítve.
3. **Discriminated union a helpdesk credentials-hez** — Zendesk /
   Freshdesk / HubSpot / Webhook provider-onként eltérő mezőkkel, tagged
   union-nel típushelyesen.
4. **6 fix end-node-slot + 6 fix source-doc-slot** — a doksi enumerálja
   őket. `Dict[Literal[...], T]` a kulcs-validációhoz, default_factory
   az auto-feltöltéshez (üres slotok mindig léteznek, a frontend
   pattern erre épít).
5. **`AiPrefilledText` state machine** — a Card 4 generálás-flow magja.
   A frontend a `status` + `last_ai_generated_at` mezőkből származtatja a
   "STALE" UI állapotot (Card 2 azóta változott → újragenerálás gomb
   highlight).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any, Literal, Optional, Union
from uuid import uuid4

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


# --------------------------------------------------------------------------- #
# Shared literals + constants                                                 #
# --------------------------------------------------------------------------- #


Locale = Literal["hu", "en"]
"""Bemeneti locale — a Phase 1 `locale` paramétere ide mappel."""


BusinessModel = Literal["own_inventory", "marketplace", "both"]
"""Card 1 működési modell. `marketplace` → extra seller-escalation routing."""


TargetMarket = Literal["b2c", "b2b", "both"]
"""Card 1 célpiac. `b2b` → más SLA és garancia logika."""


ReturnWindowOrigin = Literal["delivery", "order"]
"""Card 2A: a visszaküldési határidő kezdete."""


ReturnConditionRequirement = Literal[
    "original_packaging",
    "accessories_included",
    "factory_reset",
    "any_condition",
]
"""Card 2A: visszaküldéshez kötelező csomagolási / kiegészítő feltételek."""


ShippingPayer = Literal["company", "customer", "case_by_case"]
"""Card 2A / 2C: ki fizeti a visszaküldési szállítást / kárigény."""


RemedyKind = Literal["refund", "replacement", "repair", "partial_refund"]
"""Card 2B: remedy ladder elemei (sorrend = prioritás)."""


InstantReplacementPolicy = Literal["always", "if_in_stock", "no"]
"""Card 2B: tudnak-e azonnali cserét biztosítani."""


RefundTimeline = Literal[
    "3_business_days",
    "5_7_business_days",
    "14_business_days",
    "other",
]
"""Card 2B: visszatérítés ideje (dropdown opciók)."""


CarrierKind = Literal["DPD", "DHL", "GLS", "PostNL", "FedEx", "UPS", "other"]
"""Card 2C: ismert futárszolgálatok. `other` → szabad szöveges."""


DamageReportUnit = Literal["hours", "days"]
"""Card 2C: sérült/hiányos csomag bejelentés ideje (mértékegység)."""


HelpdeskProvider = Literal["zendesk", "freshdesk", "hubspot", "other"]
"""Card 3A: támogatott helpdesk provider-ek. `other` = generic webhook."""


HelpdeskConnectionState = Literal[
    "disconnected", "testing", "connected", "failed"
]
"""Card 3A: a `[Csatlakoztatás]` teszt API hívás állapota."""


NormalSlaWindow = Literal["24h", "48h", "72h", "1_week"]
"""Card 3B: normál ügyek válaszidő dropdown."""


UrgentSlaWindow = Literal["1h", "4h", "24h"]
"""Card 3B: sürgős ügyek válaszidő dropdown."""


UrgencyTriggerKind = Literal[
    "battery_safety",
    "dead_on_arrival",
    "lost_package_urgent",
    "expired_refund_deadline",
    "other",
]
"""Card 3C: sürgős esetek multi-select. `battery_safety` mindig kötelező."""


EndNodeKind = Literal[
    "return_accepted",
    "refund_initiated",
    "replacement_initiated",
    "warranty_investigation",
    "lost_package",
    "expired_return_deadline",
]
"""Card 4A: a 6 előtöltött end-node-szöveg fix kulcsai."""


SourceDocumentKind = Literal[
    "gtc",
    "warranty_terms",
    "faq",
    "product_grades",
    "past_tickets",
    "return_process",
]
"""Card 6: a 6 fix forrás-dokumentum-slot kulcsai."""


SourceDocumentPriority = Literal[
    "required", "strongly_recommended", "recommended", "optional"
]
"""Card 6: priority badge értékek (UI + pipeline-warning logika)."""


SupportAvailabilitySlot = Literal[
    "weekdays_9_17", "weekdays_9_20", "weekends_too", "24_7"
]
"""Card 5B: support csapat elérhetőség multi-select opciók."""


AttachmentKind = Literal["file", "url", "text"]
"""Card 6 attachment típus: feltöltött fájl / URL / kézzel beírt szöveg."""


AiPrefilledTextStatus = Literal[
    "empty",          # még nem generált — Card 2 nincs mentve, vagy 4A még sosem fut
    "ai_generating",  # AI hívás folyamatban (BG)
    "ai_prefilled",   # AI legenerálta, user még nem nézte át
    "user_approved",  # user [✓ Jóváhagyva]-ra kattintott a változatlan szövegen
    "user_edited",    # user módosította a szöveget (re-gen NEM írja felül)
]
"""Card 4A end-node-szöveg state machine. Lásd `AiPrefilledText` docstring."""


# --------------------------------------------------------------------------- #
# Default szövegek + label-mapok                                              #
# --------------------------------------------------------------------------- #


DEFAULT_OFF_TOPIC_REDIRECT_HU = (
    "Ez a kérdés kívül esik azon, amiben segíteni tudok. Visszaküldési, "
    "garanciális vagy szállítási problémában tudok segíteni — van ilyen "
    "jellegű kérdésed?"
)


DEFAULT_OFF_TOPIC_REDIRECT_EN = (
    "This question is outside the scope I can help with. I can assist with "
    "returns, warranty, or shipping issues — do you have a question like that?"
)


SOURCE_DOC_PRIORITIES: dict[SourceDocumentKind, SourceDocumentPriority] = {
    "gtc": "required",
    "warranty_terms": "required",
    "faq": "strongly_recommended",
    "product_grades": "recommended",
    "past_tickets": "optional",
    "return_process": "optional",
}
"""Source-doc kind → priority. Frontend a badge-et innen kapja."""


SOURCE_DOC_LABELS_HU: dict[SourceDocumentKind, str] = {
    "gtc": "ÁSZF / Általános Szerződési Feltételek",
    "warranty_terms": "Garancia feltételek",
    "faq": "FAQ / Tudásbázis",
    "product_grades": "Termék grade definíciók",
    "past_tickets": "Korábbi support jegyek (anonimizálva)",
    "return_process": "Visszaküldési folyamat leírása",
}
"""Magyar label-ek a 6 source-doc slothoz (frontend megjelenítéshez)."""


END_NODE_LABELS_HU: dict[EndNodeKind, str] = {
    "return_accepted": "Visszaküldés elfogadva",
    "refund_initiated": "Visszatérítés indítva",
    "replacement_initiated": "Csere indítva",
    "warranty_investigation": "Garancia vizsgálat indul",
    "lost_package": "Elveszett csomag",
    "expired_return_deadline": "Határidőn túli visszaküldés",
}
"""Magyar label-ek a 6 end-node-slothoz (Card 4A megjelenítés)."""


END_NODE_SOURCE_CARDS: dict[EndNodeKind, list[str]] = {
    "return_accepted": ["card2a"],
    "refund_initiated": ["card2b"],
    "replacement_initiated": ["card2b"],
    "warranty_investigation": ["card2b"],
    "lost_package": ["card2c"],
    "expired_return_deadline": ["card2a"],
}
"""End-node → forrás-kártyák (UX: "Forrás: 2A — határidő..." badge).

A Phase 4 end-node generálás ezt használja annak eldöntésére, hogy melyik
Card 2 alszekciókat kell betölteni a prompt-kontextusba.
"""


# --------------------------------------------------------------------------- #
# Shared building blocks                                                      #
# --------------------------------------------------------------------------- #


class Attachment(BaseModel):
    """Egy feltöltött forrás-elem (fájl, URL vagy szabad szöveg).

    A Phase 0 prompt builder a `raw_text_preview`-t használja a research_text
    építéséhez. A teljes raw_text (ha pl. PDF-ből extractáltunk ~50 oldalt)
    NEM kerül ide be — azt a tárolóban (sources tábla) tartjuk, csak az első
    N karakter idézet kerül a prompt-ba, hogy ne fújjuk fel a context window-t.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="UUID, frontend és backend közös referencia",
    )
    kind: AttachmentKind = Field(
        ...,
        description="Milyen forrás: feltöltött fájl / URL / kézzel beírt szöveg",
    )
    name: str = Field(
        ...,
        description=(
            "Fájl esetén: eredeti filename. URL esetén: a teljes URL. "
            "Szöveg esetén: rövid felhasználói label (pl. 'Termék-grade jegyzet')."
        ),
        min_length=1,
        max_length=255,
    )
    byte_size: Optional[int] = Field(
        default=None,
        ge=0,
        description="Csak `kind=file` esetén; URL/text esetén None.",
    )
    mime_type: Optional[str] = Field(
        default=None,
        description="Pl. 'application/pdf', 'text/html'. URL/text esetén lehet None.",
    )
    raw_text_preview: Optional[str] = Field(
        default=None,
        description=(
            "Az extracted plain-text első ~2000 karaktere. A Phase 0 ezt "
            "fűzi be idézettel a research_text-be. None = még nem futott le "
            "az extract pipeline (frontend `⏳ feldolgozás...`-t mutat)."
        ),
        max_length=8000,
    )
    extract_error: Optional[str] = Field(
        default=None,
        description=(
            "Ha az extract pipeline hibázott (corrupt PDF, 404 URL stb.), "
            "1-2 mondatos emberi hibaüzenet. Frontend ⚠ badge-et tesz a fájlra."
        ),
        max_length=500,
    )
    uploaded_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Audit timestamp.",
    )


class AiPrefilledText(BaseModel):
    """Card 4A end-node-szöveg az AI-prefill state machine-nel.

    State átmenetek (frontend + backend megosztva):

    ```
    empty ─── Card2 első mentés ──► ai_generating
    ai_generating ─── AI válasz ─► ai_prefilled
    ai_prefilled ─── user [✓] ──► user_approved   (változatlan szöveg)
    ai_prefilled ─── user szerk.►  user_edited    (módosított szöveg)
    user_approved ── user szerk.►  user_edited
    user_* ─── újragenerálás ────► ai_prefilled   (felülírja!)
    ```

    A "STALE" jelölés a frontend-en származtatott állapot:
    `card2.updated_at > last_ai_generated_at && status != "user_edited"`.
    Backend NEM tárolja külön — minden update timestamp-ből számolható.

    A `user_edited` állapotot az újragenerálás MEGTARTJA mint figyelmeztetést
    a frontend-en (modal: "Felülírod a saját szerkesztésedet?"), és csak
    explicit user-megerősítés után csap rá `ai_prefilled` állapotra.
    """

    model_config = ConfigDict(extra="forbid")

    status: AiPrefilledTextStatus = Field(
        default="empty",
        description="State machine pozíció.",
    )
    content: str = Field(
        default="",
        description=(
            "A jelenleg megjelenített szöveg. `empty` állapotban üres string. "
            "Generálás után a kész AI-szöveg, vagy a user által módosított "
            "változat."
        ),
        max_length=2000,
    )
    last_ai_generated_at: Optional[datetime] = Field(
        default=None,
        description=(
            "Az utolsó sikeres AI-prefill timestamp-je. A frontend ezt "
            "hasonlítja a Card 2 last-updated-jeihez a STALE jelölés "
            "származtatásához."
        ),
    )
    last_user_edited_at: Optional[datetime] = Field(
        default=None,
        description="Az utolsó user-szerkesztés (status=`user_edited` lett).",
    )
    last_user_approved_at: Optional[datetime] = Field(
        default=None,
        description="Az utolsó [✓ Jóváhagyva] kattintás (status=`user_approved`).",
    )


class SourceDocumentSlot(BaseModel):
    """Card 6: egy forrás-dokumentum slot (0..N attachment-tel).

    A 6 slot fix (`SourceDocumentKind`). A `priority` és `label` nem kerül
    ide — azt frontend mapeli `SOURCE_DOC_PRIORITIES` és `SOURCE_DOC_LABELS_HU`
    konstansokból (a kontraktban duplikáció lenne).
    """

    model_config = ConfigDict(extra="forbid")

    kind: SourceDocumentKind = Field(..., description="A slot fix kulcsa.")
    attachments: list[Attachment] = Field(
        default_factory=list,
        description="0..N attachment. Üres lista = még nincs feltöltve semmi.",
    )


# --------------------------------------------------------------------------- #
# Card 1 — Cégi alapok                                                        #
# --------------------------------------------------------------------------- #


class Card1CompanyBasics(BaseModel):
    """Card 1: cég neve, működési modell, célpiac, locale, honlap URL.

    A `website_url` opcionális, de ha kitöltött, a frontend `[✨ Töltsd ki
    ami lehet a honlap alapján]` smart-fill triggert engedélyezi (lásd
    `task 11-smart-fill`).
    """

    model_config = ConfigDict(extra="forbid")

    vendor_name: str = Field(
        ...,
        description="Cég neve. → Phase 1 `vendor_name` paraméter.",
        min_length=1,
        max_length=120,
    )
    business_model: BusinessModel = Field(
        ...,
        description="Saját készlet / marketplace / mindkettő.",
    )
    target_market: TargetMarket = Field(
        ...,
        description="B2C / B2B / mindkettő.",
    )
    locale: Locale = Field(
        ...,
        description="Chatbot nyelve. → Phase 1 `locale` paraméter.",
    )
    website_url: Optional[str] = Field(
        default=None,
        description="Cég honlapjának URL-je. Smart-fill trigger forrása.",
        max_length=500,
    )


# --------------------------------------------------------------------------- #
# Card 2 — Visszaküldés, hibakezelés, szállítás                               #
# --------------------------------------------------------------------------- #


class CategorySpecificReturnWindow(BaseModel):
    """Termékcsoport-specifikus visszaküldési határidő (Card 2A repeater)."""

    model_config = ConfigDict(extra="forbid")

    category_label: str = Field(
        ...,
        description="Pl. 'Akkumulátoros eszközök', 'Tartozékok'.",
        min_length=1,
        max_length=120,
    )
    return_window_days: int = Field(
        ...,
        gt=0,
        le=365,
        description="Visszaküldési határidő ennél a kategóriánál.",
    )


class Card2aReturns(BaseModel):
    """Card 2A: visszaküldési feltételek."""

    model_config = ConfigDict(extra="forbid")

    return_window_days: int = Field(
        ...,
        gt=0,
        le=365,
        description="Visszaküldési határidő (nap).",
    )
    return_window_starts_from: ReturnWindowOrigin = Field(
        ...,
        description="Honnan számít: kézhezvétel / rendelés napjától.",
    )
    has_category_specific_windows: bool = Field(
        default=False,
        description="Van-e termékcsoportonként eltérő határidő?",
    )
    category_specific_windows: list[CategorySpecificReturnWindow] = Field(
        default_factory=list,
        description=(
            "Ha `has_category_specific_windows=True`: kategória-szintű "
            "felülírások. Egyébként üres lista."
        ),
    )
    condition_requirements: list[ReturnConditionRequirement] = Field(
        default_factory=list,
        description=(
            "Milyen állapotban fogadják vissza: eredeti csomagolás / tartozékok / "
            "gyári reset / állapottól független. Üres list = nincs megadva."
        ),
    )
    return_shipping_paid_by: ShippingPayer = Field(
        ...,
        description="Ki fizeti a visszaküldési szállítást: cég / ügyfél / esetfüggő.",
    )

    @model_validator(mode="after")
    def _validate_category_windows_presence(self) -> "Card2aReturns":
        if self.has_category_specific_windows and not self.category_specific_windows:
            raise ValueError(
                "has_category_specific_windows=True esetén legalább 1 "
                "category_specific_windows elem kötelező."
            )
        if (
            not self.has_category_specific_windows
            and self.category_specific_windows
        ):
            raise ValueError(
                "category_specific_windows-t adtál meg, de "
                "has_category_specific_windows=False — kapcsold be a flag-et "
                "vagy ürítsd a listát."
            )
        return self


class Card2bRemedy(BaseModel):
    """Card 2B: hibakezelési hierarchia / remedy ladder.

    A `primary_remedy_order` lista SORRENDJE = prioritás. A frontend
    drag-to-reorder komponens (`RemedyLadder`) ezt manipulálja. Ha
    `has_own_repair_capacity=False`, a `repair` opció **automatikusan
    kihúzódik** a frontend-en (a kontrakt elfogadja mindkét esetet, csak
    a UX akadályozza meg az inkonzisztens kombinációt).
    """

    model_config = ConfigDict(extra="forbid")

    has_own_repair_capacity: bool = Field(
        ...,
        description="Van-e saját javítási kapacitásuk?",
    )
    primary_remedy_order: list[RemedyKind] = Field(
        ...,
        description=(
            "Hibaigazolódás esetén megoldási preferencia, csökkenő prioritással. "
            "Min 1, max 4 elem (4 = az összes RemedyKind)."
        ),
        min_length=1,
        max_length=4,
    )
    instant_replacement: InstantReplacementPolicy = Field(
        ...,
        description="Azonnali csere lehetséges-e: igen mindig / készlettől függ / nem.",
    )
    refund_timeline: RefundTimeline = Field(
        ...,
        description="Visszatérítés ideje (dropdown).",
    )
    refund_timeline_other: Optional[str] = Field(
        default=None,
        description=(
            "Csak `refund_timeline='other'` esetén kötelező: szöveges leírás "
            "(pl. '21 munkanapon belül')."
        ),
        max_length=200,
    )
    has_extended_warranty: bool = Field(
        default=False,
        description="Van-e extended warranty opció?",
    )
    extended_warranty_coverage: Optional[str] = Field(
        default=None,
        description=(
            "Ha `has_extended_warranty=True`: mit fed le ami az alap nem? "
            "Szabad szöveg, 1-2 mondat ajánlott."
        ),
        max_length=500,
    )

    @field_validator("primary_remedy_order")
    @classmethod
    def _no_duplicate_remedies(cls, v: list[RemedyKind]) -> list[RemedyKind]:
        if len(set(v)) != len(v):
            raise ValueError(
                "primary_remedy_order nem tartalmazhat duplikátumot."
            )
        return v

    @model_validator(mode="after")
    def _validate_remedy_consistency(self) -> "Card2bRemedy":
        if (
            self.refund_timeline == "other"
            and not self.refund_timeline_other
        ):
            raise ValueError(
                "refund_timeline='other' esetén refund_timeline_other kötelező."
            )
        if (
            self.refund_timeline != "other"
            and self.refund_timeline_other
        ):
            raise ValueError(
                "refund_timeline_other-t adtál meg, de refund_timeline != "
                "'other'. Vagy állítsd át a dropdown-t, vagy töröld a szöveget."
            )
        if (
            self.has_extended_warranty
            and not self.extended_warranty_coverage
        ):
            raise ValueError(
                "has_extended_warranty=True esetén extended_warranty_coverage "
                "kötelező (mit fed le az alapon felül)."
            )
        return self


class Card2cShipping(BaseModel):
    """Card 2C: szállítás."""

    model_config = ConfigDict(extra="forbid")

    carriers: list[CarrierKind] = Field(
        ...,
        description="Melyik futárszolgálatokkal dolgoznak (multi-select).",
        min_length=1,
    )
    carrier_other_label: Optional[str] = Field(
        default=None,
        description=(
            "Csak ha a `carriers`-ben szerepel `'other'`: az egyéb futár(ok) "
            "szöveges felsorolása (pl. 'Magyar Posta, Express One')."
        ),
        max_length=200,
    )
    lost_package_handled_by: ShippingPayer = Field(
        ...,
        description="Elveszett csomag kárigényét ki indítja.",
    )
    damage_report_window_value: int = Field(
        ...,
        gt=0,
        le=720,
        description="Hány X-en belül kell bejelenteni sérült/hiányos csomagot.",
    )
    damage_report_window_unit: DamageReportUnit = Field(
        ...,
        description="`hours` vagy `days` mértékegység.",
    )

    @model_validator(mode="after")
    def _validate_carrier_other(self) -> "Card2cShipping":
        if "other" in self.carriers and not self.carrier_other_label:
            raise ValueError(
                "Ha a `carriers`-ben szerepel 'other', a carrier_other_label "
                "kötelező (sorold fel a többi futárt szöveggel)."
            )
        if "other" not in self.carriers and self.carrier_other_label:
            raise ValueError(
                "carrier_other_label-t adtál meg, de 'other' nincs a "
                "`carriers` listában — vagy add hozzá, vagy töröld a labelt."
            )
        return self


class Card2Operations(BaseModel):
    """Card 2 wrapper: 2A + 2B + 2C alszekciók."""

    model_config = ConfigDict(extra="forbid")

    returns: Card2aReturns
    remedy: Card2bRemedy
    shipping: Card2cShipping


# --------------------------------------------------------------------------- #
# Card 3 — Háttérrendszer és SLA                                              #
# --------------------------------------------------------------------------- #


class ZendeskCredentials(BaseModel):
    """Zendesk csatlakozási adatok (subdomain + email + API token)."""

    model_config = ConfigDict(extra="forbid")

    provider: Literal["zendesk"] = "zendesk"
    subdomain: str = Field(
        ...,
        description="A Zendesk subdomain (pl. 'acme' → acme.zendesk.com).",
        min_length=1,
        max_length=120,
    )
    admin_email: str = Field(
        ...,
        description="Admin e-mail (API auth identifier).",
        min_length=3,
        max_length=200,
    )
    api_token: str = Field(
        ...,
        description="Zendesk API token (secret).",
        min_length=1,
        max_length=200,
    )


class FreshdeskCredentials(BaseModel):
    """Freshdesk csatlakozási adatok (subdomain + API key)."""

    model_config = ConfigDict(extra="forbid")

    provider: Literal["freshdesk"] = "freshdesk"
    subdomain: str = Field(
        ...,
        description="A Freshdesk subdomain.",
        min_length=1,
        max_length=120,
    )
    api_key: str = Field(
        ...,
        description="Freshdesk API key (secret).",
        min_length=1,
        max_length=200,
    )


class HubSpotCredentials(BaseModel):
    """HubSpot OAuth csatlakozási adatok."""

    model_config = ConfigDict(extra="forbid")

    provider: Literal["hubspot"] = "hubspot"
    oauth_access_token: str = Field(
        ...,
        description="OAuth access token (secret).",
        min_length=1,
        max_length=500,
    )
    portal_id: Optional[str] = Field(
        default=None,
        description="HubSpot portal/hub ID. OAuth scope-tól függ.",
        max_length=120,
    )


class WebhookCredentials(BaseModel):
    """Generic webhook csatlakozás (HelpdeskProvider='other')."""

    model_config = ConfigDict(extra="forbid")

    provider: Literal["other"] = "other"
    webhook_url: str = Field(
        ...,
        description="A webhook URL, ahova a tickets push-olódik.",
        min_length=10,
        max_length=500,
    )
    auth_header: Optional[str] = Field(
        default=None,
        description="Opcionális 'Authorization' header érték (Bearer token stb.).",
        max_length=500,
    )


HelpdeskCredentials = Annotated[
    Union[
        ZendeskCredentials,
        FreshdeskCredentials,
        HubSpotCredentials,
        WebhookCredentials,
    ],
    Field(discriminator="provider"),
]
"""Discriminated union a provider-specifikus credentials struktúrákra.

A `provider` mező a diszkriminátor — Pydantic ennek alapján választja ki
a megfelelő alosztályt. A frontend `HelpdeskProviderCard` komponens állítja
elő.
"""


class Card3aHelpdesk(BaseModel):
    """Card 3A: helpdesk csatlakoztatás (kétágú flow)."""

    model_config = ConfigDict(extra="forbid")

    has_helpdesk: bool = Field(
        ...,
        description=(
            "Van-e helpdesk rendszer. False esetén a backend leíró "
            "csapatneveket generál (`warranty_team`, stb.) — later bekötés "
            "lehetséges."
        ),
    )
    credentials: Optional[HelpdeskCredentials] = Field(
        default=None,
        description=(
            "Csak `has_helpdesk=True` esetén jelen van. A provider mező "
            "diszkriminálja a struktúrát."
        ),
    )
    connection_state: HelpdeskConnectionState = Field(
        default="disconnected",
        description="Frontend frissíti a `[Csatlakoztatás]` teszt eredménye után.",
    )
    last_test_error: Optional[str] = Field(
        default=None,
        description="Ha connection_state='failed': rövid emberi hibaüzenet.",
        max_length=500,
    )
    discovered_meta: Optional[dict[str, Any]] = Field(
        default=None,
        description=(
            "Sikeres teszt esetén: provider-specifikus metadata (groups, "
            "ticket_fields, pipelines stb.). Schema provider-onként eltér; "
            "a pipeline futáskor olvassa ki."
        ),
    )

    @model_validator(mode="after")
    def _validate_credentials_presence(self) -> "Card3aHelpdesk":
        if self.has_helpdesk and self.credentials is None:
            # Engedjük — a user lehet a kiválasztás közepén. A frontend
            # `connection_state=disconnected` mellett tovább engedi a card-ot.
            pass
        if not self.has_helpdesk and self.credentials is not None:
            raise ValueError(
                "has_helpdesk=False, mégis credentials van megadva. "
                "Vagy állítsd True-ra, vagy töröld a credentials-t."
            )
        return self


class Card3bSla(BaseModel):
    """Card 3B: SLA elvárások.

    Default-ok a doksiból (normál 48h, sürgős 24h). A frontend ezzel a
    default-tal jelez "✓ kész"-t a kártyára (a user kifejezetten lecserélheti).
    """

    model_config = ConfigDict(extra="forbid")

    normal_response: NormalSlaWindow = Field(
        default="48h",
        description="Normál ügyek válaszidő.",
    )
    urgent_response: UrgentSlaWindow = Field(
        default="24h",
        description="Sürgős ügyek válaszidő.",
    )


class Card3cUrgency(BaseModel):
    """Card 3C: mi számít sürgősnek.

    A `battery_safety` opció FIX — még ha a user nem is jelöli, a validator
    bedrótozza. Frontend UI: checked + disabled + magyarázó tooltip.
    """

    model_config = ConfigDict(extra="forbid")

    triggers: list[UrgencyTriggerKind] = Field(
        default_factory=lambda: ["battery_safety"],
        description=(
            "Sürgős esetek multi-select. `battery_safety` mindig benne van "
            "(safety okok); a többi opcionális, de min 1 kell összesen "
            "(amit a default biztosít)."
        ),
    )
    other_triggers_description: Optional[str] = Field(
        default=None,
        description=(
            "Ha a `triggers`-ben szerepel 'other': szöveges leírás a "
            "saját urgent-kritériumokról."
        ),
        max_length=500,
    )

    @model_validator(mode="after")
    def _enforce_safety_and_other_consistency(self) -> "Card3cUrgency":
        if "battery_safety" not in self.triggers:
            self.triggers = ["battery_safety", *self.triggers]
        # Duplikátum-szűrés (idempotens) — ha valaki `battery_safety`-t
        # többször beírja, csak egyszer marad.
        seen: set[UrgencyTriggerKind] = set()
        deduped: list[UrgencyTriggerKind] = []
        for t in self.triggers:
            if t not in seen:
                seen.add(t)
                deduped.append(t)
        self.triggers = deduped

        if "other" in self.triggers and not self.other_triggers_description:
            raise ValueError(
                "Ha 'other' a triggers-ben, other_triggers_description kötelező."
            )
        if (
            "other" not in self.triggers
            and self.other_triggers_description
        ):
            raise ValueError(
                "other_triggers_description-t adtál meg, de 'other' nincs a "
                "triggers listában — vagy add hozzá, vagy töröld."
            )
        return self


class Card3Backend(BaseModel):
    """Card 3 wrapper: 3A + 3B + 3C alszekciók."""

    model_config = ConfigDict(extra="forbid")

    helpdesk: Card3aHelpdesk
    sla: Card3bSla = Field(default_factory=Card3bSla)
    urgency: Card3cUrgency = Field(default_factory=Card3cUrgency)


# --------------------------------------------------------------------------- #
# Card 4 — Kimenet és ígéretek                                                #
# --------------------------------------------------------------------------- #


def _default_end_node_texts() -> dict[EndNodeKind, AiPrefilledText]:
    """Auto-feltölti a 6 fix end-node-slotot üres `AiPrefilledText`-ekkel.

    Így a frontend mindig számíthat rá, hogy mind a 6 kulcs jelen van —
    nem kell `if "return_accepted" in dict` checkeket szórni.
    """
    kinds: tuple[EndNodeKind, ...] = (
        "return_accepted",
        "refund_initiated",
        "replacement_initiated",
        "warranty_investigation",
        "lost_package",
        "expired_return_deadline",
    )
    return {k: AiPrefilledText() for k in kinds}


class Card4Output(BaseModel):
    """Card 4: end-node szövegek (4A) + kötelező scope-out üzenet.

    A Card 4B "eszkaláció utáni viselkedés" fix tájékoztató panel — NEM
    kontraktol mezőt, csak frontend pattern (`FixedInfoPanel`).
    """

    model_config = ConfigDict(extra="forbid")

    end_node_texts: dict[EndNodeKind, AiPrefilledText] = Field(
        default_factory=_default_end_node_texts,
        description=(
            "A 6 fix end-node-szöveg az `AiPrefilledText` state machine-nel. "
            "Auto-feltöltött; a Card 2 első mentésekor a backend ai_generating "
            "→ ai_prefilled átmenetet hajt végre minden slotra."
        ),
    )
    scope_out_message: str = Field(
        default="",
        description=(
            "Kötelező manuális mező: mit mondjon a bot ha scope-on kívüli "
            "kérést kap. Üres string = még nincs kitöltve (frontend ⚠)."
        ),
        max_length=500,
    )

    @field_validator("end_node_texts")
    @classmethod
    def _validate_all_six_keys(
        cls, v: dict[EndNodeKind, AiPrefilledText]
    ) -> dict[EndNodeKind, AiPrefilledText]:
        required_keys: set[EndNodeKind] = {
            "return_accepted",
            "refund_initiated",
            "replacement_initiated",
            "warranty_investigation",
            "lost_package",
            "expired_return_deadline",
        }
        missing = required_keys - set(v.keys())
        if missing:
            raise ValueError(
                f"end_node_texts hiányzó kötelező kulcsok: {sorted(missing)}"
            )
        return v


# --------------------------------------------------------------------------- #
# Card 5 — Viselkedési határok és eszkaláció                                  #
# --------------------------------------------------------------------------- #


class Card5aOffTopic(BaseModel):
    """Card 5A: off-topic kezelés.

    A `redirect_message` locale-függő default-tal jön — a backend a
    `SupportChatbotBrief.card1.locale` alapján tölti elő (lásd
    `default_off_topic_redirect_for` helper a `brief_expander.py`-ben).
    """

    model_config = ConfigDict(extra="forbid")

    question_limit: int = Field(
        default=2,
        ge=1,
        le=10,
        description="Hány off-topic kérdésre válaszoljon mielőtt visszaterel.",
    )
    redirect_message: str = Field(
        default="",
        description=(
            "Visszaterelő üzenet. Üres string = a brief-expander a locale "
            "alapján feltölti a `DEFAULT_OFF_TOPIC_REDIRECT_{HU,EN}` "
            "konstanssal."
        ),
        max_length=500,
    )
    excluded_topics: Optional[str] = Field(
        default=None,
        description=(
            "Explicit kizárt témák szöveges felsorolása — pl. 'áralku, B2B "
            "nagyker, általános terméktanácsadás'. Minél konkrétabb, annál "
            "jobb az off-topic node `scope` mezője."
        ),
        max_length=500,
    )


class Card5bSupportAvailability(BaseModel):
    """Card 5B: support csapat elérhetőség."""

    model_config = ConfigDict(extra="forbid")

    has_support_team: bool = Field(
        ...,
        description="Van-e saját support csapat (ami eszkaláció után átveszi).",
    )
    availability_slots: list[SupportAvailabilitySlot] = Field(
        default_factory=list,
        description=(
            "Csak `has_support_team=True` esetén kötelező legalább 1. "
            "Eszkaláció utáni üzenetben + munkaidőn kívüli tájékoztatóban "
            "használt."
        ),
    )

    @model_validator(mode="after")
    def _validate_availability_presence(self) -> "Card5bSupportAvailability":
        if self.has_support_team and not self.availability_slots:
            raise ValueError(
                "has_support_team=True esetén legalább 1 availability_slot "
                "kell — különben a bot nem tudja kommunikálni mikor érhető el a csapat."
            )
        if not self.has_support_team and self.availability_slots:
            raise ValueError(
                "availability_slots-ot adtál meg, de has_support_team=False — "
                "vagy állítsd True-ra, vagy ürítsd a listát."
            )
        return self


class Card5Boundaries(BaseModel):
    """Card 5 wrapper: 5A + 5B alszekciók.

    Az 5C "fix eszkaláció szabályok" tájékoztató panel — NEM kontraktol
    mezőt, csak frontend pattern.
    """

    model_config = ConfigDict(extra="forbid")

    off_topic: Card5aOffTopic = Field(default_factory=Card5aOffTopic)
    support_availability: Card5bSupportAvailability


# --------------------------------------------------------------------------- #
# Card 6 — Forrásanyagok                                                      #
# --------------------------------------------------------------------------- #


def _default_source_slots() -> dict[SourceDocumentKind, SourceDocumentSlot]:
    """Auto-feltölti a 6 fix source-doc-slotot üres attachment-listákkal.

    Lásd `_default_end_node_texts` rationale-jét — frontend így always-on
    slot-szerkezetre építhet.
    """
    kinds: tuple[SourceDocumentKind, ...] = (
        "gtc",
        "warranty_terms",
        "faq",
        "product_grades",
        "past_tickets",
        "return_process",
    )
    return {k: SourceDocumentSlot(kind=k) for k in kinds}


class Card6Sources(BaseModel):
    """Card 6: 6 fix forrás-dokumentum-slot.

    A `slots` dict mindig mind a 6 kulcsot tartalmazza (default factory).
    Az attachments listája lehet üres — frontend a `SOURCE_DOC_PRIORITIES`-ből
    származtatja a ⚠ warning megjelenítését.
    """

    model_config = ConfigDict(extra="forbid")

    slots: dict[SourceDocumentKind, SourceDocumentSlot] = Field(
        default_factory=_default_source_slots,
        description="A 6 fix slot. Mindig jelen van mind, attachments lista lehet üres.",
    )

    @field_validator("slots")
    @classmethod
    def _validate_all_six_slots(
        cls, v: dict[SourceDocumentKind, SourceDocumentSlot]
    ) -> dict[SourceDocumentKind, SourceDocumentSlot]:
        required_keys: set[SourceDocumentKind] = {
            "gtc",
            "warranty_terms",
            "faq",
            "product_grades",
            "past_tickets",
            "return_process",
        }
        missing = required_keys - set(v.keys())
        if missing:
            raise ValueError(
                f"Card6Sources.slots hiányzó kötelező kulcsok: {sorted(missing)}"
            )
        # A slot.kind-nak meg kell egyeznie a dict-kulccsal (konzisztencia).
        for k, slot in v.items():
            if slot.kind != k:
                raise ValueError(
                    f"slot.kind ({slot.kind!r}) != dict-kulcs ({k!r}) — "
                    "konzisztens kell legyen."
                )
        return v

    def missing_required_attachments(self) -> list[SourceDocumentKind]:
        """A `required` priority-jű slotok, amik még üresek.

        Submit előtti pipeline-warning összegzőhöz használt (a frontend
        `[Mégis építsd meg]` modal felsorolja ezeket).
        """
        return [
            kind
            for kind, slot in self.slots.items()
            if SOURCE_DOC_PRIORITIES[kind] == "required"
            and not slot.attachments
        ]


# --------------------------------------------------------------------------- #
# Top-level brief                                                             #
# --------------------------------------------------------------------------- #


BriefDraftStatus = Literal[
    "draft",            # csak részben kitöltött
    "ready_to_build",   # minden kötelező megvan, submitable
    "building",         # Phase 0-3 fut
    "built",            # final_story elkészült
    "failed",           # pipeline elhasalt — emberi review kell
]


class SupportChatbotBrief(BaseModel):
    """A teljes user-input brief (6 kártya nested).

    A `brief_id` és timestamps belső audit/draft-folytatáshoz, a `draft_status`
    a backend állapotgép. A 6 `cardN` mező a tartalom.

    A brief NEM tartalmazza a Phase 0 OUTPUT-ját (`research_text`,
    `domain_name`, `vendor_policy`) — azt a `BriefExpansionResult` adja át a
    pipeline-nak. A két modell teljesen szétválasztott: a brief a user-by-user
    újraírható (új draft), a pipeline output immutable.
    """

    model_config = ConfigDict(extra="forbid")

    brief_id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="UUID, frontend ↔ backend közös referencia.",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    draft_status: BriefDraftStatus = Field(default="draft")

    card1: Card1CompanyBasics
    card2: Card2Operations
    card3: Card3Backend
    card4: Card4Output = Field(default_factory=Card4Output)
    card5: Card5Boundaries
    card6: Card6Sources = Field(default_factory=Card6Sources)


# --------------------------------------------------------------------------- #
# Phase 0 OUTPUT — bridge a meglévő pipeline-hoz                              #
# --------------------------------------------------------------------------- #


VendorPolicyKindNarrow = Literal["specific"]
"""Support-chatbot konvenció: a vendor_policy MINDIG 'specific' (a saját cégük).

A pipeline `VendorPolicyKind` szélesebb (`generic_blended` / `specific` /
`mock`), de a brief-driven flow csak a `specific` ágat használja. A Phase 0
emiatt fix `'specific'`-et ad át a pipeline-nak.
"""


class BriefExpansionResult(BaseModel):
    """Phase 0 OUTPUT — közvetlen Phase 1 input.

    A `research_text` markdown a `brief_expander.py`-ben standardizált
    template szerint épül (Domain context / Case families / Cross-cutting
    policies / Always-collect facts / Out-of-scope / Attached source excerpts).
    A `domain_name`-t a Phase 0 a `vendor_name`-ből + `bot_purpose`-ból
    származtatja (slug-ifikált).

    A `metadata` blob a Phase 0 audit-trace-éhez tartalmaz pl. token-usage-t,
    a használt prompt verziójának hash-ét stb. — a pipeline NEM olvassa,
    csak az ops/debug tooling.
    """

    model_config = ConfigDict(extra="forbid")

    research_text: str = Field(
        ...,
        description=(
            "A teljes strukturált markdown, ami Phase 1 `research_text` "
            "paramétereként megy be."
        ),
        min_length=200,
    )
    domain_name: str = Field(
        ...,
        description="Pl. 'Apacuka complaint intake' — Phase 1 `domain_name`.",
        min_length=2,
        max_length=120,
    )
    locale: Locale = Field(..., description="A briefből áthúzott locale.")
    vendor_policy: VendorPolicyKindNarrow = Field(
        default="specific",
        description="Support-chatbotnál mindig 'specific'.",
    )
    vendor_name: str = Field(
        ...,
        description="A briefből áthúzott vendor_name.",
        min_length=1,
        max_length=120,
    )

    source_brief_id: str = Field(
        ...,
        description="A `SupportChatbotBrief.brief_id` audit referenciaként.",
    )
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Audit/debug info (token usage, prompt version stb.).",
    )


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #


def default_off_topic_redirect_for(locale: Locale) -> str:
    """Locale-szerinti off-topic redirect szöveg default-ja."""
    return (
        DEFAULT_OFF_TOPIC_REDIRECT_HU
        if locale == "hu"
        else DEFAULT_OFF_TOPIC_REDIRECT_EN
    )


__all__ = [
    # Literals & constants
    "Locale",
    "BusinessModel",
    "TargetMarket",
    "ReturnWindowOrigin",
    "ReturnConditionRequirement",
    "ShippingPayer",
    "RemedyKind",
    "InstantReplacementPolicy",
    "RefundTimeline",
    "CarrierKind",
    "DamageReportUnit",
    "HelpdeskProvider",
    "HelpdeskConnectionState",
    "NormalSlaWindow",
    "UrgentSlaWindow",
    "UrgencyTriggerKind",
    "EndNodeKind",
    "SourceDocumentKind",
    "SourceDocumentPriority",
    "SupportAvailabilitySlot",
    "AttachmentKind",
    "AiPrefilledTextStatus",
    "BriefDraftStatus",
    "VendorPolicyKindNarrow",
    "DEFAULT_OFF_TOPIC_REDIRECT_HU",
    "DEFAULT_OFF_TOPIC_REDIRECT_EN",
    "SOURCE_DOC_PRIORITIES",
    "SOURCE_DOC_LABELS_HU",
    "END_NODE_LABELS_HU",
    "END_NODE_SOURCE_CARDS",
    # Shared building blocks
    "Attachment",
    "AiPrefilledText",
    "SourceDocumentSlot",
    # Card models
    "Card1CompanyBasics",
    "CategorySpecificReturnWindow",
    "Card2aReturns",
    "Card2bRemedy",
    "Card2cShipping",
    "Card2Operations",
    "ZendeskCredentials",
    "FreshdeskCredentials",
    "HubSpotCredentials",
    "WebhookCredentials",
    "HelpdeskCredentials",
    "Card3aHelpdesk",
    "Card3bSla",
    "Card3cUrgency",
    "Card3Backend",
    "Card4Output",
    "Card5aOffTopic",
    "Card5bSupportAvailability",
    "Card5Boundaries",
    "Card6Sources",
    # Top-level
    "SupportChatbotBrief",
    "BriefExpansionResult",
    # Helpers
    "default_off_topic_redirect_for",
]

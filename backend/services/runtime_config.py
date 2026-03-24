from __future__ import annotations

import os
import traceback
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

DEFAULT_IMAGE_STYLE = "2D animation, soft natural light, gentle depth"
DEFAULT_NEGATIVE_BLOCK = (
    "no text, no typography, no captions, no subtitles, no user interface, "
    "no UI, no buttons, no menus, no windows, no chat bubbles, no screenshots, "
    "no watermarks, no signatures, no overlays, "
    "no logos, no brand names, no trademarks, no product labels, "
    "no recognizable packaging, no real-world brands, no brand signage, "
    "no storefront logos, no brand mascots, "
    "no copyrighted characters, no movie characters, no game characters, "
    "no superheroes, no comic characters, no cartoon mascots, "
    "no celebrities, no influencers, no public figures, "
    "no realistic likeness of specific people, "
    "no political logos, no political posters, no campaign material, "
    "no extremist symbols, no hate symbols, "
    "no nudity, no sexual content, no fetish, "
    "no violence, no blood, no gore, no self-harm, "
    "no drugs, no pills, no syringes, no cigarettes, no vaping, no alcohol bottles, "
    "no beer cans, no wine labels, "
    "no guns, no rifles, no knives, no weapons, "
    "no license plates, no readable documents, no ID cards, "
    "no website UI, no app UI, no social media UI, "
    "no stock-photo watermarks"
)
DEFAULT_PROMPT_LIMIT = 9000

ENABLE_IMAGE_CACHE = os.getenv("ENABLE_IMAGE_CACHE", "true").lower() == "true"
ENABLE_IMAGE_PRELOAD = os.getenv("ENABLE_IMAGE_PRELOAD", "true").lower() == "true"

BASE_DIR = os.path.abspath(os.path.dirname(__file__) + os.sep + "..")
STORIES_DIR = os.path.abspath(os.getenv("STORIES_DIR", os.path.join(BASE_DIR, "stories")))
DEFAULT_STORY = os.getenv("DEFAULT_STORY", "global.json")
ANALYTICS_DIR = os.path.abspath(
    os.getenv("ANALYTICS_DIR", os.path.join(BASE_DIR, "data", "analytics"))
)

os.makedirs("generated/images", exist_ok=True)
os.makedirs("generated/audio", exist_ok=True)
os.makedirs(STORIES_DIR, exist_ok=True)
os.environ.setdefault("STORIES_DIR", STORIES_DIR)

FEEDBACK_DIR = os.getenv("FEEDBACK_DIR")
if FEEDBACK_DIR:
    os.makedirs(FEEDBACK_DIR, exist_ok=True)

try:
    from generate_image import generate_image_asset

    HAS_IMAGE_BACKEND = True
except Exception:
    generate_image_asset = None
    HAS_IMAGE_BACKEND = False
    traceback.print_exc()

# Generated voice is intentionally disabled in this product slice.
generate_voice_asset = None
HAS_VOICE_BACKEND = False


def get_logo_url() -> str | None:
    logo_path = Path("assets") / "logo.png"
    if logo_path.exists():
        return "/assets/logo.png"
    return None

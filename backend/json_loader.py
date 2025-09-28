import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
story_path = os.path.join(BASE_DIR, "data", "story.json")

with open(story_path, "r", encoding="utf-8") as f:
    full_data = json.load(f)

def get_page_data(page_id: str):
    for chapter in full_data.get("chapters", []):
        for page in chapter.get("pages", []):
            if page.get("id") == page_id:
                return page
    return None

def get_voice_prompt(page_id: str):
    page = get_page_data(page_id)
    return page.get("voicePrompt") if page else None

def get_image_prompt(page_id: str):
    page = get_page_data(page_id)
    prompt = page.get("imagePrompt")
    return prompt.get("combinedPrompt") if prompt else None

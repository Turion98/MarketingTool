
import json
import os

def get_config():
    if os.path.exists("userConfig.json"):
        with open("userConfig.json", "r") as f:
            return json.load(f)
    return {}

"""Turn every line in phrases.json into an audio clip, using Microsoft Edge's free online voices.

Run from the project folder (needs internet; uv installs edge-tts on the fly):

    uv run --with edge-tts python workspace/tools/make_voices.py

Clips go to workspace/app/audio/<id>.mp3, and each phrase gets an "audio" field pointing at its clip.
Run it again after editing or adding lines; every clip is regenerated so none go stale.
To try a different voice for one line, add e.g. "voice": "en-GB-ThomasNeural" to that phrase.
List all voices with:  uvx --from edge-tts edge-tts --list-voices
"""
import asyncio
import json
from pathlib import Path

import edge_tts

APP = Path(__file__).resolve().parent.parent / "app"
PHRASES = APP / "phrases.json"
AUDIO_DIR = APP / "audio"

# One butler, so one male voice per accent.
VOICE_FOR_ACCENT = {
    "en-GB": "en-GB-RyanNeural",
    "en-IN": "en-IN-PrabhatNeural",
    "en-NG": "en-NG-AbeoNeural",
    "en-US": "en-US-AndrewNeural",
    "en-AU": "en-AU-WilliamMultilingualNeural",
}
DEFAULT_VOICE = VOICE_FOR_ACCENT["en-GB"]


async def main():
    phrases = json.loads(PHRASES.read_text())
    AUDIO_DIR.mkdir(exist_ok=True)
    for phrase in phrases:
        voice = phrase.get("voice") or VOICE_FOR_ACCENT.get(phrase.get("accent"), DEFAULT_VOICE)
        clip = AUDIO_DIR / f"{phrase['id']}.mp3"
        await edge_tts.Communicate(phrase["text"], voice).save(str(clip))
        phrase["audio"] = f"audio/{clip.name}"
        print(f"{voice:34} {phrase['id']}")
    write_phrases(phrases)


def write_phrases(phrases):
    """Write one phrase per line, with a blank line between categories, so the file stays easy to edit."""
    lines, previous = [], None
    for phrase in phrases:
        group = (phrase["category"], phrase.get("when"))
        if previous and group != previous:
            lines.append("")
        lines.append("  " + json.dumps(phrase, ensure_ascii=False) + ",")
        previous = group
    lines[-1] = lines[-1].rstrip(",")
    PHRASES.write_text("[\n" + "\n".join(lines) + "\n]\n")


asyncio.run(main())

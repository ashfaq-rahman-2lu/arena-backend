"""Read scores and all thirteen statistic rows in the supplied eFootball full-time template.

Accepts an already validated, normalized image on stdin; emits JSON on stdout.
Model assets are downloaded once by --warmup, then reused locally.
"""
import contextlib
import io
import json
import math
import os
from pathlib import Path
import re
import sys

# Normalized against the user's 2048 x 945 reference. Scaled copies are supported.
SCORE_BOXES = ((915 / 2048, 143 / 945, 985 / 2048, 212 / 945),
               (1063 / 2048, 143 / 945, 1133 / 2048, 212 / 945))

STAT_ROWS = (
    ("possession", "Possession"), ("shots", "Shots"),
    ("shotsOnTarget", "Shots on Target"), ("fouls", "Fouls"),
    ("offsides", "Offsides"), ("cornerKicks", "Corner Kicks"),
    ("freeKicks", "Free Kicks"), ("passes", "Passes"),
    ("successfulPasses", "Successful Passes"), ("crosses", "Crosses"),
    ("interceptions", "Interceptions"), ("tackles", "Tackles"), ("saves", "Saves"),
)


def parse_stat(text: str, confidence: float, percentage: bool) -> int | None:
    if not math.isfinite(confidence) or confidence < 0.85:
        return None
    text = text.strip()
    pattern = r"[0-9]{1,3}%?" if percentage else r"[0-9]{1,4}"
    if not re.fullmatch(pattern, text):
        return None
    value = int(text.rstrip("%"))
    return value if value <= (100 if percentage else 9999) else None


def parse_score(text: str, confidence: float) -> int | None:
    if not math.isfinite(confidence) or confidence < 0.85:
        return None
    text = text.strip()
    return int(text) if re.fullmatch(r"[0-9]{1,2}", text) else None


def score_crops(image_bytes: bytes) -> list:
    import numpy as np
    from PIL import Image, ImageOps, ImageChops

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    width, height = image.size
    if width < 640 or not 2.05 <= width / height <= 2.28:
        raise ValueError("Unsupported screenshot dimensions")
    crops = []
    for box in SCORE_BOXES:
        tile = image.crop(tuple(round(v * (width if i % 2 == 0 else height))
                                for i, v in enumerate(box)))
        pixels = np.asarray(tile)
        yellow = (pixels[:, :, 0] > 150) & (pixels[:, :, 1] > 150) & (pixels[:, :, 2] < 120)
        if float(yellow.mean()) < 0.55:
            raise ValueError("Score tiles do not match template")
        # The navy digits become black against white; padding helps single digits.
        binary = tile.convert("L").point(lambda value: 255 if value > 125 else 0)
        padded = ImageOps.expand(binary, border=max(4, tile.width // 8), fill=255)
        crops.append(np.asarray(padded.convert("RGB")))
    # Yellow stat digits on navy become black on white. Crop each numeric cell
    # separately so labels, separator lines, and neighboring rows cannot merge.
    for row in range(len(STAT_ROWS)):
        for left, right in ((730, 824), (1224, 1318)):
            top = 263 + row * 42
            tile = image.crop((round(left * width / 2048), round(top * height / 945),
                               round(right * width / 2048), round((top + 33) * height / 945)))
            binary = tile.convert("L").point(lambda value: 0 if value > 125 else 255)
            bounds = ImageChops.invert(binary).getbbox()
            if bounds is not None:
                binary = binary.crop(bounds)
            padded = ImageOps.expand(binary, border=max(2, round(4 * width / 2048)), fill=255)
            crops.append(np.asarray(padded.convert("RGB")))
    return crops


def create_model():
    cache = Path(__file__).resolve().parents[1] / ".cache"
    os.environ.setdefault("PADDLE_PDX_CACHE_HOME", str(cache / "paddleocr"))
    os.environ.setdefault("HF_HOME", str(cache / "huggingface"))
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

    from paddleocr import TextRecognition
    return TextRecognition(model_name="en_PP-OCRv4_mobile_rec", device="cpu", cpu_threads=2)



def read_scores(image_bytes: bytes) -> dict:
    try:
        crops = score_crops(image_bytes)
    except ValueError:
        return {"homeScore": None, "awayScore": None,
                "stats": [], "warnings": ["Use the full eFootball screenshot with the yellow score boxes, matching the supported template."]}
    model = create_model()
    predictions = list(model.predict(input=crops, batch_size=8))
    if len(predictions) != 2 + len(STAT_ROWS) * 2:
        raise ValueError("Incomplete OCR predictions")
    scores = [parse_score(str(item["rec_text"]), float(item["rec_score"])) for item in predictions[:2]]
    warnings = [f"Unreadable {side} score. Enter it manually."
                for side, score in zip(("home", "away"), scores) if score is None]
    stats = []
    for row, (key, label) in enumerate(STAT_ROWS):
        values = [parse_stat(str(item["rec_text"]), float(item["rec_score"]), row == 0)
                  for item in predictions[2 + row * 2:4 + row * 2]]
        stats.append({"key": key, "label": label, "home": values[0], "away": values[1],
                      "unit": "percent" if row == 0 else "count"})
        warnings.extend(f"Unreadable {side} {label}. Review the screenshot."
                        for side, value in zip(("home", "away"), values) if value is None)
    return {"homeScore": scores[0], "awayScore": scores[1], "stats": stats, "warnings": warnings}


def main() -> None:
    # Paddle's diagnostic output must never corrupt the JSON protocol.
    with contextlib.redirect_stdout(sys.stderr):
        if sys.argv[1:] == ["--warmup"]:
            create_model()
            return
        result = read_scores(sys.stdin.buffer.read(10 * 1024 * 1024 + 1))
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()

"""Read scores and optionally all thirteen stat rows in the eFootball full-time template.

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
import struct
import time
from typing import BinaryIO, TextIO, Protocol, Iterable, TYPE_CHECKING

if TYPE_CHECKING:
    from PIL import Image


class RecognitionModel(Protocol):
    def predict(self, input: list, batch_size: int) -> Iterable[dict]: ...

PixelBox = tuple[int, int, int, int]

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


def true_runs(values: Iterable[bool]) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, value in enumerate(values):
        if value and start is None:
            start = index
        elif not value and start is not None:
            runs.append((start, index))
            start = None
    if start is not None:
        runs.append((start, index + 1))
    return runs


def find_score_boxes(image: "Image.Image") -> tuple[PixelBox, PixelBox]:
    import numpy as np
    from PIL import Image

    # Bound detection work independently of upload resolution. Only the scoreboard
    # region is searched; the thirteen statistic rows keep their existing crops.
    scale = min(1.0, 1024 / image.width)
    reduced = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.NEAREST)
    width, height = reduced.size
    left, right = round(width * 0.30), round(width * 0.70)
    top, bottom = round(height * 0.05), round(height * 0.28)
    pixels = np.asarray(reduced)[top:bottom, left:right]
    yellow = (pixels[:, :, 0] > 150) & (pixels[:, :, 1] > 150) & (pixels[:, :, 2] < 120)
    # Use signed channels so subtraction cannot wrap uint8 values.
    channels = pixels.astype(np.int16)
    navy = ((channels[:, :, 0] < 110) & (channels[:, :, 1] < 110)
            & (channels[:, :, 2] < 180) & (channels[:, :, 2] > channels[:, :, 0] + 15)
            & (channels[:, :, 2] > channels[:, :, 1] + 15))
    spans: set[tuple[int, int]] = set()
    candidates: set[PixelBox] = set()
    for row in yellow:
        for x1, x2 in true_runs(row):
            span_width = x2 - x1
            if not width * 0.02 <= span_width <= width * 0.065 or (x1, x2) in spans:
                continue
            spans.add((x1, x2))
            if len(spans) > 256:
                raise ValueError("Ambiguous scoreboard")
            strip = max(1, round(span_width * 0.08))
            if x1 < strip or x2 + strip > yellow.shape[1]:
                continue
            # The tile's sides remain yellow through digit rows. Navy immediately
            # outside them distinguishes the boxes from the full-width yellow bar.
            rows = ((yellow[:, x1:x1 + strip].mean(axis=1) >= 0.7)
                    & (yellow[:, x2 - strip:x2].mean(axis=1) >= 0.7)
                    & (yellow[:, x1 - strip:x1].mean(axis=1) < 0.4)
                    & (yellow[:, x2:x2 + strip].mean(axis=1) < 0.4))
            for y1, y2 in true_runs(rows):
                span_height = y2 - y1
                if (height * 0.045 <= span_height <= height * 0.12
                        and 0.65 <= span_width / span_height <= 1.6
                        and float(yellow[y1:y2, x1:x2].mean()) >= 0.55):
                    candidates.add((x1, y1, x2, y2))
    # JPEG edges may yield several almost identical rectangles. Retain the largest
    # representative before requiring exactly one unambiguous aligned pair.
    boxes: list[PixelBox] = []
    for box in sorted(candidates, key=lambda item: (item[2] - item[0]) * (item[3] - item[1]), reverse=True):
        area = (box[2] - box[0]) * (box[3] - box[1])
        if not any(max(0, min(box[2], other[2]) - max(box[0], other[0]))
                   * max(0, min(box[3], other[3]) - max(box[1], other[1])) >= area * 0.8 for other in boxes):
            boxes.append(box)
    pairs: list[tuple[PixelBox, PixelBox]] = []
    for home in boxes:
        for away in boxes:
            w1, h1 = home[2] - home[0], home[3] - home[1]
            w2, h2 = away[2] - away[0], away[3] - away[1]
            gap = away[0] - home[2]
            if (0.8 <= w1 / w2 <= 1.25 and 0.8 <= h1 / h2 <= 1.25
                    and abs(home[1] - away[1]) <= max(2, h1 * 0.12)
                    and 0.5 * w1 <= gap <= 1.8 * w1
                    and abs(left + (home[0] + away[2]) / 2 - width / 2) <= width * 0.12):
                emblem = yellow[max(home[1], away[1]):min(home[3], away[3]), home[2]:away[0]]
                gap_navy = navy[max(home[1], away[1]):min(home[3], away[3]), home[2]:away[0]]
                if emblem.size and 0.04 <= float(emblem.mean()) <= 0.6 and float(gap_navy.mean()) >= 0.45:
                    pairs.append((home, away))
    if len(pairs) != 1:
        raise ValueError("Score boxes could not be located confidently")
    sx, sy = image.width / width, image.height / height
    mapped: list[PixelBox] = [(round((box[0] + left) * sx), round((box[1] + top) * sy),
                              round((box[2] + left) * sx), round((box[3] + top) * sy)) for box in pairs[0]]
    return mapped[0], mapped[1]


def score_crops(image_bytes: bytes, include_stats: bool = True) -> list:
    import numpy as np
    from PIL import Image, ImageOps, ImageChops

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    width, height = image.size
    if width < 640 or not 2.05 <= width / height <= 2.28:
        raise ValueError("Unsupported screenshot dimensions")
    crops = []
    for box in find_score_boxes(image):
        tile = image.crop(box)
        # The navy digits become black against white; padding helps single digits.
        binary = tile.convert("L").point(lambda value: 255 if value > 125 else 0)
        # A scaled screenshot can include the tile's navy separator at either edge.
        # Remove only nearly full-height/width edge lines; keep interior digit ink.
        ink = np.asarray(binary).copy()
        edge_width = max(1, round(tile.width * 0.1))
        for column in (*range(edge_width), *range(tile.width - edge_width, tile.width)):
            if float((ink[:, column] == 0).mean()) >= 0.8:
                ink[:, column] = 255
        edge_height = max(1, round(tile.height * 0.1))
        for row in (*range(edge_height), *range(tile.height - edge_height, tile.height)):
            if float((ink[row, :] == 0).mean()) >= 0.8:
                ink[row, :] = 255
        binary = Image.fromarray(ink)
        padded = ImageOps.expand(binary, border=max(4, tile.width // 8), fill=255)
        crops.append(np.asarray(padded.convert("RGB")))
    if not include_stats:
        return crops
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



def read_scores(image_bytes: bytes, model: RecognitionModel | None = None, timings: dict[str, float] | None = None, mode: str = "full") -> dict:
    if mode not in ("scores", "full"):
        raise ValueError("Unsupported extraction mode")
    preparation_started = time.perf_counter()
    if timings is not None:
        timings.update(prepareMs=0.0, inferenceMs=0.0)
    try:
        crops = score_crops(image_bytes, include_stats=mode == "full")
    except ValueError:
        return {"homeScore": None, "awayScore": None,
                "stats": [], "warnings": ["Use the full eFootball screenshot with the yellow score boxes, matching the supported template."]}
    finally:
        if timings is not None:
            timings["prepareMs"] = (time.perf_counter() - preparation_started) * 1000
    if model is None:
        model = create_model()
    inference_started = time.perf_counter()
    predictions = list(model.predict(input=crops, batch_size=8))
    if timings is not None:
        timings["inferenceMs"] = (time.perf_counter() - inference_started) * 1000
    if len(predictions) != (2 if mode == "scores" else 2 + len(STAT_ROWS) * 2):
        raise ValueError("Incomplete OCR predictions")
    scores = [parse_score(str(item["rec_text"]), float(item["rec_score"])) for item in predictions[:2]]
    warnings = [f"Unreadable {side} score. Enter it manually."
                for side, score in zip(("home", "away"), scores) if score is None]
    stats = []
    for row, (key, label) in enumerate(STAT_ROWS if mode == "full" else ()):
        values = [parse_stat(str(item["rec_text"]), float(item["rec_score"]), row == 0)
                  for item in predictions[2 + row * 2:4 + row * 2]]
        stats.append({"key": key, "label": label, "home": values[0], "away": values[1],
                      "unit": "percent" if row == 0 else "count"})
        warnings.extend(f"Unreadable {side} {label}. Review the screenshot."
                        for side, value in zip(("home", "away"), values) if value is None)
    return {"homeScore": scores[0], "awayScore": scores[1], "stats": stats, "warnings": warnings}


MAX_IMAGE_BYTES = 10 * 1024 * 1024


def read_exact(source: BinaryIO, count: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < count:
        chunk = source.read(count - len(chunks))
        if not chunk:
            break
        chunks.extend(chunk)
    return bytes(chunks)


def emit(output: TextIO, message: dict) -> None:
    output.write(json.dumps(message, allow_nan=False) + "\n")
    output.flush()


def serve_worker(source: BinaryIO, output: TextIO) -> None:
    started = time.perf_counter()
    with contextlib.redirect_stdout(sys.stderr):
        model = create_model()
    emit(output, {"type": "ready", "modelLoadMs": (time.perf_counter() - started) * 1000})
    while True:
        header = read_exact(source, 4)
        if not header:
            return
        try:
            if len(header) != 4:
                raise ValueError("Incomplete frame")
            # High bit selects two-cell extraction; the other bits bound image size.
            frame = struct.unpack(">I", header)[0]
            mode = "scores" if frame & 0x80000000 else "full"
            size = frame & 0x7fffffff
            if size > MAX_IMAGE_BYTES:
                raise ValueError("Frame too large")
            image_bytes = read_exact(source, size)
            if len(image_bytes) != size:
                raise ValueError("Incomplete image")
            timings: dict[str, float] = {}
            with contextlib.redirect_stdout(sys.stderr):
                result = read_scores(image_bytes, model, timings, mode)
            emit(output, {"type": "result", "result": result, "timings": timings})
        except Exception:
            # No image, prediction, or arbitrary exception text crosses the diagnostic boundary.
            emit(output, {"type": "error"})
            return


def main() -> None:
    if sys.argv[1:] == ["--worker"]:
        serve_worker(sys.stdin.buffer, sys.stdout)
        return
    # Paddle's diagnostic output must never corrupt the JSON protocol.
    with contextlib.redirect_stdout(sys.stderr):
        if sys.argv[1:] == ["--warmup"]:
            create_model()
            return
        result = read_scores(sys.stdin.buffer.read(10 * 1024 * 1024 + 1))
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()

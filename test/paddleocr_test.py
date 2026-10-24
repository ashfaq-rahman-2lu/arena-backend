"""Template regressions; no model download needed for these tests."""
import importlib.util
import contextlib
import io
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
import os
import struct
import json

SPEC = importlib.util.spec_from_file_location(
    "score_reader", Path(__file__).resolve().parents[1] / "ocr" / "score_reader.py"
)

EXPECTED_STATS = [
    {"key": key, "label": label, "home": home, "away": away,
     "unit": "percent" if key == "possession" else "count"}
    for key, label, home, away in [
        ("possession", "Possession", 55, 45), ("shots", "Shots", 5, 11),
        ("shotsOnTarget", "Shots on Target", 5, 9), ("fouls", "Fouls", 1, 1),
        ("offsides", "Offsides", 1, 0), ("cornerKicks", "Corner Kicks", 1, 2),
        ("freeKicks", "Free Kicks", 1, 1), ("passes", "Passes", 115, 79),
        ("successfulPasses", "Successful Passes", 79, 57), ("crosses", "Crosses", 4, 3),
        ("interceptions", "Interceptions", 19, 27), ("tackles", "Tackles", 5, 8),
        ("saves", "Saves", 4, 2),
    ]
]
BORDERED_STAT_VALUES = [(49, 51), (9, 9), (8, 7), (2, 0), (0, 0), (1, 1), (0, 0),
                        (125, 113), (110, 99), (0, 0), (12, 10), (6, 8), (2, 3)]


def shift_scoreboard(payload: bytes, dx: int, dy: int) -> bytes:
    from PIL import Image
    image = Image.open(io.BytesIO(payload)).convert("RGB")
    left, top, right, bottom = (round(850 * image.width / 2048), round(135 * image.height / 945),
                                round(1190 * image.width / 2048), round(214 * image.height / 945))
    header = image.crop((left, top, right, bottom))
    image.paste((0, 0, 80), (min(left, left + dx), min(top, top + dy),
                           max(right, right + dx), max(bottom, bottom + dy)))
    image.paste(header, (left + dx, top + dy))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()

def score_scene(boxes: list[tuple[int, int, int, int]], emblem: bool = True) -> bytes:
    from PIL import Image, ImageDraw
    image = Image.new("RGB", (2048, 945), (0, 0, 80))
    draw = ImageDraw.Draw(image)
    for left, top, right, bottom in boxes:
        draw.rectangle((left, top, right - 1, bottom - 1), fill="yellow")
        draw.rectangle((left + 20, top + 20, left + 24, top + 49), fill="black")
        draw.rectangle((left + 40, top + 20, left + 44, top + 49), fill="black")
        draw.line((left, top, left, bottom - 1), fill="black", width=1)
        draw.line((right - 1, top, right - 1, bottom - 1), fill="black", width=1)
    for home, away in zip(boxes[::2], boxes[1::2]) if emblem else []:
        center = (home[2] + away[0]) // 2
        top = home[1]
        draw.ellipse((center - 20, top + 12, center + 20, top + 55), outline="yellow", width=5)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()

class ScoreReaderTest(unittest.TestCase):
    def test_score_only_recognizes_two_cells_without_stat_warnings(self) -> None:
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        model = Mock()
        model.predict.return_value = [{"rec_text": "4", "rec_score": 0.99}, {"rec_text": "5", "rec_score": 0.99}]
        payload = (Path(__file__).parent / "fixtures" / "scorer_image_bordered.jpg").read_bytes()
        result = module.read_scores(payload, model, mode="scores")
        self.assertEqual(len(model.predict.call_args.kwargs["input"]), 2)
        self.assertEqual(result, {"homeScore": 4, "awayScore": 5, "stats": [], "warnings": []})

    def test_worker_keeps_mode_per_frame(self) -> None:
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        model = Mock()
        model.predict.side_effect = [
            [{"rec_text": "4", "rec_score": 0.99}, {"rec_text": "5", "rec_score": 0.99}],
            [{"rec_text": "0", "rec_score": 0.99} for _ in range(28)],
        ]
        payload = (Path(__file__).parent / "fixtures" / "scorer_image_bordered.jpg").read_bytes()
        frames = struct.pack(">I", len(payload) + 0x80000000) + payload + struct.pack(">I", len(payload)) + payload
        output = io.StringIO()
        with patch.object(module, "create_model", return_value=model):
            module.serve_worker(io.BytesIO(frames), output)
        messages = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual([message["type"] for message in messages], ["ready", "result", "result"])
        self.assertEqual(messages[1]["result"]["stats"], [])
        self.assertEqual(len(messages[2]["result"]["stats"]), 13)
        self.assertEqual([len(call.kwargs["input"]) for call in model.predict.call_args_list], [2, 28])

    def test_score_crops_remove_tile_separators_without_erasing_digits(self) -> None:
        import numpy as np
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        crops = module.score_crops(score_scene([(915, 143, 985, 212), (1063, 143, 1133, 212)]))
        self.assertEqual(len(crops), 28)
        for crop in crops[:2]:
            self.assertEqual(int(np.count_nonzero(crop[:, :, 0] == 0)), 2 * 5 * 30)

    def test_score_boxes_follow_position_and_size_without_changing_stat_crops(self) -> None:
        import numpy as np
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        for dx, dy, width, height in ((-95, -35, 70, 69), (85, 25, 70, 69), (0, 0, 84, 78)):
            with self.subTest(dx=dx, dy=dy, width=width, height=height):
                boxes = [(915 + dx, 143 + dy, 915 + dx + width, 143 + dy + height),
                         (1063 + dx, 143 + dy, 1063 + dx + width, 143 + dy + height)]
                crops = module.score_crops(score_scene(boxes))
                for crop in crops[:2]:
                    self.assertEqual(int(np.count_nonzero(crop[:, :, 0] == 0)), 300)
        # Move just the scoreboard; the stat panel deliberately stays in place.
        original = (Path(__file__).parent / "fixtures" / "scorer_image.jpg").read_bytes()
        first = module.score_crops(original)
        second = module.score_crops(shift_scoreboard(original, 80, -30))
        for expected, actual in zip(first[2:], second[2:]):
            np.testing.assert_array_equal(expected, actual)

    def test_missing_or_ambiguous_score_layout_requires_manual_entry(self) -> None:
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        cases = [[], [(915, 143, 985, 212)],
                 [(915, 143, 985, 212), (1063, 165, 1133, 234)],
                 [(915, 60, 985, 129), (1063, 60, 1133, 129),
                  (915, 143, 985, 212), (1063, 143, 1133, 212)]]
        for boxes in cases:
            with self.subTest(boxes=boxes), patch.object(module, "create_model") as factory:
                factory.return_value.predict.return_value = [{"rec_text": "0", "rec_score": 0.99} for _ in range(28)]
                result = module.read_scores(score_scene(boxes))
                self.assertIsNone(result["homeScore"])
                self.assertIsNone(result["awayScore"])
                self.assertTrue(result["warnings"])
                factory.assert_not_called()

    def test_score_box_pair_needs_emblem_and_ignores_unrelated_yellow_regions(self) -> None:
        from PIL import Image, ImageDraw
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        boxes = [(915, 143, 985, 212), (1063, 143, 1133, 212)]
        with self.assertRaises(ValueError):
            module.score_crops(score_scene(boxes, emblem=False))
        wrong_gap = Image.open(io.BytesIO(score_scene(boxes)))
        gap_draw = ImageDraw.Draw(wrong_gap)
        gap_draw.rectangle((985, 143, 1062, 211), fill=(0, 150, 0))
        gap_draw.ellipse((1004, 155, 1044, 198), outline="yellow", width=5)
        with self.assertRaises(ValueError):
            module.find_score_boxes(wrong_gap)
        image = Image.open(io.BytesIO(score_scene(boxes)))
        draw = ImageDraw.Draw(image)
        draw.rectangle((740, 143, 809, 211), fill="yellow")
        draw.rectangle((0, 230, 2047, 260), fill="yellow")
        result = module.find_score_boxes(image)
        for expected, actual in zip(boxes, result):
            self.assertTrue(all(abs(a - b) <= 3 for a, b in zip(expected, actual)))

    @unittest.skipUnless(os.environ.get("PADDLEOCR_INTEGRATION") == "1", "Set PADDLEOCR_INTEGRATION=1 to run the real OCR model")
    def test_bordered_scorecard_reads_scores_and_all_stats(self) -> None:
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        payload = (Path(__file__).parent / "fixtures" / "scorer_image_bordered.jpg").read_bytes()
        result = module.read_scores(payload)
        self.assertEqual((result["homeScore"], result["awayScore"]), (4, 5))
        self.assertEqual(result["warnings"], [])
        self.assertEqual(
            [(stat["home"], stat["away"]) for stat in result["stats"]],
            BORDERED_STAT_VALUES,
        )

    @unittest.skipUnless(os.environ.get("PADDLEOCR_INTEGRATION") == "1", "Set PADDLEOCR_INTEGRATION=1 to run the real OCR model")
    def test_shifted_scoreboards_with_real_model(self) -> None:
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        model = module.create_model()
        for name, scores, values, dx, dy in [
            ("scorer_image.jpg", (1, 2), [(stat["home"], stat["away"]) for stat in EXPECTED_STATS], 80, -30),
            ("scorer_image_bordered.jpg", (4, 5), BORDERED_STAT_VALUES, -50, 15),
        ]:
            with self.subTest(image=name):
                payload = (Path(__file__).parent / "fixtures" / name).read_bytes()
                result = module.read_scores(shift_scoreboard(payload, dx, dy), model)
                self.assertEqual((result["homeScore"], result["awayScore"]), scores)
                self.assertEqual([(stat["home"], stat["away"]) for stat in result["stats"]], values)
                self.assertEqual(result["warnings"], [])

    def test_read_scores_does_not_log_predictions(self) -> None:
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        model = Mock()
        model.predict.return_value = [
            {"rec_text": "1", "rec_score": 0.99},
            {"rec_text": "2", "rec_score": 0.99},
        ]
        for stat in EXPECTED_STATS:
            for side in ("home", "away"):
                model.predict.return_value.append({"rec_text": str(stat[side]) + ("%" if stat["unit"] == "percent" else ""), "rec_score": 0.99})
        stderr = io.StringIO()
        with patch.object(module, "score_crops", return_value=[Mock() for _ in range(28)]), \
             patch.object(module, "create_model", return_value=model), \
             contextlib.redirect_stderr(stderr):
            result = module.read_scores(b"test image")
        self.assertEqual(result, {"homeScore": 1, "awayScore": 2, "stats": EXPECTED_STATS, "warnings": []})
        self.assertEqual(stderr.getvalue(), "")

    def test_strict_digits_and_confidence(self) -> None:
        # Import happens inside tests so missing implementation is an observable failure.
        self.assertTrue(SPEC.origin and Path(SPEC.origin).exists(), "PaddleOCR score reader is missing")
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        self.assertEqual(module.parse_score("1", 0.99), 1)
        self.assertEqual(module.parse_score("2", 0.99), 2)
        self.assertEqual(module.parse_score("0", 0.99), 0)
        self.assertEqual(module.parse_score("12", 0.99), 12)
        for text, confidence in [("I", 0.99), ("1-2", 0.99), ("|4", 0.99), ("5|", 0.99), ("", 1), ("3", 0.4), ("123", 1)]:
            self.assertIsNone(module.parse_score(text, confidence))

    def test_invalid_stat_values_are_null_with_warnings(self) -> None:
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        predictions = [{"rec_text": "0", "rec_score": 0.99} for _ in range(28)]
        predictions[2] = {"rec_text": "101%", "rec_score": 0.99}
        predictions[3] = {"rec_text": "45%", "rec_score": 0.2}
        predictions[4] = {"rec_text": "1-2", "rec_score": 0.99}
        predictions[16] = {"rec_text": "115", "rec_score": 0.99}
        model = Mock()
        model.predict.return_value = predictions
        with patch.object(module, "score_crops", return_value=[Mock() for _ in range(28)]), \
             patch.object(module, "create_model", return_value=model):
            result = module.read_scores(b"image")
        self.assertIsNone(result["stats"][0]["home"])
        self.assertIsNone(result["stats"][0]["away"])
        self.assertIsNone(result["stats"][1]["home"])
        self.assertEqual(result["stats"][1]["away"], 0)
        self.assertEqual(result["stats"][7]["home"], 115)
        self.assertEqual(len(result["warnings"]), 3)

    def test_worker_loads_model_once_and_reports_phase_timings(self) -> None:
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        model = Mock()
        model.predict.return_value = [{"rec_text": "0", "rec_score": 0.99} for _ in range(28)]
        payload = b"private-image"
        frame = struct.pack(">I", len(payload)) + payload
        output = io.StringIO()
        with patch.object(module, "create_model", return_value=model) as factory, \
             patch.object(module, "score_crops", return_value=[Mock() for _ in range(28)]):
            module.serve_worker(io.BytesIO(frame + frame), output)
        responses = [json.loads(line) for line in output.getvalue().splitlines()]
        factory.assert_called_once()
        self.assertEqual(model.predict.call_count, 2)
        self.assertEqual(responses[0]["type"], "ready")
        self.assertGreaterEqual(responses[0]["modelLoadMs"], 0)
        for response in responses[1:]:
            self.assertEqual(response["result"]["homeScore"], 0)
            self.assertGreaterEqual(response["timings"]["prepareMs"], 0)
            self.assertGreaterEqual(response["timings"]["inferenceMs"], 0)
        self.assertNotIn("private-image", output.getvalue())

    @unittest.skipUnless(os.environ.get("PADDLEOCR_INTEGRATION") == "1", "Set PADDLEOCR_INTEGRATION=1 to run the real OCR model")
    def test_reference_image_and_scaled_copy(self) -> None:
        import io
        from PIL import Image
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        image_bytes = (Path(__file__).parent / "fixtures" / "scorer_image.jpg").read_bytes()
        for scale in (1, 0.5):
            image = Image.open(io.BytesIO(image_bytes))
            image = image.resize((round(image.width * scale), round(image.height * scale)))
            output = io.BytesIO()
            image.save(output, format="PNG")
            result = module.read_scores(output.getvalue())
            self.assertEqual(result, {"homeScore": 1, "awayScore": 2, "stats": EXPECTED_STATS, "warnings": []})
        blank = io.BytesIO()
        Image.new("RGB", (2048, 945), "white").save(blank, format="PNG")
        result = module.read_scores(blank.getvalue())
        self.assertIsNone(result["homeScore"])
        self.assertIsNone(result["awayScore"])
        self.assertTrue(result["warnings"])

if __name__ == "__main__":
    unittest.main()

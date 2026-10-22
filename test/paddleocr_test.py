"""Template regressions; no model download needed for these tests."""
import importlib.util
import contextlib
import io
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
import os

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

class ScoreReaderTest(unittest.TestCase):
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
        for text, confidence in [("I", 0.99), ("1-2", 0.99), ("", 1), ("3", 0.4), ("123", 1)]:
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

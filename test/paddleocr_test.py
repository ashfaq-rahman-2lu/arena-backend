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

class ScoreReaderTest(unittest.TestCase):
    def test_read_scores_does_not_log_predictions(self) -> None:
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        model = Mock()
        model.predict.return_value = [
            {"rec_text": "1", "rec_score": 0.99},
            {"rec_text": "2", "rec_score": 0.99},
        ]
        stderr = io.StringIO()
        with patch.object(module, "score_crops", return_value=[Mock(), Mock()]), \
             patch.object(module, "create_model", return_value=model), \
             contextlib.redirect_stderr(stderr):
            result = module.read_scores(b"test image")
        self.assertEqual(result, {"homeScore": 1, "awayScore": 2, "warnings": []})
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
            self.assertEqual(result, {"homeScore": 1, "awayScore": 2, "warnings": []})
        blank = io.BytesIO()
        Image.new("RGB", (2048, 945), "white").save(blank, format="PNG")
        result = module.read_scores(blank.getvalue())
        self.assertIsNone(result["homeScore"])
        self.assertIsNone(result["awayScore"])
        self.assertTrue(result["warnings"])

if __name__ == "__main__":
    unittest.main()

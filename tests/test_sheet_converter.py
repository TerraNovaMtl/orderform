import datetime as dt
import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location("converter", Path(__file__).parents[1] / "scripts" / "convert-sheet-export.py")
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


class ConversionTests(unittest.TestCase):
    def test_known_stale_headers_require_exact_layout(self):
        old = converter.OLD_ORDER_HEADERS + [""] * 12
        self.assertEqual(converter.map_headers("Orders", old)[0], converter.ORDER_HEADERS)
        self.assertIsNone(converter.map_headers("Orders", old[:-1])[1])
        self.assertIsNone(converter.map_headers("Products", old)[1])

    def value(self, value, header="barcode", fmt="General", kind="n"):
        errors = []
        cell = SimpleNamespace(value=value, data_type=kind, number_format=fmt, coordinate="A2")
        result = converter.read_value(cell, header, errors, "Products")
        return result, errors

    def test_identifiers_preserve_leading_zeros(self):
        self.assertEqual(self.value("0000123")[0], "0000123")
        self.assertEqual(self.value(123, fmt="0000000")[0], "0000123")

    def test_numeric_prices_and_checkbox_flags_keep_types(self):
        self.assertEqual(self.value(1.3875, "Dealer/Unit ($)")[0], 1.3875)
        self.assertIs(self.value(False, "Cancelled", kind="b")[0], False)

    def test_missing_does_not_become_zero(self):
        self.assertEqual(self.value(None, "cost")[0], "")

    def test_dates_keep_local_wall_time(self):
        self.assertEqual(self.value(dt.datetime(2026, 9, 30, 9, 15), "Date")[0], "2026-09-30T09:15:00")

    def test_errors_and_unsafe_numeric_ids_are_reported(self):
        self.assertTrue(self.value("#REF!", kind="e")[1])
        self.assertTrue(self.value(1234567890123456)[1])


if __name__ == "__main__":
    unittest.main()

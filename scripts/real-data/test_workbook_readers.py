import unittest

from workbook_readers import normalize_sheet_name


class WorkbookReaderTest(unittest.TestCase):
    def test_sheet_names_are_trimmed(self):
        self.assertEqual(normalize_sheet_name("花名册 "), "花名册")
        self.assertEqual(normalize_sheet_name(" 周度数据表"), "周度数据表")


if __name__ == "__main__":
    unittest.main()

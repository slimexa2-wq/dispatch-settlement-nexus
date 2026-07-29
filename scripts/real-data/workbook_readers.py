from __future__ import annotations

import json
import re
import struct
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

FREESECT = 0xFFFFFFFF
ENDOFCHAIN = 0xFFFFFFFE


def normalize_sheet_name(value: Any) -> str:
    return str(value).strip()


def excel_serial_to_date(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:T.*)?", text):
            return text[:10]
        try:
            value = float(text)
        except ValueError:
            return text
    if isinstance(value, (int, float)):
        # Excel 1900 date system including the historic leap-year compatibility offset.
        base = datetime(1899, 12, 30)
        return (base + timedelta(days=float(value))).date().isoformat()
    return str(value)


class CompoundFile:
    def __init__(self, data: bytes):
        self.data = data
        if data[:8] != bytes.fromhex("D0CF11E0A1B11AE1"):
            raise ValueError("not a CDFV2 compound file")
        self.sector_size = 1 << struct.unpack_from("<H", data, 30)[0]
        self.mini_size = 1 << struct.unpack_from("<H", data, 32)[0]
        self.num_fat = struct.unpack_from("<I", data, 44)[0]
        self.first_dir = struct.unpack_from("<I", data, 48)[0]
        self.mini_cutoff = struct.unpack_from("<I", data, 56)[0]
        self.first_minifat = struct.unpack_from("<I", data, 60)[0]
        self.num_minifat = struct.unpack_from("<I", data, 64)[0]
        first_difat = struct.unpack_from("<I", data, 68)[0]
        num_difat = struct.unpack_from("<I", data, 72)[0]
        difat = [x for x in struct.unpack_from("<109I", data, 76) if x not in (FREESECT, ENDOFCHAIN)]
        sector = first_difat
        for _ in range(num_difat):
            payload = self.sector(sector)
            count = self.sector_size // 4 - 1
            difat.extend(x for x in struct.unpack_from(f"<{count}I", payload, 0) if x not in (FREESECT, ENDOFCHAIN))
            sector = struct.unpack_from("<I", payload, self.sector_size - 4)[0]
        self.fat: list[int] = []
        for sector in difat[: self.num_fat]:
            self.fat.extend(struct.unpack(f"<{self.sector_size // 4}I", self.sector(sector)))
        directory = self.read_chain(self.first_dir)
        self.entries: list[dict[str, Any]] = []
        for offset in range(0, len(directory), 128):
            entry = directory[offset : offset + 128]
            if len(entry) < 128:
                break
            name_length = struct.unpack_from("<H", entry, 64)[0]
            name = entry[: max(0, name_length - 2)].decode("utf-16le", "replace") if name_length >= 2 else ""
            self.entries.append(
                {
                    "name": name,
                    "type": entry[66],
                    "start": struct.unpack_from("<I", entry, 116)[0],
                    "size": struct.unpack_from("<Q", entry, 120)[0],
                }
            )
        self.root = next((entry for entry in self.entries if entry["type"] == 5), None)
        self.minifat: list[int] = []
        if self.num_minifat:
            raw = self.read_chain(self.first_minifat)[: self.num_minifat * self.sector_size]
            self.minifat = list(struct.unpack(f"<{len(raw) // 4}I", raw[: len(raw) // 4 * 4]))
        self.ministream = (
            self.read_chain(self.root["start"])[: self.root["size"]]
            if self.root and self.root["size"]
            else b""
        )

    def sector(self, number: int) -> bytes:
        start = 512 + number * self.sector_size
        return self.data[start : start + self.sector_size]

    def read_chain(self, start: int) -> bytes:
        output: list[bytes] = []
        seen: set[int] = set()
        number = start
        while number not in (ENDOFCHAIN, FREESECT) and number < len(self.fat) and number not in seen:
            seen.add(number)
            output.append(self.sector(number))
            number = self.fat[number]
        return b"".join(output)

    def read_minichain(self, start: int) -> bytes:
        output: list[bytes] = []
        seen: set[int] = set()
        number = start
        while number not in (ENDOFCHAIN, FREESECT) and number < len(self.minifat) and number not in seen:
            seen.add(number)
            offset = number * self.mini_size
            output.append(self.ministream[offset : offset + self.mini_size])
            number = self.minifat[number]
        return b"".join(output)

    def stream(self, name: str) -> bytes:
        entry = next(entry for entry in self.entries if entry["name"].lower() == name.lower())
        raw = self.read_minichain(entry["start"]) if entry["size"] < self.mini_cutoff else self.read_chain(entry["start"])
        return raw[: entry["size"]]


class SegmentedReader:
    def __init__(self, segments: list[bytes]):
        self.segments = segments
        self.segment_index = 0
        self.offset = 0

    def _advance(self) -> None:
        while self.segment_index < len(self.segments) and self.offset >= len(self.segments[self.segment_index]):
            self.segment_index += 1
            self.offset = 0
        if self.segment_index >= len(self.segments):
            raise EOFError

    def read(self, count: int) -> bytes:
        output = bytearray()
        while count:
            self._advance()
            segment = self.segments[self.segment_index]
            take = min(count, len(segment) - self.offset)
            output.extend(segment[self.offset : self.offset + take])
            self.offset += take
            count -= take
        return bytes(output)

    def u8(self) -> int:
        return self.read(1)[0]

    def u16(self) -> int:
        return struct.unpack("<H", self.read(2))[0]

    def u32(self) -> int:
        return struct.unpack("<I", self.read(4))[0]

    def skip(self, count: int) -> None:
        self.read(count)

    def chars(self, count: int, unicode_chars: bool) -> str:
        output: list[str] = []
        remaining = count
        is_unicode = unicode_chars
        while remaining:
            self._advance()
            segment = self.segments[self.segment_index]
            unit = 2 if is_unicode else 1
            available = (len(segment) - self.offset) // unit
            take = min(remaining, available)
            if take:
                raw = segment[self.offset : self.offset + take * unit]
                self.offset += take * unit
                output.append(raw.decode("utf-16le" if is_unicode else "latin1", "replace"))
                remaining -= take
            if remaining:
                self.segment_index += 1
                self.offset = 0
                self._advance()
                option = self.u8()
                is_unicode = bool(option & 1)
        return "".join(output)


def _biff_records(data: bytes, start: int = 0):
    offset = start
    while offset + 4 <= len(data):
        record_id, length = struct.unpack_from("<HH", data, offset)
        payload = data[offset + 4 : offset + 4 + length]
        yield offset, record_id, payload
        offset += 4 + length
        if record_id == 0x000A:
            break


def _parse_short_unicode(payload: bytes, offset: int = 0) -> str:
    length = payload[offset]
    option = payload[offset + 1]
    raw = payload[offset + 2 : offset + 2 + length * (2 if option & 1 else 1)]
    return raw.decode("utf-16le" if option & 1 else "latin1", "replace")


def _parse_sst(data: bytes) -> list[str]:
    records = list(_biff_records(data))
    for index, (_, record_id, payload) in enumerate(records):
        if record_id != 0x00FC:
            continue
        segments = [payload]
        cursor = index + 1
        while cursor < len(records) and records[cursor][1] == 0x003C:
            segments.append(records[cursor][2])
            cursor += 1
        reader = SegmentedReader(segments)
        reader.u32()
        unique = reader.u32()
        strings: list[str] = []
        for _ in range(unique):
            char_count = reader.u16()
            flags = reader.u8()
            rich = bool(flags & 8)
            extended = bool(flags & 4)
            runs = reader.u16() if rich else 0
            extension_length = reader.u32() if extended else 0
            strings.append(reader.chars(char_count, bool(flags & 1)))
            if runs:
                reader.skip(runs * 4)
            if extension_length:
                reader.skip(extension_length)
        return strings
    raise ValueError("BIFF workbook has no SST record")


def _rk_value(value: int) -> float | int:
    if value & 2:
        result: float | int = struct.unpack("<i", struct.pack("<I", value))[0] >> 2
    else:
        result = struct.unpack("<d", struct.pack("<II", 0, value & 0xFFFFFFFC))[0]
    if value & 1:
        result = result / 100
    return result


def read_xls(path: str | Path) -> dict[str, list[list[Any]]]:
    compound = CompoundFile(Path(path).read_bytes())
    workbook = None
    for stream_name in ("Workbook", "Book"):
        try:
            workbook = compound.stream(stream_name)
            break
        except (KeyError, StopIteration):
            continue
    if workbook is None:
        raise ValueError("legacy workbook stream not found")
    strings = _parse_sst(workbook)
    sheets: list[tuple[str, int]] = []
    for _, record_id, payload in _biff_records(workbook):
        if record_id == 0x0085:
            sheets.append((_parse_short_unicode(payload, 6), struct.unpack_from("<I", payload, 0)[0]))
    output: dict[str, list[list[Any]]] = {}
    for name, start in sheets:
        cells: dict[tuple[int, int], Any] = {}
        max_row = max_col = 0
        for _, record_id, payload in _biff_records(workbook, start):
            row = col = 0
            if record_id == 0x00FD:
                row, col, _, string_index = struct.unpack_from("<HHHI", payload, 0)
                cells[(row, col)] = strings[string_index]
            elif record_id == 0x0203:
                row, col, _ = struct.unpack_from("<HHH", payload, 0)
                cells[(row, col)] = struct.unpack_from("<d", payload, 6)[0]
            elif record_id == 0x027E:
                row, col, _, raw = struct.unpack_from("<HHHI", payload, 0)
                cells[(row, col)] = _rk_value(raw)
            elif record_id == 0x00BD:
                row, first_col = struct.unpack_from("<HH", payload, 0)
                last_col = struct.unpack_from("<H", payload, len(payload) - 2)[0]
                for index in range(last_col - first_col + 1):
                    _, raw = struct.unpack_from("<HI", payload, 4 + index * 6)
                    cells[(row, first_col + index)] = _rk_value(raw)
                col = last_col
            elif record_id == 0x0205:
                row, col, _, raw, is_error = struct.unpack_from("<HHHBB", payload, 0)
                cells[(row, col)] = f"#ERR{raw}" if is_error else bool(raw)
            elif record_id == 0x0006:
                row, col, _ = struct.unpack_from("<HHH", payload, 0)
                cached = payload[6:14]
                if cached[6:8] != b"\xff\xff":
                    cells[(row, col)] = struct.unpack("<d", cached)[0]
            else:
                continue
            max_row = max(max_row, row)
            max_col = max(max_col, col)
        output[name] = [[cells.get((row, col)) for col in range(max_col + 1)] for row in range(max_row + 1)]
    return output


def _column_number(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference.upper())
    if not letters:
        return 0
    result = 0
    for char in letters.group(0):
        result = result * 26 + ord(char) - 64
    return result - 1


def read_xlsx(path: str | Path) -> dict[str, list[list[Any]]]:
    with zipfile.ZipFile(path) as archive:
        namespace = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {item.attrib["Id"]: item.attrib["Target"] for item in relationships}
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("a:si", namespace):
                shared_strings.append("".join(node.text or "" for node in item.iterfind(".//a:t", namespace)))
        output: dict[str, list[list[Any]]] = {}
        for sheet in workbook.findall("a:sheets/a:sheet", namespace):
            name = normalize_sheet_name(sheet.attrib["name"])
            rel_id = sheet.attrib[f"{{{namespace['r']}}}id"]
            target = rel_map[rel_id]
            if target.startswith("/"):
                member = target.lstrip("/")
            else:
                member = "xl/" + target.replace("../", "")
            root = ET.fromstring(archive.read(member))
            cells: dict[tuple[int, int], Any] = {}
            max_row = max_col = 0
            for cell in root.findall(".//a:sheetData/a:row/a:c", namespace):
                reference = cell.attrib.get("r", "A1")
                col = _column_number(reference)
                row_match = re.search(r"\d+", reference)
                row = int(row_match.group(0)) - 1 if row_match else 0
                cell_type = cell.attrib.get("t")
                value_node = cell.find("a:v", namespace)
                if cell_type == "inlineStr":
                    value = "".join(node.text or "" for node in cell.iterfind(".//a:t", namespace))
                elif value_node is None:
                    value = None
                elif cell_type == "s":
                    value = shared_strings[int(value_node.text or 0)]
                elif cell_type == "b":
                    value = value_node.text == "1"
                elif cell_type in {"str", "e"}:
                    value = value_node.text
                else:
                    raw = value_node.text or ""
                    try:
                        number = float(raw)
                        value = int(number) if number.is_integer() else number
                    except ValueError:
                        value = raw
                cells[(row, col)] = value
                max_row = max(max_row, row)
                max_col = max(max_col, col)
            output[name] = [[cells.get((row, col)) for col in range(max_col + 1)] for row in range(max_row + 1)]
        return output


def rows_as_records(rows: list[list[Any]], header_row: int, date_columns: set[str] | None = None) -> list[dict[str, Any]]:
    headers = [str(value).strip() if value is not None else "" for value in rows[header_row]]
    date_columns = date_columns or set()
    records: list[dict[str, Any]] = []
    for row in rows[header_row + 1 :]:
        if not any(value not in (None, "") for value in row):
            continue
        record: dict[str, Any] = {}
        for index, header in enumerate(headers):
            if not header:
                continue
            value = row[index] if index < len(row) else None
            if header in date_columns:
                value = excel_serial_to_date(value)
            record[header] = value
        records.append(record)
    return records

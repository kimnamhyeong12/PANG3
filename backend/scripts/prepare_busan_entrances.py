"""Build the compact 부산 entrance index used by the route service.

Usage: python backend/scripts/prepare_busan_entrances.py <부산광역시.zip>
The original address map archive stays outside the app and backend package.
"""

import argparse
import gzip
import json
import struct
import zipfile
from pathlib import Path


OUTPUT = Path(__file__).resolve().parents[1] / "data/busan-entrances.jsonl.gz"


def dbf_records(archive, name, columns):
    with archive.open(name) as stream:
        header = stream.read(32)
        count = struct.unpack_from("<I", header, 4)[0]
        header_size = struct.unpack_from("<H", header, 8)[0]
        record_size = struct.unpack_from("<H", header, 10)[0]
        descriptors = stream.read(header_size - 32)
        fields = {}
        offset = 1
        for index in range(0, header_size - 33, 32):
            descriptor = descriptors[index:index + 32]
            field = descriptor[:11].split(b"\0")[0].decode("ascii")
            fields[field] = (offset, descriptor[16])
            offset += descriptor[16]
        for _ in range(count):
            record = stream.read(record_size)
            if not record:
                raise ValueError("Truncated DBF record")
            values = {}
            for field in columns:
                start, length = fields[field]
                values[field] = record[start:start + length].strip(b"\0 ").decode("ascii")
            yield values if record[:1] != b"*" else None


def shapes(archive, name):
    with archive.open(name) as stream:
        stream.read(100)
        while True:
            header = stream.read(8)
            if not header:
                return
            if len(header) != 8:
                raise ValueError("Truncated SHP record header")
            _, length = struct.unpack(">II", header)
            data = stream.read(length * 2)
            if len(data) != length * 2:
                raise ValueError("Truncated SHP record")
            yield data


def polygon_rings(data):
    if struct.unpack_from("<I", data, 0)[0] != 5:
        return []
    part_count, point_count = struct.unpack_from("<II", data, 36)
    parts = list(struct.unpack_from("<" + "I" * part_count, data, 44))
    offsets = parts + [point_count]
    point_offset = 44 + 4 * part_count
    rings = []
    for start, end in zip(offsets, offsets[1:]):
        if end - start < 4:
            continue
        ring = []
        for index in range(start, end):
            x, y = struct.unpack_from("<dd", data, point_offset + 16 * index)
            ring.append([round(x, 2), round(y, 2)])
        rings.append(ring)
    return rings


def entrance_point(data):
    if struct.unpack_from("<I", data, 0)[0] != 1:
        return None
    return [round(value, 2) for value in struct.unpack_from("<dd", data, 4)]


def build(source):
    with zipfile.ZipFile(source) as archive:
        prefix = "26000/"
        entrances = {}
        for row, shape in zip(
            dbf_records(archive, prefix + "TL_SPBD_ENTRC.dbf", ("SIG_CD", "EQB_MAN_SN")),
            shapes(archive, prefix + "TL_SPBD_ENTRC.shp"),
            strict=True,
        ):
            if not row or not row["EQB_MAN_SN"]:
                continue
            coordinate = entrance_point(shape)
            if coordinate:
                entrances.setdefault((row["SIG_CD"], row["EQB_MAN_SN"]), []).append(coordinate)

        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        count = 0
        with gzip.open(OUTPUT, "wt", encoding="utf-8", newline="\n") as output:
            for row, shape in zip(
                dbf_records(archive, prefix + "TL_SPBD_EQB.dbf", ("SIG_CD", "EQB_MAN_SN")),
                shapes(archive, prefix + "TL_SPBD_EQB.shp"),
                strict=True,
            ):
                if not row:
                    continue
                points = entrances.get((row["SIG_CD"], row["EQB_MAN_SN"]))
                rings = polygon_rings(shape)
                if not points or not rings:
                    continue
                output.write(json.dumps({"sig": row["SIG_CD"], "group": row["EQB_MAN_SN"],
                                         "rings": rings, "entrances": points}, separators=(",", ":")))
                output.write("\n")
                count += 1
    print(f"Prepared {count} 부산 building groups at {OUTPUT} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    build(parser.parse_args().archive)

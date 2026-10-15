"""Compare actual embedded HWPX bytes against the previous JPEG encoder, without AI/network."""
import io
from zipfile import ZipFile
import test_report_export as export
from PIL import Image, ImageOps, ImageChops


def main():
    output = export.AI_DIR.parent / 'backend' / 'target' / 'report-compression-test'
    output.mkdir(parents=True, exist_ok=True)
    # Fixed seed produces a reproducible detailed fixture; no customer photos are used.
    import random
    random.seed(11)
    source = Image.frombytes('RGB', (1800, 1200), random.randbytes(1800 * 1200 * 3))
    original = output / 'source.png'
    source.save(original)
    previous = io.BytesIO()
    ImageOps.fit(source, (1600, 1100), method=Image.Resampling.LANCZOS).save(previous, 'JPEG', quality=92)
    result = export.run_pipeline({'location_name': '압축 검증', 'progress_status': 'complete',
        'field_photos': [{'path': str(original), 'comment': '작업 후|검증 사진'}], 'output_dir': str(output)})
    with ZipFile(result['report_file']) as archive:
        images = [archive.read(name) for name in archive.namelist() if name.startswith('BinData/') and name.lower().endswith(('.jpg', '.jpeg'))]
        assert len(images) == 1
        assert len(images[0]) < len(previous.getvalue()) * 0.85
        with Image.open(io.BytesIO(images[0])) as embedded:
            assert embedded.size == (1600, 1100), 'report photo dimensions remain unchanged'
    print(f'Embedded JPEG: {len(previous.getvalue()):,} -> {len(images[0]):,} bytes ({1-len(images[0])/len(previous.getvalue()):.1%} smaller)')
    # The real repository sample complements the deliberately difficult noise fixture.
    sample = export.AI_DIR / 'test2.jpeg'
    if sample.exists():
        with Image.open(sample) as image:
            old = io.BytesIO()
            ImageOps.fit(ImageOps.exif_transpose(image).convert('RGB'), (1600,1100), method=Image.Resampling.LANCZOS).save(old,'JPEG',quality=92)
        new = export.sanitize_image(str(sample),str(output/'sample.jpg'),canvas_size=(1600,1100))
        new_size = export.Path(new).stat().st_size
        assert new_size < len(old.getvalue())
        print(f'Repository photo: {len(old.getvalue()):,} -> {new_size:,} bytes ({1-new_size/len(old.getvalue()):.1%} smaller)')


if __name__ == '__main__':
    main()

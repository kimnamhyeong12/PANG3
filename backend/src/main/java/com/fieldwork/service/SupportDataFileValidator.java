package com.fieldwork.service;

import java.io.ByteArrayInputStream;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.util.zip.ZipInputStream;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Validate uploaded data files without importing rows or executing workbook content. */
final class SupportDataFileValidator {
    private SupportDataFileValidator() {}

    static void xlsx(byte[] data) {
        boolean contentTypes = false, workbook = false, worksheet = false;
        if (data.length < 4 || data[0] != 'P' || data[1] != 'K') throw invalidXlsx();
        try (var zip = new ZipInputStream(new ByteArrayInputStream(data))) {
            int count = 0; long expanded = 0;
            byte[] buffer = new byte[8192];
            for (var entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                if (++count > 4096) throw invalidXlsx();
                String name = entry.getName();
                if (name.equals("[Content_Types].xml")) contentTypes = true;
                if (name.equals("xl/workbook.xml")) workbook = true;
                if (name.matches("xl/worksheets/[^/]+\\.xml")) worksheet = true;
                int length;
                while ((length = zip.read(buffer)) != -1) {
                    expanded += length;
                    if (expanded > 128L * 1024 * 1024) throw invalidXlsx();
                }
            }
        } catch (java.io.IOException | IllegalArgumentException error) { throw invalidXlsx(); }
        if (!contentTypes || !workbook || !worksheet) throw invalidXlsx();
    }

    static void csv(byte[] data) {
        // Accept UTF-8 (including BOM), Korean Excel's CP949 and BOM-tagged UTF-16.
        Charset[] encodings = data.length >= 2 && ((data[0] == (byte)0xff && data[1] == (byte)0xfe)
                || (data[0] == (byte)0xfe && data[1] == (byte)0xff))
            ? new Charset[]{StandardCharsets.UTF_16}
            : new Charset[]{StandardCharsets.UTF_8, Charset.forName("MS949")};
        for (Charset encoding : encodings) {
            try {
                var text = encoding.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(data));
                boolean valid = text.length() > 0;
                for (int i = 0; valid && i < text.length(); i++) {
                    char character = text.charAt(i);
                    if (Character.isISOControl(character) && character != '\r' && character != '\n' && character != '\t') valid = false;
                }
                if (valid) return;
            } catch (CharacterCodingException ignored) { /* Try the next supported text encoding. */ }
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "정상적인 CSV 파일을 선택해 주세요. UTF-8 또는 한글 엑셀 CSV 파일을 사용할 수 있습니다.");
    }

    private static ResponseStatusException invalidXlsx() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "정상적인 엑셀(XLSX) 파일을 선택해 주세요.");
    }
}

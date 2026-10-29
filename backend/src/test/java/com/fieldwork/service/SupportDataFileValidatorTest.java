package com.fieldwork.service;

import static org.junit.jupiter.api.Assertions.*;
import java.io.ByteArrayOutputStream;
import java.nio.charset.*;
import java.util.zip.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class SupportDataFileValidatorTest {
    @Test void csvAcceptsKoreanTextEncodingsAndRejectsBinary() {
        String csv = "시설물 이름,주소,위도,경도\r\n소화전,부산광역시,35.1,129.2\r\n";
        for (Charset encoding : new Charset[]{StandardCharsets.UTF_8, Charset.forName("MS949"), StandardCharsets.UTF_16})
            assertDoesNotThrow(() -> SupportDataFileValidator.csv(csv.getBytes(encoding)));
        assertDoesNotThrow(() -> SupportDataFileValidator.csv(("\uFEFF" + csv).getBytes(StandardCharsets.UTF_8)));
        assertThrows(ResponseStatusException.class, () -> SupportDataFileValidator.csv(new byte[]{0, 1, 2, 3}));
        assertThrows(ResponseStatusException.class, () -> SupportDataFileValidator.csv(new byte[0]));
    }

    @Test void xlsxRequiresAnIntactWorkbookContainer() throws Exception {
        assertDoesNotThrow(() -> SupportDataFileValidator.xlsx(book(true)));
        assertThrows(ResponseStatusException.class, () -> SupportDataFileValidator.xlsx(book(false)));
        assertThrows(ResponseStatusException.class, () -> SupportDataFileValidator.xlsx("PK not an excel file".getBytes()));
        byte[] truncated = java.util.Arrays.copyOf(book(true), 50);
        assertThrows(ResponseStatusException.class, () -> SupportDataFileValidator.xlsx(truncated));
    }

    private byte[] book(boolean worksheet) throws Exception {
        var bytes = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(bytes)) {
            for (String name : worksheet ? new String[]{"[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"}
                    : new String[]{"[Content_Types].xml", "xl/workbook.xml"}) {
                zip.putNextEntry(new ZipEntry(name)); zip.write("<document/>".getBytes()); zip.closeEntry();
            }
        }
        return bytes.toByteArray();
    }
}

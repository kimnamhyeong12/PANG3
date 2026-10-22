package com.fieldwork.service;

import com.fieldwork.config.FieldworkProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import static org.junit.jupiter.api.Assertions.*;

class ReportImageCompatibilityTest {
    @TempDir Path temp;
    private final FileStorageService files = new FileStorageService(new FieldworkProperties());

    @Test void webpReportsMustBeRegeneratedButJpegAndPngReportsCanBeReused() throws Exception {
        assertFalse(files.isReusableReport(report("webp", "BinData/BIN0001.webp")));
        assertFalse(files.isReusableReport(report("mixed", "BinData/BIN0001.jpg", "BinData/BIN0002.WEBP")));
        assertTrue(files.isReusableReport(report("jpeg", "BinData/BIN0001.jpg")));
        assertTrue(files.isReusableReport(report("png", "BinData/BIN0001.png")));
    }

    @Test void missingOrDamagedFilesMustBeRegenerated() throws Exception {
        assertFalse(files.isReusableReport(null));
        assertFalse(files.isReusableReport(temp.resolve("missing.hwpx").toString()));
        Path broken = temp.resolve("broken.hwpx");
        Files.writeString(broken, "not a report package");
        assertFalse(files.isReusableReport(broken.toString()));
    }

    private String report(String name, String... images) throws Exception {
        Path path = temp.resolve(name + ".hwpx");
        try (var zip = new ZipOutputStream(Files.newOutputStream(path))) {
            for (String image : images) {
                zip.putNextEntry(new ZipEntry(image));
                zip.write(new byte[]{1, 2, 3});
                zip.closeEntry();
            }
        }
        return path.toString();
    }
}

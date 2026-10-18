package com.fieldwork.security;

import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.service.FileStorageService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.*;
import static org.junit.jupiter.api.Assertions.*;

class FileIsolationTest {
    @TempDir Path temp;
    @Test void retainedImagesCannotReferenceOtherTasksOrLocalServerFiles() throws Exception {
        FieldworkProperties config = new FieldworkProperties(); config.getUpload().setBaseDir(temp.toString());
        FileStorageService storage = new FileStorageService(config);
        String own=storage.saveMultipart(7L,"photo",new MockMultipartFile("photo", "photo.jpg", "image/jpeg", image()));
        String other=storage.saveMultipart(8L,"photo",new MockMultipartFile("photo", "other.jpg", "image/jpeg", image()));
        assertDoesNotThrow(() -> storage.requireTaskFile(7L,own));
        assertThrows(ResponseStatusException.class, () -> storage.requireTaskFile(7L,other));
        assertThrows(ResponseStatusException.class, () -> storage.requireTaskFile(7L,"file://"+own));
        assertThrows(ResponseStatusException.class, () -> storage.requireTaskFile(7L,temp.resolve("missing.jpg").toString()));
        assertThrows(ResponseStatusException.class, () -> storage.saveMultipart(7L,"photo",new MockMultipartFile("photo", "x.txt", "text/plain", new byte[]{1})));
    }
    static byte[] image() throws Exception {
        var output = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2, 2, java.awt.image.BufferedImage.TYPE_INT_RGB), "png", output);
        return output.toByteArray();
    }
    @Test void rejectsSpoofedOversizedAndExcessPixelImagesAndEnforcesQuota() throws Exception {
        FieldworkProperties config = new FieldworkProperties(); config.getUpload().setBaseDir(temp.toString());
        FileStorageService storage = new FileStorageService(config);
        assertThrows(ResponseStatusException.class, () -> storage.saveMultipart(1L,"photo",new MockMultipartFile("photo","fake.jpg","image/jpeg",new byte[]{1,2,3})));
        config.getUpload().setMaxPixels(1);
        assertThrows(ResponseStatusException.class, () -> storage.saveMultipart(1L,"photo",new MockMultipartFile("photo","large.png","image/png",image())));
        config.getUpload().setMaxPixels(100);
        config.getUpload().setMaxFileBytes(2);
        assertThrows(ResponseStatusException.class, () -> storage.saveMultipart(1L,"photo",new MockMultipartFile("photo","large.png","image/png",image())));
        config.getUpload().setMaxFileBytes(100000);
        config.getUpload().setMaxTaskBytes(1);
        assertEquals(413, assertThrows(ResponseStatusException.class, () -> storage.saveMultipart(1L,"photo",new MockMultipartFile("photo","photo.png","image/png",image()))).getStatusCode().value());
    }
    @Test void normalizesPixelsAndRemovesTrailingMetadata() throws Exception {
        FieldworkProperties config = new FieldworkProperties(); config.getUpload().setBaseDir(temp.toString());
        byte[] original = image();
        var input = new java.io.ByteArrayOutputStream(); input.write(original); input.write("PRIVATE_METADATA".getBytes());
        String saved = new FileStorageService(config).saveMultipart(1L,"photo",new MockMultipartFile("photo","photo.png","image/png",input.toByteArray()));
        assertNotNull(javax.imageio.ImageIO.read(Path.of(saved).toFile()));
        assertFalse(new String(Files.readAllBytes(Path.of(saved)), java.nio.charset.StandardCharsets.ISO_8859_1).contains("PRIVATE_METADATA"));
    }
    @Test void uploaderQuotaAppliesAcrossDifferentTasks() throws Exception {
        FieldworkProperties config = new FieldworkProperties(); config.getUpload().setBaseDir(temp.toString());
        FileStorageService storage = new FileStorageService(config);
        String first = storage.saveMultipart(1L,"photo",new MockMultipartFile("photo","photo.png","image/png",image()));
        config.getUpload().setMaxUserBytes(Files.size(Path.of(first)) + 1);
        assertEquals(413, assertThrows(ResponseStatusException.class, () -> storage.saveMultipart(2L,"photo",
                new MockMultipartFile("photo","photo.png","image/png",image()))).getStatusCode().value());
    }
}

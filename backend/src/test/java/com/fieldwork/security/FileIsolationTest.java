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
        String own=storage.saveMultipart(7L,"photo",new MockMultipartFile("photo", "photo.jpg", "image/jpeg", new byte[]{1,2,3}));
        String other=storage.saveMultipart(8L,"photo",new MockMultipartFile("photo", "other.jpg", "image/jpeg", new byte[]{1,2,3}));
        assertDoesNotThrow(() -> storage.requireTaskFile(7L,own));
        assertThrows(ResponseStatusException.class, () -> storage.requireTaskFile(7L,other));
        assertThrows(ResponseStatusException.class, () -> storage.requireTaskFile(7L,"file://"+own));
        assertThrows(ResponseStatusException.class, () -> storage.requireTaskFile(7L,temp.resolve("missing.jpg").toString()));
        assertThrows(ResponseStatusException.class, () -> storage.saveMultipart(7L,"photo",new MockMultipartFile("photo", "x.txt", "text/plain", new byte[]{1})));
    }
}

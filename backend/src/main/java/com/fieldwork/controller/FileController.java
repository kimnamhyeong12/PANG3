package com.fieldwork.controller;

import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.util.ProjectPaths;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Path;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private final Path baseDir;
    private final com.fieldwork.service.TaskProgressService progress;

    public FileController(FieldworkProperties properties, com.fieldwork.service.TaskProgressService progress) {
        this.baseDir = ProjectPaths.resolve(properties.getUpload().getBaseDir()).toAbsolutePath().normalize();
        this.progress = progress;
    }

    @GetMapping("/{taskId}/{fileName}")
    public ResponseEntity<Resource> serveFile(
            @PathVariable Long taskId,
            @PathVariable String fileName
    ) {
        progress.validateTaskReader(taskId, com.fieldwork.security.CurrentUser.id());
        Path file = baseDir.resolve(String.valueOf(taskId)).resolve(fileName).normalize();
        if (!file.startsWith(baseDir) || !file.toFile().isFile()) {
            return ResponseEntity.notFound().build();
        }
        try {
            Path taskDirectory = baseDir.resolve(taskId.toString()).toRealPath();
            if (!taskDirectory.startsWith(baseDir.toRealPath()) || !file.toRealPath().startsWith(taskDirectory)) return ResponseEntity.notFound().build();
        } catch (java.io.IOException ex) { return ResponseEntity.notFound().build(); }

        FileSystemResource resource = new FileSystemResource(file);
        return ResponseEntity.ok()
                .cacheControl(org.springframework.http.CacheControl.noStore())
                .contentType(
                        fileName.toLowerCase(java.util.Locale.ROOT).endsWith(".png") ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG)
                .body(resource);
    }
}

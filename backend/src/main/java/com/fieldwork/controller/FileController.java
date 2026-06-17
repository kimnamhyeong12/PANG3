package com.fieldwork.controller;

import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.util.ProjectPaths;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Path;
import java.nio.file.Paths;

@RestController
@RequestMapping("/api/files")
@CrossOrigin(origins = "*")
public class FileController {

    private final Path baseDir;

    public FileController(FieldworkProperties properties) {
        this.baseDir = ProjectPaths.resolve(properties.getUpload().getBaseDir()).toAbsolutePath().normalize();
    }

    @GetMapping("/{taskId}/{fileName}")
    public ResponseEntity<Resource> serveFile(
            @PathVariable Long taskId,
            @PathVariable String fileName
    ) {
        Path file = baseDir.resolve(String.valueOf(taskId)).resolve(fileName).normalize();
        if (!file.startsWith(baseDir) || !file.toFile().exists()) {
            return ResponseEntity.notFound().build();
        }

        FileSystemResource resource = new FileSystemResource(file);
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .body(resource);
    }
}

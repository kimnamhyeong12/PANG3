package com.fieldwork.service;

import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.util.ProjectPaths;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

@Service
public class FileStorageService {

    private final Path baseDir;

    public FileStorageService(FieldworkProperties properties) {
        this.baseDir = ProjectPaths.resolve(properties.getUpload().getBaseDir()).toAbsolutePath().normalize();
    }

    public Path taskDir(Long taskId) throws IOException {
        Path dir = baseDir.resolve(String.valueOf(taskId));
        Files.createDirectories(dir);
        return dir;
    }

    public String saveMultipart(Long taskId, String prefix, MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            return null;
        }
        String ext = extension(file.getOriginalFilename());
        String filename = prefix + "_" + UUID.randomUUID().toString().substring(0, 8) + ext;
        Path target = taskDir(taskId).resolve(filename);
        file.transferTo(target);
        return target.toString();
    }

    public boolean exists(String absolutePath) {
        if (absolutePath == null || absolutePath.isBlank()) {
            return false;
        }
        return Files.exists(Paths.get(absolutePath));
    }

    public Path resolveReadable(String pathOrUri) {
        if (pathOrUri == null || pathOrUri.isBlank()) {
            return null;
        }
        if (pathOrUri.startsWith("http://") || pathOrUri.startsWith("https://")) {
            return null;
        }
        if (pathOrUri.startsWith("file://")) {
            return Paths.get(pathOrUri.replace("file://", ""));
        }
        return Paths.get(pathOrUri);
    }

    public void requireTaskFile(Long taskId, String path) {
        if (path == null || path.isBlank()) return;
        try {
            Path supplied = Paths.get(path).toAbsolutePath().normalize();
            Path directory = baseDir.resolve(taskId.toString()).toRealPath();
            if (!directory.startsWith(baseDir.toRealPath()) || !supplied.toRealPath().startsWith(directory) || !Files.isRegularFile(supplied)) {
                throw new IOException("Outside task directory");
            }
        } catch (IOException | java.nio.file.InvalidPathException ex) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "이 업무에 저장된 사진만 사용할 수 있습니다.");
        }
    }

    private String extension(String name) {
        if (name == null || !name.contains(".")) {
            return ".jpg";
        }
        String extension = name.substring(name.lastIndexOf('.')).toLowerCase(java.util.Locale.ROOT);
        if (!java.util.Set.of(".jpg", ".jpeg", ".png", ".webp").contains(extension)) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "JPG, PNG, WEBP 사진만 업로드할 수 있습니다.");
        }
        return extension;
    }
}

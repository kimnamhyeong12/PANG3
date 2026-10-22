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
    private final FieldworkProperties.Upload limits;
    private final String pythonCommand;
    private static final Object UPLOAD_LOCK = new Object();

    public FileStorageService(FieldworkProperties properties) {
        this.baseDir = ProjectPaths.resolve(properties.getUpload().getBaseDir()).toAbsolutePath().normalize();
        this.limits = properties.getUpload();
        String python = properties.getAi().getPythonPath();
        this.pythonCommand = python.contains("/") || python.contains("\\") ? ProjectPaths.resolve(python).toString() : python;
        if (limits.getMaxFileBytes() < 1 || limits.getMaxFileBytes() > 60L * 1024 * 1024
                || limits.getMaxPixels() < 1 || limits.getMaxPixels() > 50000000 || limits.getMaxTaskBytes() < 1
                || limits.getMaxUserBytes() < 1 || limits.getMaxTotalBytes() < 1)
            throw new IllegalArgumentException("Invalid upload limits");
    }

    public Path taskDir(Long taskId) throws IOException {
        if (taskId == null || taskId <= 0) throw invalid("업무 정보를 확인해 주세요.");
        Path dir = baseDir.resolve(String.valueOf(taskId));
        Files.createDirectories(dir);
        if (!dir.toRealPath().startsWith(baseDir.toRealPath()) || Files.isSymbolicLink(dir)) throw invalid("사진 저장 위치가 올바르지 않습니다.");
        return dir;
    }

    public String saveMultipart(Long taskId, String prefix, MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            return null;
        }
        extension(file.getOriginalFilename());
        if (prefix == null || !prefix.matches("[A-Za-z0-9_]{1,32}")) throw invalid("사진 이름이 올바르지 않습니다.");
        if (file.getSize() > limits.getMaxFileBytes()) throw invalid("사진 파일이 너무 큽니다.");
        // Bound decoding memory and serialize quota check + write so parallel uploads cannot overshoot.
        synchronized (UPLOAD_LOCK) {
            byte[] bytes;
            try (var input = file.getInputStream()) { bytes = input.readNBytes(Math.toIntExact(limits.getMaxFileBytes()) + 1); }
            if (bytes.length > limits.getMaxFileBytes()) throw invalid("사진 파일이 너무 큽니다.");
            byte[] sanitized = sanitize(bytes);
            Path directory = taskDir(taskId);
            var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
            Long uploader = auth != null && auth.getPrincipal() instanceof Long id ? id : 0L;
            checkQuota(directory, uploader, sanitized.length);
            Path target = directory.resolve(prefix + "_u" + uploader + "_" + UUID.randomUUID() + ".webp");
            Files.write(target, sanitized, java.nio.file.StandardOpenOption.CREATE_NEW);
            return target.toString();
        }
    }

    public boolean exists(String absolutePath) {
        if (absolutePath == null || absolutePath.isBlank()) {
            return false;
        }
        return Files.exists(Paths.get(absolutePath));
    }

    /** Regenerate reports from the short-lived WebP export rollout on next download. */
    public boolean isReusableReport(String absolutePath) {
        if (absolutePath == null || absolutePath.isBlank()) return false;
        try (var report = new java.util.zip.ZipFile(absolutePath)) {
            return report.stream().noneMatch(entry -> entry.getName().startsWith("BinData/")
                    && entry.getName().toLowerCase(java.util.Locale.ROOT).endsWith(".webp"));
        } catch (IOException | java.nio.file.InvalidPathException error) {
            return false;
        }
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
            throw invalid("JPG, PNG, WebP 사진을 업로드해 주세요.");
        }
        return extension;
    }

    private byte[] sanitize(byte[] bytes) throws IOException {
        try (var input = javax.imageio.ImageIO.createImageInputStream(new java.io.ByteArrayInputStream(bytes))) {
            var readers = javax.imageio.ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw invalid("정상적인 사진 파일을 선택해 주세요.");
            var reader = readers.next();
            try {
                String format = reader.getFormatName().toLowerCase(java.util.Locale.ROOT);
                if (!java.util.Set.of("jpeg", "jpg", "png", "webp").contains(format)) throw invalid("JPG, PNG, WebP 사진을 업로드해 주세요.");
                reader.setInput(input, true, true);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width <= 0 || height <= 0 || (long) width * height > limits.getMaxPixels()) throw invalid("사진 해상도가 너무 큽니다.");
                var image = reader.read(0);
                int orientation = jpegOrientation(bytes);
                boolean swap = orientation >= 5;
                var normalized = new java.awt.image.BufferedImage(swap ? height : width, swap ? width : height, java.awt.image.BufferedImage.TYPE_INT_RGB);
                var graphics = normalized.createGraphics();
                try {
                    graphics.setColor(java.awt.Color.WHITE); graphics.fillRect(0, 0, normalized.getWidth(), normalized.getHeight());
                    java.awt.geom.AffineTransform transform = switch (orientation) {
                        case 2 -> new java.awt.geom.AffineTransform(-1, 0, 0, 1, width, 0);
                        case 3 -> new java.awt.geom.AffineTransform(-1, 0, 0, -1, width, height);
                        case 4 -> new java.awt.geom.AffineTransform(1, 0, 0, -1, 0, height);
                        case 5 -> new java.awt.geom.AffineTransform(0, 1, 1, 0, 0, 0);
                        case 6 -> new java.awt.geom.AffineTransform(0, 1, -1, 0, height, 0);
                        case 7 -> new java.awt.geom.AffineTransform(0, -1, -1, 0, height, width);
                        case 8 -> new java.awt.geom.AffineTransform(0, -1, 1, 0, 0, width);
                        default -> new java.awt.geom.AffineTransform();
                    };
                    graphics.drawImage(image, transform, null);
                } finally { graphics.dispose(); image.flush(); }
                try { return encodeWebp(normalized); }
                finally { normalized.flush(); }
            } finally { reader.dispose(); }
        } catch (javax.imageio.IIOException | IllegalArgumentException error) { throw invalid("손상되었거나 지원하지 않는 사진입니다."); }
    }
    private byte[] encodeWebp(java.awt.image.BufferedImage image) throws IOException {
        // Reuse the deployed Pillow runtime; never execute filenames as shell commands.
        Path temporary = Files.createTempDirectory("fieldwork-webp-");
        Path input = temporary.resolve("input.png"), output = temporary.resolve("output.webp");
        Process process = null;
        try {
            if (!javax.imageio.ImageIO.write(image, "png", input.toFile())) throw new IOException("Image encoder unavailable");
            process = new ProcessBuilder(pythonCommand, "-c",
                    "from PIL import Image; import sys; Image.open(sys.argv[1]).save(sys.argv[2], format='WEBP', quality=90, method=4)",
                    input.toString(), output.toString())
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            if (!process.waitFor(30, java.util.concurrent.TimeUnit.SECONDS)) throw new IOException("WebP conversion timed out");
            if (process.exitValue() != 0 || !Files.isRegularFile(output)) throw new IOException("WebP encoder unavailable");
            if (Files.size(output) > limits.getMaxFileBytes()) throw invalid("변환한 사진 파일이 너무 큽니다.");
            return Files.readAllBytes(output);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt(); throw new IOException("WebP conversion interrupted", interrupted);
        } finally {
            if (process != null && process.isAlive()) {
                process.destroyForcibly();
                try { process.waitFor(2, java.util.concurrent.TimeUnit.SECONDS); }
                catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            }
            Files.deleteIfExists(input); Files.deleteIfExists(output); Files.deleteIfExists(temporary);
        }
    }
    private void checkQuota(Path task, Long uploader, long incoming) throws IOException {
        long total = 0, taskTotal = 0, userTotal = 0; int count = 0, taskCount = 0;
        try (var paths = Files.walk(baseDir)) {
            var iterator = paths.iterator();
            while (iterator.hasNext()) {
                Path path = iterator.next();
                if (!Files.isRegularFile(path, java.nio.file.LinkOption.NOFOLLOW_LINKS)) continue;
                long size = Files.size(path); total += size; count++;
                if (path.startsWith(task)) { taskTotal += size; taskCount++; }
                if (path.getFileName().toString().matches(".*_u" + uploader + "_[0-9a-f-]+\\.(jpg|jpeg|png|webp)")) userTotal += size;
                if (total + incoming > limits.getMaxTotalBytes() || taskTotal + incoming > limits.getMaxTaskBytes()
                        || userTotal + incoming > limits.getMaxUserBytes()
                        || count >= 20000 || taskCount >= 1000) throw quota();
            }
        }
        if (incoming > limits.getMaxTaskBytes() || incoming > limits.getMaxUserBytes() || incoming > limits.getMaxTotalBytes()
                || Files.getFileStore(baseDir).getUsableSpace() < incoming + 512L * 1024 * 1024) throw quota();
    }
    private static org.springframework.web.server.ResponseStatusException invalid(String message) {
        return new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, message);
    }
    private static org.springframework.web.server.ResponseStatusException quota() {
        return new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE,
                "사진 저장 한도를 초과했습니다. 관리자에게 문의해 주세요.");
    }
    private static int jpegOrientation(byte[] bytes) {
        // Read only the EXIF orientation; no metadata is copied to the normalized JPEG.
        try {
            for (int offset = 2; offset + 4 < bytes.length && (bytes[offset] & 255) == 255;) {
                int marker = bytes[offset + 1] & 255;
                if (marker == 218 || marker == 217) break;
                int length = (bytes[offset + 2] & 255) * 256 + (bytes[offset + 3] & 255);
                if (length < 2 || offset + 2 + length > bytes.length) break;
                if (marker == 225 && length >= 16 && bytes[offset + 4] == 'E' && bytes[offset + 5] == 'x'
                        && bytes[offset + 6] == 'i' && bytes[offset + 7] == 'f') {
                    int start = offset + 10;
                    var data = java.nio.ByteBuffer.wrap(bytes, start, length - 8).slice();
                    data.order(bytes[start] == 'I' ? java.nio.ByteOrder.LITTLE_ENDIAN : java.nio.ByteOrder.BIG_ENDIAN);
                    int table = data.getInt(4), entries = Short.toUnsignedInt(data.getShort(table));
                    for (int i = 0; i < entries; i++) {
                        int entry = table + 2 + i * 12;
                        if (Short.toUnsignedInt(data.getShort(entry)) == 274 && data.getShort(entry + 2) == 3 && data.getInt(entry + 4) == 1) {
                            int orientation = Short.toUnsignedInt(data.getShort(entry + 8));
                            return orientation >= 1 && orientation <= 8 ? orientation : 1;
                        }
                    }
                }
                offset += length + 2;
            }
        } catch (IndexOutOfBoundsException | IllegalArgumentException ignored) { }
        return 1;
    }
}

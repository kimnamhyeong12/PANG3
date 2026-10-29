package com.fieldwork.service;

import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.entity.SupportAttachment;
import com.fieldwork.entity.SupportInquiry;
import com.fieldwork.repository.SupportAttachmentRepository;
import com.fieldwork.util.ProjectPaths;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SupportAttachmentService {
    public static final long MAX_TOTAL = 30L * 1024 * 1024;
    public static final long MAX_FILE = 15L * 1024 * 1024;
    private static final Object STORAGE_LOCK = new Object();
    private final Path root;
    private final FieldworkProperties.Upload limits;
    private final FileStorageService images;
    private final SupportAttachmentRepository attachments;
    private final SupportInboxService inbox;
    public SupportAttachmentService(FieldworkProperties properties, FileStorageService images, SupportAttachmentRepository attachments, SupportInboxService inbox) {
        this.root = ProjectPaths.resolve(properties.getUpload().getBaseDir()).toAbsolutePath().normalize().resolve("support");
        this.limits = properties.getUpload(); this.images = images; this.attachments = attachments; this.inbox = inbox;
    }
    public void validate(List<MultipartFile> files) {
        if (files == null) return;
        if (files.size() > 5) throw invalid("첨부파일은 최대 5개까지 등록할 수 있습니다.");
        long total = 0;
        for (var file : files) {
            if (file == null || file.isEmpty()) throw invalid("빈 파일은 첨부할 수 없습니다.");
            if (file.getSize() > Math.min(MAX_FILE, limits.getMaxFileBytes())) throw invalid("파일 하나의 크기는 최대 15MB입니다.");
            total += file.getSize();
            if (total > MAX_TOTAL) throw invalid("첨부파일의 합계는 최대 30MB입니다.");
            String name = Objects.toString(file.getOriginalFilename(), "").toLowerCase(Locale.ROOT);
            if (!name.matches(".+\\.(jpg|jpeg|png|pdf|xlsx|csv)$")) throw invalid("JPG, PNG, PDF, XLSX, CSV 파일만 첨부할 수 있습니다.");
        }
    }
    public void save(SupportInquiry inquiry, List<MultipartFile> files) {
        validate(files);
        if (files == null || files.isEmpty()) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) throw new IllegalStateException("Attachment writes require a transaction");
        List<Path> written = new ArrayList<>();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status == STATUS_COMMITTED) return;
                for (Path path : written) try { Files.deleteIfExists(path); } catch (IOException ignored) { /* Do not hide the transaction failure. */ }
            }
        });
        try {
            synchronized (STORAGE_LOCK) {
                Files.createDirectories(root);
                Path directory = root.resolve(inquiry.user.getUserId().toString()); Files.createDirectories(directory);
                if (!root.toRealPath().startsWith(root.getParent().toRealPath()) || Files.isSymbolicLink(root)
                        || !directory.toRealPath().startsWith(root.toRealPath()) || Files.isSymbolicLink(directory)) throw invalid("파일 저장 위치가 올바르지 않습니다.");
                for (MultipartFile file : files) {
                    String name = file.getOriginalFilename().replaceAll("[\\\\/\\p{Cntrl}]", "_");
                    if (name.length() > 150) name = name.substring(name.length() - 150);
                    boolean pdf = name.toLowerCase(Locale.ROOT).endsWith(".pdf");
                    boolean xlsx = name.toLowerCase(Locale.ROOT).endsWith(".xlsx");
                    boolean csv = name.toLowerCase(Locale.ROOT).endsWith(".csv");
                    String extension = pdf ? ".pdf" : xlsx ? ".xlsx" : csv ? ".csv" : ".jpg";
                    String contentType = pdf ? "application/pdf" : xlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : csv ? "text/csv" : "image/jpeg";
                    byte[] data;
                    try (var input = file.getInputStream()) { data = input.readNBytes(Math.toIntExact(MAX_FILE) + 1); }
                    if (data.length > MAX_FILE) throw invalid("파일 하나의 크기는 최대 15MB입니다.");
                    if (pdf) {
                        if (data.length < 5 || !new String(data, 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-")) throw invalid("정상적인 PDF 파일을 선택해 주세요.");
                    } else if (xlsx) { SupportDataFileValidator.xlsx(data);
                    } else if (csv) { SupportDataFileValidator.csv(data);
                    } else { data = images.sanitize(data); name = name.replaceFirst("(?i)\\.(png|jpeg|jpg)$", ".jpg"); }
                    checkQuota(directory, data.length);
                    String key = inquiry.user.getUserId() + "/" + UUID.randomUUID() + extension;
                    Path target = root.resolve(key);
                    try (var output = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW)) { written.add(target); output.write(data); }
                    SupportAttachment attachment = new SupportAttachment(); attachment.inquiry = inquiry;
                    attachment.name = name; attachment.contentType = contentType; attachment.size = data.length; attachment.storageKey = key;
                    inquiry.attachments.add(attachments.save(attachment));
                }
            }
        } catch (IOException failure) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "첨부파일을 저장하지 못했습니다. 다시 시도해 주세요."); }
    }
    private void checkQuota(Path owner, long incoming) throws IOException {
        long total = 0, userTotal = 0; int count = 0;
        try (var paths = Files.walk(root)) {
            var iterator = paths.iterator();
            while (iterator.hasNext()) {
                Path path = iterator.next();
                if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) continue;
                long size = Files.size(path); total += size; if (path.startsWith(owner)) userTotal += size;
                if (++count > 20000) throw full();
            }
        }
        if (total + incoming > limits.getMaxTotalBytes() || userTotal + incoming > limits.getMaxUserBytes()) throw full();
    }
    public record Download(String name, String contentType, long size, Path path) {}
    @Transactional(readOnly = true)
    public Download download(Long userId, Long inquiryId, Long attachmentId, boolean admin) {
        // Perform ownership/role checks before disclosing whether an attachment exists.
        if (admin) inbox.requireAgent(userId); else inbox.mine(userId, inquiryId);
        var attachment = attachments.findByIdAndInquiry_Id(attachmentId, inquiryId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "첨부파일을 찾을 수 없습니다."));
        try {
            if (!attachment.storageKey.matches("[0-9]+/[a-f0-9-]+\\.(jpg|pdf|xlsx|csv)")) throw new IOException();
            Path path = root.resolve(attachment.storageKey);
            if (!path.toRealPath().startsWith(root.toRealPath()) || !Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) throw new IOException();
            return new Download(attachment.name, attachment.contentType, Files.size(path), path);
        } catch (IOException failure) { throw new ResponseStatusException(HttpStatus.NOT_FOUND, "첨부파일을 찾을 수 없습니다."); }
    }
    private static ResponseStatusException invalid(String reason) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason); }
    private static ResponseStatusException full() { return new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "첨부파일 저장 한도를 초과했습니다. 고객센터에 문의해 주세요."); }
}

package com.fieldwork.repository;
import com.fieldwork.entity.SupportAttachment;
import org.springframework.data.jpa.repository.JpaRepository;
public interface SupportAttachmentRepository extends JpaRepository<SupportAttachment, Long> {
    java.util.Optional<SupportAttachment> findByIdAndInquiry_Id(Long id, Long inquiryId);
}

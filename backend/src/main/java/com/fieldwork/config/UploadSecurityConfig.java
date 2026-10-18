package com.fieldwork.config;

import jakarta.servlet.MultipartConfigElement;
import org.springframework.boot.web.servlet.MultipartConfigFactory;
import org.springframework.context.annotation.*;
import org.springframework.util.unit.DataSize;

@Configuration
public class UploadSecurityConfig {
    @Bean public MultipartConfigElement multipartConfigElement(FieldworkProperties properties,
            @org.springframework.beans.factory.annotation.Value("${spring.servlet.multipart.max-file-size:15MB}") DataSize fileSize,
            @org.springframework.beans.factory.annotation.Value("${spring.servlet.multipart.max-request-size:60MB}") DataSize requestSize) {
        var factory = new MultipartConfigFactory();
        long fileCeiling = properties.getUpload().getMaxFileBytes(), requestCeiling = DataSize.ofMegabytes(60).toBytes();
        factory.setMaxFileSize(DataSize.ofBytes(fileSize.isNegative() ? fileCeiling : Math.min(fileSize.toBytes(), fileCeiling)));
        factory.setMaxRequestSize(DataSize.ofBytes(requestSize.isNegative() ? requestCeiling : Math.min(requestSize.toBytes(), requestCeiling)));
        return factory.createMultipartConfig();
    }
}

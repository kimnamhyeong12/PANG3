package com.fieldwork.security;

import com.fieldwork.config.*;
import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;
import static org.junit.jupiter.api.Assertions.*;

class UploadSecurityConfigTest {
    @Test void operatorLimitsCanTightenButNotBypassTheServiceCeiling() {
        var config = new UploadSecurityConfig(); var properties = new FieldworkProperties();
        var tighter = config.multipartConfigElement(properties, DataSize.ofMegabytes(2), DataSize.ofMegabytes(5));
        assertEquals(DataSize.ofMegabytes(2).toBytes(), tighter.getMaxFileSize());
        assertEquals(DataSize.ofMegabytes(5).toBytes(), tighter.getMaxRequestSize());
        var looser = config.multipartConfigElement(properties, DataSize.ofGigabytes(1), DataSize.ofGigabytes(1));
        assertEquals(DataSize.ofMegabytes(15).toBytes(), looser.getMaxFileSize());
        assertEquals(DataSize.ofMegabytes(60).toBytes(), looser.getMaxRequestSize());
        var unlimited = config.multipartConfigElement(properties, DataSize.ofBytes(-1), DataSize.ofBytes(-1));
        assertEquals(DataSize.ofMegabytes(15).toBytes(), unlimited.getMaxFileSize());
        assertEquals(DataSize.ofMegabytes(60).toBytes(), unlimited.getMaxRequestSize());
    }
}

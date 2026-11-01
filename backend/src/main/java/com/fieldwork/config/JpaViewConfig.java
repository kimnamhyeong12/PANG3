package com.fieldwork.config;

import jakarta.persistence.EntityManagerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.orm.jpa.support.OpenEntityManagerInViewInterceptor;
import org.springframework.web.servlet.config.annotation.*;

/** Streaming responses must never retain a request-scoped JPA connection. */
@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(prefix="spring.jpa",name="open-in-view",havingValue="true",matchIfMissing=true)
public class JpaViewConfig {
    @Bean OpenEntityManagerInViewInterceptor entityManagerInView(EntityManagerFactory factory) {
        var interceptor=new OpenEntityManagerInViewInterceptor();interceptor.setEntityManagerFactory(factory);return interceptor;
    }
    @Bean WebMvcConfigurer entityManagerInViewRoutes(OpenEntityManagerInViewInterceptor interceptor) {
        return new WebMvcConfigurer() {
            @Override public void addInterceptors(InterceptorRegistry registry) {
                registry.addWebRequestInterceptor(interceptor).excludePathPatterns("/api/sync/events");
            }
        };
    }
}

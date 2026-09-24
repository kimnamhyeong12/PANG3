package com.fieldwork;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class FieldworkApplication {

    public static void main(String[] args) {
        SpringApplication.run(FieldworkApplication.class, args);
    }

}

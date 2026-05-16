package com.fieldwork.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

@RestController
public class DebugController {

    @Autowired
    private RequestMappingHandlerMapping handlerMapping;

    @GetMapping("/mappings")
    public Object getAllMappings() {
        System.out.println("adfdfas");
        return handlerMapping.getHandlerMethods();
    }
    @GetMapping("/hello")
    public String hello()
    {
        return "<h1>HELLO WORLD</h1>";
    }
}
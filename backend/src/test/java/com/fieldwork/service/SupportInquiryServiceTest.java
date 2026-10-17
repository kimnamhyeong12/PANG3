package com.fieldwork.service;

import com.fieldwork.entity.User;
import com.fieldwork.repository.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SupportInquiryServiceTest {
    UserRepository users;
    JavaMailSender sender;
    ObjectProvider<JavaMailSender> provider;
    SupportInquiryService support;
    @BeforeEach @SuppressWarnings("unchecked") void setup() {
        users=mock(UserRepository.class); sender=mock(JavaMailSender.class); provider=mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(sender);
        User user=new User(); user.setLoginId("tester"); user.setRole("USER");
        when(users.findById(10L)).thenReturn(Optional.of(user));
        support=new SupportInquiryService(users,provider,"pang3.apps@gmail.com");
    }
    void send() { support.send(10L,"reply@example.test","Help","Question details","1.0.0","android"); }
    @Test void sendsOnlyToSupportAndSetsReplyAddressWithoutImpersonatingTheUser() {
        send(); var message=ArgumentCaptor.forClass(SimpleMailMessage.class); verify(sender).send(message.capture());
        assertArrayEquals(new String[]{"pang3.apps@gmail.com"},message.getValue().getTo());
        assertEquals("pang3.apps@gmail.com",message.getValue().getFrom());
        assertEquals("reply@example.test",message.getValue().getReplyTo());
        assertTrue(message.getValue().getText().contains("tester"));
        assertTrue(message.getValue().getText().contains("Question details"));
    }
    @Test void missingMailConfigurationNeverReportsSuccess() {
        support=new SupportInquiryService(users,provider,"");
        assertEquals(503,assertThrows(ResponseStatusException.class,this::send).getStatusCode().value());
        verifyNoInteractions(sender);
    }
    @Test void smtpFailureNeverReportsSuccess() {
        doThrow(new MailSendException("provider failure")).when(sender).send(any(SimpleMailMessage.class));
        var failure=assertThrows(ResponseStatusException.class,this::send);
        assertEquals(503,failure.getStatusCode().value()); assertFalse(failure.getReason().contains("provider failure"));
    }
    @Test void rejectsInvalidEmailHeaderInjectionAndOversizedContents() {
        assertEquals(400,assertThrows(ResponseStatusException.class,()->support.send(10L,"not-email","Help","Body","1","android")).getStatusCode().value());
        assertEquals(400,assertThrows(ResponseStatusException.class,()->support.send(10L,"reply@example.test\r\nBcc:other@example.test","Help","Body","1","android")).getStatusCode().value());
        assertEquals(400,assertThrows(ResponseStatusException.class,()->support.send(10L,"reply@example.test","Help\nBcc:other","Body","1","android")).getStatusCode().value());
        assertEquals(400,assertThrows(ResponseStatusException.class,()->support.send(10L,"reply@example.test","x".repeat(101),"Body","1","android")).getStatusCode().value());
        assertEquals(400,assertThrows(ResponseStatusException.class,()->support.send(10L,"reply@example.test","Help","x".repeat(5001),"1","android")).getStatusCode().value());
        verifyNoInteractions(sender);
    }
    @Test void limitsRepeatedSubmissionsPerAccount() {
        for(int i=0;i<5;i++) send();
        assertEquals(429,assertThrows(ResponseStatusException.class,this::send).getStatusCode().value());
        verify(sender,times(5)).send(any(SimpleMailMessage.class));
    }
    @Test void rejectsMissingOrDeletedAccounts() {
        when(users.findById(10L)).thenReturn(Optional.empty());
        assertEquals(401,assertThrows(ResponseStatusException.class,this::send).getStatusCode().value());
        verifyNoInteractions(sender);
    }
}

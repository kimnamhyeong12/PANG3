package com.fieldwork.service;

import com.fieldwork.entity.User;
import com.fieldwork.repository.UserRepository;
import com.fieldwork.repository.SupportInquiryRepository;
import com.fieldwork.entity.SupportInquiry;
import org.springframework.context.ApplicationEventPublisher;
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
    SupportInquiryRepository inquiries;
    ApplicationEventPublisher events;
    SupportAttachmentService files;
    @BeforeEach @SuppressWarnings("unchecked") void setup() {
        users=mock(UserRepository.class); sender=mock(JavaMailSender.class); provider=mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(sender);
        User user=new User(); user.setLoginId("tester"); user.setRole("USER");
        when(users.findById(10L)).thenReturn(Optional.of(user));
        inquiries=mock(SupportInquiryRepository.class); events=mock(ApplicationEventPublisher.class);
        when(inquiries.saveAndFlush(any())).thenAnswer(call -> { SupportInquiry i=call.getArgument(0); i.id=100L; return i; });
        files=mock(SupportAttachmentService.class);
        support=new SupportInquiryService(users,inquiries,provider,events,files,"pang3.apps@gmail.com");
        doAnswer(call -> { support.notifyOperator(call.getArgument(0)); return null; }).when(events).publishEvent(any(SupportInquiryService.MailNotification.class));
    }
    void send() { support.send(10L,"reply@example.test","Help","Question details","1.0.0","android"); }
    @Test void sendsOnlyToSupportAndSetsReplyAddressWithoutImpersonatingTheUser() {
        send(); var message=ArgumentCaptor.forClass(SimpleMailMessage.class); verify(sender).send(message.capture());
        assertArrayEquals(new String[]{"pang3.apps@gmail.com"},message.getValue().getTo());
        assertEquals("pang3.apps@gmail.com",message.getValue().getFrom());
        assertEquals("reply@example.test",message.getValue().getReplyTo());
        assertTrue(message.getValue().getText().contains("tester"));
        assertTrue(message.getValue().getText().contains("Question details"));
        assertEquals("[핀워크 문의] Help", message.getValue().getSubject());
        assertTrue(message.getValue().getText().contains("답변 이메일: reply@example.test"));
    }
    @Test void missingMailConfigurationStillAcceptsTheStoredInquiry() {
        support=new SupportInquiryService(users,inquiries,provider,events,files,"");
        assertDoesNotThrow(this::send);
        verify(inquiries).saveAndFlush(any());
        verifyNoInteractions(sender);
    }
    @Test void smtpFailureDoesNotLoseTheStoredInquiry() {
        doThrow(new MailSendException("provider failure")).when(sender).send(any(SimpleMailMessage.class));
        assertDoesNotThrow(this::send);
        verify(inquiries).saveAndFlush(any());
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

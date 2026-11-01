package com.fieldwork.security;

import com.fasterxml.jackson.databind.*;
import com.fieldwork.entity.*;
import com.fieldwork.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes=ReleaseAuthIntegrationTest.TestConfig.class,properties={"spring.config.location=classpath:/auth-test.properties","spring.datasource.url=jdbc:h2:mem:emailcodes;MODE=PostgreSQL;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc(print=org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint.NONE)
class EmailCodeIntegrationTest {
    @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired UserRepository users;
    @Autowired EmailChallengeRepository challenges; @Autowired JavaMailSender mail; @Autowired PasswordEncoder passwords;
    @Autowired com.fieldwork.service.SocialVerificationService social;
    String ip;
    @BeforeEach void setup(){reset(mail);ip=UUID.randomUUID().toString();}
    User user(){User u=new User();u.setLoginId("code"+UUID.randomUUID());u.setName("code test");u.setRole("USER");u.setPassword(passwords.encode("test-password"));return users.saveAndFlush(u);}
    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder postBody(String path,Object body)throws Exception{return post(path).with(r->{r.setRemoteAddr(ip);return r;}).contentType("application/json").content(json.writeValueAsString(body));}
    String login(User u)throws Exception{return "Bearer "+json.readTree(mvc.perform(postBody("/api/auth/login",Map.of("loginId",u.getLoginId(),"password","test-password")).header("X-Auth-Client","native")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("accessToken").asText();}
    record Sent(String id,String code){}
    Sent request(String auth,String address)throws Exception{
        return request(auth,address,"test-password");
    }
    Sent request(String auth,String address,String credential)throws Exception{
        var response=mvc.perform(postBody("/api/auth/email/code/request",Map.of("email",address,"password",credential)).header("Authorization",auth)).andExpect(status().isOk()).andReturn();
        var message=org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);verify(mail,atLeastOnce()).send(message.capture());
        var match=java.util.regex.Pattern.compile("인증코드: ([0-9]{6})").matcher(message.getValue().getText());assertTrue(match.find());
        String id=json.readTree(response.getResponse().getContentAsString()).get("challengeId").asText();assertFalse(response.getResponse().getContentAsString().contains(match.group(1)));
        return new Sent(id,match.group(1));
    }
    void verifyCode(String auth,Sent sent,String code,int expected)throws Exception{
        mvc.perform(postBody("/api/auth/email/code/verify",Map.of("challengeId",sent.id(),"code",code)).header("Authorization",auth)).andExpect(status().is(expected));
    }
    @Test void emailChangesOnlyAfterTheMailedCodeAndCannotBeReused()throws Exception{
        User u=user();String auth=login(u),email=u.getLoginId()+"@example.test";Sent sent=request(auth,email);
        assertNull(users.findById(u.getUserId()).orElseThrow().getEmail());
        var saved=challenges.findAll().stream().filter(c->c.user.getUserId().equals(u.getUserId())).findFirst().orElseThrow();
        assertNotEquals(sent.code(),saved.codeHash);assertEquals(64,saved.codeHash.length());
        verifyCode(auth,sent,sent.code(),200);assertEquals(email,users.findById(u.getUserId()).orElseThrow().getEmail());verifyCode(auth,sent,sent.code(),400);
    }
    @Test void wrongCodesConsumeAttemptsAndLockAfterFiveIncludingAcrossRequests()throws Exception{
        User u=user();String auth=login(u);Sent sent=request(auth,u.getLoginId()+"@example.test");String wrong=sent.code().equals("000000")?"111111":"000000";
        for(int i=0;i<5;i++)verifyCode(auth,sent,wrong,400);
        var saved=challenges.findAll().stream().filter(c->c.user.getUserId().equals(u.getUserId())).findFirst().orElseThrow();assertEquals(5,saved.attempts);
        verifyCode(auth,sent,sent.code(),400);assertNull(users.findById(u.getUserId()).orElseThrow().getEmail());
    }
    @Test void expiredOtherUserAndUnauthenticatedCodesAreRejected()throws Exception{
        User u=user();String auth=login(u);Sent sent=request(auth,u.getLoginId()+"@example.test");
        verifyCode(login(user()),sent,sent.code(),400);
        mvc.perform(postBody("/api/auth/email/code/verify",Map.of("challengeId",sent.id(),"code",sent.code()))).andExpect(status().isUnauthorized());
        var c=challenges.findAll().stream().filter(row->row.user.getUserId().equals(u.getUserId())).findFirst().orElseThrow();c.expiresAt=Instant.now().minusSeconds(1);challenges.saveAndFlush(c);verifyCode(auth,sent,sent.code(),400);
    }
    @Test void requestsRequireReauthenticationAndResendsInvalidateTheOldCode()throws Exception{
        User u=user();String auth=login(u);
        mvc.perform(postBody("/api/auth/email/code/request",Map.of("email","wrong@example.test","password","wrong")).header("Authorization",auth)).andExpect(status().isBadRequest());verifyNoInteractions(mail);
        Sent first=request(auth,u.getLoginId()+"@example.test"),second=request(auth,u.getLoginId()+"-new@example.test");
        verifyCode(auth,first,first.code(),400);verifyCode(auth,second,second.code(),200);
    }
    @Test void socialReauthenticationIsAcceptedOnlyForItsOwnAccount()throws Exception{
        User u=user(),other=user();String auth=login(u),address=u.getLoginId()+"@example.test";
        mvc.perform(postBody("/api/auth/email/code/request",Map.of("email",address,"password",social.issue(other.getUserId()))).header("Authorization",auth)).andExpect(status().isBadRequest());verifyNoInteractions(mail);
        Sent sent=request(auth,address,social.issue(u.getUserId()));verifyCode(auth,sent,sent.code(),200);
    }
    @Test void resendIsLimitedAndMailFailureDoesNotInvalidateThePreviousCode()throws Exception{
        User u=user();String auth=login(u),address=u.getLoginId()+"@example.test";Sent sent=request(auth,address);
        mvc.perform(postBody("/api/auth/email/code/request",Map.of("email",address,"password","test-password")).header("Authorization",auth)).andExpect(status().isTooManyRequests());
        doThrow(new org.springframework.mail.MailSendException("mail unavailable")).when(mail).send(any(SimpleMailMessage.class));
        mvc.perform(postBody("/api/auth/email/code/request",Map.of("email",u.getLoginId()+"-retry@example.test","password","test-password")).header("Authorization",auth)).andExpect(status().isServiceUnavailable());
        assertNull(users.findById(u.getUserId()).orElseThrow().getEmail());verifyCode(auth,sent,sent.code(),200);
    }
}

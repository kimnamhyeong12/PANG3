package com.fieldwork.security;

import com.fasterxml.jackson.databind.*;
import com.fieldwork.entity.User;
import com.fieldwork.repository.*;
import com.fieldwork.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes=ReleaseAuthIntegrationTest.TestConfig.class, properties={
    "spring.config.location=classpath:/auth-test.properties", "spring.datasource.url=jdbc:h2:mem:logincredentials;MODE=PostgreSQL;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc(print=org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint.NONE)
class LoginCredentialsIntegrationTest {
    @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired UserRepository users;
    @Autowired GroupMemberRepository members; @Autowired SocialAccountService social;
    @Autowired SocialVerificationService verification; @Autowired AuthSessionService sessions;
    @Autowired PasswordEncoder encoder;
    String ip;
    @BeforeEach void setup(){ip=UUID.randomUUID().toString();}
    User socialUser(){Long id=social.resolve("google",UUID.randomUUID().toString(),"소셜 회원",null,false);social.completeProfile(id,new SocialAccountService.ProfileInput("소셜 회원",null,null,null,null,null));return users.findById(id).orElseThrow();}
    User localUser(){User u=new User();u.setLoginId("member-"+UUID.randomUUID());u.setName("일반 회원");u.setPassword(encoder.encode("old-password"));u.setRole("USER");return users.saveAndFlush(u);}
    String auth(User u){return "Bearer "+sessions.issue(u.getUserId()).get("accessToken");}
    String id(){return "chosen-"+UUID.randomUUID();}
    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder postBody(String path,Object body)throws Exception{
        return post(path).with(r->{r.setRemoteAddr(ip);return r;}).contentType("application/json").content(json.writeValueAsBytes(body));
    }
    void change(User u,String auth,String id,String password,String credential,int status)throws Exception{
        Map<String,Object> body=new HashMap<>();body.put("loginId",id);body.put("password",password);body.put("credential",credential);
        mvc.perform(postBody("/api/users/"+u.getUserId()+"/login-credentials",body).header("Authorization",auth)).andExpect(status().is(status));
    }
    JsonNode login(String id,String password,int status)throws Exception{
        return json.readTree(mvc.perform(postBody("/api/auth/login",Map.of("loginId",id,"password",password)).header("X-Auth-Client","native"))
            .andExpect(status().is(status)).andReturn().getResponse().getContentAsString());
    }
    @Test void socialSetupPreservesBothProvidersAndMembershipAndEnablesLocalLogin()throws Exception{
        String google=UUID.randomUUID().toString(),kakao=UUID.randomUUID().toString();
        Long uid=social.resolve("google",google,"원래 이름",null,false);social.resolve("kakao",kakao,"카카오 이름",uid,false);
        social.completeProfile(uid,new SocialAccountService.ProfileInput("원래 이름",null,null,null,null,null));
        User u=users.findById(uid).orElseThrow();String old=u.getLoginId(),auth=auth(u),chosen=id();
        var before=members.findAll().stream().filter(m->m.getUser().getUserId().equals(uid)).map(m->m.getGroup().getGroupId()).sorted().toList();
        long count=users.count();assertTrue(AuthSessionService.userInfo(u).get("loginSetupRequired").equals(true));
        change(u,auth,chosen,"new-password",verification.issue(uid),200);
        User saved=users.findById(uid).orElseThrow();assertEquals(chosen,saved.getLoginId());assertTrue(saved.isPasswordLoginEnabled());
        assertTrue(encoder.matches("new-password",saved.getPassword()));assertFalse(saved.isLoginSetupRequired());assertEquals(count,users.count());
        assertEquals(before,members.findAll().stream().filter(m->m.getUser().getUserId().equals(uid)).map(m->m.getGroup().getGroupId()).sorted().toList());
        assertEquals(Set.of("google","kakao"),new HashSet<>(social.providers(uid)));
        assertEquals(uid,social.resolve("google",google,"새 구글 이름",null,false));assertEquals(uid,social.resolve("kakao",kakao,"새 카카오 이름",null,false));
        assertEquals(chosen,sessions.issue(uid).get("loginId"));assertEquals(uid,login(chosen,"new-password",200).get("userId").asLong());
        login(old,"new-password",401);mvc.perform(get("/api/auth/me").header("Authorization",auth)).andExpect(status().isUnauthorized());
    }
    @Test void socialSetupRequiresOwnSocialReauthenticationAndBothCredentials()throws Exception{
        User u=socialUser(),other=socialUser();String auth=auth(u),old=u.getLoginId();
        change(u,auth,id(),"new-password","wrong",400);change(u,auth,id(),"new-password",verification.issue(other.getUserId()),400);
        change(u,auth,id(),null,verification.issue(u.getUserId()),400);change(u,auth,id(),"short",verification.issue(u.getUserId()),400);
        change(u,auth,"bad id","new-password",verification.issue(u.getUserId()),400);
        change(u,auth,"social-"+UUID.randomUUID(),"new-password",verification.issue(u.getUserId()),400);
        assertEquals(old,users.findById(u.getUserId()).orElseThrow().getLoginId());assertFalse(users.findById(u.getUserId()).orElseThrow().isPasswordLoginEnabled());
    }
    @Test void duplicateOrTakenAfterAvailabilityDoesNotPartiallyEnablePasswordLogin()throws Exception{
        User u=socialUser(),taken=localUser();String auth=auth(u),old=u.getLoginId(),chosen=id();
        mvc.perform(get("/api/auth/login-id/availability").param("loginId",chosen)).andExpect(status().isOk()).andExpect(jsonPath("$.available").value(true));
        taken.setLoginId(chosen);users.saveAndFlush(taken);
        change(u,auth,chosen,"new-password",verification.issue(u.getUserId()),400);
        User saved=users.findById(u.getUserId()).orElseThrow();assertEquals(old,saved.getLoginId());assertFalse(saved.isPasswordLoginEnabled());
        change(u,auth,id(),"new-password",verification.issue(u.getUserId()),200);
    }
    @Test void existingUserCanRenameWithCurrentPasswordWithoutChangingPasswordOrSocialLinks()throws Exception{
        User u=localUser();String old=u.getLoginId(),hash=u.getPassword(),subject=UUID.randomUUID().toString(),auth=auth(u),chosen=id();
        social.resolve("kakao",subject,"카카오",u.getUserId(),false);
        change(u,auth,chosen,null,"wrong",400);change(u,auth,chosen,null,"old-password",200);
        assertEquals(hash,users.findById(u.getUserId()).orElseThrow().getPassword());
        assertEquals(u.getUserId(),login(chosen,"old-password",200).get("userId").asLong());login(old,"old-password",401);
        assertEquals(u.getUserId(),social.resolve("kakao",subject,"카카오",null,false));
        mvc.perform(get("/api/auth/me").header("Authorization",auth)).andExpect(status().isUnauthorized());
    }
    @Test void existingUserCanRenameWithOwnSocialGrantButCannotChangeSomeoneElse()throws Exception{
        User u=localUser(),other=localUser();String auth=auth(u),chosen=id();
        change(u,auth,chosen,null,verification.issue(other.getUserId()),400);
        change(other,auth,chosen,null,verification.issue(other.getUserId()),403);
        change(u,auth,chosen,null,verification.issue(u.getUserId()),200);
        assertEquals(u.getUserId(),login(chosen,"old-password",200).get("userId").asLong());
    }
    @Test void existingIdDuplicateInvalidAndUnchangedAreRejectedAndAnonymousCannotChange()throws Exception{
        User u=localUser(),other=localUser();String auth=auth(u),old=u.getLoginId();
        change(u,auth,old,null,"old-password",400);change(u,auth,other.getLoginId(),null,"old-password",400);change(u,auth,"a b",null,"old-password",400);
        change(u,auth,id(),"new-password","old-password",400);
        mvc.perform(postBody("/api/users/"+u.getUserId()+"/login-credentials",Map.of("loginId",id(),"credential","old-password"))).andExpect(status().isUnauthorized());
        assertEquals(old,users.findById(u.getUserId()).orElseThrow().getLoginId());
    }
    @Test void legacyGeneratedIdWithPasswordStillRequiresSocialSetupAndProfileCannotBypassIt()throws Exception{
        User u=socialUser();u.setPasswordLoginEnabled(true);u.setPassword(encoder.encode("old-password"));users.saveAndFlush(u);String auth=auth(u);
        change(u,auth,id(),"new-password","old-password",400);
        mvc.perform(patch("/api/users/"+u.getUserId()+"/account").header("Authorization",auth).contentType("application/json")
            .content(json.writeValueAsBytes(Map.of("currentPassword",verification.issue(u.getUserId()),"name","이름","newPassword","new-password")))).andExpect(status().isBadRequest());
        change(u,auth,id(),"new-password",verification.issue(u.getUserId()),200);
    }
    @Test void reauthenticationAttemptsCannotBypassAccountLimitByChangingIpAndRequestedId()throws Exception{
        User u=localUser();String auth=auth(u),old=u.getLoginId();
        for(int i=0;i<31;i++){
            var request=postBody("/api/users/"+u.getUserId()+"/login-credentials",Map.of("loginId",id(),"credential","wrong"));
            request.with(r->{r.setRemoteAddr(UUID.randomUUID().toString());return r;});
            mvc.perform(request.header("Authorization",auth)).andExpect(status().is(i<30?400:429));
        }
        assertEquals(old,users.findById(u.getUserId()).orElseThrow().getLoginId());
    }
    @Test void concurrentClaimsForSameIdHaveOneWinnerAndPreserveLosingAccount()throws Exception{
        User a=socialUser(),b=socialUser();String chosen=id();
        var start=new java.util.concurrent.CountDownLatch(1);var executor=java.util.concurrent.Executors.newFixedThreadPool(2);
        try{
            var jobs=new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
            for(User u:List.of(a,b)){
                String auth=auth(u),grant=verification.issue(u.getUserId());
                jobs.add(executor.submit(()->{start.await();return mvc.perform(postBody("/api/users/"+u.getUserId()+"/login-credentials",Map.of("loginId",chosen,"password","new-password","credential",grant)).header("Authorization",auth)).andReturn().getResponse().getStatus();}));
            }
            start.countDown();var statuses=new java.util.ArrayList<Integer>();for(var job:jobs)statuses.add(job.get(20,java.util.concurrent.TimeUnit.SECONDS));
            statuses.sort(Integer::compareTo);assertEquals(List.of(200,400),statuses);
            long winners=0;for(User original:List.of(a,b)){User saved=users.findById(original.getUserId()).orElseThrow();if(chosen.equals(saved.getLoginId())){winners++;assertTrue(saved.isPasswordLoginEnabled());}else{assertEquals(original.getLoginId(),saved.getLoginId());assertFalse(saved.isPasswordLoginEnabled());}}
            assertEquals(1,winners);
        }finally{executor.shutdownNow();}
    }
    @Test void unfinishedSocialSignupCannotBeLeftInAnUnfinishableStateByPasswordSetup()throws Exception{
        Long uid=social.resolve("kakao",UUID.randomUUID().toString(),"가입 중",null,false);User u=users.findById(uid).orElseThrow();
        change(u,auth(u),id(),"new-password",verification.issue(uid),400);
        User saved=users.findById(uid).orElseThrow();assertTrue(saved.isSocialProfilePending());assertFalse(saved.isPasswordLoginEnabled());assertEquals(u.getLoginId(),saved.getLoginId());
    }
}

package com.fieldwork.controller;
import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.AccountEmailService;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AccountEmailController {
    private final AccountEmailService email;
    public AccountEmailController(AccountEmailService email) { this.email=email; }
    @PostMapping("/email/request")
    public Map<String,String> requestEmail(@RequestBody Map<String,String> body) {
        email.updateEmail(CurrentUser.id(), body.get("password"), body.get("email"));
        return Map.of("message", "인증 메일을 보냈습니다. 메일의 링크를 열어 주세요.");
    }
    @PostMapping("/email/verify")
    public Map<String,String> verify(@RequestBody Map<String,String> body) {
        email.verify(body.get("token")); return Map.of("message", "이메일 인증이 완료되었습니다.");
    }
    @PostMapping("/password/forgot")
    public Map<String,String> forgot(@RequestBody Map<String,String> body) {
        email.requestReset(body.get("loginId"), body.get("email"));
        return Map.of("message", "입력한 정보와 일치하는 인증된 이메일이 있으면 재설정 메일을 보냅니다.");
    }
    @PostMapping("/password/reset")
    public Map<String,String> reset(@RequestBody Map<String,String> body) {
        email.reset(body.get("token"), body.get("password")); return Map.of("message", "비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.");
    }
}

package com.fieldwork.controller;
import com.fieldwork.entity.NotificationPreference;
import com.fieldwork.repository.NotificationPreferenceRepository;
import com.fieldwork.security.CurrentUser;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
@RestController @RequestMapping("/api/notifications/preferences")
public class NotificationPreferenceController {
 private final NotificationPreferenceRepository preferences;
 public NotificationPreferenceController(NotificationPreferenceRepository preferences){this.preferences=preferences;}
 private NotificationPreference mine(){return preferences.findById(CurrentUser.id()).orElseGet(()->{var p=new NotificationPreference();p.userId=CurrentUser.id();return p;});}
 @GetMapping public ResponseEntity<?> read(){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(mine());}
 public record Input(Boolean taskAlerts,Boolean teamAlerts,Boolean activityAlerts){}
 @PatchMapping @Transactional public NotificationPreference update(@RequestBody Input input){var p=mine();if(input.taskAlerts()!=null)p.taskAlerts=input.taskAlerts();if(input.teamAlerts()!=null)p.teamAlerts=input.teamAlerts();if(input.activityAlerts()!=null)p.activityAlerts=input.activityAlerts();return preferences.save(p);}
}

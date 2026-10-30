package com.fieldwork.entity;
import jakarta.persistence.*;
@Entity @Table(name="notification_preferences")
public class NotificationPreference {
 @Id public Long userId;
 public boolean taskAlerts=true;
 public boolean teamAlerts=true;
 public boolean activityAlerts=true;
}

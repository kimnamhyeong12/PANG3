package com.fieldwork.service;

import com.fieldwork.entity.LocationAssignment;
import com.fieldwork.entity.Task;
import com.fieldwork.entity.User;
import com.fieldwork.repository.LocationAssignmentRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class NotificationScheduler {

    private static final ZoneId KOREA_ZONE =
            ZoneId.of("Asia/Seoul");

    private final LocationAssignmentRepository locationAssignmentRepository;
    private final PushNotificationService pushNotificationService;
    private final HolidayService holidayService;

    public NotificationScheduler(
            LocationAssignmentRepository locationAssignmentRepository,
            PushNotificationService pushNotificationService,
            HolidayService holidayService
    ) {
        this.locationAssignmentRepository = locationAssignmentRepository;
        this.pushNotificationService = pushNotificationService;
        this.holidayService = holidayService;
    }

    @Scheduled(
            cron = "0 0 9 * * *",
            zone = "Asia/Seoul"
    )
    public void scheduledMorningSummary() {
        sendMorningSummaries();
    }

    @Scheduled(
            cron = "0 0 17 * * *",
            zone = "Asia/Seoul"
    )
    public void scheduledEndOfDayReminder() {
        sendEndOfDayReminders();
    }

    /**
     * 테스트 시 실제 09:00까지 기다릴 필요 없이 이 메서드를 직접 호출할 수 있다.
     */
    public void sendMorningSummaries() {
        LocalDate today = LocalDate.now(KOREA_ZONE);

        if (!holidayService.isBusinessDay(today)) {
            System.out.println(
                    "[Notification] " + today
                            + " 휴일이므로 아침 업무 요약을 건너뜁니다."
            );
            return;
        }

        for (UserTasks userTasks : collectAssignedTasks().values()) {
            int todayCount = 0;
            int overdueCount = 0;

            for (Task task : userTasks.tasks()) {
                if (isComplete(task.getTaskStatus())) {
                    continue;
                }

                LocalDate scheduledDate = effectiveScheduledDate(task);

                if (scheduledDate == null || scheduledDate.equals(today)) {
                    todayCount++;
                } else if (scheduledDate.isBefore(today)) {
                    overdueCount++;
                }
            }

            if (todayCount == 0 && overdueCount == 0) {
                continue;
            }

            Map<String, Object> data = new LinkedHashMap<>();
            data.put(
                    "type",
                    PushNotificationService.TYPE_MORNING_SUMMARY
            );
            data.put("todayCount", todayCount);
            data.put("unfinishedCount", overdueCount);

            pushNotificationService.sendToUser(
                    userTasks.user().getUserId(),
                    "오늘 외근 업무",
                    "오늘 업무 " + todayCount
                            + "건 · 미처리 업무 "
                            + overdueCount + "건이 있습니다.",
                    data
            );
        }
    }

    /**
     * 테스트 시 실제 17:00까지 기다릴 필요 없이 이 메서드를 직접 호출할 수 있다.
     */
    public void sendEndOfDayReminders() {
        LocalDate today = LocalDate.now(KOREA_ZONE);

        if (!holidayService.isBusinessDay(today)) {
            System.out.println(
                    "[Notification] " + today
                            + " 휴일이므로 퇴근 전 알림을 건너뜁니다."
            );
            return;
        }

        for (UserTasks userTasks : collectAssignedTasks().values()) {
            int pendingCount = 0;
            int workingCount = 0;

            for (Task task : userTasks.tasks()) {
                LocalDate scheduledDate = effectiveScheduledDate(task);

                // 아직 미래에 배치된 업무는 퇴근 전 미완료 집계에서 제외한다.
                if (scheduledDate != null && scheduledDate.isAfter(today)) {
                    continue;
                }

                String status = normalizeStatus(task.getTaskStatus());

                if ("pending".equals(status)) {
                    pendingCount++;
                } else if ("working".equals(status)) {
                    workingCount++;
                }
            }

            if (pendingCount == 0 && workingCount == 0) {
                continue;
            }

            Map<String, Object> data = new LinkedHashMap<>();
            data.put(
                    "type",
                    PushNotificationService.TYPE_END_OF_DAY_INCOMPLETE
            );
            data.put("pendingCount", pendingCount);
            data.put("workingCount", workingCount);

            pushNotificationService.sendToUser(
                    userTasks.user().getUserId(),
                    "미완료 업무가 있습니다",
                    "작업 중 " + workingCount
                            + "건 · 작업 전 "
                            + pendingCount + "건이 남아 있습니다.",
                    data
            );
        }
    }

    private Map<Long, UserTasks> collectAssignedTasks() {
        Map<Long, UserTasks> byUser = new LinkedHashMap<>();

        // 같은 사용자/업무가 혹시 중복 배정 데이터로 존재해도
        // 정기 알림에서 두 번 집계하지 않도록 키를 별도로 관리한다.
        Map<Long, Set<Long>> seenTaskIds = new LinkedHashMap<>();

        List<LocationAssignment> assignments =
                locationAssignmentRepository.findAll();

        for (LocationAssignment assignment : assignments) {
            User user = assignment.getAssignee();
            Task task = assignment.getTask();

            if (user == null
                    || user.getUserId() == null
                    || task == null
                    || task.getTaskId() == null) {
                continue;
            }

            Set<Long> seen = seenTaskIds.computeIfAbsent(
                    user.getUserId(),
                    ignored -> new LinkedHashSet<>()
            );

            if (!seen.add(task.getTaskId())) {
                continue;
            }

            UserTasks userTasks = byUser.computeIfAbsent(
                    user.getUserId(),
                    ignored -> new UserTasks(
                            user,
                            new ArrayList<>()
                    )
            );

            userTasks.tasks().add(task);
        }

        return byUser;
    }

    private LocalDate effectiveScheduledDate(Task task) {
        if (task.getScheduledDate() != null) {
            return task.getScheduledDate();
        }

        return task.getWorkDate();
    }

    private boolean isComplete(String status) {
        String normalized = normalizeStatus(status);

        return "complete".equals(normalized)
                || "completed".equals(normalized)
                || "done".equals(normalized);
    }

    private String normalizeStatus(String status) {
        return status == null
                ? ""
                : status.trim().toLowerCase();
    }

    private record UserTasks(
            User user,
            List<Task> tasks
    ) {
    }
}

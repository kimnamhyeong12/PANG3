package com.fieldwork.service;

import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.entity.*;
import com.fieldwork.repository.TaskProgressRepository;
import java.lang.reflect.*;
import java.util.*;
import org.springframework.web.multipart.MultipartHttpServletRequest;

/** Synthetic contract checks, run with -ea; no database, AI process, or operational data. */
public class TaskProgressContractTest {
    static class Tasks extends TaskService {
        final Task task;
        final User owner;
        int statusWrites;
        Tasks(Task task, User owner) { super(null,null,null,null,null,null,null,null); this.task=task; this.owner=owner; }
        @Override public Task getById(Long id) { return task; }
        @Override public User currentAssignee(Task task) { return owner; }
        @Override public void requireEditor(Long id, Long userId) { if (!owner.getUserId().equals(userId)) throw new IllegalArgumentException("\uD604\uC7AC \uB2F4\uB2F9\uC790\uB9CC \uBCC0\uACBD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."); }
        @Override public Task updateStatusEntity(Task task, String status) { statusWrites++; task.setTaskStatus(status); return task; }
        @Override public Task updateLocationEntity(Task task, Double lat, Double lng) { return task; }
    }
    static class Ai extends AiReportService {
        int calls;
        Ai() { super(new FieldworkProperties()); }
        @Override public Map<String,Object> generateReport(Task task, TaskProgress progress) {
            calls++; throw new AssertionError("Saving field records must not run HWPX generation");
        }
    }
    static void id(TaskProgress report, long id) throws Exception {
        Field field=TaskProgress.class.getDeclaredField("progressId"); field.setAccessible(true); field.set(report,id);
    }
    public static void main(String[] args) throws Exception {
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(7L, null, List.of()));
        Task task=new Task(); task.setTaskId(1L); task.setTaskStatus("complete");
        User owner=new User(); owner.setUserId(7L);
        TaskProgress report=new TaskProgress(); report.setTask(task); report.setProgressStatus("complete"); id(report,11L);
        report.setFieldMemo("original"); report.setFieldPhotos(List.of(Map.of("path","/before.jpg","comment","작업 전|기존")));
        report.setPerformedByUserId(6L);
        TaskProgressRepository repository=(TaskProgressRepository)Proxy.newProxyInstance(TaskProgressRepository.class.getClassLoader(),
            new Class<?>[]{TaskProgressRepository.class}, (proxy, method, values) -> {
                if (List.of("findById","findLocked","findTopByTask_TaskIdOrderByCreatedAtDesc").contains(method.getName())) return Optional.of(report);
                if (method.getName().equals("saveAndFlush") || method.getName().equals("save")) return values[0];
                throw new UnsupportedOperationException(method.getName());
            });
        Tasks tasks=new Tasks(task,owner); Ai ai=new Ai();
        var manager = org.mockito.Mockito.mock(org.springframework.transaction.PlatformTransactionManager.class);
        org.mockito.Mockito.when(manager.getTransaction(org.mockito.ArgumentMatchers.any()))
                .thenReturn(new org.springframework.transaction.support.SimpleTransactionStatus());
        TaskProgressService service=new TaskProgressService(repository,tasks,new FileStorageService(new FieldworkProperties()),ai,manager);
        for (String status : Arrays.asList("pending", null, "unknown")) {
            report.setProgressStatus(status);
            try { service.prepareReport(11L, 7L); throw new AssertionError("Pre-work report must not be generated"); }
            catch (org.springframework.web.server.ResponseStatusException expected) { assert expected.getStatusCode().value()==409; }
            try { service.prepareCombined(List.of(11L), 7L); throw new AssertionError("Pre-work report must not enter a combined file"); }
            catch (org.springframework.web.server.ResponseStatusException expected) { assert expected.getStatusCode().value()==409; }
            var controller = new com.fieldwork.controller.TaskProgressController(service);
            try { controller.downloadReport(11L); throw new AssertionError("Direct download must reject pre-work reports"); }
            catch (org.springframework.web.server.ResponseStatusException expected) { assert expected.getStatusCode().value()==409; }
        }
        assert ai.calls==0;
        report.setProgressStatus("working"); service.validateDownloadable(report);
        report.setProgressStatus("complete"); service.validateDownloadable(report);
        String revision=service.toResponseMap(report,task).get("revision").toString();
        Map<String,String> params=new HashMap<>(Map.of("taskId","1","userId","7","progressId","11","expectedRevision",revision,
                "fieldMemo","corrected","progressStatus","complete","photoSlots",
                "[{\"type\":\"before\",\"action\":\"keep\",\"path\":\"/before.jpg\",\"comment\":\"수정\"},{\"type\":\"during\",\"action\":\"delete\"},{\"type\":\"after\",\"action\":\"delete\"}]"));
        MultipartHttpServletRequest request=(MultipartHttpServletRequest)Proxy.newProxyInstance(MultipartHttpServletRequest.class.getClassLoader(),
            new Class<?>[]{MultipartHttpServletRequest.class}, (proxy, method, values) -> switch(method.getName()) {
                case "getParameter" -> params.get(values[0]); case "getFile" -> null; case "getFiles" -> List.of();
                default -> throw new UnsupportedOperationException(method.getName());
            });
        Map<String,Object> saved=service.saveFromMultipart(request);
        assert saved.get("progressId").equals(11L);
        assert saved.get("fieldMemo").equals("corrected");
        assert saved.get("performedByUserId").equals(6L);
        assert task.getTaskStatus().equals("complete") && tasks.statusWrites==0;
        assert report.getFieldPhotos().size()==1 && report.getFieldPhotos().get(0).get("path").equals("/before.jpg");
        assert report.getFieldPhotos().get(0).get("type").equals("before");
        assert report.getReportFilePath()==null && ai.calls==0;
        try { service.saveFromMultipart(request); throw new AssertionError("Stale edits must not overwrite"); }
        catch (IllegalArgumentException expected) { assert expected.getMessage().contains("변경"); }
        params.put("userId","8");
        try { service.saveFromMultipart(request); throw new AssertionError("Unassigned user must not edit"); }
        catch (IllegalArgumentException expected) { assert expected.getMessage().contains("담당자"); }

        List<Map<String,Object>> old=List.of(Map.of("path","/during.jpg","comment","작업 중|과거"));
        List<Map<String,Object>> manifest=List.of(Map.of("type","before","action","upload","uploadIndex",0,"comment","새 사진"),
                Map.of("type","during","action","keep","path","/during.jpg"), Map.of("type","after","action","delete"));
        List<Map<String,Object>> merged=PhotoSlots.merge(manifest,old,List.of(Map.of("path","/new.jpg")));
        assert merged.size()==2 && merged.get(0).get("type").equals("before") && merged.get(1).get("path").equals("/during.jpg");
        assert old.get(0).get("comment").equals("작업 중|과거");
        try { PhotoSlots.merge(manifest,List.of(),List.of(Map.of("path","/new.jpg"))); throw new AssertionError("Foreign photo reference"); }
        catch (IllegalArgumentException expected) {}
        task.setTaskStatus("working"); id(report,12L); report.setProgressStatus("working");
        TaskProgress historical=new TaskProgress(); historical.setTask(task); id(historical,11L); historical.setProgressStatus("pending");
        Method sync=TaskProgressService.class.getDeclaredMethod("syncReportStatus",Task.class,TaskProgress.class); sync.setAccessible(true);
        sync.invoke(service,task,historical);
        assert task.getTaskStatus().equals("working") && tasks.statusWrites==0;
        sync.invoke(service,task,new TaskProgress());
        assert task.getTaskStatus().equals("working");
        params.put("userId","7"); params.remove("progressId"); params.remove("expectedRevision");
        params.put("fieldMemo","new visit"); params.put("progressStatus","working");
        params.put("photoSlots","[{\"type\":\"before\",\"action\":\"delete\"},{\"type\":\"during\",\"action\":\"delete\"},{\"type\":\"after\",\"action\":\"delete\"}]");
        Map<String,Object> fresh=service.saveFromMultipart(request);
        assert fresh.get("fieldMemo").equals("new visit") && fresh.get("performedByUserId").equals(7L);
        assert report.getFieldMemo().equals("corrected") && report.getFieldPhotos().size()==1;
        System.out.println("Task progress checks passed: completed editing, ownership, stale edits, photo retention and historical status isolation");
    }
}

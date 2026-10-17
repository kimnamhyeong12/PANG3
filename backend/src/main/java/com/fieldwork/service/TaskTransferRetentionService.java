package com.fieldwork.service;

import com.fieldwork.repository.TaskTransferRequestRepository;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Only processed requests expire; pending requests never expire automatically. */
@Service
public class TaskTransferRetentionService {
    private final TaskTransferRequestRepository requests;
    private final TransactionTemplate transactions;

    public TaskTransferRetentionService(TaskTransferRequestRepository requests, PlatformTransactionManager manager) {
        this.requests = requests;
        transactions = new TransactionTemplate(manager);
    }

    @Scheduled(fixedDelay = 3600000, initialDelay = 60000)
    public void cleanup() {
        cleanupBefore(LocalDateTime.now(ZoneOffset.UTC).minusDays(30));
    }

    public void cleanupBefore(LocalDateTime cutoff) {
        for (int batch = 0; batch < 100; batch++) {
            Integer count = transactions.execute(status -> {
                var ids = requests.findExpiredIds(cutoff, PageRequest.of(0, 100));
                for (Long id : ids) requests.findByIdForUpdate(id).ifPresent(request -> {
                    if (!"PENDING".equals(request.getStatus()) && request.getRespondedAt() != null
                            && !request.getRespondedAt().isAfter(cutoff)) {
                        // Entity deletion also removes task_transfer_items, never the tasks/reports.
                        requests.delete(request);
                    }
                });
                requests.flush();
                return ids.size();
            });
            if (count == null || count < 100) break;
        }
    }
}

package com.fieldwork.security;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class RequestBudgetTest {
    @Test void rejectedAttemptsDoNotExtendLockoutAndCountersExpire() {
        var budget = new RequestBudget();
        assertTrue(budget.allow("user", 2, 1000, 0));
        assertTrue(budget.allow("user", 2, 1000, 1));
        assertFalse(budget.allow("user", 2, 1000, 999));
        assertTrue(budget.allow("other", 2, 1000, 999));
        assertTrue(budget.allow("user", 2, 1000, 1000));
    }
}

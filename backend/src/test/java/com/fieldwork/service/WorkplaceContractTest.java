package com.fieldwork.service;

import com.fieldwork.controller.UserController;
import com.fieldwork.entity.User;
import com.fieldwork.repository.UserRepository;
import java.lang.reflect.Proxy;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

public class WorkplaceContractTest {
    public static void main(String[] args) {
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(7L, null, java.util.List.of()));
        User user = new User(); user.setUserId(7L); user.setRole("USER");
        AtomicInteger saves = new AtomicInteger();
        UserRepository repository = (UserRepository) Proxy.newProxyInstance(UserRepository.class.getClassLoader(), new Class[]{UserRepository.class}, (proxy, method, values) -> {
            if (method.getName().equals("findById")) return Optional.of(user);
            if (method.getName().equals("save")) { saves.incrementAndGet(); return values[0]; }
            throw new UnsupportedOperationException(method.getName());
        });
        UserController controller = new UserController(repository, null, null);
        Map<String, Object> result = controller.updateWorkplace(7L, new UserController.WorkplaceRequest(" 부산 사상구 백양대로494번길 10 ", 35.16, 129.02));
        assert result.get("workplaceAddress").equals("부산 사상구 백양대로494번길 10");
        assert user.getWorkplaceLat().equals(35.16) && user.getWorkplaceLng().equals(129.02);
        assert saves.get() == 1;
        for (Double badLat : new Double[]{null, Double.NaN, 91.0}) {
            try { controller.updateWorkplace(7L, new UserController.WorkplaceRequest("new", badLat, 129.0)); throw new AssertionError("invalid coordinates accepted"); }
            catch (IllegalArgumentException expected) {}
        }
        assert saves.get() == 1 && user.getWorkplaceLat().equals(35.16);
        controller.updateWorkplace(7L, new UserController.WorkplaceRequest("변경한 근무지", 35.1, 129.1));
        assert user.getWorkplaceAddress().equals("변경한 근무지") && saves.get() == 2;
        user.setRole("DELETED");
        try { controller.updateWorkplace(7L, new UserController.WorkplaceRequest("new", 35.0, 129.0)); throw new AssertionError("deleted user accepted"); }
        catch (IllegalArgumentException expected) {}
        assert saves.get() == 2;
        System.out.println("Workplace contract checks passed: account persistence, changed address, invalid coordinate rejection and deleted account");
    }
}

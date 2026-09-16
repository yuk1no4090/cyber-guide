package com.cyberguide.security;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.model.PlanDay;
import com.cyberguide.repository.PlanDayRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SessionOwnershipGuardTest {

    @Mock
    private PlanDayRepository planDayRepository;

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    private SessionOwnershipGuard guard() {
        return new SessionOwnershipGuard(planDayRepository);
    }

    private void authenticateAs(String id, String type) {
        var principal = new AuthPrincipal(id, type, type.equals("user") ? "u@test.com" : null);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + type.toUpperCase()))));
    }

    private PlanDay row(UUID owner) {
        PlanDay day = new PlanDay();
        day.setUserId(owner);
        return day;
    }

    @Test
    void anonymousCallerMayOnlyTouchItsOwnSession() {
        authenticateAs("session-mine", "anonymous");

        assertDoesNotThrow(() -> guard().assertCanAccessPlan("session-mine"));
    }

    @Test
    void anonymousCallerIsRefusedAnotherSession() {
        authenticateAs("session-mine", "anonymous");

        BizException ex = assertThrows(BizException.class,
                () -> guard().assertCanAccessPlan("session-someone-else"));

        assertEquals(ErrorCode.FORBIDDEN, ex.getErrorCode());
    }

    @Test
    void loggedInCallerIsRefusedASessionAnotherAccountHasClaimed() {
        UUID me = UUID.randomUUID();
        UUID someoneElse = UUID.randomUUID();
        authenticateAs(me.toString(), "user");
        when(planDayRepository.findBySessionIdOrderByDayIndexAsc("s-1"))
                .thenReturn(List.of(row(someoneElse)));

        BizException ex = assertThrows(BizException.class, () -> guard().assertCanAccessPlan("s-1"));

        assertEquals(ErrorCode.FORBIDDEN, ex.getErrorCode());
    }

    @Test
    void loggedInCallerMayTouchItsOwnClaimedSession() {
        UUID me = UUID.randomUUID();
        authenticateAs(me.toString(), "user");
        when(planDayRepository.findBySessionIdOrderByDayIndexAsc("s-2"))
                .thenReturn(List.of(row(me)));

        assertDoesNotThrow(() -> guard().assertCanAccessPlan("s-2"));
    }

    @Test
    void loggedInCallerMayTouchUnclaimedRows() {
        // Rows are stamped only when an anonymous session is upgraded at signup.
        // Refusing unclaimed rows would strand the plan a person just built.
        authenticateAs(UUID.randomUUID().toString(), "user");
        when(planDayRepository.findBySessionIdOrderByDayIndexAsc("s-3"))
                .thenReturn(List.of(row(null)));

        assertDoesNotThrow(() -> guard().assertCanAccessPlan("s-3"));
    }

    @Test
    void loggedInCallerMayStartAPlanForASessionWithNoRowsYet() {
        authenticateAs(UUID.randomUUID().toString(), "user");
        when(planDayRepository.findBySessionIdOrderByDayIndexAsc("s-4")).thenReturn(List.of());

        assertDoesNotThrow(() -> guard().assertCanAccessPlan("s-4"));
    }

    @Test
    void anUnauthenticatedCallerIsRefused() {
        BizException ex = assertThrows(BizException.class, () -> guard().assertCanAccessPlan("s-5"));

        assertEquals(ErrorCode.UNAUTHORIZED, ex.getErrorCode());
    }
}

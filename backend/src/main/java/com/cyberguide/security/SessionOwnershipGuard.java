package com.cyberguide.security;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.model.PlanDay;
import com.cyberguide.repository.PlanDayRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Checks that the caller is entitled to the {@code session_id} they asked about.
 * <p>
 * The plan endpoints take a session id straight from the request body and were
 * reading and writing on that alone, so anyone holding a token could operate on
 * any session whose id they learned. Session ids are random UUIDs, so this was
 * not browsable, but "unguessable" is not the same as "authorized" -- an id that
 * leaks through a log, a shared link or a screenshot should not carry write
 * access with it.
 */
@Component
public class SessionOwnershipGuard {

    private final PlanDayRepository planDayRepository;

    public SessionOwnershipGuard(PlanDayRepository planDayRepository) {
        this.planDayRepository = planDayRepository;
    }

    /**
     * @param sessionId the session id named in the request
     * @throws BizException UNAUTHORIZED when there is no principal, FORBIDDEN when
     *                      the principal is not entitled to this session
     */
    public void assertCanAccessPlan(String sessionId) {
        AuthPrincipal principal = SecurityUtils.currentPrincipal()
                .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));

        if (principal.isAnonymous()) {
            // An anonymous token's subject IS the session id it was minted for,
            // so the check is an equality test with nothing to look up.
            if (!principal.id().equals(sessionId)) {
                throw new BizException(ErrorCode.FORBIDDEN);
            }
            return;
        }

        UUID userId = SecurityUtils.currentUserId()
                .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));

        // Rows are stamped with a user only once an anonymous session is upgraded
        // (AuthUpgradeService). Unclaimed rows stay reachable so that upgrading an
        // account does not strand the plan the person just made; what this refuses
        // is reaching into a session another account has already claimed.
        List<PlanDay> rows = planDayRepository.findBySessionIdOrderByDayIndexAsc(sessionId);
        boolean claimedByAnother = rows.stream()
                .anyMatch(row -> row.getUserId() != null && !row.getUserId().equals(userId));
        if (claimedByAnother) {
            throw new BizException(ErrorCode.FORBIDDEN);
        }
    }
}

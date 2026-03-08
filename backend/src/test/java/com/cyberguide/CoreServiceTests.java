package com.cyberguide;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

import com.cyberguide.service.ModerationService;
import com.cyberguide.service.RedactService;

class CoreServiceTests {

    @Test
    void crisisDetection_realCrisis() {
        var result = ModerationService.check("我想自杀");
        assertTrue(result.isCrisis());
        assertFalse(result.keywordsFound().isEmpty());
    }

    @Test
    void crisisDetection_falsePositive() {
        var result = ModerationService.check("热死了今天");
        assertFalse(result.isCrisis());
    }

    @Test
    void redaction_phone() {
        String redacted = RedactService.redact("我的手机号是13812345678");
        assertTrue(redacted.contains("[PHONE]"));
        assertFalse(redacted.contains("13812345678"));
    }

    @Test
    void redaction_email() {
        String redacted = RedactService.redact("邮箱是test@example.com");
        assertTrue(redacted.contains("[EMAIL]"));
    }
}

package com.cyberguide.service;

import java.util.regex.Pattern;

/**
 * PII redaction utility — mirrors the TypeScript redact.ts logic.
 */
public final class RedactService {

    private RedactService() {}

    private static final Pattern[] PATTERNS = {
        Pattern.compile("\\d{17}[\\dXx]"),                          // ID card 18
        Pattern.compile("\\d{16,19}"),                               // bank card
        Pattern.compile("(?<!\\d)\\d{15}(?!\\d)"),                   // ID card 15
        Pattern.compile("1[3-9]\\d{9}"),                             // phone
        Pattern.compile("[\\w.-]+@[\\w.-]+\\.\\w+", Pattern.CASE_INSENSITIVE), // email
        Pattern.compile("\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}"), // IP
    };

    private static final String[] REPLACEMENTS = {
        "[ID_CARD]", "[BANK_CARD]", "[ID_CARD]", "[PHONE]", "[EMAIL]", "[IP]"
    };

    public static String redact(String text) {
        if (text == null) return null;
        String result = text;
        for (int i = 0; i < PATTERNS.length; i++) {
            result = PATTERNS[i].matcher(result).replaceAll(REPLACEMENTS[i]);
        }
        return result;
    }
}

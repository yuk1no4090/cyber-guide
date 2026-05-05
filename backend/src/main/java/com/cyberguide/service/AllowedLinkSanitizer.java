package com.cyberguide.service;

import com.cyberguide.rag.RagService;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Removes hallucinated links from AI responses.
 *
 * Only URLs that were present in this turn's evidence are allowed to remain.
 */
public final class AllowedLinkSanitizer {

    private static final Pattern MARKDOWN_LINK = Pattern.compile("\\[([^\\]]+)]\\((https?://[^\\s)]+)\\)");
    private static final Pattern PLAIN_URL = Pattern.compile("(?<!\\()https?://[^\\s)）\\]}>\"']+");

    private AllowedLinkSanitizer() {}

    public static String sanitizeWithRetrievalResults(String text, List<RagService.RetrievalResult> results) {
        Set<String> allowed = new HashSet<>();
        if (results != null) {
            for (RagService.RetrievalResult result : results) {
                if (result != null && result.url() != null && !result.url().isBlank()) {
                    allowed.add(canonical(result.url()));
                }
            }
        }
        return sanitize(text, allowed);
    }

    public static String sanitizeWithEvidenceMaps(String text, List<Map<String, Object>> evidence, List<Map<String, Object>> similarCases) {
        Set<String> allowed = new HashSet<>();
        collectUrls(allowed, evidence);
        collectUrls(allowed, similarCases);
        return sanitize(text, allowed);
    }

    private static void collectUrls(Set<String> allowed, List<Map<String, Object>> items) {
        if (items == null) return;
        for (Map<String, Object> item : items) {
            Object url = item == null ? null : item.get("url");
            if (url instanceof String s && !s.isBlank()) {
                allowed.add(canonical(s));
            }
        }
    }

    private static String sanitize(String text, Set<String> allowed) {
        if (text == null || text.isBlank()) return "";

        Matcher markdown = MARKDOWN_LINK.matcher(text);
        StringBuffer markdownCleaned = new StringBuffer();
        while (markdown.find()) {
            String label = markdown.group(1);
            String url = markdown.group(2);
            String replacement = isAllowed(url, allowed) ? markdown.group(0) : label;
            markdown.appendReplacement(markdownCleaned, Matcher.quoteReplacement(replacement));
        }
        markdown.appendTail(markdownCleaned);

        Matcher plain = PLAIN_URL.matcher(markdownCleaned.toString());
        StringBuffer plainCleaned = new StringBuffer();
        while (plain.find()) {
            String url = plain.group();
            String replacement = isAllowed(url, allowed) ? url : "";
            plain.appendReplacement(plainCleaned, Matcher.quoteReplacement(replacement));
        }
        plain.appendTail(plainCleaned);

        String cleaned = plainCleaned.toString()
            .replaceAll("[ \\t]{2,}", " ")
            .replaceAll("\\n{3,}", "\n\n")
            .trim();
        if (cleaned.isBlank() && !text.isBlank()) {
            return PLAIN_URL.matcher(text).replaceAll("").trim();
        }
        return cleaned;
    }

    private static boolean isAllowed(String url, Set<String> allowed) {
        if (allowed.isEmpty()) return false;
        return allowed.contains(canonical(url));
    }

    private static String canonical(String url) {
        String s = url == null ? "" : url.trim();
        while (s.endsWith(".") || s.endsWith(",") || s.endsWith("，") || s.endsWith("。")
                || s.endsWith(";") || s.endsWith("；") || s.endsWith(":") || s.endsWith("：")
                || s.endsWith("!") || s.endsWith("！") || s.endsWith("?") || s.endsWith("？")) {
            s = s.substring(0, s.length() - 1);
        }
        while (s.endsWith("/") && s.length() > "https://x".length()) {
            s = s.substring(0, s.length() - 1);
        }
        return s;
    }
}

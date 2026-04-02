package com.cyberguide.rag;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

/**
 * Loads and resolves university/school data (tiers, aliases, rankings).
 */
@Component
public class UniversityResolver {

    private static final Logger log = LoggerFactory.getLogger(UniversityResolver.class);

    @Value("${rag.university-data-path:../knowledge_base/china_universities.json}")
    private String universityDataPath;

    private final Map<String, SchoolInfo> schoolInfoByName = new LinkedHashMap<>();
    private final Map<String, SchoolInfo> schoolInfoByAlias = new LinkedHashMap<>();

    public record SchoolInfo(
        String name,
        String tier,
        Integer rank,
        Integer qsRank,
        String region,
        List<String> aliases
    ) implements java.io.Serializable {}

    public enum SchoolTier { C9, T985, T211, SYL, YIBEN, ERBEN, UNKNOWN }

    private static final Map<String, String> FUZZY_SCHOOL_TIER_MAP = Map.ofEntries(
        Map.entry("华五", "C9"), Map.entry("top2", "C9"), Map.entry("清北", "C9"),
        Map.entry("双九", "C9"), Map.entry("中九", "C9"), Map.entry("末九", "985"),
        Map.entry("中9", "C9"),
        Map.entry("某985", "985"), Map.entry("末流985", "985"), Map.entry("中流985", "985"),
        Map.entry("末985", "985"), Map.entry("top985", "985"),
        Map.entry("某211", "211"), Map.entry("末流211", "211"), Map.entry("中流211", "211"),
        Map.entry("双非一本", "双非"), Map.entry("双非本科", "双非"), Map.entry("双非本", "双非"),
        Map.entry("普通双非", "双非"), Map.entry("某双非", "双非"),
        Map.entry("四非", "双非"), Map.entry("四非院校", "双非"),
        Map.entry("普通一本", "普通一本"), Map.entry("省属一本", "普通一本"),
        Map.entry("二本", "二本"), Map.entry("某二本", "二本"), Map.entry("普通二本", "二本")
    );

    @PostConstruct
    public void loadUniversityData() {
        Path path = Paths.get(universityDataPath);
        if (!Files.isRegularFile(path)) {
            log.warn("University data file not found: {}", path.toAbsolutePath());
            return;
        }
        try {
            String json = Files.readString(path);
            var mapper = new ObjectMapper();
            Map<String, Object> data = mapper.readValue(json, new TypeReference<>() {});
            schoolInfoByName.clear();
            schoolInfoByAlias.clear();
            loadSchoolObjectList(data, "domestic");
            loadSchoolObjectList(data, "international");

            // Backward compatibility with old tier-array format.
            loadTierList(data, "c9", "C9");
            loadTierList(data, "985", "985");
            loadTierList(data, "211_non985", "211");
            loadTierList(data, "syl_discipline_new", "双一流学科");
            loadTierList(data, "known_strong_shuangfei", "双非强校");
        } catch (Exception e) {
            log.error("Failed to load university tiers", e);
        }
        log.info("Loaded {} school mappings (name={}, alias={})",
            schoolInfoByName.size() + schoolInfoByAlias.size(),
            schoolInfoByName.size(),
            schoolInfoByAlias.size());
    }

    public String resolveSchoolTier(String school) {
        SchoolInfo info = resolveSchool(school);
        return info == null || info.tier() == null || info.tier().isBlank() ? "普通院校" : info.tier();
    }

    public SchoolInfo resolveSchool(String school) {
        if (school == null || school.isBlank()) return null;
        String key = normalizeSchoolKey(school);
        SchoolInfo exact = schoolInfoByName.get(key);
        if (exact != null) return exact;
        SchoolInfo alias = schoolInfoByAlias.get(key);
        if (alias != null) return alias;

        for (Map.Entry<String, SchoolInfo> e : schoolInfoByName.entrySet()) {
            if (key.contains(e.getKey()) || e.getKey().contains(key)) {
                return e.getValue();
            }
        }
        for (Map.Entry<String, SchoolInfo> e : schoolInfoByAlias.entrySet()) {
            if (key.contains(e.getKey()) || e.getKey().contains(key)) {
                return e.getValue();
            }
        }
        return null;
    }

    public String resolveFuzzySchoolTier(String schoolDescription) {
        if (schoolDescription == null || schoolDescription.isBlank()) return null;
        String key = schoolDescription.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
        for (Map.Entry<String, String> e : FUZZY_SCHOOL_TIER_MAP.entrySet()) {
            if (key.equals(e.getKey()) || key.startsWith(e.getKey())) {
                return e.getValue();
            }
        }
        if (key.contains("985")) return "985";
        if (key.contains("211")) return "211";
        if (key.contains("双非") || key.contains("四非") || key.contains("非985") || key.contains("非211")) return "双非";
        if (key.contains("一本")) return "普通一本";
        if (key.contains("二本")) return "二本";
        if (key.contains("c9")) return "C9";
        return null;
    }

    public int tierLevel(String tier) {
        String t = tier == null ? "" : tier.toLowerCase(Locale.ROOT);
        if (t.contains("c9")) return 0;
        if (t.contains("985")) return 1;
        if (t.contains("211")) return 2;
        if (t.contains("双一流")) return 3;
        if (t.contains("双非") || t.contains("一本")) return 4;
        if (t.contains("二本")) return 5;
        return 6;
    }

    // ─── Internal helpers ───

    private void loadTierList(Map<String, Object> data, String key, String tier) {
        Object val = data.get(key);
        if (val instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof String name) {
                    SchoolInfo info = new SchoolInfo(name, tier, null, null, "CN", List.of());
                    registerSchoolInfo(info);
                }
            }
        }
    }

    private void loadSchoolObjectList(Map<String, Object> data, String key) {
        Object val = data.get(key);
        if (!(val instanceof List<?> list)) return;
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> row)) continue;
            String name = asString(row.get("name"));
            if (name == null || name.isBlank()) continue;
            String tier = asString(row.get("tier"));
            Integer rank = asInt(row.get("rank"));
            Integer qsRank = asInt(row.get("qs_rank"));
            String region = Optional.ofNullable(asString(row.get("region"))).orElse("CN");
            List<String> aliases = asStringList(row.get("aliases"));
            SchoolInfo info = new SchoolInfo(name, tier, rank, qsRank, region, aliases);
            registerSchoolInfo(info);
        }
    }

    private void registerSchoolInfo(SchoolInfo info) {
        if (info == null || info.name() == null || info.name().isBlank()) return;
        String nameKey = normalizeSchoolKey(info.name());
        schoolInfoByName.putIfAbsent(nameKey, info);
        if (info.aliases() != null) {
            for (String alias : info.aliases()) {
                if (alias == null || alias.isBlank()) continue;
                schoolInfoByAlias.putIfAbsent(normalizeSchoolKey(alias), info);
            }
        }
    }

    private String normalizeSchoolKey(String raw) {
        return raw == null ? "" : raw.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    private String asString(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }

    private Integer asInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (Exception ignored) {
            return null;
        }
    }

    private List<String> asStringList(Object v) {
        if (!(v instanceof List<?> list)) return List.of();
        List<String> result = new ArrayList<>();
        for (Object item : list) {
            if (item != null) {
                String s = String.valueOf(item).trim();
                if (!s.isBlank()) result.add(s);
            }
        }
        return result;
    }
}

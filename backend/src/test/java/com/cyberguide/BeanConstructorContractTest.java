package com.cyberguide;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Controller;
import org.springframework.stereotype.Repository;
import org.springframework.stereotype.Service;

import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards a failure mode that compiles, passes every other test, and then refuses
 * to start.
 * <p>
 * Spring injects through the sole constructor only while there is exactly one.
 * Add a second (a convenience overload for tests, say) and it stops guessing,
 * looks for a no-arg constructor, finds none, and the whole context dies at
 * boot. Nothing else here catches that: the controller slices mock these beans,
 * and the unit tests call the constructors directly.
 */
class BeanConstructorContractTest {

    @Test
    void everyBeanWithSeveralConstructorsNamesTheOneSpringShouldUse() {
        var scanner = new ClassPathScanningCandidateComponentProvider(false);
        for (var stereotype : List.of(Component.class, Service.class, Repository.class, Controller.class)) {
            scanner.addIncludeFilter(new AnnotationTypeFilter(stereotype));
        }

        List<String> offenders = new ArrayList<>();
        for (var candidate : scanner.findCandidateComponents("com.cyberguide")) {
            String name = candidate.getBeanClassName();
            if (name == null) continue;
            Class<?> type;
            try {
                type = Class.forName(name);
            } catch (Throwable e) {
                continue;
            }
            if (type.isInterface()) continue;

            Constructor<?>[] constructors = type.getDeclaredConstructors();
            if (constructors.length <= 1) continue;

            long marked = Arrays.stream(constructors)
                    .filter(c -> c.isAnnotationPresent(Autowired.class))
                    .count();
            boolean hasNoArg = Arrays.stream(constructors).anyMatch(c -> c.getParameterCount() == 0);

            if (marked != 1 && !hasNoArg) {
                offenders.add(name + " has " + constructors.length
                        + " constructors, none marked @Autowired and no no-arg fallback");
            }
        }

        assertTrue(offenders.isEmpty(),
                "These beans would fail context startup:\n  " + String.join("\n  ", offenders));
    }
}

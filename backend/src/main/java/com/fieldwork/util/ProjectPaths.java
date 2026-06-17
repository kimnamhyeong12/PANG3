package com.fieldwork.util;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public final class ProjectPaths {

    private ProjectPaths() {
    }

    public static Path resolve(String path) {
        Path configured = Paths.get(path);
        if (configured.isAbsolute()) {
            return configured.normalize();
        }

        Path currentRelative = configured.toAbsolutePath().normalize();
        if (Files.exists(currentRelative)) {
            return currentRelative;
        }

        return projectRoot().resolve(configured).normalize();
    }

    public static Path projectRoot() {
        Path current = Paths.get("").toAbsolutePath().normalize();
        Path cursor = current;

        while (cursor != null) {
            if (Files.isRegularFile(cursor.resolve("ai/app.py"))
                    && Files.isDirectory(cursor.resolve("backend"))) {
                return cursor;
            }
            cursor = cursor.getParent();
        }

        Path parent = current.getParent();
        if (parent != null && Files.isRegularFile(parent.resolve("ai/app.py"))) {
            return parent;
        }

        return current;
    }
}

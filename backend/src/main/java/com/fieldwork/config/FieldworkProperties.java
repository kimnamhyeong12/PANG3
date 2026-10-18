package com.fieldwork.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "fieldwork")
public class FieldworkProperties {

    private final Upload upload = new Upload();
    private final Ai ai = new Ai();

    public Upload getUpload() {
        return upload;
    }

    public Ai getAi() {
        return ai;
    }

    public static class Upload {
        private String baseDir = "./ai/uploads";
        private long maxFileBytes = 15L * 1024 * 1024;
        private long maxPixels = 24000000;
        private long maxTaskBytes = 256L * 1024 * 1024;
        private long maxUserBytes = 1024L * 1024 * 1024;
        private long maxTotalBytes = 5L * 1024 * 1024 * 1024;
        public long getMaxFileBytes() { return maxFileBytes; }
        public void setMaxFileBytes(long value) { maxFileBytes = value; }
        public long getMaxPixels() { return maxPixels; }
        public void setMaxPixels(long value) { maxPixels = value; }
        public long getMaxTaskBytes() { return maxTaskBytes; }
        public void setMaxTaskBytes(long value) { maxTaskBytes = value; }
        public long getMaxUserBytes() { return maxUserBytes; }
        public void setMaxUserBytes(long value) { maxUserBytes = value; }
        public long getMaxTotalBytes() { return maxTotalBytes; }
        public void setMaxTotalBytes(long value) { maxTotalBytes = value; }

        public String getBaseDir() {
            return baseDir;
        }

        public void setBaseDir(String baseDir) {
            this.baseDir = baseDir;
        }
    }

    public static class Ai {
        private int maxConcurrent = 2;
        private int queueSize = 8;
        public int getMaxConcurrent() { return maxConcurrent; }
        public void setMaxConcurrent(int value) { maxConcurrent = value; }
        public int getQueueSize() { return queueSize; }
        public void setQueueSize(int value) { queueSize = value; }
        private String pythonPath = "./ai/venv/bin/python";
        private String scriptPath = "./ai/app.py";
        private String outputDir = "./ai/output";

        public String getPythonPath() {
            return pythonPath;
        }

        public void setPythonPath(String pythonPath) {
            this.pythonPath = pythonPath;
        }

        public String getScriptPath() {
            return scriptPath;
        }

        public void setScriptPath(String scriptPath) {
            this.scriptPath = scriptPath;
        }

        public String getOutputDir() {
            return outputDir;
        }

        public void setOutputDir(String outputDir) {
            this.outputDir = outputDir;
        }
    }
}

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

        public String getBaseDir() {
            return baseDir;
        }

        public void setBaseDir(String baseDir) {
            this.baseDir = baseDir;
        }
    }

    public static class Ai {
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

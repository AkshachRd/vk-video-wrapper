plugins {
    `kotlin-dsl`
}

gradlePlugin {
    plugins {
        create("pluginsForCoolKids") {
            id = "rust"
            implementationClass = "RustPlugin"
        }
    }
}

repositories {
    google()
    mavenCentral()
}

dependencies {
    compileOnly(gradleApi())
    implementation("com.android.tools.build:gradle:8.11.0")
}

// kotlin-dsl по умолчанию компилирует buildSrc под Java 8 toolchain; на этой машине
// Java 8 есть только как JRE (без javac), а единственный JDK — JBR 21. Компилируем
// buildSrc текущим JDK (JBR). Переприменить после `tauri android init`.
// См. docs/llm/android-build.md (Blocker 2).
java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}


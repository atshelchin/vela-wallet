plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// Repo root (this module lives at <repo>/app-android/vela-wallet/app).
val velaRepoRoot: File = rootDir.parentFile.parentFile

android {
    namespace = "app.getvela.wallet"
    // Plain compileSdk 36: the scaffold's `release(36) { minorApiLevel = 1 }` makes
    // PackageManager fail to resolve ANY activity in the APK on real devices/emulators
    // ("Error type 3: Activity class does not exist", START_CLASS_NOT_FOUND) — verified
    // empirically 2026-08-01 on API 34 emulator; same symptom on a physical device with
    // the sibling 009 scaffold. SDK-minor targeting has no consumer in this app.
    compileSdk = 36

    defaultConfig {
        applicationId = "app.getvela.wallet"
        minSdk = 31
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Only the ABIs rust/scripts/build-android.sh produces — prunes the extra
        // legacy ABIs (mips, x86, armeabi) the JNA aar would otherwise package.
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
    }

    buildTypes {
        release {
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
    }

    sourceSets {
        getByName("main") {
            // Generated uniffi Kotlin bindings are consumed in place (spec 008 FR-009 / research D1):
            // single committed copy, regenerated only via rust/scripts/smoke-kotlin.sh.
            kotlin.srcDir(velaRepoRoot.resolve("rust/bindings/kotlin"))
            // Locale catalogs are synced from the generated public/i18n at build time (research D3).
            // Static File (not Provider): AGP 9 disallows Providers here; the task
            // dependency is carried by the merge*Assets wiring below.
            assets.srcDir(projectDir.resolve("build/generated/velaI18n"))
        }
    }

    testOptions {
        unitTests.all { test ->
            // JVM engine tests load the host-platform dylib through JNA (research D14).
            test.systemProperty("jna.library.path", velaRepoRoot.resolve("rust/target/release").absolutePath)
            test.systemProperty("vela.repo.root", velaRepoRoot.absolutePath)
            // The system properties above are just path STRINGS to Gradle — declare the
            // files behind them as tracked inputs, or the drift/engine tests go
            // stale-green (UP-TO-DATE) exactly when the guarded files change.
            test.inputs.file(velaRepoRoot.resolve("docs/design-tokens.json"))
                .withPathSensitivity(PathSensitivity.NONE)
                .withPropertyName("velaDesignTokens")
            test.inputs.dir(velaRepoRoot.resolve("public/i18n"))
                .withPathSensitivity(PathSensitivity.RELATIVE)
                .withPropertyName("velaI18nCatalogs")
            test.inputs.file(
                velaRepoRoot.resolve("rust/target/release/${System.mapLibraryName("vela_core_uniffi")}"),
            )
                .withPathSensitivity(PathSensitivity.NONE)
                .withPropertyName("velaHostEngineLib")
        }
    }
}

// Evaluated at configuration time (configuration-cache safe).
val velaSkipRustBuild: Boolean = providers.gradleProperty("velaSkipRustBuild").isPresent

val cargoNdkBuild = tasks.register<Exec>("cargoNdkBuild") {
    description = "Cross-compiles libvela_core_uniffi.so for all packaged ABIs (research D2)."
    workingDir = velaRepoRoot
    commandLine("bash", velaRepoRoot.resolve("rust/scripts/build-android.sh").absolutePath)
    enabled = !velaSkipRustBuild
}

val syncVelaI18nAssets = tasks.register<Sync>("syncVelaI18nAssets") {
    description = "Copies generated locale catalogs (public/i18n) into build assets (research D3)."
    from(velaRepoRoot.resolve("public/i18n")) {
        include("*.json")
    }
    into(layout.buildDirectory.dir("generated/velaI18n/i18n"))
}

val rustHostLib = tasks.register<Exec>("rustHostLib") {
    description = "Builds the host-platform vela-core-uniffi dylib for JVM unit tests (research D14)."
    workingDir = velaRepoRoot.resolve("rust")
    commandLine("cargo", "build", "--release", "-p", "vela-core-uniffi")
    enabled = !velaSkipRustBuild
}

tasks.named("preBuild") {
    dependsOn(cargoNdkBuild, syncVelaI18nAssets)
}
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach {
    dependsOn(syncVelaI18nAssets)
}
tasks.withType<Test>().configureEach {
    dependsOn(rustHostLib)
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    // Used directly (StateFlow, launch) — do not rely on lifecycle's transitive edge.
    implementation(libs.kotlinx.coroutines.android)
    // JNA: Android needs the aar (bundled libjnidispatch.so per ABI); JVM tests use the plain jar.
    implementation(libs.jna) {
        artifact {
            type = "aar"
        }
    }
    testImplementation(libs.junit)
    testImplementation(libs.jna)
    testImplementation(libs.org.json)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}

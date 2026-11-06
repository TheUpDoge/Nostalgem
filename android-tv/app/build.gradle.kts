import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The web app in ../../web is the whole TV. This copies it into the APK as assets/www, so the app
// starts with no network at all; only the programs themselves stream from archive.org.
abstract class CopyWebApp : DefaultTask() {
    @get:InputDirectory
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val webDir: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val out = outputDir.get().asFile
        out.deleteRecursively()
        webDir.get().asFile.copyRecursively(File(out, "www"), overwrite = true)
    }
}

val copyWebApp = tasks.register<CopyWebApp>("copyWebApp") {
    webDir.set(rootProject.layout.projectDirectory.dir("../web"))
}

val runNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1

android {
    namespace = "io.github.theupdoge.nostalgem"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.theupdoge.nostalgem"
        minSdk = 23
        targetSdk = 35
        versionCode = runNumber
        versionName = "1.0.$runNumber"
    }

    // A key kept in the repo so every build can install over the last one. It's for sideloading
    // onto your own TV only; a Play Store release would need a private key.
    signingConfigs {
        create("sideload") {
            storeFile = rootProject.file("keystore/sideload.jks")
            storeType = "pkcs12"
            storePassword = "nostalgem"
            keyAlias = "sideload"
            keyPassword = "nostalgem"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("sideload")
        }
        debug {
            signingConfig = signingConfigs.getByName("sideload")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    lint {
        // A sideloaded TV app isn't bound by Play's target-SDK deadlines.
        disable += "ExpiredTargetSdkVersion"
        abortOnError = false
        checkReleaseBuilds = false
    }
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyWebApp, CopyWebApp::outputDir)
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}

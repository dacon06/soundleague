import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
}

// Auf GitHub zählt die Versionsnummer bei jedem Bau hoch → Obtainium erkennt Updates
val buildNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
val releaseKeystore = file("release.keystore")
val youtubeKey = System.getenv("YOUTUBE_API_KEY") ?: ""

android {
    namespace = "app.soundleague"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.soundleague"
        minSdk = 26
        targetSdk = 36
        versionCode = buildNumber
        versionName = "2.0.$buildNumber"
        buildConfigField("String", "YOUTUBE_API_KEY", "\"$youtubeKey\"")
        // Die Website: liefert den YouTube-Player und die Push-Endpunkte
        buildConfigField("String", "WEB_BASE", "\"https://soundleague.vercel.app\"")
    }

    signingConfigs {
        create("release") {
            // Der Schlüssel kommt aus den GitHub-Secrets und liegt nie im Repository
            if (releaseKeystore.exists()) {
                storeFile = releaseKeystore
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (releaseKeystore.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.core:core-ktx:1.15.0")

    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-messaging")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")

    implementation("io.coil-kt:coil-compose:2.7.0")
}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.safe1210.shop"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.safe1210.shop"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }
}

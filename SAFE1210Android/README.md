# SAFE1210 Mobile Projects

This folder contains source projects for opening the SAFE1210 online store on Android and iOS. Both apps display the existing `https://safe1210.com/` website in the platform WebView; neither implements a separate store backend or SAFE device-control SDK.

## Android

Open this folder in Android Studio with Android SDK Platform 35 and JDK 17 installed. Sync Gradle, then run the `app` configuration or use **Build > Build APK(s)**. The APK is generated under `app/build/outputs/apk/debug/`.

## iOS

Open `SAFE1210iOS/SAFE1210iOS.xcodeproj` in Xcode on macOS. Select the shared `SAFE1210` scheme and an iPhone simulator or connected iPhone, then press **Run**. To install on a physical device, choose a signing Team in the target's **Signing & Capabilities** settings.

The current development environment is Windows and does not include Android Studio, Android SDK, Java, Gradle, Xcode, or `xcodebuild`. The project sources and Xcode scheme are provided, but native builds and simulator/device runs must be performed on machines with the relevant platform tools installed.

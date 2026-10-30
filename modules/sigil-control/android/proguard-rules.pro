# Release builds run R8 (Expo sets android.enableMinifyInReleaseBuilds=true).
# MediaPipe Tasks reads its protocol buffer messages by field name (protobuf
# lite) and its native code calls back into Java by name, so R8 must leave both
# as they are. Without this the hand tracker cannot start in a release build:
# "Field platform_ for ... not found".
-keep class com.google.mediapipe.** { *; }
-keep class com.google.protobuf.** { *; }
-dontwarn com.google.mediapipe.**
-dontwarn com.google.protobuf.**

# MediaPipe logs through Flogger, which finds its backend by class name
# (DefaultPlatform and the system backend). R8 removed them as unused, so the
# static initializer of MediaPipe's Graph failed: ExceptionInInitializerError.
-keep class com.google.common.flogger.** { *; }
-dontwarn com.google.common.flogger.**

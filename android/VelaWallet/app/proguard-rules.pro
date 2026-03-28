# Vela Wallet ProGuard Rules

# Keep serialization model classes (used for JSON parsing)
-keep class app.getvela.wallet.service.ApiToken { *; }
-keep class app.getvela.wallet.service.ApiNft { *; }
-keep class app.getvela.wallet.service.WalletResponse { *; }
-keep class app.getvela.wallet.service.NftResponse { *; }
-keep class app.getvela.wallet.service.ExchangeRateResponse { *; }
-keep class app.getvela.wallet.service.LocalStorage$* { *; }
-keep class app.getvela.wallet.service.PublicKeyIndexService$* { *; }

# Keep model classes
-keep class app.getvela.wallet.model.** { *; }

# Kotlinx serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class app.getvela.wallet.**$$serializer { *; }
-keepclassmembers class app.getvela.wallet.** {
    *** Companion;
}
-keepclasseswithmembers class app.getvela.wallet.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

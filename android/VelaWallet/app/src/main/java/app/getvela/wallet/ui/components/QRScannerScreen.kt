package app.getvela.wallet.ui.components

import android.Manifest
import android.content.pm.PackageManager
import android.util.Size
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.getvela.wallet.ui.theme.VelaColor
import com.google.zxing.*
import com.google.zxing.common.HybridBinarizer
import java.util.concurrent.Executors

@Composable
fun QRScannerScreen(
    onScanned: (String) -> Unit,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var hasCameraPermission by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        if (hasCameraPermission) {
            var hasScanned by remember { mutableStateOf(false) }

            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    val previewView = PreviewView(ctx)
                    val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                    val executor = Executors.newSingleThreadExecutor()

                    cameraProviderFuture.addListener({
                        val cameraProvider = cameraProviderFuture.get()
                        val preview = Preview.Builder().build().also {
                            it.surfaceProvider = previewView.surfaceProvider
                        }

                        val imageAnalysis = ImageAnalysis.Builder()
                            .setTargetResolution(Size(1280, 720))
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()

                        imageAnalysis.setAnalyzer(executor) { imageProxy ->
                            if (hasScanned) {
                                imageProxy.close()
                                return@setAnalyzer
                            }

                            val buffer = imageProxy.planes[0].buffer
                            val bytes = ByteArray(buffer.remaining())
                            buffer.get(bytes)

                            val source = PlanarYUVLuminanceSource(
                                bytes, imageProxy.width, imageProxy.height,
                                0, 0, imageProxy.width, imageProxy.height, false,
                            )
                            val binaryBitmap = BinaryBitmap(HybridBinarizer(source))

                            try {
                                val result = MultiFormatReader().apply {
                                    setHints(mapOf(DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE)))
                                }.decode(binaryBitmap)

                                hasScanned = true
                                val text = result.text
                                previewView.post { onScanned(text) }
                            } catch (_: NotFoundException) {
                                // No QR code found in this frame
                            }
                            imageProxy.close()
                        }

                        try {
                            cameraProvider.unbindAll()
                            cameraProvider.bindToLifecycle(
                                lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA,
                                preview, imageAnalysis,
                            )
                        } catch (_: Exception) {}
                    }, ContextCompat.getMainExecutor(ctx))

                    previewView
                },
            )

            // Scan overlay
            Canvas(modifier = Modifier.fillMaxSize()) {
                val scanSize = 250.dp.toPx()
                val left = (size.width - scanSize) / 2
                val top = (size.height - scanSize) / 2 - 40.dp.toPx()

                // Dark overlay
                drawRect(Color.Black.copy(alpha = 0.5f))
                // Clear scan area
                drawRect(
                    Color.Transparent,
                    topLeft = Offset(left, top),
                    size = androidx.compose.ui.geometry.Size(scanSize, scanSize),
                    blendMode = BlendMode.Clear,
                )

                // Corner brackets
                val bracketLen = 30.dp.toPx()
                val bracketWidth = 3.dp.toPx()
                val accentColor = VelaColor.accent

                val corners = listOf(
                    Triple(Offset(left, top + bracketLen), Offset(left, top), Offset(left + bracketLen, top)),
                    Triple(Offset(left + scanSize - bracketLen, top), Offset(left + scanSize, top), Offset(left + scanSize, top + bracketLen)),
                    Triple(Offset(left + scanSize, top + scanSize - bracketLen), Offset(left + scanSize, top + scanSize), Offset(left + scanSize - bracketLen, top + scanSize)),
                    Triple(Offset(left + bracketLen, top + scanSize), Offset(left, top + scanSize), Offset(left, top + scanSize - bracketLen)),
                )
                corners.forEach { (start, corner, end) ->
                    drawLine(accentColor, start, corner, bracketWidth, StrokeCap.Round)
                    drawLine(accentColor, corner, end, bracketWidth, StrokeCap.Round)
                }
            }
        } else {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Camera access required", color = Color.White)
            }
        }

        // Close button
        IconButton(
            onClick = onClose,
            modifier = Modifier
                .padding(top = 48.dp, start = 20.dp)
                .size(36.dp)
                .background(Color.Black.copy(alpha = 0.4f), CircleShape),
        ) {
            Icon(Icons.Default.Close, "Close", tint = Color.White)
        }
    }
}

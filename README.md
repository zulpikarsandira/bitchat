# BitChat — Go Core Engine

Paket Go inti (`chatengine`) untuk aplikasi chat offline BitChat berbasis BLE.

## Struktur Proyek

```
bitchat/
├── go.mod
└── chatengine/
    ├── engine.go        ← Kode utama
    └── engine_test.go   ← Unit tests
```

## Fungsi-Fungsi Utama

| Fungsi | Keterangan |
|--------|-----------|
| `Encrypt(text, secret)` | Enkripsi AES-256-GCM → base64 string |
| `Decrypt(b64, secret)` | Dekripsi → plaintext string |
| `CreatePacket(text, secret, type)` | Buat JSON Packet terenkripsi |
| `ParsePacket(json, secret)` | Dekripsi & validasi Packet |
| `GetPacketType(json)` | Baca tipe packet tanpa dekripsi |
| `VerifyChecksum(json, secret)` | Verifikasi integritas data |
| `SliceData(data)` | Fragmentasi → JSON array 20-byte chunks |
| `ReassembleData(chunksJSON)` | Rekonstruksi dari chunks |
| `SliceAndEncryptPacket(text, secret, type)` | Helper: enkripsi + fragmentasi |
| `ReassembleAndDecryptPacket(chunksJSON, secret)` | Helper: reassemble + dekripsi |
| `DeriveKey(secret)` | SHA-256 → 32-byte AES key |
| `Version()` | Versi library |

## PacketType Constants

```
PacketTypeMessage   = "MESSAGE"
PacketTypeFile      = "FILE"
PacketTypeHandshake = "HANDSHAKE"
```

## Menjalankan Tests

```bash
cd /home/zulpikar/Documents/bitchat
go test ./chatengine/... -v
```

## Build AAR untuk Android (Gomobile)

```bash
# Install Gomobile (sekali saja)
go install golang.org/x/mobile/cmd/gomobile@latest
gomobile init

# Generate AAR
cd /home/zulpikar/Documents/bitchat
gomobile bind \
  -target=android \
  -javapkg=com.bitchat.engine \
  -o chatengine.aar \
  ./chatengine/
```

## Integrasi React Native

### 1. Salin AAR

```
YourReactNativeApp/android/app/libs/
├── chatengine.aar
└── chatengine-sources.jar
```

### 2. `android/app/build.gradle`

```groovy
repositories {
    flatDir { dirs 'libs' }
}

dependencies {
    implementation(name: 'chatengine', ext: 'aar')
}
```

### 3. Native Module Java

```java
// android/app/src/main/java/com/yourapp/ChatEngineModule.java
package com.yourapp;

import com.facebook.react.bridge.*;
import chatengine.Chatengine;

public class ChatEngineModule extends ReactContextBaseJavaModule {
    ChatEngineModule(ReactApplicationContext context) { super(context); }

    @Override public String getName() { return "ChatEngine"; }

    @ReactMethod
    public void encrypt(String text, String secret, Promise promise) {
        promise.resolve(Chatengine.encrypt(text, secret));
    }

    @ReactMethod
    public void decrypt(String ciphertext, String secret, Promise promise) {
        promise.resolve(Chatengine.decrypt(ciphertext, secret));
    }

    @ReactMethod
    public void createPacket(String text, String secret, String type, Promise promise) {
        promise.resolve(Chatengine.createPacket(text, secret, type));
    }

    @ReactMethod
    public void parsePacket(String json, String secret, Promise promise) {
        promise.resolve(Chatengine.parsePacket(json, secret));
    }

    @ReactMethod
    public void sliceData(String data, Promise promise) {
        promise.resolve(Chatengine.sliceData(data));
    }

    @ReactMethod
    public void reassembleData(String chunksJSON, Promise promise) {
        promise.resolve(Chatengine.reassembleData(chunksJSON));
    }
}
```

### 4. Daftarkan Module di `MainApplication.java`

```java
@Override
protected List<ReactPackage> getPackages() {
    return Arrays.<ReactPackage>asList(
        new MainReactPackage(),
        new ChatEnginePackage()   // ← tambahkan ini
    );
}
```

### 5. Panggil dari JavaScript

```javascript
import { NativeModules } from 'react-native';
const { ChatEngine } = NativeModules;

// Enkripsi pesan
const encrypted = await ChatEngine.encrypt("Halo!", "shared-secret");

// Dekripsi pesan
const decrypted = await ChatEngine.decrypt(encrypted, "shared-secret");

// Kirim via BLE (fragmentasi)
const chunks = await ChatEngine.sliceData(encrypted);
// → kirim chunk per chunk via BLE write characteristic

// Terima dari BLE (reassemble)
const full = await ChatEngine.reassembleData(receivedChunksJSON);
const message = await ChatEngine.parsePacket(full, "shared-secret");
```

## Notes

- Shared secret saat ini adalah placeholder statis. Phase 2 akan mengimplementasikan ECDH key exchange via BLE Handshake packet.
- Error selalu dikembalikan sebagai string dengan prefix `"ERROR:"` untuk kompatibilitas Gomobile.

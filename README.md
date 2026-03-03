# BitChat — Secure Offline Messaging

**BitChat** adalah aplikasi pengiriman pesan revolusioner yang bekerja sepenuhnya secara **offline**. Menggunakan teknologi Bluetooth Low Energy (BLE), BitChat memungkinkan pengguna untuk berkomunikasi tanpa internet, tanpa kuota, dan tanpa ketergantungan pada server pusat.

---

## 🚀 Fitur Utama

- **Pesan Offline Terenkripsi**: Kirim dan terima pesan teks tanpa koneksi internet sama sekali.
- **Auto-Discovery**: HP akan otomatis mendeteksi perangkat lain di sekitar yang menjalankan BitChat.
- **Peer-to-Peer (P2P)**: Komunikasi langsung antar perangkat lewat sinyal radio Bluetooth.
- **Local History**: Semua pesan disimpan secara aman di perangkat lokal dalam format JSON terstruktur.
- **Low Energy Consumption**: Menggunakan BLE agar baterai tetap awet meskipun aplikasi aktif mencari teman di sekitar.

## 🛡️ Teknologi Keamanan (Military Grade)

Privasi adalah pondasi BitChat. Kami menggunakan kombinasi teknologi kriptografi modern:

- **AES-256-GCM**: Standar enkripsi tingkat militer untuk melindungi isi pesan. Setiap pesan memiliki *nonce* unik untuk mencegah serangan replay.
- **ECDH (Elliptic Curve Diffie-Hellman)**: Digunakan untuk pertukaran kunci secara aman lewat udara (*Key Exchange*) agar kunci rahasia tidak pernah dikirim secara langsung.
- **SHA-256 Checksum**: Setiap paket data divalidasi integritasnya menggunakan hash SHA-256 untuk memastikan data tidak rusak atau dimanipulasi saat transmisi.
- **No Metadata Privacy**: Karena tidak ada server pusat, data metadata Anda tidak pernah terpusat di satu tempat.

## 🛠️ Tech Stack

### Mobile Frontend
- **React Native (v0.72.6)**: Framework utama untuk antarmuka yang responsif.
- **React Native BLE Manager**: Untuk menangani *scanning* perangkat di sekitar.
- **Native Bridge (Java)**: Jembatan penghubung antara JavaScript dan core engine Go.

### Core Engine (The Brain)
- **Go (Golang)**: Digunakan untuk logika komputasi berat, enkripsi, dan manajemen paket data.
- **Gomobile**: Teknologi yang memungkinkan library Go di-*compile* menjadi file AAR Android untuk performa maksimal.

---

## 🏗️ Struktur Proyek

```
bitchat/
├── chatengine/         ← Core Logic (Go)
├── android/            ← Native Android Wrapper (Java)
├── src/
│   ├── screens/        ← UI & Logic (React Native)
│   └── bridge/         ← Native Modules Connectivity
└── README.md
```

## 🧪 Cara Pengujian

1. **Jalankan Build**: Build aplikasi ke dua perangkat Android berbeda (disarankan menggunakan APK versi Release).
2. **Aktifkan Bluetooth & Lokasi**: BitChat memerlukan kedua layanan ini untuk melihat perangkat di sekitar.
3. **Klik SCAN**: Satu HP menekan tombol SCAN, HP lainnya akan muncul di daftar.
4. **Mulai Chat**: Pesan akan terenkripsi di HP asal, dipecah menjadi fragmen-fragmen kecil, dikirim via Bluetooth, dan didekripsi kembali di HP tujuan.

---

## 📜 Lisensi & Versi
**Version**: `1.1.0 (BLE Advertising Update)`  
BitChat adalah proyek open-source untuk mendemonstrasikan kekuatan komunikasi P2P yang aman.

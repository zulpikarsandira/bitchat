import React from 'react';
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    SafeAreaView,
    StatusBar,
    ScrollView,
} from 'react-native';

const SettingsScreen = ({ onBack }) => {
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#111B21" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={onBack}>
                    <Text style={styles.backIcon}>←</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Setelan</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Keamanan & Enkripsi</Text>

                    <View style={styles.card}>
                        <Text style={styles.cardHeader}>End-to-End Encryption</Text>
                        <Text style={styles.cardText}>
                            Pesan Anda diamankan menggunakan protokol Diffie-Hellman (ECDH P-256). Kunci enkripsi dibuat secara lokal pada perangkat Anda dan tidak pernah dikirimkan melalui jaringan.
                        </Text>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.cardHeader}>Data Fragmentation</Text>
                        <Text style={styles.cardText}>
                            Data dipecah menjadi fragmen-fragmen kecil sebelum dikirim melalui Bluetooth Low Energy (BLE) untuk memastikan transmisi yang andal dan aman.
                        </Text>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.cardHeader}>Penyimpanan Lokal</Text>
                        <Text style={styles.cardText}>
                            Riwayat obrolan disimpan secara lokal dalam format terenkripsi pada perangkat Anda. Tidak ada data yang disimpan di server eksternal.
                        </Text>
                    </View>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>Locbit v1.0.0</Text>
                    <Text style={styles.footerText}>Privasi Anda adalah prioritas kami.</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0B141B',
    },
    header: {
        height: 60,
        backgroundColor: '#202C33',
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        elevation: 4,
    },
    backButton: {
        marginRight: 16,
        padding: 4,
    },
    backIcon: {
        color: '#E9EDEF',
        fontSize: 24,
    },
    headerTitle: {
        color: '#E9EDEF',
        fontSize: 20,
        fontWeight: 'bold',
    },
    content: {
        padding: 16,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        color: '#00A884',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 16,
        textTransform: 'uppercase',
    },
    card: {
        backgroundColor: '#202C33',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        elevation: 2,
    },
    cardHeader: {
        color: '#E9EDEF',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    cardText: {
        color: '#8696A0',
        fontSize: 14,
        lineHeight: 20,
    },
    footer: {
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 40,
    },
    footerText: {
        color: '#8696A0',
        fontSize: 12,
        marginBottom: 4,
    },
});

export default SettingsScreen;

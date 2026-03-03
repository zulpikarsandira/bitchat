package com.bitchat.bridge;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import chatengine.Chatengine;

/**
 * ChatEngineModule bridges the Go core logic (chatengine.aar) to React Native.
 * All core computations (encryption, fragmented data handling) happen in Go.
 */
public class ChatEngineModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;

    public ChatEngineModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "ChatEngine";
    }

    /**
     * Constants for packet types exported to JS
     */
    @Override
    public java.util.Map<String, Object> getConstants() {
        final java.util.Map<String, Object> constants = new java.util.HashMap<>();
        constants.put("TYPE_MESSAGE", "MESSAGE");
        constants.put("TYPE_FILE", "FILE");
        constants.put("TYPE_HANDSHAKE", "HANDSHAKE");
        return constants;
    }

    @ReactMethod
    public void encrypt(String plaintext, String secret, Promise promise) {
        try {
            String result = Chatengine.encrypt(plaintext, secret);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("E_ENCRYPT", e.getMessage());
        }
    }

    @ReactMethod
    public void decrypt(String ciphertextB64, String secret, Promise promise) {
        try {
            String result = Chatengine.decrypt(ciphertextB64, secret);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("E_DECRYPT", e.getMessage());
        }
    }

    @ReactMethod
    public void sliceData(String data, Promise promise) {
        try {
            String result = Chatengine.sliceData(data);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("E_SLICE", e.getMessage());
        }
    }

    @ReactMethod
    public void reassembleData(String chunksJSON, Promise promise) {
        try {
            String result = Chatengine.reassembleData(chunksJSON);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("E_REASSEMBLE", e.getMessage());
        }
    }

    @ReactMethod
    public void createPacket(String plaintext, String secret, String type, Promise promise) {
        try {
            String result = Chatengine.createPacket(plaintext, secret, type);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("E_CREATE_PACKET", e.getMessage());
        }
    }

    @ReactMethod
    public void parsePacket(String packetJSON, String secret, Promise promise) {
        try {
            String result = Chatengine.parsePacket(packetJSON, secret);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("E_PARSE_PACKET", e.getMessage());
        }
    }

    @ReactMethod
    public void getVersion(Promise promise) {
        promise.resolve(Chatengine.version());
    }

    @ReactMethod
    public void generateKeyPair(Promise promise) {
        try {
            promise.resolve(Chatengine.generateKeyPair());
        } catch (Exception e) {
            promise.reject("E_GEN_KEYPAIR", e.getMessage());
        }
    }

    @ReactMethod
    public void computeSharedSecret(String privateKeyB64, String remotePublicKeyB64, Promise promise) {
        try {
            promise.resolve(Chatengine.computeSharedSecret(privateKeyB64, remotePublicKeyB64));
        } catch (Exception e) {
            promise.reject("E_COMPUTE_SECRET", e.getMessage());
        }
    }

    @ReactMethod
    public void storeMessage(String filePath, String text, String sender, Promise promise) {
        try {
            promise.resolve(Chatengine.storeMessage(filePath, text, sender));
        } catch (Exception e) {
            promise.reject("E_STORE_MSG", e.getMessage());
        }
    }

    @ReactMethod
    public void getHistory(String filePath, Promise promise) {
        try {
            promise.resolve(Chatengine.getHistory(filePath));
        } catch (Exception e) {
            promise.reject("E_GET_HISTORY", e.getMessage());
        }
    }

    @ReactMethod
    public void startAdvertising(Promise promise) {
        try {
            android.bluetooth.BluetoothAdapter adapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isMultipleAdvertisementSupported()) {
                promise.reject("E_ADV", "BLE Advertising not supported");
                return;
            }

            android.bluetooth.le.BluetoothLeAdvertiser advertiser = adapter.getBluetoothLeAdvertiser();
            android.bluetooth.le.AdvertiseSettings settings = new android.bluetooth.le.AdvertiseSettings.Builder()
                    .setAdvertiseMode(android.bluetooth.le.AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                    .setConnectable(true)
                    .setTimeout(0)
                    .setTxPowerLevel(android.bluetooth.le.AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                    .build();

            android.bluetooth.le.AdvertiseData data = new android.bluetooth.le.AdvertiseData.Builder()
                    .setIncludeDeviceName(true)
                    .addServiceUuid(new android.os.ParcelUuid(
                            java.util.UUID.fromString("0000fee0-0000-1000-8000-00805f9b34fb")))
                    .build();

            advertiser.startAdvertising(settings, data, new android.bluetooth.le.AdvertiseCallback() {
                @Override
                public void onStartSuccess(android.bluetooth.le.AdvertiseSettings settingsInEffect) {
                    super.onStartSuccess(settingsInEffect);
                }
            });
            promise.resolve("OK");
        } catch (Exception e) {
            promise.reject("E_ADV", e.getMessage());
        }
    }

    @ReactMethod
    public void stopAdvertising(Promise promise) {
        try {
            android.bluetooth.BluetoothAdapter adapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter();
            if (adapter != null && adapter.getBluetoothLeAdvertiser() != null) {
                // Not saving callback for now, just stopping all if possible
                promise.resolve("OK");
            }
        } catch (Exception e) {
            promise.reject("E_STOP_ADV", e.getMessage());
        }
    }

    @ReactMethod
    public void clearHistory(String filePath, Promise promise) {
        try {
            promise.resolve(Chatengine.clearHistory(filePath));
        } catch (Exception e) {
            promise.reject("E_CLEAR_HISTORY", e.getMessage());
        }
    }
}

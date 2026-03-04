import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  NativeModules,
  NativeEventEmitter,
  RefreshControl,
  PermissionsAndroid,
  Alert,
} from 'react-native';
import BleManager from 'react-native-ble-manager';

const { ChatEngine } = NativeModules;
const chatEngineEmitter = new NativeEventEmitter(ChatEngine);
const bleManagerEmitter = new NativeEventEmitter(NativeModules.BleManager);

// Shared secret for Phase 1 (placeholder)
const SHARED_SECRET = 'bitchat-shared-secret-placeholder';

const SERVICE_UUID = 'fee0';
const CHARACTERISTIC_UUID = 'fee1';

const ChatScreen = ({ onNavigateToSettings }) => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('Offline'); // Scanning, Connecting, Connected, Offline
  const [devices, setDevices] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [receivedChunks, setReceivedChunks] = useState([]);
  const flatListRef = useRef(null);

  const HISTORY_PATH =
    Platform.OS === 'android'
      ? '/data/user/0/com.bitchat/files/chat_history.json'
      : 'history.json';

  useEffect(() => {
    loadHistory();

    // 1. Initialize BLE Manager
    BleManager.start({ showAlert: false });

    // 2. Request Android Permissions
    if (Platform.OS === 'android' && Platform.Version >= 23) {
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION).then(
        result => {
          if (!result) {
            PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
          }
        },
      );
      if (Platform.Version >= 31) {
        PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        ]).then(() => {
          ChatEngine.startAdvertising()
            .then(() => console.log('BLE Advertising started'))
            .catch(err => console.error('BLE Advertising failed:', err));
        });
      } else {
        ChatEngine.startAdvertising().catch(err =>
          console.log('Adv start skip or fail:', err),
        );
      }
    }

    // 3. Setup BLE Event Listeners
    const handlerDiscover = bleManagerEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      handleDiscoverPeripheral,
    );

    const handlerStop = bleManagerEmitter.addListener('BleManagerStopScan', () => {
      console.log('Scan stopped');
      setStatus(prev => (prev === 'Scanning' ? 'Offline' : prev));
    });

    const handlerData = chatEngineEmitter.addListener('onDataReceived', data => {
      console.log('Data received via GATT:', data);
      handleIncomingChunk(data);
    });

    const handlerDisconnect = bleManagerEmitter.addListener(
      'BleManagerDisconnectPeripheral',
      () => {
        console.log('Disconnected');
        setStatus('Offline');
        setDevices([]);
      },
    );

    // Initial dummy data
    setMessages([
      { id: '1', text: 'Halo! Selamat datang di Locbit.', sender: 'them', time: '00:00' },
      { id: '2', text: 'Tekan "SCAN" di atas untuk mencari teman chat.', sender: 'them', time: '00:01' },
    ]);

    return () => {
      ChatEngine.stopAdvertising().catch(() => { });
      handlerDiscover.remove();
      handlerStop.remove();
      handlerData.remove();
      handlerDisconnect.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHistory = async () => {
    try {
      const historyStr = await ChatEngine.getHistory(HISTORY_PATH);
      const history = JSON.parse(historyStr);
      if (history && history.length > 0) {
        const mapped = history.map(m => ({
          id: m.id,
          text: m.text,
          sender: m.sender,
          time: new Date(m.timestamp * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        }));
        setMessages(mapped);
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  };

  // Handles a raw chunk arriving from GATT – accumulates until we have a full JSON packet
  const handleIncomingChunk = chunk => {
    setReceivedChunks(prev => {
      const newChunks = [...prev, chunk];
      const fullString = newChunks.join('');
      if (fullString.endsWith('}')) {
        handleIncomingBluetoothData(JSON.stringify(newChunks));
        return [];
      }
      return newChunks;
    });
  };

  // Auto-connect when a peer advertising our service is discovered
  const handleDiscoverPeripheral = peripheral => {
    if (!peripheral || !peripheral.advertising || !peripheral.advertising.serviceUUIDs) {
      return;
    }
    const serviceUUIDs = peripheral.advertising.serviceUUIDs.map(u => u.toLowerCase());
    if (serviceUUIDs.includes(SERVICE_UUID)) {
      console.log('Found Locbit peer:', peripheral.name, peripheral.id);
      setStatus(current => {
        if (current !== 'Connected' && current !== 'Connecting') {
          connectToDevice(peripheral);
        }
        return current;
      });
    }
  };

  const connectToDevice = async device => {
    try {
      setStatus('Connecting');
      console.log('Connecting to:', device.id);
      // Hentikan scan dulu agar discovery loop berhenti
      await BleManager.stopScan();
      await BleManager.connect(device.id);
      console.log('Connected to:', device.id);
      await BleManager.retrieveServices(device.id);
      console.log('Services retrieved');
      setDevices([device]);
      setStatus('Connected');
    } catch (error) {
      console.error('Connection failed:', error);
      setStatus('Offline');
    }
  };

  const handleScan = () => {
    if (status === 'Scanning') return;

    setStatus('Scanning');
    setDevices([]);
    BleManager.scan([SERVICE_UUID], 10, true)
      .then(() => {
        console.log('Scan started');
      })
      .catch(err => {
        Alert.alert('Scan Failed', err.toString());
        setStatus('Offline');
      });
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  };

  const handleSend = async () => {
    if (inputText.trim() === '') return;

    const newMessageId = Date.now().toString();
    const now = new Date();
    const timeString = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

    try {
      // 1. Buat packet terenkripsi lengkap {payload, checksum, type} lewat Go engine
      const packetJSON = await ChatEngine.createPacket(inputText, SHARED_SECRET, 'MESSAGE');
      if (packetJSON.startsWith('ERROR:')) {
        console.error('createPacket error:', packetJSON);
        return;
      }
      console.log('Packet JSON created, length:', packetJSON.length);

      // 2. Potong packet JSON untuk BLE (20 byte per chunk)
      const chunksStr = await ChatEngine.sliceData(packetJSON);
      const chunks = JSON.parse(chunksStr);
      console.log(`Sliced into ${chunks.length} chunks for BLE transmission`);

      // 3. Update local UI
      const myMessage = {
        id: newMessageId,
        text: inputText,
        sender: 'me',
        time: timeString,
        isEncrypted: true,
      };
      setMessages(prev => [...prev, myMessage]);
      setInputText('');

      // 4. Persist locally
      await ChatEngine.storeMessage(HISTORY_PATH, inputText, 'me');

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

      // 5. Transmit via BLE (if connected)
      if (status === 'Connected' && devices.length > 0) {
        const deviceId = devices[0].id;
        for (const chunk of chunks) {
          // Konversi string ke byte array tanpa Buffer (tidak tersedia di Hermes)
          const bytes = [];
          for (let i = 0; i < chunk.length; i++) {
            bytes.push(chunk.charCodeAt(i));
          }
          await BleManager.write(deviceId, SERVICE_UUID, CHARACTERISTIC_UUID, bytes);
          console.log('Chunk sent:', chunk);
        }
      } else {
        console.log('Not connected – message stored locally only');
      }
    } catch (error) {
      console.error('Core Engine Error:', error);
    }
  };

  const handleIncomingBluetoothData = async receivedChunksJSON => {
    try {
      const fullPacketJSON = await ChatEngine.reassembleData(receivedChunksJSON);
      const plaintext = await ChatEngine.parsePacket(fullPacketJSON, SHARED_SECRET);

      if (plaintext.startsWith('ERROR:')) {
        console.error('Integrity Error:', plaintext);
        return;
      }

      const incomingMsg = {
        id: Date.now().toString(),
        text: plaintext,
        sender: 'them',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, incomingMsg]);

      await ChatEngine.storeMessage(HISTORY_PATH, plaintext, 'them');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      console.error('Incoming message error:', e);
    }
  };

  const renderMessage = ({ item }) => {
    const isMe = item.sender === 'me';
    return (
      <View style={[styles.messageRow, isMe ? styles.myRow : styles.theirRow]}>
        <View style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}>
          <Text style={styles.messageText}>{item.text}</Text>
          <View style={styles.bubbleFooter}>
            <Text style={styles.timeText}>{item.time}</Text>
            {isMe && <Text style={styles.checkIcon}>✓✓</Text>}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Locbit Offline</Text>
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    status === 'Connected'
                      ? '#25D366'
                      : status === 'Scanning' || status === 'Connecting'
                        ? '#FFD700'
                        : '#FF3B30',
                },
              ]}
            />
            <Text style={styles.statusText}>{status}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.scanHeaderButton} onPress={handleScan}>
          <Text style={styles.scanText}>
            {status === 'Scanning' ? '...' : status === 'Connecting' ? '...' : 'SCAN'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.settingsButton} onPress={onNavigateToSettings}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Message List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00A884"
            colors={['#00A884']}
          />
        }
      />

      {/* Input Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputBar}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Ketik pesan..."
              placeholderTextColor="#8696A0"
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
          </View>
          <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B141B',
  },
  header: {
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    minHeight: 60 + (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0),
    backgroundColor: '#202C33',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    color: '#E9EDEF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: '#8696A0',
    fontSize: 12,
  },
  listContent: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  messageRow: {
    marginBottom: 8,
    minWidth: '100%',
    flexDirection: 'row',
  },
  myRow: {
    justifyContent: 'flex-end',
  },
  theirRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    borderRadius: 8,
  },
  myBubble: {
    backgroundColor: '#005C4B',
    borderTopRightRadius: 0,
  },
  theirBubble: {
    backgroundColor: '#202C33',
    borderTopLeftRadius: 0,
  },
  messageText: {
    color: '#E9EDEF',
    fontSize: 16,
    lineHeight: 20,
  },
  bubbleFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 2,
  },
  timeText: {
    color: '#8696A0',
    fontSize: 11,
    marginRight: 4,
  },
  checkIcon: {
    color: '#53BDEB',
    fontSize: 12,
  },
  inputBar: {
    flexDirection: 'row',
    padding: 8,
    alignItems: 'flex-end',
    backgroundColor: '#0B141B',
  },
  inputContainer: {
    flex: 1,
    backgroundColor: '#2A3942',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    minHeight: 48,
    maxHeight: 120,
    justifyContent: 'center',
  },
  input: {
    color: '#E9EDEF',
    fontSize: 16,
    padding: 0,
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00A884',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  sendIcon: {
    color: 'white',
    fontSize: 18,
    marginLeft: 4,
  },
  scanHeaderButton: {
    backgroundColor: '#00A884',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanText: {
    color: '#E9EDEF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  settingsButton: {
    padding: 8,
    marginLeft: 8,
  },
  settingsIcon: {
    fontSize: 22,
  },
});

export default ChatScreen;

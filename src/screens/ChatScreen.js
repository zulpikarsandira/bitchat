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
  RefreshControl,
  PermissionsAndroid,
  Alert,
} from 'react-native';
import BleManager from 'react-native-ble-manager';


const { ChatEngine } = NativeModules;

// Simulate a shared secret for Phase 1
const SHARED_SECRET = 'bitchat-shared-secret-placeholder';

const ChatScreen = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('Offline'); // Scanning, Connected, Offline
  const [devices, setDevices] = useState([]);
  const [activeSecret, setActiveSecret] = useState(SHARED_SECRET);
  const [refreshing, setRefreshing] = useState(false);
  const flatListRef = useRef(null);

  const HISTORY_PATH = Platform.OS === 'android' ? '/data/user/0/com.bitchat/files/chat_history.json' : 'history.json';


  useEffect(() => {
    // Load Local History from Go Engine
    loadHistory();

    // 1. Initialize BLE Manager
    BleManager.start({ showAlert: false });

    // 2. Request Android Permissions
    if (Platform.OS === 'android' && Platform.Version >= 23) {
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION).then((result) => {
        if (!result) {
          PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        }
      });
      // Bluetooth permissions for API 31+
      if (Platform.Version >= 31) {
        PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        ]).then(() => {
          // Start advertising after permissions granted
          ChatEngine.startAdvertising()
            .then(() => console.log('BLE Advertising started'))
            .catch(err => console.error('BLE Advertising failed:', err));
        });
      } else {
        // For older Android versions, start advertising immediately if Bluetooth is on
        ChatEngine.startAdvertising()
          .catch(err => console.log('Adv start skip or fail:', err));
      }
    }

    // Initial dummy data
    setMessages([
      { id: '1', text: 'Halo! Selamat datang di BitChat.', sender: 'them', time: '20:00' },
      { id: '2', text: 'Tekan "Scan" di atas untuk mencari teman chat.', sender: 'them', time: '20:01' },
    ]);

    return () => {
      // Stop advertising when screen unmounts
      ChatEngine.stopAdvertising().catch(() => { });
    };
  }, []);

  const loadHistory = async () => {
    try {
      const historyStr = await ChatEngine.getHistory(HISTORY_PATH);
      const history = JSON.parse(historyStr);
      if (history && history.length > 0) {
        // Map Go Message struct to UI format
        const mapped = history.map(m => ({
          id: m.id,
          text: m.text,
          sender: m.sender,
          time: new Date(m.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
        setMessages(mapped);
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  };

  const connectToDevice = async (device) => {
    setStatus('Connecting');
    // 1. Start Handshake (Generate ECDH KeyPair)
    const kpJSON = await ChatEngine.generateKeyPair();
    const kp = JSON.parse(kpJSON);

    // 2. Simulate Exchange (Real BLE: Send kp.public to remote)
    console.log('My Public Key:', kp.public);

    // 3. For Demo: Set Connected
    setStatus('Connected');
    setActiveSecret('dynamic-handshake-secret-demo'); // In real app, compute from remote public
  };


  const handleScan = () => {
    if (status === 'Scanning') return;

    setStatus('Scanning');
    // Scan for BitChat devices using the specific service UUID
    BleManager.scan(['fee0'], 5, true)
      .then(() => {
        console.log('Scan started');
        setTimeout(() => setStatus('Offline'), 5000);
      })
      .catch((err) => {
        Alert.alert('Scan Failed', err.toString());
        setStatus('Offline');
      });
  };


  const onRefresh = () => {
    setRefreshing(true);
    // Simulate loading history
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  const handleSend = async () => {
    if (inputText.trim() === '') return;

    const newMessageId = Date.now().toString();
    const now = new Date();
    const timeString = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

    // --- INTEGRATION WITH GO CORE (PHASE 1 Logic) ---
    try {
      // 1. Encrypt message using Go library via NativeBridge
      const encrypted = await ChatEngine.encrypt(inputText, SHARED_SECRET);
      console.log('Encrypted message from Go:', encrypted);

      // 2. Fragment data if needed (simulated for BLE transport)
      const chunksStr = await ChatEngine.sliceData(encrypted);
      const chunks = JSON.parse(chunksStr);
      console.log(`Sliced into ${chunks.length} chunks for BLE transmission`);

      // 3. Update local UI immediately
      const myMessage = {
        id: newMessageId,
        text: inputText,
        sender: 'me',
        time: timeString,
        isEncrypted: true,
      };

      setMessages((prev) => [...prev, myMessage]);
      setInputText('');

      // 4. PERSIST TO GO LOCAL STORAGE
      await ChatEngine.storeMessage(HISTORY_PATH, inputText, 'me');

      // Auto-scroll to bottom
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);


      // --- BLE TRANSMISSION LOGIC (Placeholder for react-native-ble-manager) ---
      // chunks.forEach(chunk => BluetoothClient.write(chunk));

    } catch (error) {
      console.error('Core Engine Error:', error);
      setStatus('Offline');
    }
  };

  /**
   * Mock listener for incoming Bluetooth data
   * This is how we would use the Go engine to reassemble and decrypt
   */
  const handleIncomingBluetoothData = async (receivedChunksJSON) => {
    try {
      // 1. Reassemble chunks into one JSON Packet string
      const fullPacketJSON = await ChatEngine.reassembleData(receivedChunksJSON);

      // 2. Decrypt and verify checksum in one go using ParsePacket
      const plaintext = await ChatEngine.parsePacket(fullPacketJSON, SHARED_SECRET);

      if (plaintext.startsWith('ERROR:')) {
        console.error('Integrity Error:', plaintext);
        return;
      }

      // 3. Update UI
      const incomingMsg = {
        id: Date.now().toString(),
        text: plaintext,
        sender: 'them',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, incomingMsg]);

      // 4. PERSIST TO GO LOCAL STORAGE
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
      <StatusBar barStyle="light-content" backgroundColor="#111B21" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>BitChat Offline</Text>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, { backgroundColor: status === 'Connected' ? '#25D366' : status === 'Scanning' ? '#FFD700' : '#FF3B30' }]} />
            <Text style={styles.statusText}>{status}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.scanHeaderButton} onPress={handleScan}>
          <Text style={styles.scanText}>{status === 'Scanning' ? '...' : 'SCAN'}</Text>
        </TouchableOpacity>
      </View>


      {/* Message List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
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
    backgroundColor: '#0B141B', // WhatsApp Dark Background
  },
  header: {
    height: 60,
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
    backgroundColor: '#005C4B', // WhatsApp Dark Me Bubble
    borderTopRightRadius: 0,
  },
  theirBubble: {
    backgroundColor: '#202C33', // WhatsApp Dark Their Bubble
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
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    maxHeight: 120,
  },
  input: {
    color: '#E9EDEF',
    fontSize: 16,
    padding: 0,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00A884', // WhatsApp Green
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  sendIcon: {
    color: 'white',
    fontSize: 24,
    marginLeft: 4,
  },
});

export default ChatScreen;

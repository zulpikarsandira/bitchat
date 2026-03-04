import React, { useState } from 'react';
import ChatScreen from './src/screens/ChatScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const App = () => {
    const [currentScreen, setCurrentScreen] = useState('chat');

    if (currentScreen === 'settings') {
        return <SettingsScreen onBack={() => setCurrentScreen('chat')} />;
    }

    return <ChatScreen onNavigateToSettings={() => setCurrentScreen('settings')} />;
};

export default App;

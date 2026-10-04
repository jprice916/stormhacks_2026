import { LandingPage } from './pages/LandingPage';
import { ProfilePage } from './pages/ProfilePage';
import { VoiceSettingsPage } from './pages/VoiceSettingsPage';
import { WeeklyScreen } from './pages/WeeklyScreen';

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '');
  if (pathname.endsWith('/weekly')) return <WeeklyScreen />;
  if (pathname.endsWith('/profile')) return <ProfilePage />;
  if (pathname.endsWith('/voice-settings')) return <VoiceSettingsPage />;
  return <LandingPage />;
}

export default App;

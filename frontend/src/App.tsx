import { LandingPage } from './pages/LandingPage';
import { LoggerPage } from './pages/LoggerPage';
import { LoginPage } from './pages/LoginPage';
import { MyVideosPage } from './pages/MyVideosPage';
import { DayRecordingsPage } from './pages/DayRecordingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { VoiceSettingsPage } from './pages/VoiceSettingsPage';
import { WeeklyScreen } from './pages/WeeklyScreen';
import { resolveFrontendPath } from './lib/paths';

function App() {
  const pathname = resolveFrontendPath(window.location.pathname);
  if (pathname === '/login') return <LoginPage />;
  if (pathname === '/logger') return <LoggerPage />;
  if (pathname === '/my-videos') return <MyVideosPage />;
  if (pathname === '/recordings') return <DayRecordingsPage />;
  if (pathname === '/weekly') return <WeeklyScreen />;
  if (pathname === '/profile') return <ProfilePage />;
  if (pathname === '/voice-settings') return <VoiceSettingsPage />;
  return <LandingPage />;
}

export default App;

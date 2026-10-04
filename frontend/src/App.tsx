import { LandingPage } from './pages/LandingPage';
import { LoggerPage } from './pages/LoggerPage';
import { LoginPage } from './pages/LoginPage';
import { MyVideosPage } from './pages/MyVideosPage';
import { DayRecordingsPage } from './pages/DayRecordingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { WeeklyScreen } from './pages/WeeklyScreen';

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/login') return <LoginPage />;
  if (pathname === '/logger') return <LoggerPage />;
  if (pathname === '/my-videos') return <MyVideosPage />;
  if (pathname === '/recordings') return <DayRecordingsPage />;
  if (pathname === '/weekly') return <WeeklyScreen />;
  if (pathname === '/profile') return <ProfilePage />;
  return <LandingPage />;
}

export default App;

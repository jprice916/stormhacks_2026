import { LandingPage } from './pages/LandingPage';
import { LoggerPage } from './pages/LoggerPage';
import { LoginPage } from './pages/LoginPage';
import { MyVideosPage } from './pages/MyVideosPage';
import { DayRecordingsPage } from './pages/DayRecordingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { WeeklyScreen } from './pages/WeeklyScreen';

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '');
  if (pathname.endsWith('/login')) return <LoginPage />;
  if (pathname.endsWith('/logger')) return <LoggerPage />;
  if (pathname.endsWith('/my-videos')) return <MyVideosPage />;
  if (pathname.endsWith('/recordings')) return <DayRecordingsPage />;
  if (pathname.endsWith('/weekly')) return <WeeklyScreen />;
  if (pathname.endsWith('/profile')) return <ProfilePage />;
  return <LandingPage />;
}

export default App;

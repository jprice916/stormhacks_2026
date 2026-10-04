import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { WeeklyScreen } from './pages/WeeklyScreen';

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '');
  if (pathname === '/login') return <LoginPage />;
  if (pathname.endsWith('/weekly')) return <WeeklyScreen />;
  if (pathname.endsWith('/profile')) return <ProfilePage />;
  return <LandingPage />;
}

export default App;

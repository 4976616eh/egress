import { useEffect, useState } from 'react';
import App from './App';
import Landing from './landing/Landing';
import ErrorBoundary, { CrashScreen } from './components/ErrorBoundary';

const isApp = () => location.hash === '#/app';

/** Landing page at the root URL, the simulation at `#/app` (hash routing keeps the static deploy simple). */
export default function Root() {
  const [app, setApp] = useState(isApp);
  useEffect(() => {
    const onHash = () => setApp(isApp());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (app) {
    return (
      <ErrorBoundary fallback={(error) => <CrashScreen error={error} />}>
        <App />
      </ErrorBoundary>
    );
  }
  return (
    <Landing
      onOpen={() => {
        location.hash = '#/app';
        window.scrollTo(0, 0);
      }}
    />
  );
}

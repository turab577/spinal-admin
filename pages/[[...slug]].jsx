import dynamic from 'next/dynamic';

// The admin is a client-rendered React Router app; Next.js serves it for every path.
const App = dynamic(() => import('@/App'), { ssr: false });

export default function Page() {
  return <App />;
}

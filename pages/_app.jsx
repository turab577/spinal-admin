import Head from 'next/head';
import '@/index.css';

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>SpinalInfo Admin</title>
      </Head>
      <Component {...pageProps} />
    </>
  );
}

import type { NextPage, GetStaticProps } from 'next'
import Head from 'next/head'
import styles from '../styles/Home.module.css'
import Link from '@mui/material/Link';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import CssBaseline from '@mui/material/CssBaseline';
import Container from '@mui/material/Container';

const Home: NextPage = () => {
  return (
    <Container maxWidth="sm" className={styles.container}>

      <CssBaseline />

      <Head>
        <title>梶ヶ谷 宜之 | ホームページ</title>
        <meta name="description" content="ホームページです。" />
        <link rel="icon" href="/favicon.ico" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP&amp;family=Roboto&amp;display=swap" rel="stylesheet" />
      </Head>

      <main>

        <h1 className="block text-2xl font-bold">ホームページ</h1>

        <a href="https://www.irasutoya.com/2014/12/blog-post_964.html" target="_blank" rel="noreferrer noopener">
          <picture>
            <source srcSet="/ea98a6f9-e9a6-43ea-a6e3-464656155004.webp" type="image/webp" />
            <img className="max-w-sm my2" src="/ea98a6f9-e9a6-43ea-a6e3-464656155004.jpg" alt="ハクビシン"  width={384} height={337.438} />
          </picture>
          <ruby className="block text-4xl font-bold italic my-2">
            ハクビシン
            <rt>アライグマ</rt>
          </ruby>
        </a>

        <ul className="my-2">
          <li>
            <Link href="https://twitter.com/sasakiuri" target="_blank" rel="noreferrer noopener">Twitter</Link>
          </li>
          <li>
            <Link href="https://www.facebook.com/nkajigaya1128" target="_blank" rel="noreferrer noopener">Facebook</Link>
          </li>
        </ul>

      </main>

    </Container>
  )
}

export const getStaticProps: GetStaticProps = async () => {
  return {
    props:{}
  }
}

export default Home

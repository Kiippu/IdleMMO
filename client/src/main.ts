import { mount } from 'svelte';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/silkscreen/latin-400.css';
import atkinsonUrl from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2?url';
import './app.css';

// Preload the body face so first paint uses the legible numerals.
const pre = document.createElement('link');
pre.rel = 'preload'; pre.as = 'font'; pre.type = 'font/woff2'; pre.href = atkinsonUrl; pre.crossOrigin = 'anonymous';
document.head.appendChild(pre);
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

export default app;

import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('The frontend root element is missing.');

createRoot(rootElement).render(<App />);

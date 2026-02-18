import { TTSController } from './TTSController';
import { ArticleNavigation } from './ArticleNavigation';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize TTS
    const ttsRoot = document.getElementById('tts-player-root');
    if (ttsRoot) {
        new TTSController({
            container: ttsRoot,
            articleContentSelector: '#article-content',
            onStateChange: (state) => console.log('TTS State:', state)
        });
    }

    // Initialize Nav
    const navRoot = document.getElementById('article-nav-root');
    if (navRoot) {
        new ArticleNavigation();
    }
});

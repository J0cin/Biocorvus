document.addEventListener('DOMContentLoaded', () => {

    // --- LÓGICA DEL CURSOR METABALL ---
    const cursorBall = document.getElementById('cursor-ball');
    
    if (window.matchMedia("(pointer: fine)").matches) {
        document.body.addEventListener('mousemove', (e) => {
            window.requestAnimationFrame(() => {
                const x = e.clientX - cursorBall.offsetWidth / 2;
                const y = e.clientY - cursorBall.offsetHeight / 2;
                cursorBall.style.transform = `translate(${x}px, ${y}px)`;
            });
        });
    } else {
        cursorBall.style.display = 'none';
    }

    // --- LÓGICA DEL INTERRUPTOR DE TEMA (LIGHT/DARK MODE) ---
    const themeToggle = document.getElementById('theme-toggle');
    const lightIcon = document.getElementById('light-icon');
    const darkIcon = document.getElementById('dark-icon');
    const body = document.body;

    const applyTheme = (theme) => {
        if (theme === 'light') {
            body.classList.add('light-mode');
            lightIcon.classList.add('hidden');
            darkIcon.classList.remove('hidden');
        } else {
            body.classList.remove('light-mode');
            lightIcon.classList.remove('hidden');
            darkIcon.classList.add('hidden');
        }
    };

    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);

    themeToggle.addEventListener('click', () => {
        const newTheme = body.classList.contains('light-mode') ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });

});
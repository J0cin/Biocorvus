document.addEventListener('DOMContentLoaded', () => {
    // --- SELECTORES GLOBALES ---
    const appLayout = document.getElementById('app-layout');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarToggleInput = document.getElementById('sidebar-toggle-input');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');

    // --- LÓGICA DE SIDEBAR (Copiada de cleaner.js) ---
    if (sidebarToggleInput && appLayout && sidebarToggleBtn) {
        const isSidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        appLayout.classList.toggle('sidebar-collapsed', isSidebarCollapsed);
        sidebarToggleBtn.classList.toggle('is-active', !isSidebarCollapsed);
        sidebarToggleInput.checked = !isSidebarCollapsed;

        sidebarToggleInput.addEventListener('change', () => {
            const isCollapsed = !sidebarToggleInput.checked;
            appLayout.classList.toggle('sidebar-collapsed', isCollapsed);
            sidebarToggleBtn.classList.toggle('is-active', !isCollapsed);
            localStorage.setItem('sidebarCollapsed', isCollapsed);
        });
    }

    // --- LÓGICA DE TEMA OSCURO/CLARO (Copiada de cleaner.js) ---
    // Use central theme manager if available
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            if (window.toggleTheme) {
                window.toggleTheme();
            } else {
                const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', newTheme);
                try { localStorage.setItem('theme', newTheme); } catch (e) {}
            }
        });
    }

    const fileInputs = document.querySelectorAll('.file-input-wrapper input[type="file"]');
    fileInputs.forEach(input => {
        const wrapper = input.closest('.file-input-wrapper');
        const fileNameDisplay = wrapper.querySelector('.file-name-display');
        
        if (fileNameDisplay) {
            input.addEventListener('change', () => {
                const fileName = input.files.length > 0 ? input.files[0].name : 'No file selected';
                fileNameDisplay.textContent = fileName;
            });
        }
    });
});


// --- LÓGICA DEL CHATBOT ---
const sendMessage = async () => {
    const userText = chatInput.value.trim();
    if (userText === '') return;

    // 1. Mostrar mensaje del usuario
    chatMessages.innerHTML += `<div class="message user-message">${userText}</div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatInput.value = '';
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    // 2. Mostrar un indicador de "pensando"
    const thinkingMessage = document.createElement('div');
    thinkingMessage.className = 'message system-message';
    thinkingMessage.innerText = 'BioCorvus está pensando...';
    chatMessages.appendChild(thinkingMessage);
    chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    // ¡IMPORTANTE! Reemplaza esta URL con la URL de tu proyecto en Vercel
    // cuando lo despliegues. Para probar en local, sería 'http://localhost:3001/api/chat'.
    const response = await fetch('https://biocorvus-3wx51y6t2-boris-projects-3d0e8363.vercel.app', { // <-- CAMBIA ESTO
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userText }),
    });

    const data = await response.json();
    
    // Reemplazar el "pensando" con la respuesta real
    thinkingMessage.innerText = data.reply;

} catch (error) {
        thinkingMessage.innerText = 'Error de conexión. Por favor, inténtalo de nuevo más tarde.';
        console.error('Chatbot error:', error);
    } finally {
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        chatInput.focus();
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
};

// Y actualiza los event listeners
chatSendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
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

    // --- CHATBOT WIDGET INITIALIZATION ---
  const chatbotContainer = document.getElementById('chatbot-container');
    if (chatbotContainer) {
        const chatbotToggleBtn = document.getElementById('chatbot-toggle-btn');
        const chatWidget = document.getElementById('chat-widget');
        const chatInput = document.getElementById('chat-input');
        const chatSendBtn = document.getElementById('chat-send-btn');
        const chatMessages = document.getElementById('chat-messages');

        // Lógica para abrir y cerrar el widget
        chatbotToggleBtn.addEventListener('click', () => {
            // ESTA ES LA LÍNEA CORREGIDA: 'open' se cambió por 'show'
            chatWidget.classList.toggle('show'); 
            chatbotToggleBtn.classList.toggle('active');
        });

        // El resto del código del chatbot permanece igual
        const sendMessage = async () => {
            const userText = chatInput.value.trim();
            if (userText === '') return;

            // ... (el resto de la función sendMessage no necesita cambios)
            chatMessages.innerHTML += `<div class="message user-message">${userText}</div>`;
            chatMessages.scrollTop = chatMessages.scrollHeight;
            chatInput.value = '';
            chatInput.disabled = true;
            chatSendBtn.disabled = true;

            const thinkingMessage = document.createElement('div');
            thinkingMessage.className = 'message system-message';
            thinkingMessage.innerText = 'BioCorvus está pensando...';
            chatMessages.appendChild(thinkingMessage);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: userText }),
                });
                if (!response.ok) throw new Error(`API error: ${response.status}`);
                const data = await response.json();
                thinkingMessage.innerText = data.reply || "No he podido generar una respuesta.";
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

        chatSendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    }
});
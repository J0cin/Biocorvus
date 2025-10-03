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
        const chatMessages = document.getElementById('chat-messages');
        const chatInput = document.getElementById('chat-input');
        const chatSendBtn = document.getElementById('chat-send-btn');
        const initialSystemMessage = `<div class="message system-message">Hola, soy BioCorvus Assistant. ¿En qué puedo ayudarte sobre Quality Inspector, Sequence Cleaner o Sequence Aligner?</div>`;

        // Novedad: Función para cerrar el chat de forma elegante
        const closeChat = () => {
            appendMessage("¡De nada! Hasta la próxima.", 'system-message');
            setTimeout(() => {
                chatWidget.classList.remove('show');
                chatbotToggleBtn.classList.remove('active');
            }, 1500); // Espera 1.5 segundos antes de cerrar
        };
        
        // Modificado: Lógica para abrir/cerrar y limpiar la memoria
        chatbotToggleBtn.addEventListener('click', () => {
            const isOpening = !chatWidget.classList.contains('show');
            chatWidget.classList.toggle('show');
            chatbotToggleBtn.classList.toggle('active');
            
            // Si se está abriendo, reseteamos la conversación (vaciar memoria)
            if (isOpening) {
                chatMessages.innerHTML = initialSystemMessage;
                chatInput.focus();
            }
        });

        // Novedad: Función auxiliar para añadir mensajes
        const appendMessage = (text, className) => {
            chatMessages.innerHTML += `<div class="message ${className}">${text}</div>`;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        };

        const sendMessage = async () => {
            const userText = chatInput.value.trim();
            if (userText === '') return;

            appendMessage(userText, 'user-message');
            chatInput.value = '';

            // Novedad: Comprobar si el usuario quiere terminar la conversación
            const closingWords = ['no', 'no gracias', 'eso es todo', 'nada más', 'listo', 'ya está'];
            if (closingWords.includes(userText.toLowerCase())) {
                closeChat();
                return; // Detiene la ejecución para no llamar a la API
            }

            chatInput.disabled = true;
            chatSendBtn.disabled = true;

            const thinkingMessage = document.createElement('div');
            thinkingMessage.className = 'message system-message';
            thinkingMessage.innerText = 'BioCorvus está pensando...';
            chatMessages.appendChild(thinkingMessage);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            try {
                // ❗ IMPORTANTE: Pega aquí la URL de tu backend en Render ❗
                const apiUrl = '/api/Chatbot'; 

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_message: userText }),
                });
                if (!response.ok) throw new Error(`API error: ${response.status}`);

                const data = await response.json();
                thinkingMessage.innerText = data.response || "No he podido generar una respuesta.";

                // Novedad: Preguntar si puede ayudar en algo más
                setTimeout(() => {
                    appendMessage("¿Puedo ayudarte en algo más?", 'system-message');
                }, 1000); // Pregunta después de 1 segundo

            } catch (error) {
                thinkingMessage.innerText = 'Error de conexión. Por favor, inténtalo de nuevo más tarde.';
                console.error('Chatbot error:', error);
            } finally {
                chatInput.disabled = false;
                chatSendBtn.disabled = false;
                chatInput.focus();
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
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
        const chatOptionsContainer = document.getElementById('chat-options-container');
        const initialSystemMessage = `<div class="message system-message">Hola, soy BioCorvus Assistant. ¿Sobre qué herramienta quieres saber más?</div>`;

        // ==================================================================
        // AQUÍ VIVE LA INTELIGENCIA DEL CHATBOT (EL ÁRBOL DE CONVERSACIÓN)
        // ==================================================================
        const conversationTree = {
                // Nivel 1: Opciones Principales
    options: {
        // ==========================================================
        // ===== NUEVA SECCIÓN: SOBRE BIOCORVUS (3 NIVELES) =========
        // ==========================================================
        "¿Qué es BioCorvus?": {
            // Nivel 2: Respuesta general y sub-opciones
            answer: "BioCorvus es una plataforma web de bioinformática diseñada para ser intuitiva y accesible. Ofrece un conjunto de herramientas para realizar análisis de secuencias genómicas directamente en el navegador. ¿Qué aspecto de la plataforma te interesa más?",
            options: {
                "¿Cuál es su objetivo principal?": {
                    // Nivel 3: Respuesta más específica y opciones finales
                    answer: "El objetivo principal de BioCorvus es simplificar el pre-procesamiento y análisis de datos de secuenciación, permitiendo a los investigadores y estudiantes centrarse en los resultados sin necesidad de complejas instalaciones de software o líneas de comandos.",
                    options: {
                        "¿A quién está dirigido?": {
                            answer: "Está dirigido tanto a biólogos moleculares que necesitan herramientas rápidas para sus análisis diarios, como a estudiantes de bioinformática que están aprendiendo los flujos de trabajo estándar en el campo."
                        },
                        "¿Qué tecnología utiliza?": {
                            answer: "La plataforma utiliza tecnologías web modernas como HTML, CSS y JavaScript. Algunas herramientas usan WebAssembly para correr eficientemente en el navegador, y el chatbot se integra con APIs de modelos de lenguaje avanzados."
                        }
                    }
                },
                "¿Qué significa el nombre 'BioCorvus'?": {
                    // Nivel 3: Respuesta más específica y opciones finales
                    answer: "El nombre es una combinación de 'Bio' (biología/bioinformática) y 'Corvus' (el género de los cuervos). Los cuervos son conocidos por su inteligencia y su habilidad para usar herramientas, lo que simboliza la visión de la plataforma: herramientas inteligentes para la ciencia.",
                    options: {
                        "¿Tiene relación con la investigación?": {
                           answer: "Sí, el concepto se inspira en cómo los cuervos resuelven problemas complejos, una metáfora perfecta para el desafío que supone el análisis de datos genómicos en la investigación científica."
                        }
                    }
                }
            }
        },
        // ==========================================================
        // ===== SECCIONES EXISTENTES (SIN CAMBIOS) =================
        // ==========================================================
        "Sobre Quality Inspector": {
            answer: "Excelente elección. ¿Qué te gustaría saber sobre Quality Inspector?",
            options: {
                "¿Para qué sirve?": {
                    answer: "Quality Inspector analiza la calidad de archivos FASTQ. Genera reportes visuales para ayudarte a decidir si tus datos crudos son de buena calidad antes de continuar con el análisis."
                },
                "¿Cómo se utiliza?": {
                    answer: "Es muy sencillo. Simplemente subes tu archivo en formato FASTQ o FASTQ.gz, y la herramienta genera automáticamente un reporte en HTML con todas las métricas de calidad."
                },
                "¿Qué métricas analiza?": {
                    answer: "Analiza métricas clave como la calidad de las bases por ciclo, el contenido de GC, la presencia de secuencias sobre-representadas y los niveles de duplicación de secuencias."
                }
            }
        },
        "Sobre Sequence Cleaner": {
            answer: "Claro. Sequence Cleaner es vital para el pre-procesamiento. ¿Qué detalle te interesa?",
            options: {
                "Función principal": {
                    answer: "Su función es limpiar datos de secuenciación crudos. Esto incluye recortar adaptadores, filtrar lecturas de baja calidad y eliminar secuencias duplicadas para mejorar la fiabilidad de tus resultados."
                },
                "¿Qué obtengo como resultado?": {
                    answer: "Obtienes un nuevo archivo FASTQ limpio, listo para ser usado en alineamientos u otros análisis posteriores con mayor confianza."
                }
            }
        },
        "Sobre Sequence Aligner": {
            answer: "El alineador es una herramienta fundamental. ¿Qué quieres saber?",
            options: {
                "¿Qué hace exactamente?": {
                    answer: "Realiza el alineamiento de secuencias de ADN o proteínas contra un genoma de referencia para identificar dónde y cómo encajan tus secuencias."
                },
                "¿Qué formatos de archivo genera?": {
                    answer: "Genera archivos estándar en la industria bioinformática, como SAM o BAM, que describen detalladamente los resultados del alineamiento."
                }
            }
        }
    }
};

        let currentNode = conversationTree; // Mantiene el estado actual de la conversación

        // --- Funciones del Chatbot ---

        const appendMessage = (text, className) => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${className}`;
            messageDiv.innerHTML = text; // Usamos innerHTML para poder añadir saltos de línea si es necesario
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        };

        const renderOptions = (node) => {
            chatOptionsContainer.innerHTML = ''; // Limpia los botones anteriores
            
            // Añadir los botones de las opciones actuales
            for (const optionText in node.options) {
                const button = document.createElement('button');
                button.className = 'option-btn';
                button.innerText = optionText;
                button.addEventListener('click', handleOptionClick);
                chatOptionsContainer.appendChild(button);
            }

            // Si no estamos en el menú principal, añadir un botón para volver
            if (node !== conversationTree) {
                const backButton = document.createElement('button');
                backButton.className = 'option-btn back-btn';
                backButton.innerText = '‹‹ Volver al menú principal';
                backButton.addEventListener('click', () => {
                    currentNode = conversationTree;
                    appendMessage("¿Sobre qué más te gustaría saber?", 'system-message');
                    renderOptions(currentNode);
                });
                chatOptionsContainer.appendChild(backButton);
            }
        };

        const handleOptionClick = (event) => {
            const userChoice = event.target.innerText;
            appendMessage(userChoice, 'user-message');

            const nextNode = currentNode.options[userChoice];
            
            setTimeout(() => {
                // Muestra la respuesta intermedia o final
                appendMessage(nextNode.answer, 'system-message');

                // Si hay más opciones, actualiza el estado y renderiza los nuevos botones
                if (nextNode.options) {
                    currentNode = nextNode;
                    renderOptions(currentNode);
                } else {
                    // Si es una respuesta final, no mostramos más opciones, solo el botón de volver
                    chatOptionsContainer.innerHTML = '';
                    const backButton = document.createElement('button');
                    backButton.className = 'option-btn back-btn';
                    backButton.innerText = '‹‹ Volver al menú principal';
                    backButton.addEventListener('click', () => {
                        currentNode = conversationTree;
                        appendMessage("¿Sobre qué más te gustaría saber?", 'system-message');
                        renderOptions(currentNode);
                    });
                    chatOptionsContainer.appendChild(backButton);
                }
            }, 800); // Simula un pequeño tiempo de "pensamiento"
        };

        // --- Inicialización del Chat ---
        chatbotToggleBtn.addEventListener('click', () => {
            const isOpening = !chatWidget.classList.contains('show');
            chatWidget.classList.toggle('show');
            chatbotToggleBtn.classList.toggle('active');
            
            if (isOpening) {
                chatMessages.innerHTML = initialSystemMessage;
                currentNode = conversationTree; // Resetea al menú principal
                renderOptions(currentNode); // Muestra las opciones iniciales
            }
        });
    }
});
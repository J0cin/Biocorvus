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

    // --- LÓGICA DE TEMA OSCURO/CLARO ---
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
    const initialSystemMessage = `<div class="message system-message">Hello, I'm BioCorvus Assistant. Which tool would you like to know more about?</div>`;

    // ==================================================================
    // HERE LIVES THE CHATBOT'S BRAIN (THE CONVERSATION TREE)
    // ==================================================================
    const conversationTree = {
            // Level 1: Main Options
        options: {
            // ==========================================================
            // ===== NEW SECTION: ABOUT BIOCORVUS (3 LEVELS) ==========
            // ==========================================================
            "What is BioCorvus?": {
                // Level 2: General answer and sub-options
                answer: "BioCorvus is a bioinformatics web platform designed to be intuitive and accessible. It offers a suite of tools to perform genomic sequence analysis directly in the browser. What aspect of the platform are you most interested in?",
                options: {
                    "What is its main goal?": {
                        // Level 3: More specific answer and final options
                        answer: "The main goal of BioCorvus is to simplify the pre-processing and analysis of sequencing data, allowing researchers and students to focus on the results without the need for complex software installations or command lines.",
                        options: {
                            "Who is it for?": {
                                answer: "It is aimed at both molecular biologists who need quick tools for their daily analyses, and bioinformatics students who are learning the standard workflows in the field."
                            },
                        }
                    },
                    "What does the name 'BioCorvus' mean?": {
                        // Level 3: More specific answer and final options
                        answer: "The name is a combination of 'Bio' (biology/bioinformatics) and 'Corvus' (the genus for crows). Crows are known for their intelligence and ability to use tools, which symbolizes the platform's vision: smart tools for science.",
                        options: {
                            "Is it related to research?": {
                               answer: "Yes, the concept is inspired by how crows solve complex problems, a perfect metaphor for the challenge of analyzing genomic data in scientific research."
                            }
                        }
                    }
                }
            },
            // ==========================================================
            // ===== EXISTING SECTIONS  =====================
            // ==========================================================
            "About Quality Inspector": {
                answer: "Excellent choice. What would you like to know about Quality Inspector?",
                options: {
                    "What is it for?": {
                        answer: "Quality Inspector analyzes the quality of FASTQ files. It generates visual reports to help you decide if your raw data is of good quality before proceeding with the analysis."
                    },
                    "How do I use it?": {
                        answer: "It's very simple. You just upload your file in FASTQ or FASTQ.gz format, and the tool automatically generates an HTML report with all the quality metrics."
                    },
                    "What metrics does it analyze?": {
                        answer: "It analyzes key metrics such as per-base quality scores, GC content, the presence of overrepresented sequences, and sequence duplication levels."
                    }
                }
            },
            "About Sequence Cleaner": {
                answer: "Of course. Sequence Cleaner is vital for pre-processing. What detail are you interested in?",
                options: {
                    "Main function": {
                        answer: "Its function is to clean raw sequencing data. This includes trimming adapters, filtering low-quality reads, and removing duplicate sequences to improve the reliability of your results."
                    },
                    "What is the output?": {
                        answer: "You get a new, clean FASTQ file, ready to be used in alignments or other downstream analyses with greater confidence."
                    }
                }
            },
            "About Sequence Aligner": {
                answer: "The aligner is a fundamental tool. What do you want to know?",
                options: {
                    "What does it do exactly?": {
                        answer: "It performs the alignment of DNA or protein sequences against a reference genome to identify where and how your sequences fit."
                    },
                    "What file formats does it generate?": {
                        answer: "It generates industry-standard bioinformatics files, such as SAM or BAM, which describe the alignment results in detail."
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
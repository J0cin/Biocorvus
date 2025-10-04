document.addEventListener('DOMContentLoaded', function() {

    // --- SOLUCIÓN DEFINITIVA: LÓGICA DE UI ---
    const appLayout = document.getElementById('app-layout');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarToggleInput = document.getElementById('sidebar-toggle-input');

    if (sidebarToggleBtn && appLayout) {
        // Set initial closed state
        appLayout.classList.add('sidebar-collapsed');

        const setSidebarOpen = (open) => {
            if (!appLayout) return;
            appLayout.classList.toggle('sidebar-collapsed', !open);
            try { sidebarToggleBtn.classList.toggle('is-active', open); } catch (e) {}
        };

        // If there is a checkbox input (label contains input), sync with it
        if (sidebarToggleInput) {
            // initialize input checked state from appLayout
            sidebarToggleInput.checked = !appLayout.classList.contains('sidebar-collapsed');
            setSidebarOpen(sidebarToggleInput.checked);
            sidebarToggleInput.addEventListener('change', (e) => setSidebarOpen(!!e.target.checked));
        }

        // Click on the label should toggle the checkbox (if present) or toggle state directly
        sidebarToggleBtn.addEventListener('click', () => {
            if (sidebarToggleInput) {
                sidebarToggleInput.checked = !sidebarToggleInput.checked;
                setSidebarOpen(sidebarToggleInput.checked);
            } else {
                // fallback
                const isCollapsed = appLayout.classList.toggle('sidebar-collapsed');
                sidebarToggleBtn.classList.toggle('is-active', !isCollapsed);
            }
        });
    }

    // --- LÓGICA DE ANIMACIÓN DE SCROLL ---
    const appContent = document.getElementById('app-content');
    const mainTitle = document.getElementById('main-title');
    const moon = document.querySelector('.moon');
    const crowContainer = document.getElementById('crow-container');
    const crowImage = document.getElementById('crow-image');

    // Ejecutar solo si estamos en la página principal
    if (appContent && mainTitle && moon && crowContainer) {
        const sceneTriggerThreshold = 50;
        const fadeStartPoint = window.innerHeight * 0.7;

        appContent.addEventListener('scroll', () => {
            const scrollTop = appContent.scrollTop;

            // Animar Título
            mainTitle.style.transform = `translateY(-${scrollTop * 1.2}px)`;
            mainTitle.style.opacity = Math.max(0, 1 - scrollTop / 300).toString();

            // Animar Cuervo
            if (scrollTop > sceneTriggerThreshold) {
                crowContainer.style.opacity = '1';
                crowImage.style.transform = 'translateY(0) scale(1)';
            } else {
                crowContainer.style.opacity = '0';
                crowImage.style.transform = 'translateY(40px) scale(0.9)';
            }
            
            // MEJORA: Animar Luna y Cuervo con movimiento muy sutil
            const parallaxOffset = scrollTop * 0.1; // Movimiento mínimo
            let moonOpacity = 1;

            if (scrollTop > fadeStartPoint) {
                const fadeProgress = (scrollTop - fadeStartPoint) / (window.innerHeight / 2);
                moonOpacity = Math.max(0, 1 - fadeProgress);
            }

            const newTransform = `translateY(${parallaxOffset}px)`;
            moon.style.transform = newTransform;
            crowContainer.style.transform = newTransform;
            moon.style.opacity = moonOpacity.toString();
        });
    }

});

document.addEventListener('DOMContentLoaded', () => {
    const appContent = document.getElementById('app-content');
    const mainTitle = document.getElementById('main-title');
    const toolsSection = document.getElementById('tools-section');

    if (appContent && mainTitle && toolsSection) {
        appContent.addEventListener('scroll', () => {
            const scrollPosition = appContent.scrollTop;
            const viewportHeight = appContent.clientHeight;

            // Definimos un punto de activación (ej. al 20% de la altura de la ventana)
            const activationPoint = viewportHeight * 0.2;

            if (scrollPosition > activationPoint) {
                // Cuando el usuario ha hecho scroll suficiente:
                // 1. Ocultamos el título principal
                mainTitle.style.opacity = '0';
                mainTitle.style.transform = 'translate(-50%, -50%) scale(0.8)'; // Encoge un poco al desaparecer
                
                // 2. Mostramos la sección de herramientas
                toolsSection.classList.add('is-visible');

            } else {
                // Si el usuario vuelve hacia arriba, revertimos los cambios
                // 1. Mostramos el título de nuevo
                mainTitle.style.opacity = '1';
                mainTitle.style.transform = 'translate(-50%, -50%) scale(1)';
                
                // 2. Ocultamos la sección de herramientas
                toolsSection.classList.remove('is-visible');
            }
        });
    }
});
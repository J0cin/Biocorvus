document.addEventListener('DOMContentLoaded', function() {

    // --- LÓGICA PARA EL MENÚ HAMBURGUESA ---
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const appLayout = document.getElementById('app-layout');
    const sidebarToggleInput = document.getElementById('sidebar-toggle-input');

    // Estado inicial del menú (abierto)
    let isSidebarActive = true;
    sidebarToggleBtn.classList.add('is-active');
    
    sidebarToggleBtn.addEventListener('click', () => {
        isSidebarActive = !isSidebarActive;
        if (isSidebarActive) {
            sidebarToggleBtn.classList.add('is-active');
            appLayout.classList.remove('sidebar-collapsed');
            sidebarToggleInput.checked = true;
        } else {
            sidebarToggleBtn.classList.remove('is-active');
            appLayout.classList.add('sidebar-collapsed');
            sidebarToggleInput.checked = false;
        }
    });


    // --- LÓGICA PARA REVELAR EL CUERVO CON SCROLL ---
    const appContent = document.getElementById('app-content');
    const crowSilhouette = document.querySelector('.crow-silhouette');

    // Umbral de scroll para mostrar el cuervo (ej. 20% de la altura de la ventana)
    const scrollThreshold = window.innerHeight * 0.2;

    appContent.addEventListener('scroll', () => {
        // Si el scroll supera el umbral, muestra el cuervo
        if (appContent.scrollTop > scrollThreshold) {
            crowSilhouette.classList.add('visible');
        } else {
            // Si vuelve a subir, lo oculta
            crowSilhouette.classList.remove('visible');
        }
    });

});
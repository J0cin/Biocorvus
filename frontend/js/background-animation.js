document.addEventListener('DOMContentLoaded', () => {
    const animationContainer = document.getElementById('background-animation');
    const mainContent = document.querySelector('main');
    
    const domainImages = [
        'assets/domains/domain1.png',
        'assets/domains/domain2.png',
        'assets/domains/domain3.png',
        'assets/domains/domain4.png',
        'assets/domains/domain5.png',
        'assets/domains/domain6.png',
        'assets/domains/domain7.png'
    ];

    const domains = [];
    const numDomains = 15;
    const mouse = { x: null, y: null, radius: 150 };

    window.addEventListener('mousemove', (event) => {
        mouse.x = event.x;
        mouse.y = event.y;
    });
    window.addEventListener('mouseout', () => {
        mouse.x = null;
        mouse.y = null;
    });

    class Domain {
        constructor() {
            this.element = document.createElement('img');
            this.element.src = domainImages[Math.floor(Math.random() * domainImages.length)];
            this.element.className = 'floating-domain';
            
            this.size = Math.random() * 40 + 30;
            this.radius = this.size / 2;
            this.element.style.width = `${this.size}px`;
            this.element.style.height = 'auto';
            
            this.x = Math.random() * window.innerWidth;
            this.y = Math.random() * window.innerHeight;
            this.vx = (Math.random() - 0.5) * 0.5;
            this.vy = (Math.random() - 0.5) * 0.5;
            this.mass = this.size * 0.1;

            animationContainer.appendChild(this.element);
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            if (this.y + this.radius > window.innerHeight || this.y - this.radius < 0) {
                this.vy = -this.vy;
            }
            if (this.x + this.radius > window.innerWidth || this.x - this.radius < 0) {
                this.vx = -this.vx;
            }

            // Interacción con el ratón
            if (mouse.x && mouse.y) {
                const dxMouse = this.x - mouse.x;
                const dyMouse = this.y - mouse.y;
                const distanceMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
                if (distanceMouse < mouse.radius + this.radius) {
                    const angle = Math.atan2(dyMouse, dxMouse);
                    // CAMBIO: Reducimos la fuerza del empuje para una interacción más suave
                    this.vx += Math.cos(angle) * 0.03;
                    this.vy += Math.sin(angle) * 0.03;
                }
            }
            
            const mainRect = mainContent.getBoundingClientRect();
            if (this.x > mainRect.left - this.radius && 
                this.x < mainRect.right + this.radius && 
                this.y > mainRect.top - this.radius && 
                this.y < mainRect.bottom + this.radius) {
                
                const overlapLeft = (this.x + this.radius) - mainRect.left;
                const overlapRight = mainRect.right - (this.x - this.radius);
                const overlapTop = (this.y + this.radius) - mainRect.top;
                const overlapBottom = mainRect.bottom - (this.y - this.radius);

                const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

                if (minOverlap === overlapLeft) {
                    this.vx = -Math.abs(this.vx);
                    this.x = mainRect.left - this.radius;
                } else if (minOverlap === overlapRight) {
                    this.vx = Math.abs(this.vx);
                    this.x = mainRect.right + this.radius;
                } else if (minOverlap === overlapTop) {
                    this.vy = -Math.abs(this.vy);
                    this.y = mainRect.top - this.radius;
                } else if (minOverlap === overlapBottom) {
                    this.vy = Math.abs(this.vy);
                    this.y = mainRect.bottom + this.radius;
                }
            }

            this.element.style.transform = `translate(${this.x - this.radius}px, ${this.y - this.radius}px)`;
        }
    }

    function resolveCollision(p1, p2) {
        // ... (lógica de colisión sin cambios)
    }

    function animate() {
        domains.forEach(domain => {
            domain.update();
        });

        for (let i = 0; i < domains.length; i++) {
            for (let j = i + 1; j < domains.length; j++) {
                resolveCollision(domains[i], domains[j]);
            }
        }

        requestAnimationFrame(animate);
    }

    function init() {
        for (let i = 0; i < numDomains; i++) {
            domains.push(new Domain());
        }
    }

    init();
    animate();
});